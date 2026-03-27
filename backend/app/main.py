from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random

from . import models, schemas
from .database import engine, Base, get_db
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
def get_policy_quote(zone: str):
    # Step 3: Dynamic Premium Calculation mock using ML model
    premium, risk_level = predict_premium(zone)
    return schemas.QuoteResponse(
        zone=zone,
        recommended_premium=round(premium, 2),
        cover_amount=500.0,
        risk_level=risk_level,
        factors={"historical_disruption": "baseline", "recent_weather": "clear"}
    )

@app.post("/api/v1/policy/create", response_model=schemas.Policy)
def create_policy(policy_req: schemas.PolicyCreate, db: Session = Depends(get_db)):
    # Verify user
    user = db.query(models.User).filter(models.User.id == policy_req.worker_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_policy = models.Policy(
        worker_id=policy_req.worker_id,
        zone=policy_req.zone,
        premium_amount=policy_req.premium_amount,
        cover_amount=policy_req.cover_amount,
        start_date=datetime.utcnow(),
        end_date=policy_req.end_date,
        status=models.PolicyStatus.ACTIVE
    )
    db.add(db_policy)
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
def process_zero_touch_claims(trigger_event: models.TriggerEvent, db: Session):
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
    
    db.commit()

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
    background_tasks.add_task(process_zero_touch_claims, new_event, db)
    
    return new_event

@app.get("/api/v1/claims/{user_id}", response_model=list[schemas.Claim])
def get_user_claims(user_id: int, db: Session = Depends(get_db)):
    # Find active policy for user to find its claims
    policies = db.query(models.Policy).filter(models.Policy.worker_id == user_id).all()
    policy_ids = [p.id for p in policies]
    
    claims = db.query(models.Claim).filter(models.Claim.policy_id.in_(policy_ids)).all()
    return claims
