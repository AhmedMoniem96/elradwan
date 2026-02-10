from django.urls import path
from rest_framework.routers import DefaultRouter

from inventory.views import (
    AdminCategoryViewSet,
    AdminProductViewSet,
    AdminPurchaseOrderViewSet,
    AdminStockTransferViewSet,
    AdminSupplierContactViewSet,
    AdminSupplierViewSet,
    AdminWarehouseViewSet,
    AlertMarkReadView,
    CategoryViewSet,
    InventoryAlertViewSet,
    ProductViewSet,
    PurchaseOrderViewSet,
    PurchaseReceiveHistoryView,
    ReorderSuggestionExportView,
    StockIntelligenceView,
    StockTransferViewSet,
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
router.register(r"stock-transfers", StockTransferViewSet, basename="stock-transfer")
router.register(r"alerts", InventoryAlertViewSet, basename="inventory-alert")
router.register(r"admin/categories", AdminCategoryViewSet, basename="admin-category")
router.register(r"admin/products", AdminProductViewSet, basename="admin-product")
router.register(r"admin/warehouses", AdminWarehouseViewSet, basename="admin-warehouse")
router.register(r"admin/suppliers", AdminSupplierViewSet, basename="admin-supplier")
router.register(r"admin/supplier-contacts", AdminSupplierContactViewSet, basename="admin-supplier-contact")
router.register(r"admin/purchase-orders", AdminPurchaseOrderViewSet, basename="admin-purchase-order")
router.register(r"admin/stock-transfers", AdminStockTransferViewSet, basename="admin-stock-transfer")

urlpatterns = router.urls + [
    path("reports/supplier-balances/", SupplierBalancesReportView.as_view(), name="supplier-balances"),
    path("reports/purchases/received-history/", PurchaseReceiveHistoryView.as_view(), name="received-history"),
    path("stock-intelligence/", StockIntelligenceView.as_view(), name="stock-intelligence"),
    path("alerts/mark-read/", AlertMarkReadView.as_view(), name="alerts-mark-read"),
    path("reorder-suggestions/export/", ReorderSuggestionExportView.as_view(), name="reorder-suggestions-export"),
]
