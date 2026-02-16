import datetime
import decimal
import uuid

from sync.models import SyncOutbox


def _to_json_compatible(value):
    if isinstance(value, dict):
        return {key: _to_json_compatible(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_json_compatible(item) for item in value]
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (datetime.date, datetime.datetime, datetime.time)):
        return value.isoformat()
    return value


def emit_outbox(branch_id, entity, entity_id, op, payload):
    payload_data = _to_json_compatible(dict(payload or {}))
    if branch_id and payload_data.get("branch_id") in (None, ""):
        payload_data["branch_id"] = str(branch_id)

    envelope = {
        "entity": entity,
        "op": op,
        "entity_id": str(entity_id),
        "payload": payload_data,
    }

    return SyncOutbox.objects.create(
        branch_id=branch_id,
        entity=entity,
        entity_id=entity_id,
        op=op,
        payload=envelope,
    )
