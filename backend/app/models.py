from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from .database import Base

class PolicyStatus(enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"

class ClaimStatus(enum.Enum):
    APPROVED = "APPROVED"
    PAID = "PAID"
    DENIED = "DENIED"

class TriggerType(enum.Enum):
    HEAVY_RAIN = "HEAVY_RAIN"
    EXTREME_HEAT = "EXTREME_HEAT"
    AQI_SPIKE = "AQI_SPIKE"
    FLASH_FLOOD = "FLASH_FLOOD"
    PANDEMIC = "PANDEMIC"

class PaymentStatus(enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

class PayoutStatus(enum.Enum):
    INITIATED = "INITIATED"
    RELEASED = "RELEASED"
    FAILED = "FAILED"

class UserRole(enum.Enum):
    WORKER = "WORKER"
    ADMIN = "ADMIN"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    phone = Column(String, unique=True, index=True)
    current_zone = Column(String, index=True) # e.g., "ZONE_A"
    joined_at = Column(DateTime, default=datetime.utcnow)

    policies = relationship("Policy", back_populates="worker")
    payments = relationship("PaymentTransaction", back_populates="worker")
    auth_credential = relationship("AuthCredential", back_populates="user", uselist=False)

class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id"))
    zone = Column(String, index=True)
    premium_amount = Column(Float)
    cover_amount = Column(Float)
    status = Column(SQLEnum(PolicyStatus), default=PolicyStatus.ACTIVE)
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime)

    worker = relationship("User", back_populates="policies")
    claims = relationship("Claim", back_populates="policy")
    payment = relationship("PaymentTransaction", back_populates="policy", uselist=False)

class TriggerEvent(Base):
    __tablename__ = "trigger_events"

    id = Column(Integer, primary_key=True, index=True)
    zone = Column(String, index=True)
    trigger_type = Column(SQLEnum(TriggerType))
    severity = Column(Float) # e.g., 75mm rain
    timestamp = Column(DateTime, default=datetime.utcnow)

class Claim(Base):
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True)
    policy_id = Column(Integer, ForeignKey("policies.id"))
    trigger_event_id = Column(Integer, ForeignKey("trigger_events.id"))
    amount = Column(Float)
    status = Column(SQLEnum(ClaimStatus), default=ClaimStatus.APPROVED)
    created_at = Column(DateTime, default=datetime.utcnow)

    policy = relationship("Policy", back_populates="claims")
    trigger_event = relationship("TriggerEvent")
    payouts = relationship("PayoutLedger", back_populates="claim")

class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    policy_id = Column(Integer, ForeignKey("policies.id"), nullable=True)
    zone = Column(String, index=True)
    premium_amount = Column(Float, nullable=False)
    cover_amount = Column(Float, nullable=False)
    end_date = Column(DateTime, nullable=False)
    provider_ref = Column(String, unique=True, index=True)
    status = Column(SQLEnum(PaymentStatus), default=PaymentStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    worker = relationship("User", back_populates="payments")
    policy = relationship("Policy", back_populates="payment")

class PayoutLedger(Base):
    __tablename__ = "payout_ledger"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    policy_id = Column(Integer, ForeignKey("policies.id"), nullable=False)
    worker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(SQLEnum(PayoutStatus), default=PayoutStatus.INITIATED)
    provider_ref = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    claim = relationship("Claim", back_populates="payouts")

class AuthCredential(Base):
    __tablename__ = "auth_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.WORKER, nullable=False)
    refresh_token_hash = Column(String, nullable=True)
    refresh_token_expires_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="auth_credential")
