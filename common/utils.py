from sync.models import SyncOutbox


def emit_outbox(branch_id, entity, entity_id, op, payload):
    payload_data = dict(payload or {})
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
