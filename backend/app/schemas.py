from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from .models import (
    PolicyStatus,
    ClaimStatus,
    TriggerType,
    PaymentStatus,
    PayoutStatus,
    UserRole,
)

# --- User Schemas ---
class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: str
    current_zone: str

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)

class User(UserBase):
    id: int
    joined_at: datetime

    class Config:
        from_attributes = True

class AuthTokenRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class AuthRefreshRequest(BaseModel):
    refresh_token: str

class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class AuthProfile(BaseModel):
    user_id: int
    email: EmailStr
    role: UserRole

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


class ZoneInfo(BaseModel):
    zone_id: str
    city: str
    neighbourhood: str
    lat: float
    lon: float
    risk_tier: str
    weekly_premium: float
    cover_amount: float

# --- Trigger Schemas ---
class TriggerEventBase(BaseModel):
    zone: str
    trigger_type: TriggerType
    severity: float = Field(gt=0)

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

class ClaimLifecycleEvent(BaseModel):
    claim_id: int
    trigger_type: TriggerType
    trigger_severity: float
    claim_status: ClaimStatus
    payout_status: Optional[PayoutStatus] = None
    payout_amount: Optional[float] = None
    created_at: datetime

# --- Payments Schemas ---
class CheckoutCreate(BaseModel):
    worker_id: int
    zone: str
    premium_amount: float = Field(gt=0)
    cover_amount: float = Field(gt=0)
    end_date: datetime

class CheckoutSession(BaseModel):
    checkout_id: int
    provider_ref: str
    status: PaymentStatus
    amount: float

class PaymentConfirmRequest(BaseModel):
    checkout_id: int
    payment_success: bool = True

class SeedDemoRequest(BaseModel):
    name: str = "Demo Worker"
    email: EmailStr = "demo.worker@giggity.dev"
    phone: str = "+910000000000"
    zone: str = "ZONE_A"
    create_active_policy: bool = True

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

class SeedDemoResponse(BaseModel):
    user: User
    payment: Optional[PaymentTransaction] = None
    policy: Optional[Policy] = None

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
