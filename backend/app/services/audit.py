from app.models.models import GateEvent, GateEventType


def log_gate_event(db, event_type: GateEventType, *, actor_id=None, source="WEB", gate=None,
                   card_uid=None, session_id=None, detail=None):
    """Ghi nhật ký trong cùng transaction với thay đổi nghiệp vụ (cùng commit / rollback)."""
    db.add(GateEvent(actor_id=actor_id, source=source, event_type=event_type.value, gate=gate,
                     card_uid=card_uid, session_id=session_id,
                     detail=(detail[:255] if detail else None)))
