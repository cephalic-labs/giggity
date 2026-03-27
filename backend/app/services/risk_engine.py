import joblib
import numpy as np
import os
from sklearn.linear_model import LinearRegression

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "premium_model.joblib")

def train_dummy_model():
    """Train a mock Scikit-learn model to calculate premium dynamically"""
    # Features: [zone_risk_score, recent_disruptions_count, weather_forecast_severity]
    # y = base premium amount
    X = np.array([
        [0.1, 0, 0.2],  # Low risk zone
        [0.5, 1, 0.5],  # Medium risk zone
        [0.9, 3, 0.9],  # High risk zone
        [0.3, 0, 0.1],
        [0.8, 2, 0.6]
    ])
    y = np.array([15.0, 30.0, 50.0, 20.0, 45.0])
    
    model = LinearRegression()
    model.fit(X, y)
    
    joblib.dump(model, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

def load_model():
    if not os.path.exists(MODEL_PATH):
        train_dummy_model()
    return joblib.load(MODEL_PATH)

def predict_premium(zone_name: str) -> tuple[float, str]:
    model = load_model()
    
    # Mocking zone feature extraction map
    zone_features = {
        "ZONE_A": [0.1, 0, 0.2],  # Low risk
        "ZONE_B": [0.5, 1, 0.5],  # Med risk
        "ZONE_C": [0.9, 2, 0.8],  # High risk
    }
    features = zone_features.get(zone_name, [0.3, 0, 0.3])
    
    # Predict using the dummy model
    premium = float(model.predict([features])[0])
    
    # Calculate Risk Level string based on features
    if features[0] >= 0.7:
        risk_level = "High"
    elif features[0] >= 0.4:
        risk_level = "Medium"
    else:
        risk_level = "Low"
        
    return max(10.0, premium), risk_level # Minimum premium is 10

if __name__ == "__main__":
    train_dummy_model()
