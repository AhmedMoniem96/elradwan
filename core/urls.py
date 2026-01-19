from rest_framework.routers import DefaultRouter

from core.views import BranchViewSet, DeviceViewSet

router = DefaultRouter()
router.register(r"branches", BranchViewSet, basename="branch")
router.register(r"devices", DeviceViewSet, basename="device")

urlpatterns = router.urls
