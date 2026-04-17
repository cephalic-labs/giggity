"""
Fraud scoring baseline.

This module turns claim and trigger context into an explainable fraud
assessment so the payout path can make a decision before releasing money.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable

from sqlalchemy.orm import Session

from .. import models


@dataclass(frozen=True)
class FraudResult:
    score: float
    decision: models.FraudDecision
    reasons: list[str]


def _clamp_score(score: float) -> float:
    return max(0.0, min(1.0, round(score, 3)))


def _append_reason(reasons: list[str], reason: str) -> None:
    if reason not in reasons:
        reasons.append(reason)


def _count_claims(db: Session, worker_id: int, since: datetime, trigger_type: models.TriggerType | None = None) -> int:
    query = (
        db.query(models.Claim)
        .join(models.Policy, models.Policy.id == models.Claim.policy_id)
        .join(models.TriggerEvent, models.TriggerEvent.id == models.Claim.trigger_event_id)
        .filter(models.Policy.worker_id == worker_id)
        .filter(models.Claim.created_at >= since)
    )
    if trigger_type is not None:
        query = query.filter(models.TriggerEvent.trigger_type == trigger_type)
    return query.count()


def _policy_age_hours(policy: models.Policy, now: datetime) -> float:
    start_date = policy.start_date or now
    return max(0.0, (now - start_date).total_seconds() / 3600)


def _account_age_days(worker: models.User, now: datetime) -> float:
    joined_at = worker.joined_at or now
    return max(0.0, (now - joined_at).total_seconds() / 86400)


def assess_claim_fraud(
    db: Session,
    *,
    worker: models.User,
    policy: models.Policy,
    trigger_event: models.TriggerEvent,
    payout_amount: float,
) -> FraudResult:
    now = datetime.utcnow()
    score = 0.0
    reasons: list[str] = []

    if worker.current_zone and worker.current_zone != policy.zone:
        score += 0.28
        _append_reason(reasons, "worker_zone_mismatch")

    if _account_age_days(worker, now) < 2:
        score += 0.18
        _append_reason(reasons, "new_account")
    elif _account_age_days(worker, now) < 14:
        score += 0.08
        _append_reason(reasons, "recent_account")

    age_hours = _policy_age_hours(policy, now)
    if age_hours < 2:
        score += 0.30
        _append_reason(reasons, "fresh_policy")
    elif age_hours < 24:
        score += 0.14
        _append_reason(reasons, "recent_policy")

    recent_claim_window = now - timedelta(days=14)
    recent_claims = _count_claims(db, worker.id, recent_claim_window)
    if recent_claims >= 3:
        score += 0.26
        _append_reason(reasons, "claim_burst")
    elif recent_claims >= 1:
        score += 0.10
        _append_reason(reasons, "prior_claim_activity")

    recent_same_trigger = _count_claims(
        db,
        worker.id,
        now - timedelta(days=7),
        trigger_event.trigger_type,
    )
    if recent_same_trigger >= 2:
        score += 0.18
        _append_reason(reasons, "repeated_trigger_pattern")

    payout_ratio = 0.0
    if policy.cover_amount > 0:
        payout_ratio = payout_amount / policy.cover_amount

    if payout_ratio >= 0.95 and trigger_event.severity < 2.0:
        score += 0.08
        _append_reason(reasons, "high_payout_low_severity")

    if trigger_event.trigger_type == models.TriggerType.ZONE_LOCKDOWN and trigger_event.severity < 1.0:
        score += 0.12
        _append_reason(reasons, "weak_lockdown_signal")

    score = _clamp_score(score)

    if score >= 0.8:
        decision = models.FraudDecision.DENY
    elif score >= 0.55:
        decision = models.FraudDecision.HOLD
    elif score >= 0.25:
        decision = models.FraudDecision.REVIEW
    else:
        decision = models.FraudDecision.CLEAR

    return FraudResult(score=score, decision=decision, reasons=reasons[:5])


def encode_reasons(reasons: Iterable[str]) -> str:
    return json.dumps(list(reasons))


def decode_reasons(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return [raw]
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]