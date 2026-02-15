from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import create_audit_log_from_request
from sync.models import SyncEvent, SyncOutbox
from sync.permissions import (
    get_permitted_device,
    validation_failed_response,
)
from sync.serializers import SyncConflictActionSerializer, SyncPullSerializer, SyncPushSerializer
from sync.services import (
    REJECT_CODE_CONFLICT,
    REJECT_CODE_VALIDATION_FAILED,
    process_sync_event,
)


class SyncPushView(APIView):
    def post(self, request):
        serializer = SyncPushSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_failed_response(serializer.errors)

        device_id = serializer.validated_data["device_id"]
        events = serializer.validated_data["events"]
        validate_only = serializer.validated_data.get("validate_only", False)

        device, error_response = get_permitted_device(request.user, device_id)
        if error_response is not None:
            return error_response

        acknowledged = []
        rejected = []

        for event in events:
            payload_branch_id = str(event["payload"].get("branch_id", ""))
            if payload_branch_id != str(device.branch_id):
                rejected.append(
                    {
                        "event_id": str(event["event_id"]),
                        "reason": REJECT_CODE_VALIDATION_FAILED,
                        "code": REJECT_CODE_VALIDATION_FAILED,
                        "details": {"branch_id": "Payload branch_id does not match device branch."},
                    }
                )
                continue

            try:
                with transaction.atomic():
                    sync_event = SyncEvent(
                        event_id=event["event_id"],
                        device=device,
                        branch=device.branch,
                        user=request.user,
                        event_type=event["event_type"],
                        payload=event["payload"],
                    )

                    if not validate_only:
                        sync_event, created = SyncEvent.objects.get_or_create(
                            event_id=event["event_id"],
                            device=device,
                            defaults={
                                "branch": device.branch,
                                "user": request.user,
                                "event_type": event["event_type"],
                                "payload": event["payload"],
                            },
                        )
                        if not created:
                            acknowledged.append(str(event["event_id"]))
                            continue

                    result = process_sync_event(sync_event, validate_only=validate_only)
                    if result.accepted:
                        acknowledged.append(str(event["event_id"]))
                        if not validate_only:
                            sync_event.processed_at = timezone.now()
                            sync_event.status = SyncEvent.Status.PROCESSED
                            sync_event.save(update_fields=["status", "processed_at"])
                    else:
                        if not validate_only:
                            sync_event.processed_at = timezone.now()
                            sync_event.status = SyncEvent.Status.REJECTED
                            sync_event.save(update_fields=["status", "processed_at"])
                        rejected.append(
                            {
                                "event_id": str(event["event_id"]),
                                "reason": result.reason,
                                "code": result.reason,
                                "details": result.details or {},
                            }
                        )

            except IntegrityError as exc:
                rejected.append(
                    {
                        "event_id": str(event["event_id"]),
                        "reason": REJECT_CODE_CONFLICT,
                        "code": REJECT_CODE_CONFLICT,
                        "details": {"error": str(exc)},
                    }
                )

        latest_outbox = SyncOutbox.objects.order_by("-id").first()
        server_cursor = latest_outbox.id if latest_outbox else 0

        return Response(
            {
                "acknowledged": acknowledged,
                "rejected": rejected,
                "server_cursor": server_cursor,
                "validate_only": validate_only,
            }
        )


class SyncConflictActionView(APIView):
    def post(self, request):
        serializer = SyncConflictActionSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_failed_response(serializer.errors)

        device_id = serializer.validated_data["device_id"]
        device, error_response = get_permitted_device(request.user, device_id)
        if error_response is not None:
            return error_response

        action = serializer.validated_data["action"]
        event_id = serializer.validated_data.get("event_id")
        details = serializer.validated_data.get("details") or {}
        reason = serializer.validated_data.get("reason")

        create_audit_log_from_request(
            request,
            action=f"sync.conflict.{action}",
            entity="sync_event",
            entity_id=event_id,
            branch=device.branch,
            device=device,
            before_snapshot={
                "event_type": serializer.validated_data.get("event_type"),
                "payload_snapshot": serializer.validated_data.get("payload_snapshot"),
            },
            after_snapshot={
                "reason": reason,
                "details": details,
            },
            event_id=event_id,
        )

        return Response({"status": "logged"})


class SyncPullView(APIView):
    def post(self, request):
        serializer = SyncPullSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_failed_response(serializer.errors)

        device_id = serializer.validated_data["device_id"]
        cursor = serializer.validated_data["cursor"]
        limit = serializer.validated_data["limit"]

        device, error_response = get_permitted_device(request.user, device_id)
        if error_response is not None:
            return error_response

        updates_qs = SyncOutbox.objects.filter(branch_id=device.branch_id, id__gt=cursor).order_by("id")
        updates = list(updates_qs[:limit])
        latest = updates[-1].id if updates else cursor
        server_cursor = latest
        has_more = updates_qs.count() > limit

        return Response(
            {
                "server_cursor": server_cursor,
                "updates": [
                    {
                        "cursor": update.id,
                        "entity": (update.payload or {}).get("entity", update.entity),
                        "op": (update.payload or {}).get("op", update.op),
                        "entity_id": (update.payload or {}).get("entity_id", str(update.entity_id)),
                        "payload": (update.payload or {}).get("payload", update.payload),
                    }
                    for update in updates
                ],
                "has_more": has_more,
            }
        )
