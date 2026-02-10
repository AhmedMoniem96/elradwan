from rest_framework.routers import DefaultRouter

from sales.views import (
    AdminCustomerViewSet,
    AdminInvoiceViewSet,
    CashShiftCloseView,
    CashShiftCurrentView,
    CashShiftOpenView,
    CashShiftReportView,
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


from django.urls import path

urlpatterns += [
    path("shifts/open/", CashShiftOpenView.as_view(), name="shift-open"),
    path("shifts/current/", CashShiftCurrentView.as_view(), name="shift-current"),
    path("shifts/<uuid:shift_id>/close/", CashShiftCloseView.as_view(), name="shift-close"),
    path("shifts/<uuid:shift_id>/report/", CashShiftReportView.as_view(), name="shift-report"),
]
