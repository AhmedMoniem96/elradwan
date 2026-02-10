from rest_framework.routers import DefaultRouter

from sales.views import CustomerViewSet, InvoiceViewSet, PaymentViewSet

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"invoices", InvoiceViewSet, basename="invoice")
router.register(r"payments", PaymentViewSet, basename="payment")

urlpatterns = router.urls
