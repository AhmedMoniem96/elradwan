from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from inventory.models import (
    Category,
    InventoryAlert,
    Product,
    ProductBundle,
    ProductBundleLine,
    ProductUnit,
    PurchaseImportJob,
    PurchaseOrder,
    PurchaseOrderLine,
    StockMove,
    StockTransfer,
    StockTransferLine,
    Supplier,
    SupplierContact,
    SupplierImportProfile,
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




class ProductUnitSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = ProductUnit
        fields = [
            "id",
            "unit_name",
            "conversion_to_base",
            "barcode",
            "is_sellable",
            "cost_price",
            "sell_price",
            "min_sell_price",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProductSerializer(serializers.ModelSerializer):
    preferred_supplier_name = serializers.CharField(source="preferred_supplier.name", read_only=True)
    image_url = serializers.SerializerMethodField()
    units = ProductUnitSerializer(many=True, required=False)

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
            "units",
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
        nullable_optional_fields = ["category", "cost", "preferred_supplier", "slug", "sku", "barcode"]
        for field_name in nullable_optional_fields:
            value = attrs.get(field_name, serializers.empty)
            if isinstance(value, str):
                value = value.strip()
            if value == "":
                attrs[field_name] = None
            elif value is not serializers.empty:
                attrs[field_name] = value

        units_payload = attrs.get("units", serializers.empty)
        if units_payload is serializers.empty and hasattr(self, "initial_data"):
            raw_units = self.initial_data.get("units")
            if isinstance(raw_units, str):
                import json

                try:
                    parsed_units = json.loads(raw_units)
                except json.JSONDecodeError as exc:
                    raise serializers.ValidationError({"units": f"Invalid units payload: {exc.msg}"})
                attrs["units"] = parsed_units
        return attrs

    def _sync_units(self, product, units_payload):
        if units_payload is None:
            return

        existing_by_id = {str(unit.id): unit for unit in product.units.all()}
        keep_ids = set()

        for unit_payload in units_payload:
            unit_id = unit_payload.get("id")
            if unit_id and str(unit_id) in existing_by_id:
                unit = existing_by_id[str(unit_id)]
                for field in ["unit_name", "conversion_to_base", "barcode", "is_sellable", "cost_price", "sell_price", "min_sell_price"]:
                    if field in unit_payload:
                        setattr(unit, field, unit_payload[field])
                unit.save()
                keep_ids.add(str(unit.id))
                continue

            created = ProductUnit.objects.create(
                product=product,
                unit_name=unit_payload["unit_name"],
                conversion_to_base=unit_payload["conversion_to_base"],
                barcode=unit_payload.get("barcode") or None,
                is_sellable=unit_payload.get("is_sellable", True),
                cost_price=unit_payload.get("cost_price"),
                sell_price=unit_payload["sell_price"],
                min_sell_price=unit_payload.get("min_sell_price"),
            )
            keep_ids.add(str(created.id))

        product.units.exclude(id__in=keep_ids).delete()

    @transaction.atomic
    def create(self, validated_data):
        units_payload = validated_data.pop("units", None)
        product = super().create(validated_data)
        self._sync_units(product, units_payload or [])
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        units_payload = validated_data.pop("units", None)
        product = super().update(instance, validated_data)
        if units_payload is not None:
            self._sync_units(product, units_payload)
        return product


class ProductBundleLineSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = ProductBundleLine
        fields = ["id", "component_product", "quantity", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProductBundleSerializer(serializers.ModelSerializer):
    lines = ProductBundleLineSerializer(many=True)

    class Meta:
        model = ProductBundle
        fields = [
            "id",
            "branch",
            "code",
            "name",
            "parent_product",
            "standalone_sku",
            "custom_price",
            "is_active",
            "created_at",
            "updated_at",
            "lines",
        ]
        read_only_fields = ["id", "branch", "created_at", "updated_at"]

    def _sync_lines(self, bundle, lines_payload):
        existing_by_id = {str(line.id): line for line in bundle.lines.all()}
        keep_ids = set()

        for line_payload in lines_payload:
            line_id = line_payload.get("id")
            if line_id and str(line_id) in existing_by_id:
                line = existing_by_id[str(line_id)]
                line.component_product = line_payload.get("component_product", line.component_product)
                line.quantity = line_payload.get("quantity", line.quantity)
                line.save()
                keep_ids.add(str(line.id))
                continue

            created = ProductBundleLine.objects.create(
                bundle=bundle,
                component_product=line_payload["component_product"],
                quantity=line_payload["quantity"],
            )
            keep_ids.add(str(created.id))

        bundle.lines.exclude(id__in=keep_ids).delete()

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        bundle = super().create(validated_data)
        self._sync_lines(bundle, lines)
        return bundle

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        bundle = super().update(instance, validated_data)
        if lines is not None:
            self._sync_lines(bundle, lines)
        return bundle


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


class SupplierImportProfileSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    default_warehouse_name = serializers.CharField(source="default_warehouse.name", read_only=True)

    class Meta:
        model = SupplierImportProfile
        fields = [
            "id",
            "branch",
            "supplier",
            "supplier_name",
            "version",
            "file_type",
            "detected_columns",
            "column_mapping",
            "format_signature",
            "default_warehouse",
            "default_warehouse_name",
            "default_tax_rate",
            "notes",
            "is_active",
            "parse_runs",
            "parse_total_rows",
            "parse_error_rows",
            "parse_error_rate",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "branch",
            "version",
            "supplier_name",
            "default_warehouse_name",
            "parse_runs",
            "parse_total_rows",
            "parse_error_rows",
            "parse_error_rate",
            "created_at",
            "updated_at",
        ]


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


class PurchaseImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseImportJob
        fields = [
            "id",
            "branch",
            "uploaded_by",
            "supplier",
            "supplier_template",
            "supplier_template_version",
            "source_file",
            "source_filename",
            "file_type",
            "state",
            "parse_confidence",
            "detected_columns",
            "column_mapping",
            "format_signature",
            "parsed_rows",
            "draft_receipt",
            "row_actions",
            "apply_summary",
            "supplier_invoice_reference",
            "error_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "branch",
            "uploaded_by",
            "supplier",
            "supplier_template",
            "supplier_template_version",
            "source_filename",
            "file_type",
            "state",
            "parse_confidence",
            "detected_columns",
            "format_signature",
            "parsed_rows",
            "draft_receipt",
            "apply_summary",
            "supplier_invoice_reference",
            "error_message",
            "created_at",
            "updated_at",
        ]


class PurchaseImportJobCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseImportJob
        fields = ["id", "source_file", "supplier", "column_mapping", "test_parse", "default_warehouse", "default_tax_rate"]
        read_only_fields = ["id"]

    test_parse = serializers.BooleanField(required=False, default=False)
    default_warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all(), required=False, allow_null=True)
    default_tax_rate = serializers.DecimalField(max_digits=6, decimal_places=4, required=False)


class PurchaseImportJobApplySerializer(serializers.Serializer):
    row_actions = serializers.JSONField(required=False)
    confirm = serializers.BooleanField(required=False, default=False)
    supplier_invoice_reference = serializers.CharField(required=False, allow_blank=True, max_length=128)
