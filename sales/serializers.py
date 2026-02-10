from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from inventory.models import StockMove, Warehouse
from sales.models import Customer, Invoice, InvoiceLine, Payment, Refund, Return, ReturnLine

MONEY_QUANT = Decimal("0.01")


def _to_money(value):
    return Decimal(value).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "branch", "name", "phone", "email", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = [
            "id",
            "invoice",
            "product",
            "quantity",
            "unit_price",
            "discount",
            "tax_rate",
            "line_total",
        ]
        read_only_fields = ["id"]


class PaymentSerializer(serializers.ModelSerializer):
    invoice_total = serializers.DecimalField(source="invoice.total", max_digits=12, decimal_places=2, read_only=True)
    invoice_amount_paid = serializers.SerializerMethodField()
    invoice_balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id",
            "invoice",
            "method",
            "amount",
            "paid_at",
            "event_id",
            "device",
            "invoice_total",
            "invoice_amount_paid",
            "invoice_balance_due",
        ]
        read_only_fields = ["id"]

    def get_invoice_amount_paid(self, obj):
        total_paid = obj.invoice.payments.aggregate(total=Sum("amount"))["total"] or 0
        return total_paid

    def get_invoice_balance_due(self, obj):
        total_paid = obj.invoice.payments.aggregate(total=Sum("amount"))["total"] or 0
        return max(obj.invoice.total - total_paid, 0)

    def validate(self, attrs):
        invoice = attrs["invoice"]
        amount = attrs["amount"]

        if amount <= 0:
            raise serializers.ValidationError({"amount": "Payment amount must be greater than zero."})

        paid_so_far = invoice.payments.aggregate(total=Sum("amount"))["total"] or 0
        balance_due = invoice.total - paid_so_far
        if amount > balance_due:
            raise serializers.ValidationError({"amount": "Payment amount cannot be greater than the remaining balance."})

        return attrs

    def create(self, validated_data):
        payment = super().create(validated_data)
        invoice = payment.invoice
        total_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or 0

        if total_paid >= invoice.total:
            invoice.status = Invoice.Status.PAID
            invoice.paid_at = payment.paid_at or timezone.now()
        elif total_paid > 0:
            invoice.status = Invoice.Status.PARTIALLY_PAID
            invoice.paid_at = None
        else:
            invoice.status = Invoice.Status.OPEN
            invoice.paid_at = None

        invoice.save(update_fields=["status", "paid_at", "updated_at"])
        return payment


class ReturnLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnLine
        fields = [
            "id",
            "invoice_line",
            "quantity",
            "refunded_subtotal",
            "refunded_tax",
            "refunded_total",
        ]
        read_only_fields = ["id", "refunded_subtotal", "refunded_tax", "refunded_total"]


class RefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refund
        fields = ["id", "method", "amount", "refunded_at"]
        read_only_fields = ["id", "refunded_at"]


class ReturnSerializer(serializers.ModelSerializer):
    lines = ReturnLineSerializer(many=True)
    refunds = RefundSerializer(many=True)

    class Meta:
        model = Return
        fields = [
            "id",
            "invoice",
            "branch",
            "device",
            "user",
            "reason",
            "subtotal",
            "tax_total",
            "total",
            "event_id",
            "created_at",
            "updated_at",
            "lines",
            "refunds",
        ]
        read_only_fields = [
            "id",
            "branch",
            "user",
            "subtotal",
            "tax_total",
            "total",
            "created_at",
            "updated_at",
        ]

    def _validate_return_line(self, invoice, line_payload):
        invoice_line = line_payload["invoice_line"]
        quantity = Decimal(str(line_payload["quantity"]))

        if invoice_line.invoice_id != invoice.id:
            raise serializers.ValidationError({"invoice_line": "Invoice line must belong to invoice."})
        if quantity <= 0:
            raise serializers.ValidationError({"quantity": "Quantity must be greater than zero."})

        returned_qty = invoice_line.return_lines.aggregate(total=Sum("quantity"))["total"] or Decimal("0")
        available = Decimal(str(invoice_line.quantity)) - Decimal(str(returned_qty))
        if quantity > available:
            raise serializers.ValidationError(
                {"quantity": f"Quantity exceeds returnable quantity for line {invoice_line.id}."}
            )

        unit_subtotal = Decimal(str(invoice_line.line_total)) / Decimal(str(invoice_line.quantity))
        refunded_subtotal = _to_money(unit_subtotal * quantity)
        refunded_tax = _to_money(refunded_subtotal * Decimal(str(invoice_line.tax_rate)))
        refunded_total = _to_money(refunded_subtotal + refunded_tax)

        return invoice_line, quantity, refunded_subtotal, refunded_tax, refunded_total

    def validate(self, attrs):
        lines = attrs.get("lines") or []
        if not lines:
            raise serializers.ValidationError({"lines": "At least one return line is required."})

        invoice = attrs["invoice"]
        line_calculations = []
        subtotal = Decimal("0")
        tax_total = Decimal("0")
        total = Decimal("0")

        for line_payload in lines:
            validated_line = self._validate_return_line(invoice, line_payload)
            line_calculations.append(validated_line)
            subtotal += validated_line[2]
            tax_total += validated_line[3]
            total += validated_line[4]

        refunds = attrs.get("refunds") or []
        if not refunds:
            raise serializers.ValidationError({"refunds": "At least one refund entry is required."})

        refunded_sum = Decimal("0")
        for refund_payload in refunds:
            amount = Decimal(str(refund_payload["amount"]))
            if amount <= 0:
                raise serializers.ValidationError({"refunds": "Refund amount must be greater than zero."})
            refunded_sum += amount

        if _to_money(refunded_sum) != _to_money(total):
            raise serializers.ValidationError({"refunds": "Refund amounts must equal return total."})

        attrs["_line_calculations"] = line_calculations
        attrs["_computed_subtotal"] = _to_money(subtotal)
        attrs["_computed_tax_total"] = _to_money(tax_total)
        attrs["_computed_total"] = _to_money(total)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        line_calculations = validated_data.pop("_line_calculations")
        subtotal = validated_data.pop("_computed_subtotal")
        tax_total = validated_data.pop("_computed_tax_total")
        total = validated_data.pop("_computed_total")
        lines = validated_data.pop("lines")
        refunds = validated_data.pop("refunds")

        return_txn = Return.objects.create(
            subtotal=subtotal,
            tax_total=tax_total,
            total=total,
            **validated_data,
        )

        for idx, line_payload in enumerate(lines):
            invoice_line, quantity, refunded_subtotal, refunded_tax, refunded_total = line_calculations[idx]
            ReturnLine.objects.create(
                return_txn=return_txn,
                invoice_line=invoice_line,
                quantity=quantity,
                refunded_subtotal=refunded_subtotal,
                refunded_tax=refunded_tax,
                refunded_total=refunded_total,
            )

        for refund_payload in refunds:
            Refund.objects.create(return_txn=return_txn, **refund_payload)

        warehouse = Warehouse.objects.filter(branch_id=return_txn.branch_id, is_primary=True).first()
        if warehouse is None:
            warehouse = Warehouse.objects.filter(branch_id=return_txn.branch_id).order_by("created_at").first()
        if warehouse is None:
            raise serializers.ValidationError({"warehouse": "No warehouse found for branch."})

        for line in return_txn.lines.select_related("invoice_line__product"):
            StockMove.objects.create(
                branch_id=return_txn.branch_id,
                warehouse=warehouse,
                product=line.invoice_line.product,
                quantity=line.quantity,
                reason=StockMove.Reason.RETURN,
                source_ref_type="sales.return",
                source_ref_id=return_txn.id,
                event_id=return_txn.event_id,
                device=return_txn.device,
            )

        return return_txn


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    returns = ReturnSerializer(many=True, read_only=True)
    amount_paid = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()
    payment_percentage = serializers.SerializerMethodField()
    returned_subtotal = serializers.SerializerMethodField()
    returned_tax_total = serializers.SerializerMethodField()
    returned_total = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "branch",
            "device",
            "user",
            "customer",
            "invoice_number",
            "local_invoice_no",
            "status",
            "subtotal",
            "discount_total",
            "tax_total",
            "total",
            "paid_at",
            "created_at",
            "updated_at",
            "amount_paid",
            "balance_due",
            "payment_percentage",
            "returned_subtotal",
            "returned_tax_total",
            "returned_total",
            "lines",
            "payments",
            "returns",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_amount_paid(self, obj):
        return obj.payments.aggregate(total=Sum("amount"))["total"] or 0

    def get_balance_due(self, obj):
        paid = obj.payments.aggregate(total=Sum("amount"))["total"] or 0
        return max(obj.total - paid, 0)

    def get_payment_percentage(self, obj):
        if obj.total == 0:
            return 0
        paid = obj.payments.aggregate(total=Sum("amount"))["total"] or 0
        return round((paid / obj.total) * 100, 2)

    def get_returned_subtotal(self, obj):
        return obj.returns.aggregate(total=Sum("subtotal"))["total"] or 0

    def get_returned_tax_total(self, obj):
        return obj.returns.aggregate(total=Sum("tax_total"))["total"] or 0

    def get_returned_total(self, obj):
        return obj.returns.aggregate(total=Sum("total"))["total"] or 0
