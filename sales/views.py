from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated

from common.utils import emit_outbox
from core.views import scoped_queryset_for_user
from sales.models import Customer, Invoice, Payment, Return
from sales.serializers import (
    CustomerSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    ReturnSerializer,
)


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
        user = self.request.user
        if not getattr(user, "branch_id", None):
            raise ValidationError("Authenticated user must belong to a branch to create records.")

        instance = serializer.save(branch_id=user.branch_id)
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

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class PaymentViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    outbox_entity = "payment"

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.is_superuser:
            return queryset
        if getattr(user, "branch_id", None):
            return queryset.filter(invoice__branch_id=user.branch_id)
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if not getattr(user, "branch_id", None):
            raise ValidationError("Authenticated user must belong to a branch to create records.")

        invoice = serializer.validated_data["invoice"]
        if invoice.branch_id != user.branch_id:
            raise ValidationError({"invoice": "Invoice must belong to your branch."})

        instance = serializer.save()
        self._emit(instance, "upsert")


class ReturnViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Return.objects.all()
    serializer_class = ReturnSerializer
    permission_classes = [IsAuthenticated]
    outbox_entity = "return"

    def get_queryset(self):
        queryset = super().get_queryset().select_related("invoice", "branch", "device", "user")
        user = self.request.user

        if user.is_superuser:
            return queryset
        if getattr(user, "branch_id", None):
            return queryset.filter(branch_id=user.branch_id)
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if not getattr(user, "branch_id", None):
            raise ValidationError("Authenticated user must belong to a branch to create records.")

        invoice = serializer.validated_data["invoice"]
        if invoice.branch_id != user.branch_id:
            raise ValidationError({"invoice": "Invoice must belong to your branch."})

        instance = serializer.save(branch_id=user.branch_id, user=user)
        self._emit(instance, "upsert")


class AdminCustomerViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "customer"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminInvoiceViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "invoice"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)
