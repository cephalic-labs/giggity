from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import PolicyStatus, ClaimStatus, TriggerType

# --- User Schemas ---
class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: str
    current_zone: str

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: int
    joined_at: datetime

    class Config:
        from_attributes = True

# --- Policy Schemas ---
class PolicyBase(BaseModel):
    zone: str
    premium_amount: float
    cover_amount: float

class PolicyCreate(PolicyBase):
    worker_id: int
    end_date: datetime

class Policy(PolicyBase):
    id: int
    worker_id: int
    status: PolicyStatus
    start_date: datetime
    end_date: datetime

    class Config:
        from_attributes = True

class QuoteResponse(BaseModel):
    zone: str
    recommended_premium: float
    cover_amount: float
    risk_level: str
    factors: dict

# --- Trigger Schemas ---
class TriggerEventBase(BaseModel):
    zone: str
    trigger_type: TriggerType
    severity: float

class TriggerEventCreate(TriggerEventBase):
    pass

class TriggerEvent(TriggerEventBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

# --- Claim Schemas ---
class ClaimBase(BaseModel):
    policy_id: int
    trigger_event_id: int
    amount: float

class Claim(ClaimBase):
    id: int
    status: ClaimStatus
    created_at: datetime

    class Config:
        from_attributes = True
