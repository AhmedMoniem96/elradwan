from django.db.models import Sum
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.utils import emit_outbox
from core.views import scoped_queryset_for_user
from inventory.models import Category, Product, PurchaseOrder, Supplier, SupplierContact, Warehouse
from inventory.serializers import (
    CategorySerializer,
    GoodsReceiptSerializer,
    ProductSerializer,
    PurchaseOrderSerializer,
    SupplierContactSerializer,
    SupplierSerializer,
    WarehouseSerializer,
)


class OutboxMutationMixin:
    outbox_entity = None

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

    def perform_update(self, serializer):
        instance = serializer.save()
        self._emit(instance, "upsert")

    def perform_destroy(self, instance):
        self._emit(instance, "delete")
        instance.delete()


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class WarehouseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class SupplierViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Supplier.objects.prefetch_related("contacts")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class PurchaseOrderViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PurchaseOrder.objects.select_related("supplier")
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        qs = self.get_queryset().filter(status__in=[PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.APPROVED])
        return Response(self.get_serializer(qs, many=True).data)


class AdminCategoryViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "category"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminProductViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "product"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminWarehouseViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "warehouse"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminSupplierViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "supplier"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)


class AdminSupplierContactViewSet(viewsets.ModelViewSet):
    queryset = SupplierContact.objects.select_related("supplier")
    serializer_class = SupplierContactSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_superuser:
            return qs
        if getattr(user, "branch_id", None):
            return qs.filter(supplier__branch_id=user.branch_id)
        return qs.none()

    def perform_create(self, serializer):
        user = self.request.user
        supplier = serializer.validated_data["supplier"]
        if not user.is_superuser and supplier.branch_id != user.branch_id:
            raise ValidationError({"supplier": "Supplier must belong to your branch."})
        instance = serializer.save()
        emit_outbox(
            branch_id=instance.supplier.branch_id,
            entity="supplier_contact",
            entity_id=instance.id,
            op="upsert",
            payload=self.get_serializer(instance).data,
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        emit_outbox(
            branch_id=instance.supplier.branch_id,
            entity="supplier_contact",
            entity_id=instance.id,
            op="upsert",
            payload=self.get_serializer(instance).data,
        )

    def perform_destroy(self, instance):
        emit_outbox(
            branch_id=instance.supplier.branch_id,
            entity="supplier_contact",
            entity_id=instance.id,
            op="delete",
            payload=self.get_serializer(instance).data,
        )
        instance.delete()


class AdminPurchaseOrderViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related("supplier").prefetch_related("lines")
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "purchase_order"

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        user = self.request.user
        supplier = serializer.validated_data["supplier"]
        if supplier.branch_id != user.branch_id:
            raise ValidationError({"supplier": "Supplier must belong to your branch."})

        instance = serializer.save(branch_id=user.branch_id)
        self._emit(instance, "upsert")

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        po = self.get_object()
        if po.status != PurchaseOrder.Status.DRAFT:
            raise ValidationError("Only draft purchase orders can be approved.")
        po.status = PurchaseOrder.Status.APPROVED
        from django.utils import timezone

        po.approved_at = timezone.now()
        po.save(update_fields=["status", "approved_at", "updated_at"])
        self._emit(po, "upsert")
        emit_outbox(po.branch_id, "purchase_order_approved", po.id, "upsert", self.get_serializer(po).data)
        return Response(self.get_serializer(po).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        po = self.get_object()
        if po.status == PurchaseOrder.Status.RECEIVED:
            raise ValidationError("Received purchase orders cannot be cancelled.")
        po.status = PurchaseOrder.Status.CANCELLED
        po.save(update_fields=["status", "updated_at"])
        self._emit(po, "upsert")
        emit_outbox(po.branch_id, "purchase_order_cancelled", po.id, "upsert", self.get_serializer(po).data)
        return Response(self.get_serializer(po).data)

    @action(detail=True, methods=["post"], url_path="receive")
    def receive(self, request, pk=None):
        po = self.get_object()
        if po.status not in [PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.DRAFT]:
            raise ValidationError("Only draft or approved purchase orders can be received.")

        serializer = GoodsReceiptSerializer(data=request.data, context={"purchase_order": po})
        serializer.is_valid(raise_exception=True)
        po = serializer.save()
        self._emit(po, "upsert")
        emit_outbox(po.branch_id, "goods_receipt", po.id, "upsert", self.get_serializer(po).data)
        return Response(self.get_serializer(po).data)


class SupplierBalancesReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        po_qs = scoped_queryset_for_user(PurchaseOrder.objects.select_related("supplier"), request.user)
        rows = []
        for supplier in Supplier.objects.filter(id__in=po_qs.values_list("supplier_id", flat=True).distinct()):
            totals = po_qs.filter(supplier_id=supplier.id).aggregate(total=Sum("total"), paid=Sum("amount_paid"))
            total = totals["total"] or 0
            paid = totals["paid"] or 0
            rows.append(
                {
                    "supplier_id": str(supplier.id),
                    "supplier_name": supplier.name,
                    "total_purchased": total,
                    "amount_paid": paid,
                    "balance_due": max(total - paid, 0),
                }
            )
        return Response(rows)


class PurchaseReceiveHistoryView(APIView):
    permission_classes = [IsAuthenticated]

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
