from rest_framework.routers import DefaultRouter

from inventory.views import (
    AdminCategoryViewSet,
    AdminProductViewSet,
    AdminWarehouseViewSet,
    CategoryViewSet,
    ProductViewSet,
    WarehouseViewSet,
)

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")
router.register(r"admin/categories", AdminCategoryViewSet, basename="admin-category")
router.register(r"admin/products", AdminProductViewSet, basename="admin-product")
router.register(r"admin/warehouses", AdminWarehouseViewSet, basename="admin-warehouse")

urlpatterns = router.urls
