from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from inventory.models import (
    Category,
    InventoryAlert,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    StockMove,
    StockTransfer,
    StockTransferLine,
    Supplier,
    SupplierContact,
    SupplierPayment,
    Warehouse,
)
from inventory.services import ensure_transfer_stock_available, update_product_cost

MONEY_QUANT = Decimal("0.01")


def _to_money(value):
    return Decimal(value).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "branch", "name", "parent", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "branch", "created_at", "updated_at"]


class ProductSerializer(serializers.ModelSerializer):
    preferred_supplier_name = serializers.CharField(source="preferred_supplier.name", read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "branch",
            "category",
            "sku",
            "barcode",
            "name",
            "description",
            "image",
            "image_url",
            "brand",
            "unit",
            "is_sellable_online",
            "slug",
            "price",
            "cost",
            "tax_rate",
            "minimum_quantity",
            "reorder_quantity",
            "preferred_supplier",
            "preferred_supplier_name",
            "stock_status",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "branch", "created_at", "updated_at"]

    def get_image_url(self, obj):
        if not obj.image:
            return ""
        request = self.context.get("request")
        if request is None:
            return obj.image.url
        return request.build_absolute_uri(obj.image.url)

    def validate(self, attrs):
        # Multipart form submissions commonly send empty strings for optional fields.
        # Normalize these values to None so admins can create/update products without
        # tripping UUID/decimal validation errors on nullable fields.
        nullable_fields = ("category", "cost", "preferred_supplier", "slug")
        for field_name in nullable_fields:
            if self.initial_data.get(field_name, None) == "":
                attrs[field_name] = None
        return attrs


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ["id", "branch", "name", "is_primary", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "branch", "created_at", "updated_at"]


class SupplierContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierContact
        fields = ["id", "supplier", "name", "phone", "email", "role", "is_primary", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SupplierSerializer(serializers.ModelSerializer):
    contacts = SupplierContactSerializer(many=True, read_only=True)

    class Meta:
        model = Supplier
        fields = ["id", "branch", "name", "code", "is_active", "created_at", "updated_at", "contacts"]
        read_only_fields = ["id", "branch", "created_at", "updated_at"]


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id",
            "purchase_order",
            "product",
            "quantity",
            "quantity_received",
            "unit_cost",
            "received_unit_cost",
            "received_line_total",
            "received_cost_variance",
            "tax_rate",
            "line_total",
        ]
        read_only_fields = ["id", "quantity_received", "received_line_total", "received_cost_variance", "line_total"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True)
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "branch",
            "supplier",
            "po_number",
            "status",
            "subtotal",
            "tax_total",
            "total",
            "amount_paid",
            "balance_due",
            "due_date",
            "payment_due_at",
            "expected_at",
            "approved_at",
            "received_at",
            "notes",
            "created_at",
            "updated_at",
            "lines",
        ]
        read_only_fields = ["id", "branch", "subtotal", "tax_total", "total", "approved_at", "received_at", "created_at", "updated_at"]

    def get_balance_due(self, obj):
        return max(obj.total - obj.amount_paid, Decimal("0.00"))

    def validate(self, attrs):
        supplier = attrs.get("supplier") or getattr(self.instance, "supplier", None)
        branch_id = attrs.get("branch_id") or getattr(self.instance, "branch_id", None)
        if supplier and branch_id and supplier.branch_id != branch_id:
            raise serializers.ValidationError({"supplier": "Supplier must belong to the same branch."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        po = PurchaseOrder.objects.create(**validated_data)

        subtotal = Decimal("0")
        tax_total = Decimal("0")
        for line in lines:
            qty = Decimal(line["quantity"])
            unit_cost = Decimal(line["unit_cost"])
            tax_rate = Decimal(line.get("tax_rate") or 0)
            line_subtotal = qty * unit_cost
            line_tax = line_subtotal * tax_rate
            line_total = _to_money(line_subtotal + line_tax)
            PurchaseOrderLine.objects.create(
                purchase_order=po,
                product=line["product"],
                quantity=qty,
                unit_cost=unit_cost,
                tax_rate=tax_rate,
                line_total=line_total,
            )
            subtotal += line_subtotal
            tax_total += line_tax

        po.subtotal = _to_money(subtotal)
        po.tax_total = _to_money(tax_total)
        po.total = _to_money(subtotal + tax_total)
        if po.status == PurchaseOrder.Status.APPROVED:
            po.approved_at = timezone.now()
        po.save(update_fields=["subtotal", "tax_total", "total", "approved_at", "updated_at"])
        return po




class SupplierPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierPayment
        fields = ["id", "supplier", "branch", "amount", "method", "paid_at", "reference", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        supplier = attrs.get("supplier") or getattr(self.instance, "supplier", None)
        branch = attrs.get("branch") or getattr(self.instance, "branch", None)
        branch_id = attrs.get("branch_id") or (branch.id if branch else getattr(self.instance, "branch_id", None))
        if supplier and branch_id and supplier.branch_id != branch_id:
            raise serializers.ValidationError({"supplier": "Supplier must belong to the same branch."})
        return attrs

class GoodsReceiptLineSerializer(serializers.Serializer):
    line_id = serializers.UUIDField()
    quantity_received = serializers.DecimalField(max_digits=12, decimal_places=2)
    received_unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class GoodsReceiptSerializer(serializers.Serializer):
    warehouse_id = serializers.UUIDField(required=False)
    event_id = serializers.UUIDField(required=True)
    lines = GoodsReceiptLineSerializer(many=True)

    def validate(self, attrs):
        po = self.context["purchase_order"]
        line_map = {line.id: line for line in po.lines.all()}
        resolved_lines = []

        for payload in attrs["lines"]:
            line_id = payload["line_id"]
            qty = Decimal(payload["quantity_received"])
            line = line_map.get(line_id)
            if line is None:
                raise serializers.ValidationError({"lines": f"Line {line_id} is not part of this PO."})
            if qty <= 0:
                raise serializers.ValidationError({"lines": "Received quantity must be greater than zero."})
            received_unit_cost = Decimal(payload.get("received_unit_cost") or line.unit_cost)

            remaining = line.quantity - line.quantity_received
            if qty > remaining:
                raise serializers.ValidationError({"lines": f"Received quantity exceeds remaining for line {line_id}."})

            resolved_lines.append((line, qty, received_unit_cost))

        attrs["_resolved_lines"] = resolved_lines
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        po = self.context["purchase_order"]
        event_id = self.validated_data["event_id"]
        warehouse_id = self.validated_data.get("warehouse_id")

        warehouse = None
        if warehouse_id:
            warehouse = Warehouse.objects.filter(id=warehouse_id, branch_id=po.branch_id).first()
        if warehouse is None:
            warehouse = Warehouse.objects.filter(branch_id=po.branch_id, is_primary=True).first()
        if warehouse is None:
            warehouse = Warehouse.objects.filter(branch_id=po.branch_id).order_by("created_at").first()
        if warehouse is None:
            raise serializers.ValidationError({"warehouse_id": "No warehouse found for branch."})

        for line, qty, received_unit_cost in self.validated_data["_resolved_lines"]:
            line.quantity_received = _to_money(line.quantity_received + qty)
            line.received_unit_cost = _to_money(received_unit_cost)
            line.received_line_total = _to_money(line.quantity_received * line.received_unit_cost)
            line.received_cost_variance = _to_money((line.received_unit_cost - line.unit_cost) * line.quantity_received)
            line.save(update_fields=["quantity_received", "received_unit_cost", "received_line_total", "received_cost_variance"])

            StockMove.objects.create(
                branch_id=po.branch_id,
                warehouse=warehouse,
                product=line.product,
                quantity=qty,
                unit_cost=line.received_unit_cost or line.unit_cost,
                reason=StockMove.Reason.PURCHASE,
                source_ref_type="inventory.purchase_order",
                source_ref_id=po.id,
                event_id=event_id,
            )

            current_stock_qty = (
                StockMove.objects.filter(branch_id=po.branch_id, product=line.product).aggregate(total=Sum("quantity"))["total"]
                or Decimal("0")
            ) - qty
            update_product_cost(
                product=line.product,
                incoming_qty=qty,
                incoming_unit_cost=line.received_unit_cost or line.unit_cost,
                current_stock_qty=current_stock_qty,
            )

        all_received = not po.lines.filter(quantity_received__lt=models.F("quantity")).exists()
        if po.status != PurchaseOrder.Status.RECEIVED and all_received:
            po.status = PurchaseOrder.Status.RECEIVED
            po.received_at = timezone.now()
            po.save(update_fields=["status", "received_at", "updated_at"])
        return po


class StockTransferLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = StockTransferLine
        fields = ["id", "transfer", "product", "product_name", "quantity"]
        read_only_fields = ["id"]


class StockTransferSerializer(serializers.ModelSerializer):
    lines = StockTransferLineSerializer(many=True)

    class Meta:
        model = StockTransfer
        fields = [
            "id",
            "branch",
            "source_warehouse",
            "destination_warehouse",
            "reference",
            "status",
            "requires_supervisor_approval",
            "approved_by",
            "approved_at",
            "completed_at",
            "notes",
            "created_at",
            "updated_at",
            "lines",
        ]
        read_only_fields = ["id", "approved_by", "approved_at", "completed_at", "created_at", "updated_at"]

    def validate(self, attrs):
        source = attrs.get("source_warehouse") or getattr(self.instance, "source_warehouse", None)
        destination = attrs.get("destination_warehouse") or getattr(self.instance, "destination_warehouse", None)
        branch_id = attrs.get("branch_id") or getattr(self.instance, "branch_id", None)

        if source and destination and source.id == destination.id:
            raise serializers.ValidationError({"destination_warehouse": "Destination must differ from source warehouse."})
        if source and branch_id and source.branch_id != branch_id:
            raise serializers.ValidationError({"source_warehouse": "Source warehouse must belong to transfer branch."})
        if destination and branch_id and destination.branch_id != branch_id:
            raise serializers.ValidationError({"destination_warehouse": "Destination warehouse must belong to transfer branch."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        transfer = StockTransfer.objects.create(**validated_data)
        for line in lines:
            StockTransferLine.objects.create(transfer=transfer, product=line["product"], quantity=line["quantity"])
        return transfer


class InventoryAlertSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)

    class Meta:
        model = InventoryAlert
        fields = [
            "id",
            "branch",
            "warehouse",
            "warehouse_name",
            "product",
            "product_name",
            "severity",
            "current_quantity",
            "threshold_quantity",
            "suggested_reorder_quantity",
            "is_read",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "branch", "resolved_at", "created_at", "updated_at"]
