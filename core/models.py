import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower


class Branch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    timezone = models.CharField(max_length=64, default="UTC")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class User(AbstractUser):
    class Role(models.TextChoices):
        CASHIER = "cashier", "Cashier"
        SUPERVISOR = "supervisor", "Supervisor"
        ADMIN = "admin", "Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(blank=True)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, null=True, blank=True)
    role = models.CharField(max_length=32, choices=Role, default=Role.CASHIER)

    class Meta(AbstractUser.Meta):
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=~Q(email=""),
                name="core_user_email_ci_unique",
            )
        ]

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)


class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    name = models.CharField(max_length=255)
    identifier = models.CharField(max_length=255, unique=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "is_active"]),
        ]


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=64)
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField(null=True, blank=True)
    before_snapshot = models.JSONField(null=True, blank=True)
    after_snapshot = models.JSONField(null=True, blank=True)
    event_id = models.UUIDField(null=True, blank=True)
    request_id = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["action", "created_at"]),
            models.Index(fields=["entity", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
        ]
