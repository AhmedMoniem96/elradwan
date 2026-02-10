from django.urls import path
from rest_framework.routers import DefaultRouter

from core.views import AuditLogViewSet, BranchViewSet, DeviceViewSet, RegisterView

router = DefaultRouter()
router.register(r"branches", BranchViewSet, basename="branch")
router.register(r"devices", DeviceViewSet, basename="device")
router.register(r"admin/audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = router.urls + [
    path("register/", RegisterView.as_view(), name="register"),
]
