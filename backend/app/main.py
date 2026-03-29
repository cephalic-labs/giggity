from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime
import random
import uuid

from . import models, schemas
from .database import engine, Base, get_db, SessionLocal
from .services.risk_engine import predict_premium

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Giggity API", description="AI-Powered Parametric Income Insurance API for Gig Workers")

# Configure CORS for Next.js app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Giggity Core API"}

# --- Registration / Onboarding ---
@app.post("/api/v1/auth/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    db_user = models.User(**user.model_dump())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/api/v1/users/{user_id}", response_model=schemas.User)
def get_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.get("/api/v1/users", response_model=list[schemas.User])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()

# --- Policy Management (Step 4 & 3) ---
@app.get("/api/v1/policy/quote", response_model=schemas.QuoteResponse)
def get_policy_quote(zone: str, disruption_context: str = "NORMAL"):
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
):
    user = db.query(models.User).filter(models.User.id == payload.worker_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    provider_ref = f"pay_{uuid.uuid4().hex[:16]}"
    transaction = models.PaymentTransaction(
        worker_id=payload.worker_id,
        zone=payload.zone,
        premium_amount=payload.premium_amount,
        cover_amount=payload.cover_amount,
        end_date=payload.end_date,
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
):
    transaction = (
        db.query(models.PaymentTransaction)
        .filter(models.PaymentTransaction.id == payload.checkout_id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Checkout session not found")

    if transaction.status == models.PaymentStatus.SUCCESS:
        policy = None
        if transaction.policy_id is not None:
            policy = (
                db.query(models.Policy)
                .filter(models.Policy.id == transaction.policy_id)
                .first()
            )
        return schemas.PaymentConfirmResponse(transaction=transaction, policy=policy)

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
def list_user_payments(user_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.PaymentTransaction)
        .filter(models.PaymentTransaction.worker_id == user_id)
        .order_by(models.PaymentTransaction.created_at.desc())
        .all()
    )

@app.post("/api/v1/policy/create", response_model=schemas.Policy)
def create_policy(policy_req: schemas.PolicyCreate, db: Session = Depends(get_db)):
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
def get_active_policies(user_id: int, db: Session = Depends(get_db)):
    policies = db.query(models.Policy).filter(
        models.Policy.worker_id == user_id, 
        models.Policy.status == models.PolicyStatus.ACTIVE
    ).all()
    return policies

# --- Admin / Triggers & Claims ---
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
    
    for policy in active_policies:
        # Create payout automatically
        claim = models.Claim(
            policy_id=policy.id,
            trigger_event_id=trigger_event.id,
            amount=policy.cover_amount, # Paying full cover for MVP demo
            status=models.ClaimStatus.APPROVED
        )
        db.add(claim)
        db.flush()

        payout = models.PayoutLedger(
            claim_id=claim.id,
            policy_id=policy.id,
            worker_id=policy.worker_id,
            amount=policy.cover_amount,
            status=models.PayoutStatus.RELEASED,
            provider_ref=f"po_{uuid.uuid4().hex[:16]}",
        )
        db.add(payout)
    
    db.commit()
    db.close()

@app.post("/api/v1/admin/triggers", response_model=schemas.TriggerEvent)
def simulate_trigger(trigger: schemas.TriggerEventCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Simulate a disruption trigger event from external Oracle (e.g. OpenWeather API mock)"""
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
def get_user_claims(user_id: int, db: Session = Depends(get_db)):
    # Find active policy for user to find its claims
    policies = db.query(models.Policy).filter(models.Policy.worker_id == user_id).all()
    policy_ids = [p.id for p in policies]
    
    claims = db.query(models.Claim).filter(models.Claim.policy_id.in_(policy_ids)).all()
    return claims


@app.get("/api/v1/payouts/{user_id}", response_model=list[schemas.PayoutLedger])
def get_user_payouts(user_id: int, db: Session = Depends(get_db)):
    payouts = (
        db.query(models.PayoutLedger)
        .filter(models.PayoutLedger.worker_id == user_id)
        .order_by(models.PayoutLedger.created_at.desc())
        .all()
    )
    return payouts
