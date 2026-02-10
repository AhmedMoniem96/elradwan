from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from common.audit import create_audit_log_from_request
from common.permissions import RoleCapabilityPermission, user_has_capability
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
    audit_entity = None

    def _get_branch_id(self, instance):
        if hasattr(instance, "branch_id"):
            return instance.branch_id
        if hasattr(instance, "invoice"):
            return instance.invoice.branch_id
        return None

    def _audit(self, *, action, entity, instance, before_snapshot=None, after_snapshot=None, event_id=None):
        create_audit_log_from_request(
            self.request,
            action=action,
            entity=entity,
            entity_id=instance.id,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
            event_id=event_id,
            branch=getattr(instance, "branch", None) or getattr(getattr(instance, "invoice", None), "branch", None),
            device=getattr(instance, "device", None) or getattr(getattr(instance, "invoice", None), "device", None),
        )

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
        self._audit(action=f"{self.audit_entity}.create", entity=self.audit_entity, instance=instance, after_snapshot=self.get_serializer(instance).data, event_id=getattr(instance, "event_id", None))

    def perform_update(self, serializer):
        before_snapshot = self.get_serializer(serializer.instance).data
        instance = serializer.save()
        self._emit(instance, "upsert")
        self._audit(
            action=f"{self.audit_entity}.update",
            entity=self.audit_entity,
            instance=instance,
            before_snapshot=before_snapshot,
            after_snapshot=self.get_serializer(instance).data,
            event_id=getattr(instance, "event_id", None),
        )

    def perform_destroy(self, instance):
        before_snapshot = self.get_serializer(instance).data
        self._emit(instance, "delete")
        self._audit(action=f"{self.audit_entity}.delete", entity=self.audit_entity, instance=instance, before_snapshot=before_snapshot)
        instance.delete()


class CustomerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "sales.customers.view", "retrieve": "sales.customers.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "sales.dashboard.view", "retrieve": "sales.dashboard.view", "dashboard_summary": "sales.dashboard.view"}

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
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {
        "list": "sales.pos.access",
        "retrieve": "sales.pos.access",
        "create": "sales.pos.access",
        "update": "admin.records.manage",
        "partial_update": "admin.records.manage",
        "destroy": "admin.records.manage",
        "void": "invoice.void",
    }
    outbox_entity = "payment"
    audit_entity = "payment"

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
        self._audit(
            action="payment.create",
            entity="payment",
            instance=instance,
            after_snapshot=self.get_serializer(instance).data,
            event_id=instance.event_id,
        )


class ReturnViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Return.objects.all()
    serializer_class = ReturnSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {
        "list": "sales.pos.access",
        "retrieve": "sales.pos.access",
        "create": "sales.pos.access",
        "update": "admin.records.manage",
        "partial_update": "admin.records.manage",
        "destroy": "admin.records.manage",
        "void": "invoice.void",
    }
    outbox_entity = "return"
    audit_entity = "return"

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
        self._audit(action="return.create", entity="return", instance=instance, after_snapshot=self.get_serializer(instance).data, event_id=instance.event_id)
        for refund in instance.refunds.all():
            create_audit_log_from_request(
                self.request,
                action="refund.create",
                entity="refund",
                entity_id=refund.id,
                after_snapshot={
                    "id": str(refund.id),
                    "return_id": str(instance.id),
                    "method": refund.method,
                    "amount": str(refund.amount),
                    "refunded_at": refund.refunded_at.isoformat(),
                },
                event_id=instance.event_id,
                branch=instance.branch,
                device=instance.device,
            )


class AdminCustomerViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {action: "admin.records.manage" for action in ["list", "retrieve", "create", "update", "partial_update", "destroy"]}
    outbox_entity = "customer"
    audit_entity = "customer"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminInvoiceViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {
        "list": "admin.records.manage",
        "retrieve": "admin.records.manage",
        "create": "admin.records.manage",
        "update": "admin.records.manage",
        "partial_update": "admin.records.manage",
        "destroy": "admin.records.manage",
        "void": "invoice.void",
    }
    outbox_entity = "invoice"
    audit_entity = "invoice"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status == Invoice.Status.VOID:
            raise ValidationError("Invoice is already void.")
        previous_status = invoice.status
        invoice.status = Invoice.Status.VOID
        invoice.updated_at = timezone.now()
        invoice.save(update_fields=["status", "updated_at"])
        self._emit(invoice, "upsert")
        self._audit(
            action="invoice.void",
            entity="invoice",
            instance=invoice,
            before_snapshot={"status": previous_status},
            after_snapshot=self.get_serializer(invoice).data,
            event_id=invoice.event_id,
        )
        return Response(self.get_serializer(invoice).data)


class CashShiftOpenView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"post": "sales.pos.access"}

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
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "sales.pos.access"}

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
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"post": "shift.close.self"}

    def post(self, request, shift_id):
        serializer = CashShiftCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        shift = CashShift.objects.filter(id=shift_id, closed_at__isnull=True).first()
        if shift is None:
            raise NotFound("Open shift not found.")
        is_own_shift = shift.cashier_id == user.id
        if not is_own_shift and not user_has_capability(user, "shift.close.override"):
            raise ValidationError("Only supervisors/admins can close another cashier's shift.")

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
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "sales.dashboard.view"}

    def get(self, request, shift_id):
        user = request.user
        qs = CashShift.objects.filter(id=shift_id)
        if not user.is_superuser:
            qs = qs.filter(branch_id=user.branch_id)

        shift = qs.first()
        if shift is None:
            raise NotFound("Shift not found.")

        return Response(CashShiftReportSerializer(get_shift_report(shift)).data)
