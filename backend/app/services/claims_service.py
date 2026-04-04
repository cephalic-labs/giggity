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

            claim = models.Claim(
                policy_id=policy.id,
                trigger_event_id=trigger_event.id,
                amount=payout_amount,
                status=models.ClaimStatus.APPROVED,
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
