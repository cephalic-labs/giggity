from dataclasses import dataclass
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
import hashlib
import os
import uuid

from . import models, schemas
from .database import engine, Base, get_db, SessionLocal
from .services.risk_engine import predict_premium

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
JWT_ALGORITHM = "HS256"
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-in-production")
CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
ADMIN_BOOTSTRAP_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ADMIN_BOOTSTRAP_EMAILS", "").split(",")
    if email.strip()
}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


@dataclass
class AuthPrincipal:
    user: models.User
    role: models.UserRole


def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _create_access_token(user_id: int, role: models.UserRole) -> tuple[str, int]:
    expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire_at = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "type": "access",
        "exp": expire_at,
    }
    encoded = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded, int(expires_delta.total_seconds())


def _create_refresh_token(user_id: int, role: models.UserRole) -> tuple[str, datetime]:
    expires_delta = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    expire_at = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "type": "refresh",
        "exp": expire_at,
        "jti": uuid.uuid4().hex,
    }
    encoded = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded, expire_at


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from error


def _get_user_with_credential(db: Session, email: str) -> tuple[models.User, models.AuthCredential]:
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.auth_credential:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return user, user.auth_credential


def _authorize_user_scope(principal: AuthPrincipal, user_id: int) -> None:
    if principal.user.id == user_id:
        return
    if principal.role == models.UserRole.ADMIN:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


def _require_admin(principal: AuthPrincipal) -> None:
    if principal.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def get_current_principal(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> AuthPrincipal:
    payload = _decode_token(token)
    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id_str = payload.get("sub")
    role_value = payload.get("role")
    if not user_id_str or not role_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        user_id = int(user_id_str)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid subject in token",
        ) from error

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.auth_credential:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found for token",
        )

    try:
        role = models.UserRole(role_value)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid role in token",
        ) from error
    if user.auth_credential.role != role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token role mismatch",
        )

    return AuthPrincipal(user=user, role=role)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Giggity API", description="AI-Powered Parametric Income Insurance API for Gig Workers")

# Configure CORS for Next.js app
allow_any_origin = "*" in CORS_ALLOW_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=not allow_any_origin,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Giggity Core API"}


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "giggity-api"}

# --- Registration / Onboarding ---
@app.post("/api/v1/auth/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=409, detail="Email already registered")

    existing_phone = db.query(models.User).filter(models.User.phone == user.phone).first()
    if existing_phone:
        raise HTTPException(status_code=409, detail="Phone already registered")

    db_user = models.User(**user.model_dump(exclude={"password"}))
    db.add(db_user)
    db.flush()

    role = models.UserRole.WORKER
    if user.email.lower() in ADMIN_BOOTSTRAP_EMAILS:
        role = models.UserRole.ADMIN

    credential = models.AuthCredential(
        user_id=db_user.id,
        password_hash=_hash_password(user.password),
        role=role,
    )
    db.add(credential)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.post("/api/v1/auth/token", response_model=schemas.AuthTokenResponse)
def create_auth_token(payload: schemas.AuthTokenRequest, db: Session = Depends(get_db)):
    user, credential = _get_user_with_credential(db, payload.email)

    if not _verify_password(payload.password, credential.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token, expires_in = _create_access_token(user_id=user.id, role=credential.role)
    refresh_token, refresh_expires_at = _create_refresh_token(user_id=user.id, role=credential.role)
    credential.refresh_token_hash = _hash_refresh_token(refresh_token)
    credential.refresh_token_expires_at = refresh_expires_at.replace(tzinfo=None)
    credential.last_login_at = datetime.utcnow()
    db.add(credential)
    db.commit()

    return schemas.AuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@app.post("/api/v1/auth/refresh", response_model=schemas.AuthTokenResponse)
def refresh_auth_token(payload: schemas.AuthRefreshRequest, db: Session = Depends(get_db)):
    token_payload = _decode_token(payload.refresh_token)
    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id_str = token_payload.get("sub")
    role_value = token_payload.get("role")
    if not user_id_str or not role_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    try:
        user_id = int(user_id_str)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid subject in token",
        ) from error

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.auth_credential:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    credential = user.auth_credential
    if credential.refresh_token_hash != _hash_refresh_token(payload.refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

    expires_at = credential.refresh_token_expires_at
    if not expires_at or expires_at <= datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    try:
        role = models.UserRole(role_value)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid role in token",
        ) from error
    if credential.role != role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token role mismatch")

    access_token, expires_in = _create_access_token(user_id=user.id, role=role)
    refresh_token, refresh_expires_at = _create_refresh_token(user_id=user.id, role=role)
    credential.refresh_token_hash = _hash_refresh_token(refresh_token)
    credential.refresh_token_expires_at = refresh_expires_at.replace(tzinfo=None)
    db.add(credential)
    db.commit()

    return schemas.AuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@app.get("/api/v1/auth/me", response_model=schemas.AuthProfile)
def get_auth_profile(principal: AuthPrincipal = Depends(get_current_principal)):
    return schemas.AuthProfile(
        user_id=principal.user.id,
        email=principal.user.email,
        role=principal.role,
    )

@app.get("/api/v1/users/{user_id}", response_model=schemas.User)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=user_id)
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.get("/api/v1/users", response_model=list[schemas.User])
def list_users(
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _require_admin(principal)
    return db.query(models.User).all()

# --- Policy Management (Step 4 & 3) ---
@app.get("/api/v1/policy/quote", response_model=schemas.QuoteResponse)
def get_policy_quote(
    zone: str,
    disruption_context: str = "NORMAL",
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _ = principal
    # Step 3: Dynamic Premium Calculation mock using ML model
    premium, risk_level = predict_premium(zone)

    normalized_context = disruption_context.upper()
    multiplier = 1.0
    if normalized_context == "PANDEMIC":
        multiplier = 1.25
    elif normalized_context == "SEVERE_WEATHER":
        multiplier = 1.15

    adjusted_premium = round(premium * multiplier, 2)

    return schemas.QuoteResponse(
        zone=zone,
        recommended_premium=adjusted_premium,
        cover_amount=500.0,
        risk_level=risk_level,
        disruption_context=normalized_context,
        factors={
            "historical_disruption": "baseline",
            "recent_weather": "clear",
            "pricing_multiplier": multiplier,
        },
    )


def _create_policy_from_transaction(
    transaction: models.PaymentTransaction,
    db: Session,
) -> models.Policy:
    db_policy = models.Policy(
        worker_id=transaction.worker_id,
        zone=transaction.zone,
        premium_amount=transaction.premium_amount,
        cover_amount=transaction.cover_amount,
        start_date=datetime.utcnow(),
        end_date=transaction.end_date,
        status=models.PolicyStatus.ACTIVE,
    )
    db.add(db_policy)
    db.flush()

    transaction.policy_id = db_policy.id
    return db_policy


@app.post("/api/v1/payments/checkout", response_model=schemas.CheckoutSession)
def create_checkout_session(
    payload: schemas.CheckoutCreate,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=payload.worker_id)
    user = db.query(models.User).filter(models.User.id == payload.worker_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    normalized_end_date = payload.end_date
    if normalized_end_date.tzinfo is not None:
        normalized_end_date = normalized_end_date.astimezone(timezone.utc).replace(tzinfo=None)

    if normalized_end_date <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="end_date must be in the future")

    has_active_policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == payload.worker_id)
        .filter(models.Policy.zone == payload.zone)
        .filter(models.Policy.status == models.PolicyStatus.ACTIVE)
        .first()
    )
    if has_active_policy:
        raise HTTPException(
            status_code=409,
            detail="Active policy already exists for this zone",
        )

    existing_pending = (
        db.query(models.PaymentTransaction)
        .filter(models.PaymentTransaction.worker_id == payload.worker_id)
        .filter(models.PaymentTransaction.zone == payload.zone)
        .filter(models.PaymentTransaction.status == models.PaymentStatus.PENDING)
        .order_by(models.PaymentTransaction.created_at.desc())
        .first()
    )
    if existing_pending:
        return schemas.CheckoutSession(
            checkout_id=existing_pending.id,
            provider_ref=existing_pending.provider_ref,
            status=existing_pending.status,
            amount=existing_pending.premium_amount,
        )

    provider_ref = f"pay_{uuid.uuid4().hex[:16]}"
    transaction = models.PaymentTransaction(
        worker_id=payload.worker_id,
        zone=payload.zone,
        premium_amount=payload.premium_amount,
        cover_amount=payload.cover_amount,
        end_date=normalized_end_date,
        provider_ref=provider_ref,
        status=models.PaymentStatus.PENDING,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return schemas.CheckoutSession(
        checkout_id=transaction.id,
        provider_ref=transaction.provider_ref,
        status=transaction.status,
        amount=transaction.premium_amount,
    )


@app.post("/api/v1/payments/confirm", response_model=schemas.PaymentConfirmResponse)
def confirm_checkout_payment(
    payload: schemas.PaymentConfirmRequest,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    transaction = (
        db.query(models.PaymentTransaction)
        .filter(models.PaymentTransaction.id == payload.checkout_id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Checkout session not found")

    _authorize_user_scope(principal=principal, user_id=transaction.worker_id)

    if transaction.status == models.PaymentStatus.SUCCESS:
        policy = None
        if transaction.policy_id is not None:
            policy = (
                db.query(models.Policy)
                .filter(models.Policy.id == transaction.policy_id)
                .first()
            )
        return schemas.PaymentConfirmResponse(transaction=transaction, policy=policy)

    if transaction.status == models.PaymentStatus.FAILED:
        return schemas.PaymentConfirmResponse(transaction=transaction, policy=None)

    transaction.status = (
        models.PaymentStatus.SUCCESS
        if payload.payment_success
        else models.PaymentStatus.FAILED
    )

    policy = None
    if transaction.status == models.PaymentStatus.SUCCESS:
        policy = _create_policy_from_transaction(transaction=transaction, db=db)

    db.commit()
    db.refresh(transaction)
    if policy is not None:
        db.refresh(policy)

    return schemas.PaymentConfirmResponse(transaction=transaction, policy=policy)


@app.get("/api/v1/payments/{user_id}", response_model=list[schemas.PaymentTransaction])
def list_user_payments(
    user_id: int,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=user_id)
    return (
        db.query(models.PaymentTransaction)
        .filter(models.PaymentTransaction.worker_id == user_id)
        .order_by(models.PaymentTransaction.created_at.desc())
        .all()
    )

@app.post("/api/v1/policy/create", response_model=schemas.Policy)
def create_policy(
    policy_req: schemas.PolicyCreate,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=policy_req.worker_id)
    if policy_req.payment_transaction_id is None:
        raise HTTPException(
            status_code=402,
            detail="Payment confirmation required. Use /api/v1/payments/checkout and /api/v1/payments/confirm.",
        )

    transaction = (
        db.query(models.PaymentTransaction)
        .filter(models.PaymentTransaction.id == policy_req.payment_transaction_id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment transaction not found")

    if transaction.status != models.PaymentStatus.SUCCESS:
        raise HTTPException(status_code=402, detail="Payment not successful")

    if transaction.policy_id is not None:
        existing_policy = (
            db.query(models.Policy).filter(models.Policy.id == transaction.policy_id).first()
        )
        if not existing_policy:
            raise HTTPException(status_code=404, detail="Linked policy not found")
        return existing_policy

    db_policy = _create_policy_from_transaction(transaction=transaction, db=db)
    db.commit()
    db.refresh(db_policy)
    return db_policy

@app.get("/api/v1/policy/active/{user_id}", response_model=list[schemas.Policy])
def get_active_policies(
    user_id: int,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=user_id)
    policies = db.query(models.Policy).filter(
        models.Policy.worker_id == user_id, 
        models.Policy.status == models.PolicyStatus.ACTIVE
    ).all()
    return policies

# --- Admin / Triggers & Claims ---
def _resolve_payout_ratio(trigger_type: models.TriggerType, severity: float) -> float:
    if trigger_type == models.TriggerType.PANDEMIC:
        if severity >= 0.85:
            return 1.0
        if severity >= 0.7:
            return 0.8
        return 0.0

    if trigger_type == models.TriggerType.HEAVY_RAIN:
        return 1.0 if severity >= 70 else 0.0

    if trigger_type == models.TriggerType.EXTREME_HEAT:
        return 1.0 if severity >= 42 else 0.0

    if trigger_type == models.TriggerType.AQI_SPIKE:
        return 1.0 if severity >= 350 else 0.0

    if trigger_type == models.TriggerType.FLASH_FLOOD:
        return 1.0 if severity >= 75 else 0.0

    return 0.0


def _validate_trigger_input(trigger: schemas.TriggerEventCreate) -> None:
    if trigger.trigger_type == models.TriggerType.PANDEMIC and trigger.severity > 1:
        raise HTTPException(
            status_code=422,
            detail="PANDEMIC severity must be between 0 and 1",
        )

    if trigger.trigger_type in {
        models.TriggerType.HEAVY_RAIN,
        models.TriggerType.EXTREME_HEAT,
        models.TriggerType.AQI_SPIKE,
        models.TriggerType.FLASH_FLOOD,
    } and trigger.severity > 1000:
        raise HTTPException(status_code=422, detail="severity out of acceptable range")


def process_zero_touch_claims(trigger_event_id: int):
    db = SessionLocal()

    trigger_event = (
        db.query(models.TriggerEvent)
        .filter(models.TriggerEvent.id == trigger_event_id)
        .first()
    )
    if not trigger_event:
        db.close()
        return

    # Find all active policies in the triggered zone
    active_policies = db.query(models.Policy).filter(
        models.Policy.zone == trigger_event.zone,
        models.Policy.status == models.PolicyStatus.ACTIVE
    ).all()

    payout_ratio = _resolve_payout_ratio(
        trigger_type=trigger_event.trigger_type,
        severity=trigger_event.severity,
    )

    if payout_ratio <= 0:
        db.close()
        return
    
    for policy in active_policies:
        payout_amount = round(policy.cover_amount * payout_ratio, 2)

        claim = models.Claim(
            policy_id=policy.id,
            trigger_event_id=trigger_event.id,
            amount=payout_amount,
            status=models.ClaimStatus.APPROVED
        )
        db.add(claim)
        db.flush()

        payout = models.PayoutLedger(
            claim_id=claim.id,
            policy_id=policy.id,
            worker_id=policy.worker_id,
            amount=payout_amount,
            status=models.PayoutStatus.INITIATED,
            provider_ref=f"po_{uuid.uuid4().hex[:16]}",
        )
        db.add(payout)

    # First commit records the initiated stage so lifecycle is explicit.
    db.commit()

    initiated_payouts = (
        db.query(models.PayoutLedger)
        .join(models.Claim, models.Claim.id == models.PayoutLedger.claim_id)
        .filter(models.Claim.trigger_event_id == trigger_event.id)
        .filter(models.PayoutLedger.status == models.PayoutStatus.INITIATED)
        .all()
    )

    for payout in initiated_payouts:
        payout.status = models.PayoutStatus.RELEASED
        claim = db.query(models.Claim).filter(models.Claim.id == payout.claim_id).first()
        if claim:
            claim.status = models.ClaimStatus.PAID
    
    db.commit()
    db.close()

@app.post("/api/v1/admin/triggers", response_model=schemas.TriggerEvent)
def simulate_trigger(
    trigger: schemas.TriggerEventCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _require_admin(principal)
    """Simulate a disruption trigger event from external Oracle (e.g. OpenWeather API mock)"""
    _validate_trigger_input(trigger)

    new_event = models.TriggerEvent(
        zone=trigger.zone,
        trigger_type=trigger.trigger_type,
        severity=trigger.severity,
        timestamp=datetime.utcnow()
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    
    # Step 6: Zero-touch claims engine execution
    background_tasks.add_task(process_zero_touch_claims, new_event.id)
    
    return new_event

@app.get("/api/v1/claims/{user_id}", response_model=list[schemas.Claim])
def get_user_claims(
    user_id: int,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=user_id)
    # Find active policy for user to find its claims
    policies = db.query(models.Policy).filter(models.Policy.worker_id == user_id).all()
    policy_ids = [p.id for p in policies]
    
    claims = db.query(models.Claim).filter(models.Claim.policy_id.in_(policy_ids)).all()
    return claims


@app.get("/api/v1/claims/lifecycle/{user_id}", response_model=list[schemas.ClaimLifecycleEvent])
def get_claim_lifecycle(
    user_id: int,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=user_id)
    policies = db.query(models.Policy).filter(models.Policy.worker_id == user_id).all()
    policy_ids = [policy.id for policy in policies]
    if not policy_ids:
        return []

    claims = (
        db.query(models.Claim)
        .filter(models.Claim.policy_id.in_(policy_ids))
        .order_by(desc(models.Claim.created_at))
        .all()
    )

    lifecycle_items: list[schemas.ClaimLifecycleEvent] = []
    for claim in claims:
        trigger = (
            db.query(models.TriggerEvent)
            .filter(models.TriggerEvent.id == claim.trigger_event_id)
            .first()
        )
        payout = (
            db.query(models.PayoutLedger)
            .filter(models.PayoutLedger.claim_id == claim.id)
            .order_by(desc(models.PayoutLedger.created_at))
            .first()
        )

        if trigger is None:
            continue

        lifecycle_items.append(
            schemas.ClaimLifecycleEvent(
                claim_id=claim.id,
                trigger_type=trigger.trigger_type,
                trigger_severity=trigger.severity,
                claim_status=claim.status,
                payout_status=payout.status if payout else None,
                payout_amount=payout.amount if payout else None,
                created_at=claim.created_at,
            )
        )

    return lifecycle_items


@app.get("/api/v1/payouts/{user_id}", response_model=list[schemas.PayoutLedger])
def get_user_payouts(
    user_id: int,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _authorize_user_scope(principal=principal, user_id=user_id)
    payouts = (
        db.query(models.PayoutLedger)
        .filter(models.PayoutLedger.worker_id == user_id)
        .order_by(models.PayoutLedger.created_at.desc())
        .all()
    )
    return payouts


@app.post("/api/v1/admin/seed-demo", response_model=schemas.SeedDemoResponse)
def seed_demo_environment(
    payload: schemas.SeedDemoRequest,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(get_current_principal),
):
    _require_admin(principal)
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        user = models.User(
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
            current_zone=payload.zone,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not payload.create_active_policy:
        return schemas.SeedDemoResponse(user=user)

    active_policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == user.id)
        .filter(models.Policy.zone == payload.zone)
        .filter(models.Policy.status == models.PolicyStatus.ACTIVE)
        .first()
    )
    if active_policy:
        return schemas.SeedDemoResponse(user=user, policy=active_policy)

    premium, _ = predict_premium(payload.zone)
    end_date = (datetime.utcnow() + timedelta(days=7)).replace(microsecond=0)

    payment = models.PaymentTransaction(
        worker_id=user.id,
        zone=payload.zone,
        premium_amount=round(premium, 2),
        cover_amount=500.0,
        end_date=end_date,
        provider_ref=f"seed_pay_{uuid.uuid4().hex[:10]}",
        status=models.PaymentStatus.SUCCESS,
    )
    db.add(payment)
    db.flush()

    policy = _create_policy_from_transaction(transaction=payment, db=db)
    db.commit()
    db.refresh(payment)
    db.refresh(policy)

    return schemas.SeedDemoResponse(user=user, payment=payment, policy=policy)
