import uuid
import json

from django.core.serializers.json import DjangoJSONEncoder

from core.models import AuditLog


def _parse_uuid(value):
    if not value:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def get_request_id(request):
    return request.headers.get("X-Request-ID") or request.META.get("HTTP_X_REQUEST_ID")


def create_audit_log(
    *,
    actor=None,
    branch=None,
    device=None,
    action,
    entity,
    entity_id=None,
    before_snapshot=None,
    after_snapshot=None,
    event_id=None,
    request_id=None,
):
    def _json_safe(value):
        if value is None:
            return None
        return json.loads(json.dumps(value, cls=DjangoJSONEncoder))

    AuditLog.objects.create(
        actor=actor,
        branch=branch,
        device=device,
        action=action,
        entity=entity,
        entity_id=entity_id,
        before_snapshot=_json_safe(before_snapshot),
        after_snapshot=_json_safe(after_snapshot),
        event_id=_parse_uuid(event_id),
        request_id=request_id,
    )


def create_audit_log_from_request(
    request,
    *,
    action,
    entity,
    entity_id=None,
    before_snapshot=None,
    after_snapshot=None,
    event_id=None,
    branch=None,
    device=None,
):
    create_audit_log(
        actor=getattr(request, "user", None) if getattr(request, "user", None) and request.user.is_authenticated else None,
        branch=branch,
        device=device,
        action=action,
        entity=entity,
        entity_id=entity_id,
        before_snapshot=before_snapshot,
        after_snapshot=after_snapshot,
        event_id=event_id,
        request_id=get_request_id(request),
    )
