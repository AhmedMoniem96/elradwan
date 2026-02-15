import uuid
from datetime import datetime, time

from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import create_audit_log_from_request
from common.permissions import RoleCapabilityPermission
from common.utils import emit_outbox
from core.models import User
from core.views import scoped_queryset_for_user
from inventory.models import (
    Category,
    InventoryAlert,
    Product,
    PurchaseOrder,
    StockMove,
    StockTransfer,
    Supplier,
    SupplierContact,
    SupplierPayment,
    Warehouse,
)
from inventory.serializers import (
    CategorySerializer,
    GoodsReceiptSerializer,
    InventoryAlertSerializer,
    ProductSerializer,
    PurchaseOrderSerializer,
    StockTransferSerializer,
    SupplierContactSerializer,
    SupplierPaymentSerializer,
    SupplierSerializer,
    WarehouseSerializer,
)
from inventory.services import (
    compute_stock_intelligence,
    ensure_transfer_stock_available,
    export_reorder_csv,
    export_reorder_pdf_text,
    refresh_inventory_alerts,
    create_purchase_orders_from_alerts,
)


class OutboxMutationMixin:
    outbox_entity = None
    audit_entity = None

    def _audit(self, *, action, entity, instance, before_snapshot=None, after_snapshot=None, event_id=None):
        create_audit_log_from_request(
            self.request,
            action=action,
            entity=entity,
            entity_id=instance.id,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
            event_id=event_id,
            branch=getattr(instance, "branch", None),
            device=None,
        )

    def _emit(self, instance, op):
        emit_outbox(
            branch_id=instance.branch_id,
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
        self._audit(action=f"{self.audit_entity}.create", entity=self.audit_entity, instance=instance, after_snapshot=self.get_serializer(instance).data)

    def perform_update(self, serializer):
        before_snapshot = self.get_serializer(serializer.instance).data
        instance = serializer.save()
        self._emit(instance, "upsert")
        self._audit(action=f"{self.audit_entity}.update", entity=self.audit_entity, instance=instance, before_snapshot=before_snapshot, after_snapshot=self.get_serializer(instance).data)

    def perform_destroy(self, instance):
        before_snapshot = self.get_serializer(instance).data
        self._emit(instance, "delete")
        self._audit(action=f"{self.audit_entity}.delete", entity=self.audit_entity, instance=instance, before_snapshot=before_snapshot)
        instance.delete()


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "inventory.view", "retrieve": "inventory.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.select_related("preferred_supplier")
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "inventory.view", "retrieve": "inventory.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class WarehouseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "inventory.view", "retrieve": "inventory.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class SupplierViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Supplier.objects.prefetch_related("contacts")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "inventory.view", "retrieve": "inventory.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class PurchaseOrderViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PurchaseOrder.objects.select_related("supplier")
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "inventory.view", "retrieve": "inventory.view", "pending": "inventory.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        qs = self.get_queryset().filter(status__in=[PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.APPROVED])
        return Response(self.get_serializer(qs, many=True).data)


class StockTransferViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockTransfer.objects.select_related("source_warehouse", "destination_warehouse", "approved_by").prefetch_related("lines__product")
    serializer_class = StockTransferSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "inventory.view", "retrieve": "inventory.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class InventoryAlertViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = InventoryAlert.objects.select_related("warehouse", "product")
    serializer_class = InventoryAlertSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "inventory.view", "retrieve": "inventory.view", "unread": "inventory.view"}

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user).filter(resolved_at__isnull=True).order_by("-created_at")

    @action(detail=False, methods=["get"], url_path="unread")
    def unread(self, request):
        qs = self.get_queryset().filter(is_read=False)
        return Response(self.get_serializer(qs, many=True).data)


class AdminCategoryViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {action: "admin.records.manage" for action in ["list", "retrieve", "create", "update", "partial_update", "destroy"]}
    outbox_entity = "category"
    audit_entity = "category"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminProductViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related("preferred_supplier")
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {action: "admin.records.manage" for action in ["list", "retrieve", "create", "update", "partial_update", "destroy"]}
    outbox_entity = "product"
    audit_entity = "product"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminWarehouseViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {action: "admin.records.manage" for action in ["list", "retrieve", "create", "update", "partial_update", "destroy"]}
    outbox_entity = "warehouse"
    audit_entity = "warehouse"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminSupplierViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {action: "admin.records.manage" for action in ["list", "retrieve", "create", "update", "partial_update", "destroy"]}
    outbox_entity = "supplier"
    audit_entity = "supplier"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminSupplierContactViewSet(viewsets.ModelViewSet):
    queryset = SupplierContact.objects.select_related("supplier")
    serializer_class = SupplierContactSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {action: "admin.records.manage" for action in ["list", "retrieve", "create", "update", "partial_update", "destroy"]}

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_superuser:
            return qs
        if getattr(user, "branch_id", None):
            return qs.filter(supplier__branch_id=user.branch_id)
        return qs.none()

    def perform_create(self, serializer):
        supplier = serializer.validated_data["supplier"]
        user = self.request.user
        if not user.is_superuser and supplier.branch_id != user.branch_id:
            raise ValidationError("Supplier must belong to your branch.")
        instance = serializer.save()
        emit_outbox(instance.supplier.branch_id, "supplier_contact", instance.id, "upsert", self.get_serializer(instance).data)

    def perform_update(self, serializer):
        instance = serializer.save()
        emit_outbox(instance.supplier.branch_id, "supplier_contact", instance.id, "upsert", self.get_serializer(instance).data)

    def perform_destroy(self, instance):
        emit_outbox(instance.supplier.branch_id, "supplier_contact", instance.id, "delete", self.get_serializer(instance).data)
        instance.delete()


class AdminPurchaseOrderViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related("supplier").prefetch_related("lines")
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "admin.records.manage", "retrieve": "admin.records.manage", "create": "admin.records.manage", "update": "admin.records.manage", "partial_update": "admin.records.manage", "destroy": "admin.records.manage", "receive": "stock.adjust"}
    outbox_entity = "purchase_order"
    audit_entity = "purchase_order"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        user = self.request.user
        if not getattr(user, "branch_id", None):
            raise ValidationError("Authenticated user must belong to a branch to create records.")

        instance = serializer.save(branch_id=user.branch_id)
        self._emit(instance, "upsert")
        self._audit(action=f"{self.audit_entity}.create", entity=self.audit_entity, instance=instance, after_snapshot=self.get_serializer(instance).data)

    @action(detail=True, methods=["post"], url_path="receive")
    def receive(self, request, pk=None):
        po = self.get_object()
        if po.status not in [PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.DRAFT]:
            raise ValidationError("Only draft or approved purchase orders can be received.")

        serializer = GoodsReceiptSerializer(data=request.data, context={"purchase_order": po})
        serializer.is_valid(raise_exception=True)
        po = serializer.save()
        self._emit(po, "upsert")
        self._audit(action="stock.adjustment", entity="purchase_order", instance=po, after_snapshot=self.get_serializer(po).data, event_id=serializer.validated_data["event_id"])
        emit_outbox(po.branch_id, "goods_receipt", po.id, "upsert", self.get_serializer(po).data)
        return Response(self.get_serializer(po).data)


class AdminStockTransferViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = StockTransfer.objects.select_related("source_warehouse", "destination_warehouse", "approved_by").prefetch_related("lines__product")
    serializer_class = StockTransferSerializer
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"list": "admin.records.manage", "retrieve": "admin.records.manage", "create": "stock.adjust", "update": "stock.adjust", "partial_update": "stock.adjust", "destroy": "stock.adjust", "approve": "stock.transfer.approve", "complete": "stock.transfer.complete"}
    outbox_entity = "stock_transfer"
    audit_entity = "stock_transfer"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(branch_id=self.request.user.branch_id)
        self._emit(instance, "upsert")
        self._audit(action="transfer.create", entity="stock_transfer", instance=instance, after_snapshot=self.get_serializer(instance).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        transfer = self.get_object()
        if transfer.status != StockTransfer.Status.DRAFT:
            raise ValidationError("Only draft transfers can be approved.")

        user = request.user
        if transfer.requires_supervisor_approval and user.role not in [User.Role.SUPERVISOR, User.Role.ADMIN] and not user.is_superuser:
            raise ValidationError("Supervisor approval is required for this transfer.")

        transfer.status = StockTransfer.Status.APPROVED
        transfer.approved_by = user
        transfer.approved_at = timezone.now()
        transfer.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        self._emit(transfer, "upsert")
        self._audit(action="transfer.approve", entity="stock_transfer", instance=transfer, after_snapshot=self.get_serializer(transfer).data)
        emit_outbox(transfer.branch_id, "stock_transfer_approved", transfer.id, "upsert", self.get_serializer(transfer).data)
        return Response(self.get_serializer(transfer).data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        transfer = self.get_object()
        if transfer.status != StockTransfer.Status.APPROVED:
            raise ValidationError("Only approved transfers can be completed.")

        shortages = ensure_transfer_stock_available(transfer)
        if shortages:
            raise ValidationError({"stock": "Insufficient source stock for transfer.", "shortages": shortages})

        event_id = request.data.get("event_id") or uuid.uuid4()
        with transaction.atomic():
            for line in transfer.lines.select_related("product"):
                StockMove.objects.create(
                    branch_id=transfer.branch_id,
                    warehouse_id=transfer.source_warehouse_id,
                    product=line.product,
                    quantity=-line.quantity,
                    unit_cost=line.product.cost,
                    reason=StockMove.Reason.TRANSFER,
                    source_ref_type="inventory.stock_transfer",
                    source_ref_id=transfer.id,
                    event_id=event_id,
                )
                StockMove.objects.create(
                    branch_id=transfer.branch_id,
                    warehouse_id=transfer.destination_warehouse_id,
                    product=line.product,
                    quantity=line.quantity,
                    unit_cost=line.product.cost,
                    reason=StockMove.Reason.TRANSFER,
                    source_ref_type="inventory.stock_transfer",
                    source_ref_id=transfer.id,
                    event_id=event_id,
                )

            transfer.status = StockTransfer.Status.COMPLETED
            transfer.completed_at = timezone.now()
            transfer.save(update_fields=["status", "completed_at", "updated_at"])

        self._emit(transfer, "upsert")
        self._audit(action="transfer.complete", entity="stock_transfer", instance=transfer, after_snapshot=self.get_serializer(transfer).data, event_id=event_id)
        emit_outbox(transfer.branch_id, "stock_transfer_completed", transfer.id, "upsert", self.get_serializer(transfer).data)
        return Response(self.get_serializer(transfer).data)


class SupplierPaymentCreateView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"post": "supplier.payment.create"}

    def post(self, request, supplier_id):
        supplier = scoped_queryset_for_user(Supplier.objects.all(), request.user).filter(id=supplier_id).first()
        if supplier is None:
            raise ValidationError("Supplier not found.")

        payload = request.data.copy()
        payload["supplier"] = supplier.id
        payload["branch"] = supplier.branch_id
        serializer = SupplierPaymentSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()

        remaining = Decimal(payment.amount)
        open_pos = PurchaseOrder.objects.filter(supplier_id=supplier.id, total__gt=F("amount_paid")).order_by("payment_due_at", "due_date", "created_at")
        for po in open_pos:
            if remaining <= 0:
                break
            po_outstanding = Decimal(po.total) - Decimal(po.amount_paid)
            allocation = min(po_outstanding, remaining)
            po.amount_paid = Decimal(po.amount_paid) + allocation
            po.save(update_fields=["amount_paid", "updated_at"])
            remaining -= allocation

        emit_outbox(supplier.branch_id, "supplier_payment", payment.id, "upsert", SupplierPaymentSerializer(payment).data)
        return Response(SupplierPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class SupplierBalancesReportView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "inventory.view", "post": "inventory.view"}

    def get(self, request):
        po_qs = scoped_queryset_for_user(PurchaseOrder.objects.select_related("supplier"), request.user)
        now = timezone.now()
        rows = []
        for supplier in Supplier.objects.filter(id__in=po_qs.values_list("supplier_id", flat=True).distinct()):
            supplier_pos = po_qs.filter(supplier_id=supplier.id)
            totals = supplier_pos.aggregate(total=Sum("total"), paid=Sum("amount_paid"))
            total = Decimal(totals["total"] or 0)
            paid = Decimal(totals["paid"] or 0)

            aging = {"current": Decimal("0.00"), "30": Decimal("0.00"), "60": Decimal("0.00"), "90_plus": Decimal("0.00")}
            for po in supplier_pos.filter(total__gt=F("amount_paid")):
                due_amount = Decimal(po.total) - Decimal(po.amount_paid)
                due_dt = po.payment_due_at or (timezone.make_aware(datetime.combine(po.due_date, time.min)) if po.due_date else po.expected_at or po.created_at)
                age_days = max((now - due_dt).days, 0)
                if age_days < 30:
                    aging["current"] += due_amount
                elif age_days < 60:
                    aging["30"] += due_amount
                elif age_days < 90:
                    aging["60"] += due_amount
                else:
                    aging["90_plus"] += due_amount

            rows.append(
                {
                    "supplier_id": str(supplier.id),
                    "supplier_name": supplier.name,
                    "total_purchased": total,
                    "amount_paid": paid,
                    "balance_due": max(total - paid, Decimal("0.00")),
                    "aging": aging,
                }
            )
        return Response(rows)




class SupplierAgingReportView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "inventory.view"}

    def get(self, request):
        return SupplierBalancesReportView().get(request)


class PurchaseReceiveHistoryView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "inventory.view", "post": "inventory.view"}

    def get(self, request):
        po_qs = scoped_queryset_for_user(
            PurchaseOrder.objects.filter(status=PurchaseOrder.Status.RECEIVED).select_related("supplier"),
            request.user,
        ).order_by("-received_at", "-updated_at")
        payload = []
        for po in po_qs:
            payload.append(
                {
                    "purchase_order_id": str(po.id),
                    "po_number": po.po_number,
                    "supplier_name": po.supplier.name,
                    "received_at": po.received_at,
                    "total": po.total,
                }
            )
        return Response(payload)


class StockIntelligenceView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "inventory.view", "post": "inventory.view"}

    def get(self, request):
        intelligence = refresh_inventory_alerts(request.user.branch_id)
        serialized_rows = [
            {
                **row,
                "warehouse_id": str(row["warehouse_id"]),
                "product_id": str(row["product_id"]),
                "preferred_supplier_id": str(row["preferred_supplier_id"]) if row["preferred_supplier_id"] else None,
                "minimum_quantity": str(row["minimum_quantity"]),
                "reorder_quantity": str(row["reorder_quantity"]),
                "on_hand": str(row["on_hand"]),
                "suggested_reorder_quantity": str(row["suggested_reorder_quantity"]),
            }
            for row in intelligence["rows"]
            if row["severity"]
        ]
        return Response(
            {
                "generated_at": intelligence["generated_at"],
                "low_count": intelligence["low_count"],
                "critical_count": intelligence["critical_count"],
                "unread_alert_count": intelligence["unread_alert_count"],
                "rows": serialized_rows,
            }
        )


class AlertMarkReadView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "inventory.view", "post": "inventory.view"}

    def post(self, request):
        alert_ids = request.data.get("alert_ids", [])
        qs = scoped_queryset_for_user(InventoryAlert.objects.filter(id__in=alert_ids, resolved_at__isnull=True), request.user)
        updated = []
        for alert in qs:
            alert.is_read = True
            alert.save(update_fields=["is_read", "updated_at"])
            updated.append(str(alert.id))
            emit_outbox(
                branch_id=alert.branch_id,
                entity="inventory_alert_update",
                entity_id=alert.id,
                op="upsert",
                payload={"alert_id": str(alert.id), "is_read": True},
            )
        return Response({"updated": updated})




class ReorderSuggestionCreatePOView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"post": "admin.records.manage"}

    def post(self, request):
        request_branch_id = request.data.get("branch_id")
        branch_id = request.user.branch_id
        if request_branch_id and (request.user.is_superuser or not getattr(request.user, "branch_id", None)):
            branch_id = request_branch_id

        if not branch_id:
            raise ValidationError("No branch is available for this request.")

        severity = request.data.get("severity")
        if severity and severity not in [InventoryAlert.Severity.LOW, InventoryAlert.Severity.CRITICAL]:
            raise ValidationError({"severity": "Severity must be low or critical."})

        min_stockout_days = request.data.get("min_stockout_days")
        if min_stockout_days in [None, ""]:
            min_stockout_days = None
        else:
            try:
                min_stockout_days = int(min_stockout_days)
            except (TypeError, ValueError):
                raise ValidationError({"min_stockout_days": "Must be an integer."})
            if min_stockout_days < 0:
                raise ValidationError({"min_stockout_days": "Must be >= 0."})

        result = create_purchase_orders_from_alerts(
            branch_id=branch_id,
            warehouse_id=request.data.get("warehouse_id"),
            severity=severity,
            min_stockout_days=min_stockout_days,
        )
        return Response(result, status=status.HTTP_201_CREATED if result["created_count"] else status.HTTP_200_OK)


class ReorderSuggestionExportView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "inventory.view", "post": "inventory.view"}

    def get(self, request):
        fmt = request.query_params.get("format", "csv").lower()
        branch_id = request.user.branch_id

        if fmt == "pdf":
            content = export_reorder_pdf_text(branch_id)
            response = HttpResponse(content, content_type="application/pdf")
            response["Content-Disposition"] = 'attachment; filename="reorder-suggestions.pdf"'
            return response

        csv_data = export_reorder_csv(branch_id)
        response = HttpResponse(csv_data, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="reorder-suggestions.csv"'
        return response
