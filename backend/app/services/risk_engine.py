"""
Hyperlocal Risk Engine — Gradient Boosting premium predictor.

Features per zone (in order):
  [flood_risk, avg_temp_c, aqi_baseline, congestion_score,
   coastal_proximity, incidents_per_week]

Training data: 948 real weekly samples (2022-2024) fetched from Open-Meteo
weather + air quality archive APIs for 6 Indian city zones.
Source: ml/zone_training_data.csv  (regenerate with: poetry run python ml/build_dataset.py)

Premium range: INR 15–50 per week (aligns with product README).
"""
import os
import logging
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "premium_model.joblib")

# DATASET_PATH resolves in priority order:
#   1. DATASET_PATH env var (set by Docker to /app/ml/zone_training_data.csv)
#   2. backend/ml/  — self-contained deployment copy
#   3. repo root ml/ — local dev working tree
_here = os.path.dirname(__file__)
_dataset_candidates = [
    os.path.join(_here, "..", "..", "ml", "zone_training_data.csv"),
    os.path.join(_here, "..", "..", "..", "ml", "zone_training_data.csv"),
]
DATASET_PATH: str = os.environ.get("DATASET_PATH") or next(
    (p for p in _dataset_candidates if os.path.exists(p)), _dataset_candidates[0]
)

FEATURE_COLS = [
    "flood_risk", "avg_temp_c", "aqi_baseline",
    "congestion_score", "coastal_proximity", "incidents_per_week",
]

# Per-zone canonical feature vector (historical means from the training CSV).
# Computed at startup from the real dataset; kept as a dict for fast inference.
ZONE_FEATURES: dict[str, list[float]] = {}


def _load_dataset() -> pd.DataFrame:
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(
            f"Training dataset not found at {DATASET_PATH}. "
            "Run: poetry run python ml/build_dataset.py"
        )
    return pd.read_csv(DATASET_PATH)


def _compute_zone_features(df: pd.DataFrame) -> dict[str, list[float]]:
    """Compute per-zone mean feature vectors from the training dataset."""
    zone_means = df.groupby("zone")[FEATURE_COLS].mean()
    return {zone: row.tolist() for zone, row in zone_means.iterrows()}


def train_model() -> GradientBoostingRegressor:
    df = _load_dataset()
    X = df[FEATURE_COLS].values
    y = df["premium_target_inr"].values

    model = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    logger.info("Risk engine model trained on %d real weekly samples.", len(df))
    return model


def _ensure_zone_features() -> None:
    """Populate ZONE_FEATURES from the CSV if not already loaded."""
    if ZONE_FEATURES:
        return
    try:
        df = _load_dataset()
        ZONE_FEATURES.update(_compute_zone_features(df))
    except FileNotFoundError:
        logger.warning("Training dataset missing — falling back to hardcoded zone features.")
        ZONE_FEATURES.update({
            "ZONE_A": [0.00, 30.1,  35.4, 0.55, 0.00, 0.0],
            "ZONE_B": [0.17, 32.0,  78.7, 0.90, 0.85, 1.0],
            "ZONE_C": [0.06, 32.4, 121.2, 0.88, 0.00, 2.0],
            "ZONE_D": [0.01, 32.3,  46.2, 0.68, 0.05, 0.1],
            "ZONE_E": [0.03, 32.7,  36.3, 0.65, 0.85, 0.2],
            "ZONE_F": [0.14, 32.6,  96.1, 0.78, 0.55, 1.1],
        })


def load_model() -> GradientBoostingRegressor:
    if not os.path.exists(MODEL_PATH):
        return train_model()
    return joblib.load(MODEL_PATH)


def predict_premium(
    zone: str,
    realtime_override: dict[str, float] | None = None,
) -> tuple[float, str]:
    """
    Predict weekly premium for a zone.

    Args:
        zone: Zone ID (e.g. "ZONE_A").
        realtime_override: Optional live signal overrides keyed by feature name:
            flood_risk, avg_temp_c, aqi_baseline, congestion_score,
            coastal_proximity, incidents_per_week

    Returns:
        (premium_inr, risk_level)  — risk_level is "Low" | "Medium" | "High"
    """
    _ensure_zone_features()
    model = load_model()

    # Fall back to a generic medium-risk profile for unknown zones
    default = [0.10, 32.0, 80.0, 0.65, 0.20, 0.5]
    features = list(ZONE_FEATURES.get(zone, default))

    if realtime_override:
        key_to_idx = {k: i for i, k in enumerate(FEATURE_COLS)}
        for key, value in realtime_override.items():
            idx = key_to_idx.get(key)
            if idx is not None:
                features[idx] = float(value)

    premium = float(model.predict([features])[0])

    flood_risk, temp, aqi_pm25 = features[0], features[1], features[2]
    # aqi_baseline is mean PM2.5 in µg/m³ (from Open-Meteo archive)
    # Thresholds: 70 µg/m³ ≈ US AQI 160 (Unhealthy); 35 µg/m³ ≈ AQI 101 (Moderate)
    if flood_risk >= 0.10 or aqi_pm25 >= 70 or temp >= 38:
        risk_level = "High"
    elif flood_risk >= 0.03 or aqi_pm25 >= 35 or temp >= 33:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return max(10.0, round(premium, 2)), risk_level


if __name__ == "__main__":
    train_model()
    _ensure_zone_features()
    for z in sorted(ZONE_FEATURES):
        p, r = predict_premium(z)
        print(f"{z}: INR {p}/week  [{r} risk]  features={[round(f,2) for f in ZONE_FEATURES[z]]}")
