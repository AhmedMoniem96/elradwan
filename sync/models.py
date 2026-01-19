import uuid

from django.db import models

from core.models import Branch, Device, User


class SyncEvent(models.Model):
    class Status(models.TextChoices):
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        PROCESSED = "processed", "Processed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    device = models.ForeignKey(Device, on_delete=models.PROTECT)
    user = models.ForeignKey(User, on_delete=models.PROTECT)
    event_id = models.UUIDField()
    event_type = models.CharField(max_length=64)
    payload = models.JSONField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACCEPTED)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["device", "created_at"]),
            models.Index(fields=["branch", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["event_id", "device"], name="uniq_syncevent_event_device"),
        ]


class SyncOutbox(models.Model):
    id = models.BigAutoField(primary_key=True)
    branch_id = models.UUIDField()
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    op = models.CharField(max_length=16)
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch_id", "id"]),
            models.Index(fields=["entity", "id"]),
        ]
