"""
Zero-touch claims processing service.

Called by the admin trigger endpoint and the automated trigger scheduler.
Creates Claims and PayoutLedger entries for all active policies in a zone
when a parametric threshold is breached.
"""
import uuid
import logging
from .. import models
from ..database import SessionLocal
from .fraud_service import assess_claim_fraud, encode_reasons

logger = logging.getLogger(__name__)


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

    if trigger_type == models.TriggerType.ZONE_LOCKDOWN:
        # Civic lockdowns trigger 75% payout (partial coverage)
        return 0.75 if severity >= 0.5 else 0.0

    return 0.0


def process_zero_touch_claims(trigger_event_id: int) -> None:
    """
    Find all active policies in the triggered zone and create approved
    claims + released payouts automatically.
    """
    db = SessionLocal()
    try:
        trigger_event = (
            db.query(models.TriggerEvent)
            .filter(models.TriggerEvent.id == trigger_event_id)
            .first()
        )
        if not trigger_event:
            logger.warning("TriggerEvent %d not found — skipping claims.", trigger_event_id)
            return

        payout_ratio = _resolve_payout_ratio(
            trigger_type=trigger_event.trigger_type,
            severity=trigger_event.severity,
        )
        if payout_ratio <= 0:
            logger.info(
                "Trigger %d (%s) below threshold — no payouts.",
                trigger_event_id,
                trigger_event.trigger_type.value,
            )
            return

        active_policies = (
            db.query(models.Policy)
            .filter(
                models.Policy.zone == trigger_event.zone,
                models.Policy.status == models.PolicyStatus.ACTIVE,
            )
            .all()
        )

        if not active_policies:
            logger.info("No active policies in zone %s — nothing to pay.", trigger_event.zone)
            return

        for policy in active_policies:
            payout_amount = round(policy.cover_amount * payout_ratio, 2)
            worker = (
                db.query(models.User)
                .filter(models.User.id == policy.worker_id)
                .first()
            )
            if worker is None:
                logger.warning("Policy %d has no worker — skipping.", policy.id)
                continue

            fraud = assess_claim_fraud(
                db,
                worker=worker,
                policy=policy,
                trigger_event=trigger_event,
                payout_amount=payout_amount,
            )

            if fraud.decision == models.FraudDecision.DENY:
                claim_status = models.ClaimStatus.DENIED
                payout_status = None
                claim_amount = 0.0
            elif fraud.decision in (models.FraudDecision.REVIEW, models.FraudDecision.HOLD):
                claim_status = models.ClaimStatus.REVIEW
                payout_status = models.PayoutStatus.HELD
                claim_amount = payout_amount
            else:
                claim_status = models.ClaimStatus.APPROVED
                payout_status = models.PayoutStatus.INITIATED
                claim_amount = payout_amount

            claim = models.Claim(
                policy_id=policy.id,
                trigger_event_id=trigger_event.id,
                amount=claim_amount,
                status=claim_status,
            )
            db.add(claim)
            db.flush()

            assessment = models.FraudAssessment(
                claim_id=claim.id,
                trigger_event_id=trigger_event.id,
                policy_id=policy.id,
                worker_id=policy.worker_id,
                zone=policy.zone,
                score=fraud.score,
                decision=fraud.decision,
                reasons=encode_reasons(fraud.reasons),
            )
            db.add(assessment)

            if payout_status is not None:
                payout = models.PayoutLedger(
                    claim_id=claim.id,
                    policy_id=policy.id,
                    worker_id=policy.worker_id,
                    amount=payout_amount,
                    status=payout_status,
                    provider_ref=f"po_{uuid.uuid4().hex[:16]}",
                )
                db.add(payout)

        # Commit initiated stage for explicit lifecycle visibility
        db.commit()

        # Immediately advance to RELEASED (simulates instant UPI disbursement)
        initiated = (
            db.query(models.PayoutLedger)
            .join(models.Claim, models.Claim.id == models.PayoutLedger.claim_id)
            .filter(models.Claim.trigger_event_id == trigger_event.id)
            .filter(models.PayoutLedger.status == models.PayoutStatus.INITIATED)
            .all()
        )
        for payout in initiated:
            payout.status = models.PayoutStatus.RELEASED
            claim = db.query(models.Claim).filter(models.Claim.id == payout.claim_id).first()
            if claim:
                claim.status = models.ClaimStatus.PAID

        db.commit()

        logger.info(
            "Zero-touch claims processed: trigger=%d zone=%s policies=%d ratio=%.2f",
            trigger_event_id,
            trigger_event.zone,
            len(active_policies),
            payout_ratio,
        )
    except Exception:
        logger.exception("Error processing claims for trigger %d", trigger_event_id)
        db.rollback()
    finally:
        db.close()
