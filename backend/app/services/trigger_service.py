"""
Automated parametric trigger service.

Polls OpenWeatherMap (weather/heat) and OpenAQ (air quality) APIs every
N minutes via APScheduler.  Falls back to zone-aware mock data when no
API key is configured, so the demo works out of the box.

Fires up to 5 trigger types automatically:
  1. HEAVY_RAIN   – rainfall > 70 mm / 24h estimate
  2. EXTREME_HEAT – temperature > 42 °C
  3. FLASH_FLOOD  – rain spike + high wind
  4. AQI_SPIKE    – AQI index > 350
  5. ZONE_LOCKDOWN – mock civic event feed (low-probability daily signal)

Deduplication: a trigger is not re-fired for the same zone+type within
TRIGGER_COOLDOWN_HOURS (default 6h).
"""
import os
import random
import logging
from datetime import datetime, timedelta
from typing import Optional

import requests

from ..database import SessionLocal
from ..models import TriggerEvent, TriggerType, Policy, PolicyStatus
from .claims_service import process_zero_touch_claims

logger = logging.getLogger(__name__)

OPENWEATHER_API_KEY: str = os.getenv("OPENWEATHER_API_KEY", "")
OPENAQ_API_KEY: str = os.getenv("OPENAQ_API_KEY", "")
TRIGGER_COOLDOWN_HOURS: int = int(os.getenv("TRIGGER_COOLDOWN_HOURS", "6"))

# Thresholds (can be tuned via env vars)
RAIN_THRESHOLD_MM: float = float(os.getenv("RAIN_THRESHOLD_MM", "70"))
HEAT_THRESHOLD_C: float = float(os.getenv("HEAT_THRESHOLD_C", "42"))
AQI_THRESHOLD: float = float(os.getenv("AQI_THRESHOLD", "350"))
FLASH_FLOOD_RAIN_MM: float = float(os.getenv("FLASH_FLOOD_RAIN_MM", "80"))
FLASH_FLOOD_WIND_KMH: float = float(os.getenv("FLASH_FLOOD_WIND_KMH", "45"))
LOCKDOWN_DAILY_PROB: float = float(os.getenv("LOCKDOWN_DAILY_PROB", "0.02"))

# Geographic zone configuration (lat/lon used for live API calls)
ZONE_CONFIG: dict[str, dict] = {
    "ZONE_A": {
        "city": "Bangalore",
        "neighbourhood": "Koramangala",
        "lat": 12.9352,
        "lon": 77.6245,
        "risk_tier": "Low",
    },
    "ZONE_B": {
        "city": "Mumbai",
        "neighbourhood": "Dharavi",
        "lat": 19.0464,
        "lon": 72.8556,
        "risk_tier": "High",
    },
    "ZONE_C": {
        "city": "Delhi",
        "neighbourhood": "Connaught Place",
        "lat": 28.6315,
        "lon": 77.2167,
        "risk_tier": "High",
    },
    "ZONE_D": {
        "city": "Hyderabad",
        "neighbourhood": "Hitec City",
        "lat": 17.4435,
        "lon": 78.3772,
        "risk_tier": "Medium",
    },
    "ZONE_E": {
        "city": "Chennai",
        "neighbourhood": "Egmore",
        "lat": 13.0732,
        "lon": 80.2609,
        "risk_tier": "Medium",
    },
    "ZONE_F": {
        "city": "Kolkata",
        "neighbourhood": "Salt Lake",
        "lat": 22.5726,
        "lon": 88.4155,
        "risk_tier": "High",
    },
}

# --------------------------------------------------------------------------- #
# Weather helpers
# --------------------------------------------------------------------------- #

def _mock_weather(zone: str) -> dict:
    """
    Deterministic mock weather seeded per zone+hour so values are stable
    within a given check window but vary realistically across runs.
    """
    # Typical April baseline conditions per zone
    baselines: dict[str, dict] = {
        "ZONE_A": {"rain_1h": 0.0, "rain_3h": 0.5,  "temp": 26.0, "wind_kmh": 9.0},
        "ZONE_B": {"rain_1h": 2.0, "rain_3h": 9.0,  "temp": 31.0, "wind_kmh": 18.0},
        "ZONE_C": {"rain_1h": 0.0, "rain_3h": 0.2,  "temp": 38.0, "wind_kmh": 12.0},
        "ZONE_D": {"rain_1h": 0.0, "rain_3h": 1.0,  "temp": 34.0, "wind_kmh": 10.0},
        "ZONE_E": {"rain_1h": 1.0, "rain_3h": 4.0,  "temp": 35.0, "wind_kmh": 15.0},
        "ZONE_F": {"rain_1h": 3.0, "rain_3h": 14.0, "temp": 33.0, "wind_kmh": 22.0},
    }
    b = baselines.get(zone, {"rain_1h": 0.0, "rain_3h": 0.5, "temp": 30.0, "wind_kmh": 10.0})

    seed = int(datetime.utcnow().strftime("%Y%m%d%H")) + abs(hash(zone)) % 1000
    rng = random.Random(seed)

    return {
        "rain_1h":  max(0.0, b["rain_1h"]  + rng.uniform(-1.0,  5.0)),
        "rain_3h":  max(0.0, b["rain_3h"]  + rng.uniform(-3.0, 18.0)),
        "temp":     b["temp"] + rng.uniform(-1.0, 2.0),
        "wind_kmh": max(0.0, b["wind_kmh"] + rng.uniform(-3.0,  8.0)),
        "source":   "mock",
    }


def _live_weather(lat: float, lon: float) -> Optional[dict]:
    """Fetch current conditions from OpenWeatherMap (free tier)."""
    try:
        resp = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lon, "appid": OPENWEATHER_API_KEY, "units": "metric"},
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
        rain = data.get("rain", {})
        wind = data.get("wind", {})
        return {
            "rain_1h":  rain.get("1h", 0.0),
            "rain_3h":  rain.get("3h", 0.0),
            "temp":     data["main"]["temp"],
            "wind_kmh": wind.get("speed", 0.0) * 3.6,   # m/s → km/h
            "source":   "openweathermap",
        }
    except Exception as exc:
        logger.warning("OpenWeatherMap request failed: %s", exc)
        return None


def fetch_weather(zone: str) -> dict:
    cfg = ZONE_CONFIG.get(zone, {})
    if OPENWEATHER_API_KEY and cfg:
        live = _live_weather(cfg["lat"], cfg["lon"])
        if live:
            return live
    return _mock_weather(zone)


# --------------------------------------------------------------------------- #
# AQI helpers
# --------------------------------------------------------------------------- #

def _mock_aqi(zone: str) -> float:
    baselines: dict[str, float] = {
        "ZONE_A":  75.0,
        "ZONE_B": 120.0,
        "ZONE_C": 285.0,
        "ZONE_D":  95.0,
        "ZONE_E": 110.0,
        "ZONE_F": 180.0,
    }
    base = baselines.get(zone, 100.0)
    seed = int(datetime.utcnow().strftime("%Y%m%d%H")) + abs(hash(zone)) % 1000
    rng = random.Random(seed)
    return max(10.0, base + rng.uniform(-25.0, 45.0))


def _pm25_to_aqi(pm25: float) -> float:
    """Approximate US-EPA PM2.5 → AQI conversion."""
    breakpoints = [
        (0.0,    12.0,   0,  50),
        (12.1,   35.4,  51, 100),
        (35.5,   55.4, 101, 150),
        (55.5,  150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= pm25 <= c_hi:
            return ((i_hi - i_lo) / (c_hi - c_lo)) * (pm25 - c_lo) + i_lo
    return 500.0


def _live_aqi(lat: float, lon: float) -> Optional[float]:
    """Fetch PM2.5 from OpenAQ v3 (requires OPENAQ_API_KEY)."""
    if not OPENAQ_API_KEY:
        return None
    try:
        resp = requests.get(
            "https://api.openaq.org/v3/locations",
            params={
                "coordinates": f"{lat},{lon}",
                "radius": 10000,
                "limit": 5,
                "order_by": "distance",
            },
            headers={"Accept": "application/json", "X-API-Key": OPENAQ_API_KEY},
            timeout=8,
        )
        resp.raise_for_status()
        for loc in resp.json().get("results", []):
            for sensor in loc.get("sensors", []):
                if sensor.get("parameter", {}).get("name") in ("pm25", "pm10"):
                    value = sensor.get("latest", {}).get("value")
                    if value and value > 0:
                        return _pm25_to_aqi(float(value))
        return None
    except Exception as exc:
        logger.warning("OpenAQ request failed: %s", exc)
        return None


def fetch_aqi(zone: str) -> float:
    cfg = ZONE_CONFIG.get(zone, {})
    if cfg:
        live = _live_aqi(cfg["lat"], cfg["lon"])
        if live is not None:
            return live
    return _mock_aqi(zone)


# --------------------------------------------------------------------------- #
# Core scheduler job
# --------------------------------------------------------------------------- #

def _on_cooldown(db, zone: str, trigger_type: TriggerType) -> bool:
    cutoff = datetime.utcnow() - timedelta(hours=TRIGGER_COOLDOWN_HOURS)
    return (
        db.query(TriggerEvent)
        .filter(
            TriggerEvent.zone == zone,
            TriggerEvent.trigger_type == trigger_type,
            TriggerEvent.timestamp >= cutoff,
        )
        .first()
    ) is not None


def _fire(db, zone: str, trigger_type: TriggerType, severity: float) -> TriggerEvent:
    event = TriggerEvent(
        zone=zone,
        trigger_type=trigger_type,
        severity=severity,
        timestamp=datetime.utcnow(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    logger.info(
        "[AutoTrigger] zone=%-7s type=%-14s severity=%.2f",
        zone, trigger_type.value, severity,
    )
    return event


def auto_check_all_zones() -> list[int]:
    """
    Main scheduler job: iterate every zone, check conditions, fire triggers,
    and kick off zero-touch claims processing for each fired event.

    Returns list of TriggerEvent IDs that were fired this run.
    """
    fired_ids: list[int] = []
    db = SessionLocal()
    try:
        for zone in ZONE_CONFIG:
            # Skip zones with no active policies — nothing to pay out
            if not db.query(Policy).filter(
                Policy.zone == zone,
                Policy.status == PolicyStatus.ACTIVE,
            ).first():
                continue

            # ---- Weather checks ----
            wx = fetch_weather(zone)
            rain_1h  = wx.get("rain_1h",  0.0)
            rain_3h  = wx.get("rain_3h",  0.0)
            temp     = wx.get("temp",     25.0)
            wind_kmh = wx.get("wind_kmh",  0.0)

            # Estimate 24h rainfall from 3h rate
            rain_24h_est = rain_3h * 8.0

            # Trigger 1: HEAVY_RAIN
            if rain_24h_est >= RAIN_THRESHOLD_MM:
                if not _on_cooldown(db, zone, TriggerType.HEAVY_RAIN):
                    event = _fire(db, zone, TriggerType.HEAVY_RAIN, rain_24h_est)
                    fired_ids.append(event.id)

            # Trigger 2: EXTREME_HEAT
            if temp >= HEAT_THRESHOLD_C:
                if not _on_cooldown(db, zone, TriggerType.EXTREME_HEAT):
                    event = _fire(db, zone, TriggerType.EXTREME_HEAT, temp)
                    fired_ids.append(event.id)

            # Trigger 3: FLASH_FLOOD (heavy instantaneous rain + high wind)
            if (rain_1h >= 10.0
                    and wind_kmh >= FLASH_FLOOD_WIND_KMH
                    and rain_24h_est >= FLASH_FLOOD_RAIN_MM):
                if not _on_cooldown(db, zone, TriggerType.FLASH_FLOOD):
                    event = _fire(db, zone, TriggerType.FLASH_FLOOD, rain_24h_est)
                    fired_ids.append(event.id)

            # ---- AQI check ----
            # Trigger 4: AQI_SPIKE
            aqi = fetch_aqi(zone)
            if aqi >= AQI_THRESHOLD:
                if not _on_cooldown(db, zone, TriggerType.AQI_SPIKE):
                    event = _fire(db, zone, TriggerType.AQI_SPIKE, aqi)
                    fired_ids.append(event.id)

            # ---- Civic event check (mock) ----
            # Trigger 5: ZONE_LOCKDOWN — seeded per zone per day, low probability
            seed = int(datetime.utcnow().strftime("%Y%m%d")) + abs(hash(zone)) % 1000
            if random.Random(seed).random() < LOCKDOWN_DAILY_PROB:
                if not _on_cooldown(db, zone, TriggerType.ZONE_LOCKDOWN):
                    event = _fire(db, zone, TriggerType.ZONE_LOCKDOWN, 1.0)
                    fired_ids.append(event.id)

    except Exception:
        logger.exception("Error in auto_check_all_zones")
    finally:
        db.close()

    # Process claims for every newly fired event (outside the DB session above)
    for event_id in fired_ids:
        try:
            process_zero_touch_claims(event_id)
        except Exception:
            logger.exception("Claims processing failed for trigger %d", event_id)

    if fired_ids:
        logger.info("[AutoTrigger] Fired %d trigger(s) this run: %s", len(fired_ids), fired_ids)

    return fired_ids
