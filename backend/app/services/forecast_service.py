import requests
"""
Forecast Service Module

This module provides weather forecast analysis and risk assessment for insurance policies
across multiple Indian zones. It integrates weather data from Open-Meteo API with a risk
evaluation engine to calculate premiums and expected payouts.

Key Features:
- Fetches weather forecasts (temperature, precipitation) for predefined zones
- Normalizes and processes forecast data
- Evaluates risk levels based on weather conditions
- Calculates zone-specific policy impacts and payouts
- Suggests premium adjustments using ML model predictions
- Returns comprehensive weekly forecast summaries

Main Components:
- fetch_forecast(): Retrieves weather data from Open-Meteo API
- normalize_forecast(): Structures raw forecast data into standardized format
- run_risk_on_forecast(): Evaluates risk for each forecast day
- summarize_week(): Identifies peak risk day in the week
- calculate_zone_impact(): Queries policies and calculates expected payouts
- suggest_premium(): Predicts premium adjustments using ML model
- generate_weekly_forecast(): Orchestrates entire pipeline for all zones

Note: The file path "/home/horcrux/Projects/giggity/backend/app/services/forcast_service.py"
contains a typo: "forcast" should be "forecast" for consistency with Python naming conventions.
"""
import joblib
import os
from typing import List, Dict, Any

from app.services.risk_engine import evaluate_risk
from app.database import SessionLocal
from app.models import Policy
from app.models import PolicyStatus


# -----------------------------
# CONFIG
# -----------------------------

ZONES = [
    {"name": "chennai", "lat": 13.0827, "lon": 80.2707},
    {"name": "delhi", "lat": 28.6139, "lon": 77.2090},
    {"name": "mumbai", "lat": 19.0760, "lon": 72.8777},
    {"name": "kolkata", "lat": 22.5726, "lon": 88.3639},
    {"name": "bangalore", "lat": 12.9716, "lon": 77.5946},
    {"name": "hyderabad", "lat": 17.3850, "lon": 78.4867},
]

PAYOUT_PER_POLICY = 500

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Load ML model (safe load)
MODEL_PATH = "/app/premium_model.joblib"
try:
    premium_model = joblib.load(MODEL_PATH)
except Exception:
    premium_model = None


# -----------------------------
# FETCH FORECAST
# -----------------------------

def get_weather(lat: float, lon: float) -> Dict[str, Any] | None:
    try:
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,precipitation_sum",
            "timezone": "auto",
        }
        response = requests.get(OPEN_METEO_URL, params=params, timeout=5)
        response.raise_for_status()

        payload = response.json()
        return payload.get("daily")

    except Exception as e:
        print(f"[Weather API Error] {lat},{lon} -> {e}")
        return None


def fetch_forecast(lat: float, lon: float) -> Dict[str, Any] | None:
    daily = get_weather(lat, lon)
    if daily is None:
        return None
    return {"daily": daily}


# -----------------------------
# NORMALIZE DATA
# -----------------------------

def normalize_forecast(raw: Dict[str, Any], zone: str) -> List[Dict]:
    if not raw or "daily" not in raw:
        return []

    days = raw["daily"].get("time", [])
    temps = raw["daily"].get("temperature_2m_max", [])
    rain = raw["daily"].get("precipitation_sum", [])

    normalized = []

    for i in range(len(days)):
        normalized.append({
            "zone": zone,
            "date": days[i],
            "temperature": temps[i] if i < len(temps) else 0,
            "rainfall": rain[i] if i < len(rain) else 0
        })

    return normalized


def extract_features(weather: Dict[str, Any]) -> Dict[str, float]:
    temperatures = weather.get("temperature_2m_max", []) if weather else []
    rainfall = weather.get("precipitation_sum", []) if weather else []

    max_temp = max(temperatures) if temperatures else 0.0
    rain_total = sum(rainfall) if rainfall else 0.0

    return {
        "heat": float(max_temp),
        "rain": float(rain_total),
    }


def compute_risk(features: Dict[str, float]) -> tuple[str, float]:
    if features.get("rain", 0.0) > 50:
        return "rain", 0.8
    if features.get("heat", 0.0) > 40:
        return "heat", 0.7
    return "low", 0.2


# -----------------------------
# RISK ENGINE PIPELINE
# -----------------------------

def run_risk_on_forecast(data: List[Dict]) -> List[Dict]:
    predictions = []

    for day in data:
        try:
            result = evaluate_risk(
                temperature=day["temperature"],
                rainfall=day["rainfall"]
            )

            confidence = result.get("confidence", 0)
            confidence = max(0, min(confidence, 1))  # clamp

            predictions.append({
                "date": day["date"],
                "risk": result.get("risk", "none"),
                "confidence": round(confidence, 2)
            })

        except Exception as e:
            print(f"[Risk Error] {day} -> {e}")

    return predictions


# -----------------------------
# WEEK SUMMARY
# -----------------------------

def summarize_week(predictions: List[Dict]) -> Dict:
    top = {"risk": "none", "confidence": 0}

    for p in predictions:
        if p["confidence"] > top["confidence"]:
            top = p

    return top


# -----------------------------
# DB + PAYOUT CALCULATION
# -----------------------------

def calculate_zone_impact(zone: str, confidence: float):
    db = SessionLocal()

    try:
        total_policies = db.query(Policy).filter(
            Policy.zone.ilike(zone),
            Policy.status == PolicyStatus.ACTIVE
        ).count()
        total_policies = total_policies or 0

        expected_payouts = int(total_policies * confidence)
        payout_inr = expected_payouts * PAYOUT_PER_POLICY

        return total_policies, expected_payouts, payout_inr

    except Exception as e:
        print(f"[DB Error] {zone} -> {e}")
        return 0, 0, 0

    finally:
        db.close()


# -----------------------------
# PREMIUM SUGGESTION
# -----------------------------

def suggest_premium(confidence: float, risk: str) -> str:
    # Data-driven premium adjustment: scales linearly with confidence
    # Higher risk (confidence) → higher premium adjustment
    premium_change = int(confidence * 15)
    return f"+{premium_change}%"


# -----------------------------
# MAIN ORCHESTRATOR
# -----------------------------

def generate_weekly_forecast() -> List[Dict]:
    results = []

    for zone in ZONES:
        raw = fetch_forecast(zone["lat"], zone["lon"])

        if raw is None:
            continue

        features = extract_features(raw.get("daily", {}))
        risk, confidence = compute_risk(features)

        normalized = normalize_forecast(raw, zone["name"])

        if not normalized:
            continue

        total, expected, payout = calculate_zone_impact(
            zone["name"],
            confidence
        )

        premium = suggest_premium(
            confidence,
            risk
        )

        results.append({
            "zone": zone["name"],
            "risk": risk,
            "confidence": confidence,
            "features": features,
            "active_policies": total,
            "expected_payouts": expected,
            "payout_inr": payout,
            "premium_change": premium
        })

    return results if results else [{"message": "No forecast data available"}]