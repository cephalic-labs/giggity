# ── Stage 1: export pinned requirements ─────────────────────────────────────
# Using a dedicated stage keeps the Poetry install out of the final image.
FROM python:3.13-slim AS requirements-export

WORKDIR /build

RUN pip install --no-cache-dir poetry==2.3.2 poetry-plugin-export==1.10.0

COPY pyproject.toml poetry.lock ./

RUN poetry export \
        --without-hashes \
        -f requirements.txt \
        -o requirements.txt


# ── Stage 2: install dependencies ───────────────────────────────────────────
FROM python:3.13-slim AS deps

WORKDIR /build

COPY --from=requirements-export /build/requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt


# ── Stage 3: train ML model at build time ───────────────────────────────────
# Baking the model into the image means zero cold-start training latency
# and no dependency on the CSV at runtime.
FROM deps AS model-trainer

WORKDIR /build

COPY app/ ./app/
COPY ml/  ./ml/

# DATASET_PATH resolves to /build/ml/ which is where we just COPY'd the CSV
ENV DATASET_PATH=/build/ml/zone_training_data.csv

RUN python -c "\
from app.services.risk_engine import train_model; \
m = train_model(); \
print('Model trained successfully.')"


# ── Stage 4: production runtime ─────────────────────────────────────────────
FROM python:3.13-slim AS production

WORKDIR /app

# Non-root user for security
RUN groupadd --system --gid 1001 giggity \
 && useradd  --system --uid 1001 --gid 1001 --no-create-home giggity

# Copy installed site-packages from deps stage
COPY --from=deps /usr/local/lib/python3.13/site-packages \
                 /usr/local/lib/python3.13/site-packages
COPY --from=deps /usr/local/bin \
                 /usr/local/bin

# Copy application code
COPY --from=model-trainer --chown=giggity:giggity /build/app ./app

# Copy training dataset (used only if model is missing; baked model is primary)
COPY --from=model-trainer --chown=giggity:giggity /build/ml  ./ml

# Copy trained model artifact
COPY --from=model-trainer --chown=giggity:giggity \
     /build/premium_model.joblib ./premium_model.joblib

# Persistent volume mount point for the SQLite database
RUN mkdir -p /app/data && chown giggity:giggity /app/data

USER giggity

EXPOSE 8000

# DATASET_PATH tells risk_engine.py where to find the CSV inside the container
ENV DATASET_PATH=/app/ml/zone_training_data.csv \
    DATABASE_URL=sqlite:////app/data/giggity.db \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
