from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from sync.models import SyncEvent, SyncOutbox
from sync.permissions import (
    get_permitted_device,
    validation_failed_response,
)
from sync.serializers import SyncPullSerializer, SyncPushSerializer
from sync.services import process_sync_event


class SyncPushView(APIView):
    def post(self, request):
        serializer = SyncPushSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_failed_response(serializer.errors)

        device_id = serializer.validated_data["device_id"]
        events = serializer.validated_data["events"]

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
                        "reason": "validation_failed",
                        "details": {"branch_id": "Payload branch_id does not match device branch."},
                    }
                )
                continue

            try:
                with transaction.atomic():
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
                    if created:
                        result = process_sync_event(sync_event)
                        sync_event.processed_at = timezone.now()

                        if result.accepted:
                            sync_event.status = SyncEvent.Status.PROCESSED
                            sync_event.save(update_fields=["status", "processed_at"])
                        else:
                            sync_event.status = SyncEvent.Status.REJECTED
                            sync_event.save(update_fields=["status", "processed_at"])
                            rejected.append(
                                {
                                    "event_id": str(event["event_id"]),
                                    "reason": result.reason,
                                    "details": result.details or {},
                                }
                            )
                            continue
                acknowledged.append(str(event["event_id"]))
            except IntegrityError as exc:
                rejected.append(
                    {
                        "event_id": str(event["event_id"]),
                        "reason": "conflict",
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
            }
        )


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
                        "entity": update.entity,
                        "op": update.op,
                        "entity_id": str(update.entity_id),
                        "payload": update.payload,
                    }
                    for update in updates
                ],
                "has_more": has_more,
            }
        )
