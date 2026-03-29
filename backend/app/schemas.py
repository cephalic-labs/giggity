from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import (
    PolicyStatus,
    ClaimStatus,
    TriggerType,
    PaymentStatus,
    PayoutStatus,
)

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
    payment_transaction_id: Optional[int] = None

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
    disruption_context: str
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

# --- Payments Schemas ---
class CheckoutCreate(BaseModel):
    worker_id: int
    zone: str
    premium_amount: float
    cover_amount: float
    end_date: datetime

class CheckoutSession(BaseModel):
    checkout_id: int
    provider_ref: str
    status: PaymentStatus
    amount: float

class PaymentConfirmRequest(BaseModel):
    checkout_id: int
    payment_success: bool = True

class PaymentTransaction(BaseModel):
    id: int
    worker_id: int
    policy_id: Optional[int]
    zone: str
    premium_amount: float
    cover_amount: float
    end_date: datetime
    provider_ref: str
    status: PaymentStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PaymentConfirmResponse(BaseModel):
    transaction: PaymentTransaction
    policy: Optional[Policy] = None

# --- Payout Schemas ---
class PayoutLedger(BaseModel):
    id: int
    claim_id: int
    policy_id: int
    worker_id: int
    amount: float
    status: PayoutStatus
    provider_ref: str
    created_at: datetime

    class Config:
        from_attributes = True
