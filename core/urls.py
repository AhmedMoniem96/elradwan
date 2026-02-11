from django.urls import path
from rest_framework.routers import DefaultRouter

from core.views import (
    AuditLogViewSet,
    BranchViewSet,
    DeviceViewSet,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
)

router = DefaultRouter()
router.register(r"branches", BranchViewSet, basename="branch")
router.register(r"devices", DeviceViewSet, basename="device")
router.register(r"admin/audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = router.urls + [
    path("register/", RegisterView.as_view(), name="register"),
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="password_reset_request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
]
