from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAdminUser, IsAuthenticated

from common.utils import emit_outbox
from core.views import scoped_queryset_for_user
from sales.models import CashShift, Customer, Invoice, Payment, Return
from sales.serializers import (
    CashShiftCloseSerializer,
    CashShiftOpenSerializer,
    CashShiftReportSerializer,
    CashShiftSerializer,
    CustomerSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    ReturnSerializer,
    ShiftSummarySerializer,
    get_shift_report,
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

    @action(detail=False, methods=["get"], url_path="dashboard-summary")
    def dashboard_summary(self, request):
        user = request.user
        qs = CashShift.objects.all()
        if not user.is_superuser and getattr(user, "branch_id", None):
            qs = qs.filter(branch_id=user.branch_id)
        elif not user.is_superuser:
            qs = qs.none()

        summary = {
            "active_shift_count": qs.filter(closed_at__isnull=True).count(),
            "expected_cash_total": qs.filter(closed_at__isnull=True).aggregate(total=Sum("opening_amount"))["total"]
            or Decimal("0.00"),
            "variance_total": qs.filter(closed_at__isnull=False).aggregate(total=Sum("variance"))["total"] or Decimal("0.00"),
        }
        return Response(ShiftSummarySerializer(summary).data)


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


class CashShiftOpenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CashShiftOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not getattr(user, "branch_id", None):
            raise ValidationError("Authenticated user must belong to a branch to open shifts.")

        device_id = serializer.validated_data["device"]
        opening_amount = serializer.validated_data["opening_amount"]

        if CashShift.objects.filter(cashier=user, device_id=device_id, closed_at__isnull=True).exists():
            raise ValidationError("An open shift already exists for this cashier and device.")

        shift = CashShift.objects.create(
            branch_id=user.branch_id,
            cashier=user,
            device_id=device_id,
            opening_amount=opening_amount,
        )

        emit_outbox(
            branch_id=shift.branch_id,
            entity="cash_shift",
            entity_id=shift.id,
            op="upsert",
            payload=CashShiftSerializer(shift).data,
        )

        return Response(CashShiftSerializer(shift).data, status=status.HTTP_201_CREATED)


class CashShiftCurrentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        device_id = request.query_params.get("device_id")
        if not device_id:
            raise ValidationError({"device_id": "This query parameter is required."})

        shift = CashShift.objects.filter(cashier=user, device_id=device_id, closed_at__isnull=True).first()
        if shift is None:
            raise NotFound("No active shift found for cashier and device.")

        return Response(CashShiftSerializer(shift).data)


class CashShiftCloseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, shift_id):
        serializer = CashShiftCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        shift = CashShift.objects.filter(id=shift_id, cashier=user, closed_at__isnull=True).first()
        if shift is None:
            raise NotFound("Open shift not found.")

        close_time = timezone.now()
        report = get_shift_report(shift)
        expected_cash = shift.opening_amount + report["payments"].get(Payment.Method.CASH, Decimal("0.00"))
        counted_cash = serializer.validated_data["closing_counted_amount"]
        variance = counted_cash - expected_cash

        shift.closed_at = close_time
        shift.closing_counted_amount = counted_cash
        shift.expected_amount = expected_cash
        shift.variance = variance
        shift.save(update_fields=["closed_at", "closing_counted_amount", "expected_amount", "variance"])

        emit_outbox(
            branch_id=shift.branch_id,
            entity="cash_shift",
            entity_id=shift.id,
            op="upsert",
            payload=CashShiftSerializer(shift).data,
        )

        report_payload = get_shift_report(shift)
        return Response(CashShiftReportSerializer(report_payload).data)


class CashShiftReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, shift_id):
        user = request.user
        qs = CashShift.objects.filter(id=shift_id)
        if not user.is_superuser:
            qs = qs.filter(branch_id=user.branch_id)

        shift = qs.first()
        if shift is None:
            raise NotFound("Shift not found.")

        return Response(CashShiftReportSerializer(get_shift_report(shift)).data)
