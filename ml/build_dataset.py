"""
Historical dataset builder for the Giggity risk engine.

Fetches 3 years (2022-2024) of daily weather + air quality for each zone
from Open-Meteo's free archive APIs (no API key required), aggregates to
weekly disruption features, derives actuarial premium targets, and saves
the result to ml/zone_training_data.csv.

Run from the repo root:
    poetry run python ml/build_dataset.py
"""
import sys
import time
from pathlib import Path

import requests
import pandas as pd
import numpy as np

# ── Zone configuration ──────────────────────────────────────────────────────
ZONES: dict[str, dict] = {
    "ZONE_A": {"city": "Bangalore",  "lat": 12.9352, "lon": 77.6245},
    "ZONE_B": {"city": "Mumbai",     "lat": 19.0464, "lon": 72.8556},
    "ZONE_C": {"city": "Delhi",      "lat": 28.6315, "lon": 77.2167},
    "ZONE_D": {"city": "Hyderabad",  "lat": 17.4435, "lon": 78.3772},
    "ZONE_E": {"city": "Chennai",    "lat": 13.0732, "lon": 80.2609},
    "ZONE_F": {"city": "Kolkata",    "lat": 22.5726, "lon": 88.4155},
}

START_DATE = "2022-01-01"
END_DATE   = "2024-12-31"

# Parametric thresholds (mirrors trigger_service.py)
RAIN_HEAVY_MM  = 70.0
HEAT_C         = 42.0
FLASH_RAIN_MM  = 80.0
FLASH_WIND_KMH = 45.0
PM25_HAZARDOUS = 150.0   # ≈ AQI 200 — severe health risk

# Actuarial parameters
COVER_AMOUNT_INR = 500.0
TARGET_LOSS_RATIO = 0.50   # claims paid / premiums collected
MIN_PREMIUM_INR   = 15.0
MAX_PREMIUM_INR   = 50.0

OUTPUT_PATH = Path(__file__).parent / "zone_training_data.csv"


# ── API fetchers ─────────────────────────────────────────────────────────────

def fetch_weather(lat: float, lon: float, zone: str) -> pd.DataFrame:
    """Daily precipitation, max temp, max wind speed from Open-Meteo archive."""
    print(f"  Fetching weather for {zone} ({lat}, {lon})...")
    resp = requests.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params={
            "latitude":        lat,
            "longitude":       lon,
            "start_date":      START_DATE,
            "end_date":        END_DATE,
            "daily":           "precipitation_sum,temperature_2m_max,wind_speed_10m_max",
            "timezone":        "Asia/Kolkata",
            "wind_speed_unit": "kmh",
        },
        timeout=30,
    )
    resp.raise_for_status()
    daily = resp.json()["daily"]

    df = pd.DataFrame({
        "date":         pd.to_datetime(daily["time"]),
        "rain_mm":      daily["precipitation_sum"],
        "temp_max_c":   daily["temperature_2m_max"],
        "wind_max_kmh": daily["wind_speed_10m_max"],
    })
    df = df.fillna(0)
    return df


def fetch_aqi(lat: float, lon: float, zone: str) -> pd.DataFrame:
    """
    Daily max PM2.5 from Open-Meteo air quality archive.
    Returns daily aggregates (max PM2.5 per day).
    """
    print(f"  Fetching AQI for {zone} ({lat}, {lon})...")
    resp = requests.get(
        "https://air-quality-api.open-meteo.com/v1/air-quality",
        params={
            "latitude":   lat,
            "longitude":  lon,
            "start_date": START_DATE,
            "end_date":   END_DATE,
            "hourly":     "pm2_5",
            "timezone":   "Asia/Kolkata",
        },
        timeout=30,
    )
    resp.raise_for_status()
    hourly = resp.json()["hourly"]

    df = pd.DataFrame({
        "datetime": pd.to_datetime(hourly["time"]),
        "pm25":     hourly["pm2_5"],
    })
    df["date"] = df["datetime"].dt.normalize()
    daily_max = (
        df.groupby("date")["pm25"]
        .max()
        .reset_index()
        .rename(columns={"pm25": "pm25_max"})
    )
    daily_max["pm25_max"] = daily_max["pm25_max"].fillna(0)
    return daily_max


# ── Feature engineering ──────────────────────────────────────────────────────

def compute_weekly_features(wx: pd.DataFrame, aqi: pd.DataFrame, zone: str) -> pd.DataFrame:
    """
    Aggregate daily data to ISO weeks, compute disruption indicators,
    and return one row per week.
    """
    merged = wx.merge(aqi, on="date", how="left")
    merged["pm25_max"] = merged["pm25_max"].fillna(0)

    # Disruption flags (mirrors parametric thresholds)
    merged["heavy_rain_day"]  = (merged["rain_mm"]      >= RAIN_HEAVY_MM ).astype(int)
    merged["heat_day"]        = (merged["temp_max_c"]   >= HEAT_C        ).astype(int)
    merged["flash_flood_day"] = (
        (merged["rain_mm"]      >= FLASH_RAIN_MM) &
        (merged["wind_max_kmh"] >= FLASH_WIND_KMH)
    ).astype(int)
    merged["aqi_hazard_day"]  = (merged["pm25_max"]     >= PM25_HAZARDOUS).astype(int)
    merged["any_disruption"]  = (
        merged["heavy_rain_day"] | merged["heat_day"] |
        merged["flash_flood_day"] | merged["aqi_hazard_day"]
    ).astype(int)

    merged["iso_year"] = merged["date"].dt.isocalendar().year
    merged["iso_week"] = merged["date"].dt.isocalendar().week

    weekly = merged.groupby(["iso_year", "iso_week"]).agg(
        rain_max_mm        = ("rain_mm",         "max"),
        rain_total_mm      = ("rain_mm",         "sum"),
        temp_max_c         = ("temp_max_c",      "max"),
        wind_max_kmh       = ("wind_max_kmh",    "max"),
        pm25_max           = ("pm25_max",        "max"),
        pm25_mean          = ("pm25_max",        "mean"),
        heavy_rain_days    = ("heavy_rain_day",  "sum"),
        heat_days          = ("heat_day",        "sum"),
        flash_flood_days   = ("flash_flood_day", "sum"),
        aqi_hazard_days    = ("aqi_hazard_day",  "sum"),
        disruption_days    = ("any_disruption",  "sum"),
    ).reset_index()

    weekly["zone"]            = zone
    weekly["disruption_weeks"] = (weekly["disruption_days"] > 0).astype(int)
    return weekly


def derive_premium(weekly: pd.DataFrame) -> pd.DataFrame:
    """
    Actuarially-derived weekly premium.

    Zone-level base premium:
      Derived from the historical disruption frequency (fraction of weeks
      where at least one parametric threshold was breached). Frequencies
      are linearly normalised to the [MIN_PREMIUM, MAX_PREMIUM] product range
      so that the safest zone → ₹15/week and the riskiest → ₹50/week.

    Per-week adjustment (±₹3):
      A z-score of the week's rain and AQI relative to the zone's own
      historical distribution adds a small ±3 INR signal so the model
      can learn that unusually bad weeks within a zone cost a little more.
    """
    # --- Binary threshold triggers (mirrors trigger_service.py thresholds) ---
    weekly["rain_triggered"]  = (weekly["rain_max_mm"]      >= RAIN_HEAVY_MM ).astype(int)
    weekly["heat_triggered"]  = (weekly["temp_max_c"]       >= HEAT_C        ).astype(int)
    weekly["flood_triggered"] = (weekly["flash_flood_days"]  > 0             ).astype(int)
    weekly["aqi_triggered"]   = (weekly["pm25_max"]         >= PM25_HAZARDOUS).astype(int)
    weekly["any_trigger"]     = (
        weekly[["rain_triggered", "heat_triggered",
                "flood_triggered", "aqi_triggered"]].sum(axis=1) > 0
    ).astype(int)

    # --- Zone-level disruption frequency (3-year historical mean) ---
    zone_freq = weekly.groupby("zone")["any_trigger"].transform("mean")

    global_min = weekly.groupby("zone")["any_trigger"].mean().min()
    global_max = weekly.groupby("zone")["any_trigger"].mean().max()
    denom = global_max - global_min if global_max > global_min else 1.0

    normalized_freq = (zone_freq - global_min) / denom          # 0→1 across zones
    zone_base = MIN_PREMIUM_INR + (MAX_PREMIUM_INR - MIN_PREMIUM_INR) * normalized_freq

    # --- Per-week severity adjustment ±3 INR ---
    zone_rain_mean = weekly.groupby("zone")["rain_max_mm"].transform("mean")
    zone_rain_std  = weekly.groupby("zone")["rain_max_mm"].transform("std").clip(lower=0.1)
    zone_aqi_mean  = weekly.groupby("zone")["pm25_max"].transform("mean")
    zone_aqi_std   = weekly.groupby("zone")["pm25_max"].transform("std").clip(lower=0.1)

    rain_z = ((weekly["rain_max_mm"] - zone_rain_mean) / zone_rain_std).clip(-2, 2)
    aqi_z  = ((weekly["pm25_max"]    - zone_aqi_mean)  / zone_aqi_std ).clip(-2, 2)
    weekly_adj = (0.5 * rain_z + 0.5 * aqi_z) * 1.5              # ±3 INR

    premium = (zone_base + weekly_adj).clip(MIN_PREMIUM_INR, MAX_PREMIUM_INR)
    weekly["premium_target_inr"] = premium.round(2)
    return weekly


# ── Model feature set ─────────────────────────────────────────────────────────

def build_model_features(weekly: pd.DataFrame, zone: str) -> pd.DataFrame:
    """
    Compute the 6 features used by risk_engine.py from historical weekly data.
    Returns one row per week (each is an independent training sample).

    Feature columns:
      flood_risk, avg_temp_c, aqi_baseline, congestion_score,
      coastal_proximity, incidents_per_week
    """
    # flood_risk: fraction of heavy-rain days in the week (0–1)
    weekly["flood_risk"] = (weekly["heavy_rain_days"] / 7).clip(0, 1)

    # avg_temp_c: weekly max temperature (proxy for heat exposure)
    weekly["avg_temp_c"] = weekly["temp_max_c"]

    # aqi_baseline: weekly mean PM2.5 → scale to intuitive AQI-like range
    weekly["aqi_baseline"] = weekly["pm25_mean"].clip(0, 500)

    # congestion_score: static per zone (no time-series source available)
    congestion_map = {
        "ZONE_A": 0.55, "ZONE_B": 0.90, "ZONE_C": 0.88,
        "ZONE_D": 0.68, "ZONE_E": 0.65, "ZONE_F": 0.78,
    }
    weekly["congestion_score"] = congestion_map.get(zone, 0.60)

    # coastal_proximity: static per zone
    coastal_map = {
        "ZONE_A": 0.00, "ZONE_B": 0.85, "ZONE_C": 0.00,
        "ZONE_D": 0.05, "ZONE_E": 0.85, "ZONE_F": 0.55,
    }
    weekly["coastal_proximity"] = coastal_map.get(zone, 0.20)

    # incidents_per_week: number of distinct disruption types triggered this week
    weekly["incidents_per_week"] = (
        (weekly["heavy_rain_days"] > 0).astype(int) +
        (weekly["heat_days"]       > 0).astype(int) +
        (weekly["flash_flood_days"] > 0).astype(int) +
        (weekly["aqi_hazard_days"] > 0).astype(int)
    ).astype(float)

    cols = [
        "zone", "iso_year", "iso_week",
        "flood_risk", "avg_temp_c", "aqi_baseline",
        "congestion_score", "coastal_proximity", "incidents_per_week",
        "rain_max_mm", "temp_max_c", "pm25_max",
        "disruption_days", "disruption_weeks",
        "premium_target_inr",
    ]
    return weekly[cols]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Step 1: fetch raw weekly data for all zones (no premiums yet)
    raw_frames: list[pd.DataFrame] = []

    for zone, cfg in ZONES.items():
        print(f"\n[{zone}] {cfg['city']}")
        try:
            wx  = fetch_weather(cfg["lat"], cfg["lon"], zone)
            time.sleep(0.5)
            aq  = fetch_aqi(cfg["lat"], cfg["lon"], zone)
            time.sleep(0.5)

            weekly = compute_weekly_features(wx, aq, zone)
            raw_frames.append(weekly)
            print(f"  → {len(weekly)} weekly samples  "
                  f"(disruption rate: {weekly['disruption_weeks'].mean():.1%})")

        except Exception as exc:
            print(f"  ERROR: {exc}", file=sys.stderr)

    if not raw_frames:
        print("No data fetched — aborting.", file=sys.stderr)
        sys.exit(1)

    # Step 2: combine ALL zones, then derive premiums with cross-zone normalisation
    all_weekly = pd.concat(raw_frames, ignore_index=True)
    all_weekly = derive_premium(all_weekly)

    # Step 3: build model feature columns
    feature_frames: list[pd.DataFrame] = []
    for zone in all_weekly["zone"].unique():
        zone_df = all_weekly[all_weekly["zone"] == zone].copy()
        feature_frames.append(build_model_features(zone_df, zone))

    dataset = pd.concat(feature_frames, ignore_index=True)
    dataset.to_csv(OUTPUT_PATH, index=False)
    print(f"\n✓ Saved {len(dataset)} rows to {OUTPUT_PATH}")

    # Summary table
    summary = dataset.groupby("zone").agg(
        samples         = ("iso_week",           "count"),
        disruption_rate = ("disruption_weeks",   "mean"),
        avg_premium_inr = ("premium_target_inr", "mean"),
        min_premium_inr = ("premium_target_inr", "min"),
        max_premium_inr = ("premium_target_inr", "max"),
    ).round(2)
    print("\nZone summary:")
    print(summary.to_string())


if __name__ == "__main__":
    main()
