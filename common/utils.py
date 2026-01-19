from sync.models import SyncOutbox


def emit_outbox(branch_id, entity, entity_id, op, payload):
    return SyncOutbox.objects.create(
        branch_id=branch_id,
        entity=entity,
        entity_id=entity_id,
        op=op,
        payload=payload,
    )
