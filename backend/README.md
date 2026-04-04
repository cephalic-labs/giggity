# Giggity Backend

FastAPI backend for the Giggity parametric income insurance platform.

---

## Table of Contents

- [What Is Implemented](#what-is-implemented)
- [Architecture Overview](#architecture-overview)
- [ML Risk Engine](#ml-risk-engine)
- [Automated Trigger System](#automated-trigger-system)
- [API Reference](#api-reference)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [End-to-End Walkthrough](#end-to-end-walkthrough)
- [Project Structure](#project-structure)
- [Data Pipeline](#data-pipeline)

---

## What Is Implemented

### Registration and Authentication
- `POST /api/v1/auth/register` — worker registration with email, phone, zone, and password
- `POST /api/v1/auth/token` — login, returns JWT access + refresh tokens
- `POST /api/v1/auth/refresh` — token refresh
- `GET  /api/v1/auth/me` — current user profile and role
- Role-based access control: `WORKER` and `ADMIN` roles
- Admin accounts bootstrapped via `ADMIN_BOOTSTRAP_EMAILS` environment variable

### Insurance Policy Management
- `GET  /api/v1/policy/quote` — ML-priced weekly premium quote for a zone
- `POST /api/v1/payments/checkout` — create a payment session
- `POST /api/v1/payments/confirm` — confirm payment and activate policy
- `POST /api/v1/policy/create` — create policy from a confirmed payment
- `GET  /api/v1/policy/active/{user_id}` — list active policies for a worker
- `GET  /api/v1/payments/{user_id}` — payment history

### Dynamic Premium Calculation
Premium is predicted by a `GradientBoostingRegressor` trained on **948 real weekly samples** (2022–2024) fetched from Open-Meteo's free historical APIs. Features per zone:

| Feature | Source | Description |
|---|---|---|
| `flood_risk` | Open-Meteo weather archive | Fraction of week with precipitation ≥ 70mm |
| `avg_temp_c` | Open-Meteo weather archive | Weekly max temperature |
| `aqi_baseline` | Open-Meteo air quality archive | Weekly mean PM2.5 (µg/m³) |
| `congestion_score` | Static (zone metadata) | Urban density proxy |
| `coastal_proximity` | Static (zone metadata) | Distance from coast/water body |
| `incidents_per_week` | Derived | Count of distinct disruption types per week |

Current zone premiums (derived from 3-year historical disruption frequencies):

| Zone | City | Disruption Rate | Weekly Premium | Risk Tier |
|---|---|---|---|---|
| ZONE_A | Bangalore (Koramangala) | 0.0% | INR 15.53 | Low |
| ZONE_D | Hyderabad (Hitec City) | 1.3% | INR 16.07 | Low |
| ZONE_E | Chennai (Egmore) | 2.5% | INR 16.79 | Low |
| ZONE_B | Mumbai (Dharavi) | 20.9% | INR 30.09 | Medium |
| ZONE_F | Kolkata (Salt Lake) | 25.9% | INR 34.34 | Medium |
| ZONE_C | Delhi (Connaught Place) | 47.5% | INR 49.75 | High |

Coverage amount is INR 500 per week across all zones. The quote endpoint also applies a context multiplier for elevated conditions (e.g. `disruption_context=PANDEMIC` adds 25%).

### Claims Management
- `GET /api/v1/claims/{user_id}` — all claims for a worker
- `GET /api/v1/claims/lifecycle/{user_id}` — full claim lifecycle with trigger details and payout status
- `GET /api/v1/payouts/{user_id}` — payout ledger for a worker

Claims are created and paid out automatically with zero manual steps (see below).

### Zero-Touch Claims Engine
When a trigger fires, the system automatically:
1. Finds all active policies in the affected zone
2. Computes payout amount based on trigger type and severity
3. Creates a `Claim` record with status `APPROVED`
4. Creates a `PayoutLedger` record with status `INITIATED`
5. Advances both to `PAID` / `RELEASED` immediately (simulates instant UPI disbursement)

Payout ratios by trigger type:

| Trigger | Threshold | Payout Ratio |
|---|---|---|
| `HEAVY_RAIN` | Rainfall ≥ 70mm/24h | 100% of cover |
| `EXTREME_HEAT` | Temperature ≥ 42°C | 100% of cover |
| `AQI_SPIKE` | AQI ≥ 350 | 100% of cover |
| `FLASH_FLOOD` | Rain ≥ 80mm + Wind ≥ 45km/h | 100% of cover |
| `ZONE_LOCKDOWN` | Civic event confirmed | 75% of cover |
| `PANDEMIC` | Severity ≥ 0.85 | 100% of cover |
| `PANDEMIC` | Severity 0.70–0.85 | 80% of cover |

### Automated Trigger Polling
An `APScheduler` background job runs every `TRIGGER_POLL_MINUTES` (default 5) and polls weather and air quality data for all 6 zones. It fires triggers automatically when thresholds are breached:

| Trigger | Data Source | Fallback |
|---|---|---|
| `HEAVY_RAIN` | OpenWeatherMap API | Zone-aware mock data |
| `EXTREME_HEAT` | OpenWeatherMap API | Zone-aware mock data |
| `FLASH_FLOOD` | OpenWeatherMap API (rain + wind) | Zone-aware mock data |
| `AQI_SPIKE` | OpenAQ v3 API | Zone-aware mock data |
| `ZONE_LOCKDOWN` | Mock civic event feed | Seeded RNG (2% daily prob.) |

The mock fallback is deterministic — seeded by zone + current hour — so it produces stable, realistic values during demos without any API keys configured.

Triggers are deduplicated: the same zone + trigger type will not re-fire within `TRIGGER_COOLDOWN_HOURS` (default 6h).

### Admin Endpoints
- `POST /api/v1/admin/triggers` — manually fire a disruption trigger
- `GET  /api/v1/admin/triggers` — list recent trigger events
- `GET  /api/v1/admin/metrics` — platform dashboard (workers, policies, claims, payouts, scheduler status)
- `POST /api/v1/admin/seed-demo` — create a ready-to-test worker + active policy
- `GET  /api/v1/zones` — all zones with ML-predicted premiums and risk tiers

---

## Architecture Overview

```
HTTP Request
    │
    ▼
FastAPI (app/main.py)
    │
    ├── JWT Auth  ─────────────────��────────────  AuthCredential (SQLite)
    │
    ├── /api/v1/policy/quote  ────────���─────────  risk_engine.py
    │                                              └── GBR model (premium_model.joblib)
    │                                              └── trained on zone_training_data.csv
    │
    ├── /api/v1/payments/*  ────────────────────  PaymentTransaction (SQLite)
    │       └── confirm → policy activated
    │
    ├── /api/v1/admin/triggers (POST)  ─────────  TriggerEvent (SQLite)
    │       └── background task → claims_service.process_zero_touch_claims()
    │
    └── APScheduler (every 5 min)  ─────────────  trigger_service.auto_check_all_zones()
            └── fetch_weather()  ───────────────  OpenWeatherMap / mock
            └── fetch_aqi()  ───────────────────  OpenAQ / mock
            └── _fire() → TriggerEvent
            └── process_zero_touch_claims()
                    └── Claim → PayoutLedger (SQLite)
```

---

## ML Risk Engine

**Model:** `GradientBoostingRegressor` (`n_estimators=200`, `max_depth=4`, `learning_rate=0.05`)

**Training data:** `ml/zone_training_data.csv`
- 948 weekly samples across 6 Indian city zones
- Date range: 2022-01-01 to 2024-12-31
- Fetched from Open-Meteo weather and air quality historical archive APIs (free, no key)

**Premium derivation:**
- Zone base premium is set from the 3-year historical disruption frequency, linearly normalised to the INR 15–50 product range
- A per-week ±INR 3 severity adjustment (z-score of that week's rain and PM2.5 relative to the zone's own history) gives the model week-level signal to learn from
- The model learns that higher flood_risk and AQI correlate with higher premiums

**Regenerating the dataset and retraining:**
```bash
# From repo root
poetry run python ml/build_dataset.py

# Delete stale model so it retrains on next API start
rm backend/premium_model.joblib
```

---

## Automated Trigger System

The scheduler starts automatically when the FastAPI app starts (via `lifespan` context). It runs `auto_check_all_zones()` on the configured interval.

For each zone with at least one active policy:
1. Fetches current weather (OpenWeatherMap free tier, or mock if no key)
2. Estimates 24h rainfall from 3h rate (`rain_3h × 8`)
3. Checks HEAVY_RAIN, EXTREME_HEAT, FLASH_FLOOD thresholds
4. Fetches AQI (OpenAQ v3, or mock if no key / auth fails)
5. Checks AQI_SPIKE threshold
6. Checks daily seeded RNG for ZONE_LOCKDOWN civic event
7. Each fired trigger immediately invokes the zero-touch claims engine

---

## API Reference

Full interactive docs available at `http://localhost:8000/docs` when the server is running.

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | None | Register a new worker |
| POST | `/api/v1/auth/token` | None | Login, get tokens |
| POST | `/api/v1/auth/refresh` | None | Refresh access token |
| GET  | `/api/v1/auth/me` | Bearer | Current user profile |

### Policy
| Method | Path | Auth | Description |
|---|---|---|---|
| GET  | `/api/v1/policy/quote` | Bearer | ML-priced quote for a zone |
| POST | `/api/v1/policy/create` | Bearer | Create policy from payment |
| GET  | `/api/v1/policy/active/{user_id}` | Bearer | Active policies |

### Payments
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/payments/checkout` | Bearer | Create checkout session |
| POST | `/api/v1/payments/confirm` | Bearer | Confirm payment, activate policy |
| GET  | `/api/v1/payments/{user_id}` | Bearer | Payment history |

### Claims and Payouts
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/claims/{user_id}` | Bearer | All claims |
| GET | `/api/v1/claims/lifecycle/{user_id}` | Bearer | Claim lifecycle with payout status |
| GET | `/api/v1/payouts/{user_id}` | Bearer | Payout ledger |

### Zones
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/zones` | Bearer | All zones with premiums and risk tiers |

### Admin (role: ADMIN)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/admin/triggers` | Bearer + Admin | Manually fire a trigger |
| GET  | `/api/v1/admin/triggers` | Bearer + Admin | List recent trigger events |
| GET  | `/api/v1/admin/metrics` | Bearer + Admin | Platform dashboard metrics |
| POST | `/api/v1/admin/seed-demo` | Bearer + Admin | Seed a demo worker + policy |
| GET  | `/api/v1/users` | Bearer + Admin | List all users |

### Utility
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Health check |
| GET | `/` | None | Root welcome message |

---

## Prerequisites

- Python 3.11+
- [Poetry](https://python-poetry.org/docs/#installation)

---

## Local Setup

```bash
cd backend

# Install dependencies
poetry install

# Copy environment file and set your values
cp .env.example .env
```

**First time only — generate the training dataset and train the model:**
```bash
# From repo root (not backend/)
poetry run python ml/build_dataset.py
```

This fetches ~3 years of weather and AQI data from Open-Meteo (free, no API key needed) and saves `ml/zone_training_data.csv`. The ML model trains automatically on first API request if `premium_model.joblib` does not exist.

---

## Environment Variables

All variables have safe defaults for local development. Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET_KEY` | `change-me-in-production` | HS256 signing key — **change this in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | JWT refresh token lifetime |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3000,...` | Comma-separated allowed origins |
| `ADMIN_BOOTSTRAP_EMAILS` | _(empty)_ | Comma-separated emails that get ADMIN role on register |
| `TRIGGER_POLL_MINUTES` | `5` | How often the scheduler polls weather/AQI APIs |
| `OPENWEATHER_API_KEY` | _(empty)_ | Free tier key from openweathermap.org. **Leave blank for mock data.** |
| `OPENAQ_API_KEY` | _(empty)_ | Free key from openaq.org. **Leave blank for mock data.** |
| `TRIGGER_COOLDOWN_HOURS` | `6` | Minimum hours between same zone + trigger type re-firing |
| `RAIN_THRESHOLD_MM` | `70` | Rainfall threshold for HEAVY_RAIN trigger |
| `HEAT_THRESHOLD_C` | `42` | Temperature threshold for EXTREME_HEAT trigger |
| `AQI_THRESHOLD` | `350` | AQI index threshold for AQI_SPIKE trigger |
| `FLASH_FLOOD_RAIN_MM` | `80` | Rain component of FLASH_FLOOD threshold |
| `FLASH_FLOOD_WIND_KMH` | `45` | Wind component of FLASH_FLOOD threshold |
| `LOCKDOWN_DAILY_PROB` | `0.02` | Daily probability of ZONE_LOCKDOWN civic event per zone |

---

## Running the Server

```bash
cd backend
poetry run uvicorn app.main:app --reload --port 8000 --env-file .env
```

The server will be available at:
- API: `http://localhost:8000`
- Interactive docs (Swagger): `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

The automated trigger scheduler starts automatically on startup. You will see a log line:

```
INFO: Automated trigger polling started (every 5 min)
```

---

## End-to-End Walkthrough

This walkthrough exercises all four hackathon requirements: Registration, Policy Management, Dynamic Premium, and Claims Management.

### 1. Register a worker

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ravi Kumar",
    "email": "ravi@example.com",
    "phone": "+919876543210",
    "current_zone": "ZONE_B",
    "password": "securepass123"
  }'
```

### 2. Log in and get tokens

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email": "ravi@example.com", "password": "securepass123"}'
```

Save `access_token` as `TOKEN`.

### 3. Get a dynamic premium quote

```bash
curl -s "http://localhost:8000/api/v1/policy/quote?zone=ZONE_B" \
  -H "Authorization: Bearer $TOKEN"
```

The response includes `recommended_premium` (ML-computed), `risk_level`, and `cover_amount`. Add `?disruption_context=PANDEMIC` to see the 1.25× surcharge applied.

### 4. View all zones and premiums

```bash
curl -s http://localhost:8000/api/v1/zones \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Create a checkout session

```bash
curl -s -X POST http://localhost:8000/api/v1/payments/checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": 1,
    "zone": "ZONE_B",
    "premium_amount": 30.09,
    "cover_amount": 500.0,
    "end_date": "2026-04-11T23:59:59Z"
  }'
```

### 6. Confirm payment and activate policy

```bash
curl -s -X POST http://localhost:8000/api/v1/payments/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"checkout_id": 1, "payment_success": true}'
```

The response includes the activated `Policy` object.

### 7. Verify active policy

```bash
curl -s http://localhost:8000/api/v1/policy/active/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 8. Simulate a trigger (requires ADMIN role)

Register with an email listed in `ADMIN_BOOTSTRAP_EMAILS`, then:

```bash
curl -s -X POST http://localhost:8000/api/v1/admin/triggers \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone": "ZONE_B", "trigger_type": "HEAVY_RAIN", "severity": 85.0}'
```

### 9. Check claim lifecycle and payouts

```bash
# Full claim lifecycle
curl -s http://localhost:8000/api/v1/claims/lifecycle/1 \
  -H "Authorization: Bearer $TOKEN"

# Payout ledger
curl -s http://localhost:8000/api/v1/payouts/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 10. Seed a complete demo environment

```bash
curl -s -X POST http://localhost:8000/api/v1/admin/seed-demo \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Worker",
    "email": "demo.worker@giggity.dev",
    "phone": "+910000000000",
    "zone": "ZONE_C",
    "create_active_policy": true
  }'
```

This creates a worker with a pre-activated policy ready for trigger simulation.

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, all route handlers, APScheduler lifespan
│   ├── models.py            # SQLAlchemy ORM models
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── database.py          # SQLAlchemy engine and session factory (SQLite)
│   └── services/
│       ├── risk_engine.py   # GradientBoostingRegressor, predict_premium()
│       ├── trigger_service.py  # Weather/AQI polling, auto_check_all_zones()
│       └── claims_service.py   # Zero-touch claims and payout processing
├── premium_model.joblib     # Trained model (auto-generated on first run)
├── giggity.db               # SQLite database (auto-created on first run)
├── pyproject.toml           # Poetry dependency manifest
├── .env                     # Local environment config (not committed)
└── .env.example             # Environment variable reference
```

```
ml/   (repo root level)
├── build_dataset.py         # Fetches historical data, builds training CSV
└── zone_training_data.csv   # 948 real weekly samples (2022-2024)
```

---

## Data Pipeline

The ML model is trained on data fetched from two free public APIs:

**Open-Meteo Weather Archive** (`archive-api.open-meteo.com`)
- Variables: `precipitation_sum`, `temperature_2m_max`, `wind_speed_10m_max`
- Granularity: daily, aggregated to weekly

**Open-Meteo Air Quality Archive** (`air-quality-api.open-meteo.com`)
- Variables: `pm2_5` (hourly), aggregated to daily max
- No API key required

The dataset pipeline (`ml/build_dataset.py`):
1. Fetches 3 years of daily data per zone (6 × 2 API calls)
2. Aggregates to ISO weekly windows
3. Flags disruption days against parametric thresholds
4. Derives actuarial premium targets from zone-level threshold-crossing frequency, normalised to the INR 15–50 product range
5. Adds a ±INR 3 per-week severity adjustment based on z-score relative to each zone's own history

To regenerate:
```bash
# From repo root
poetry run python ../ml/build_dataset.py

# Remove stale model so it retrains on next server start
rm backend/premium_model.joblib
```
