from django.urls import path
from rest_framework.routers import DefaultRouter

from inventory.views import (
    AdminCategoryViewSet,
    AdminProductViewSet,
    AdminPurchaseOrderViewSet,
    AdminSupplierContactViewSet,
    AdminSupplierViewSet,
    AdminWarehouseViewSet,
    CategoryViewSet,
    ProductViewSet,
    PurchaseOrderViewSet,
    PurchaseReceiveHistoryView,
    SupplierBalancesReportView,
    SupplierViewSet,
    WarehouseViewSet,
)

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register(r"admin/categories", AdminCategoryViewSet, basename="admin-category")
router.register(r"admin/products", AdminProductViewSet, basename="admin-product")
router.register(r"admin/warehouses", AdminWarehouseViewSet, basename="admin-warehouse")
router.register(r"admin/suppliers", AdminSupplierViewSet, basename="admin-supplier")
router.register(r"admin/supplier-contacts", AdminSupplierContactViewSet, basename="admin-supplier-contact")
router.register(r"admin/purchase-orders", AdminPurchaseOrderViewSet, basename="admin-purchase-order")

urlpatterns = router.urls + [
    path("reports/supplier-balances/", SupplierBalancesReportView.as_view(), name="supplier-balances"),
    path("reports/purchases/received-history/", PurchaseReceiveHistoryView.as_view(), name="received-history"),
]
