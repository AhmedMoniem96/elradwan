from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser, IsAuthenticated

from common.utils import emit_outbox
from sales.models import Customer, Invoice, Payment
from sales.serializers import CustomerSerializer, InvoiceSerializer, PaymentSerializer


class OutboxMutationMixin:
    outbox_entity = None

    def _get_branch_id(self, instance):
        if hasattr(instance, "branch_id"):
            return instance.branch_id
        if hasattr(instance, "invoice"):
            return instance.invoice.branch_id
        return None

    def _emit(self, instance, op):
        emit_outbox(
            branch_id=self._get_branch_id(instance),
            entity=self.outbox_entity,
            entity_id=instance.id,
            op=op,
            payload=self.get_serializer(instance).data,
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._emit(instance, "upsert")

    def perform_update(self, serializer):
        instance = serializer.save()
        self._emit(instance, "upsert")

    def perform_destroy(self, instance):
        self._emit(instance, "delete")
        instance.delete()


class CustomerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]


class PaymentViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    outbox_entity = "payment"


class AdminCustomerViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "customer"


class AdminInvoiceViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "invoice"
