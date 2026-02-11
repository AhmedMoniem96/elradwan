import csv

from django.http import HttpResponse
from django.utils.dateparse import parse_datetime
from rest_framework import generics, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated

from common.audit import create_audit_log_from_request
from common.permissions import RoleCapabilityPermission, user_has_capability
from rest_framework_simplejwt.views import TokenObtainPairView

from core.models import AuditLog, Branch, Device
from core.serializers import (
    AuditLogSerializer,
    BranchSerializer,
    DeviceSerializer,
    EmailOrUsernameTokenObtainPairSerializer,
    UserRegistrationSerializer,
)


def scoped_queryset_for_user(queryset, user):
    if not user.is_authenticated:
        return queryset.none()

    if user.is_superuser:
        return queryset

    if getattr(user, "branch_id", None):
        return queryset.filter(branch_id=user.branch_id)

    return queryset.none()


class RegisterView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        create_audit_log_from_request(
            self.request,
            action="user.create",
            entity="user",
            entity_id=user.id,
            after_snapshot={
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
            },
        )


class EmailOrUsernameTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenObtainPairSerializer


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {
        "list": "device.read",
        "retrieve": "device.read",
        "create": "admin.records.manage",
        "update": "admin.records.manage",
        "partial_update": "admin.records.manage",
        "destroy": "admin.records.manage",
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.is_superuser:
            return queryset
        if user_has_capability(user, "admin.records.manage"):
            return queryset
        if getattr(user, "branch_id", None):
            return queryset.filter(id=user.branch_id)
        return queryset.none()


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {
        "list": "device.read",
        "retrieve": "device.read",
        "create": "device.manage",
        "update": "device.manage",
        "partial_update": "device.manage",
        "destroy": "device.manage",
    }

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        user = self.request.user
        if not getattr(user, "branch_id", None):
            raise ValidationError("Authenticated user must belong to a branch to create devices.")
        instance = serializer.save(branch_id=user.branch_id)
        create_audit_log_from_request(
            self.request,
            action="device.create",
            entity="device",
            entity_id=instance.id,
            after_snapshot=self.get_serializer(instance).data,
            branch=instance.branch,
            device=instance,
        )

    def perform_update(self, serializer):
        before_snapshot = self.get_serializer(serializer.instance).data
        instance = serializer.save()
        create_audit_log_from_request(
            self.request,
            action="device.update",
            entity="device",
            entity_id=instance.id,
            before_snapshot=before_snapshot,
            after_snapshot=self.get_serializer(instance).data,
            branch=instance.branch,
            device=instance,
        )

    def perform_destroy(self, instance):
        snapshot = self.get_serializer(instance).data
        create_audit_log_from_request(
            self.request,
            action="device.delete",
            entity="device",
            entity_id=instance.id,
            before_snapshot=snapshot,
            branch=instance.branch,
            device=instance,
        )
        instance.delete()


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor", "branch", "device")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "admin.records.manage", "retrieve": "admin.records.manage", "export": "admin.records.manage"}

    def get_queryset(self):
        qs = self.queryset.order_by("-created_at")
        user = self.request.user

        if not user.is_superuser and getattr(user, "branch_id", None):
            qs = qs.filter(branch_id=user.branch_id)
        elif not user.is_superuser:
            qs = qs.none()

        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        actor_id = self.request.query_params.get("actor_id")
        action = self.request.query_params.get("action")
        entity = self.request.query_params.get("entity")

        if start_date:
            dt = parse_datetime(start_date)
            if dt:
                qs = qs.filter(created_at__gte=dt)
        if end_date:
            dt = parse_datetime(end_date)
            if dt:
                qs = qs.filter(created_at__lte=dt)
        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        if action:
            qs = qs.filter(action=action)
        if entity:
            qs = qs.filter(entity=entity)

        return qs

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        logs = self.get_queryset()
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="audit-logs.csv"'

        writer = csv.writer(response)
        writer.writerow(["id", "created_at", "actor", "branch", "device", "action", "entity", "entity_id", "event_id", "request_id"])
        for log in logs:
            writer.writerow(
                [
                    log.id,
                    log.created_at.isoformat(),
                    getattr(log.actor, "username", ""),
                    getattr(log.branch, "name", ""),
                    getattr(log.device, "name", ""),
                    log.action,
                    log.entity,
                    log.entity_id,
                    log.event_id,
                    log.request_id,
                ]
            )
        return response
