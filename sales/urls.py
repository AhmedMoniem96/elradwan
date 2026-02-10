from rest_framework.routers import DefaultRouter

from sales.views import (
    AdminCustomerViewSet,
    AdminInvoiceViewSet,
    CustomerViewSet,
    InvoiceViewSet,
    PaymentViewSet,
    ReturnViewSet,
)

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"invoices", InvoiceViewSet, basename="invoice")
router.register(r"payments", PaymentViewSet, basename="payment")
router.register(r"returns", ReturnViewSet, basename="return")
router.register(r"admin/customers", AdminCustomerViewSet, basename="admin-customer")
router.register(r"admin/invoices", AdminInvoiceViewSet, basename="admin-invoice")

urlpatterns = router.urls
