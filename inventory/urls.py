from rest_framework.routers import DefaultRouter

from inventory.views import CategoryViewSet, ProductViewSet, WarehouseViewSet

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")

urlpatterns = router.urls
