from rest_framework.routers import DefaultRouter

from sales.views import CustomerViewSet, InvoiceViewSet

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"invoices", InvoiceViewSet, basename="invoice")

urlpatterns = router.urls
