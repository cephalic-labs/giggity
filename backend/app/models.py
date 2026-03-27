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

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    phone = Column(String, unique=True, index=True)
    current_zone = Column(String, index=True) # e.g., "ZONE_A"
    joined_at = Column(DateTime, default=datetime.utcnow)

    policies = relationship("Policy", back_populates="worker")

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
