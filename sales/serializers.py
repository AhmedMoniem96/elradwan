import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from inventory.models import StockMove, Warehouse
from sales.models import CashShift, Customer, Invoice, InvoiceLine, Payment, Refund, Return, ReturnLine

MONEY_QUANT = Decimal("0.01")


def _to_money(value):
    return Decimal(value).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _get_active_shift(cashier_id, device_id):
    return CashShift.objects.filter(cashier_id=cashier_id, device_id=device_id, closed_at__isnull=True).first()


def refresh_invoice_payment_status(invoice):
    total_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    balance_due = max(invoice.total - total_paid, Decimal("0"))

    if total_paid >= invoice.total and invoice.total > 0:
        invoice.status = Invoice.Status.PAID
        latest_payment = invoice.payments.order_by("-paid_at", "-id").first()
        invoice.paid_at = latest_payment.paid_at if latest_payment else timezone.now()
    elif total_paid > 0:
        invoice.status = Invoice.Status.PARTIALLY_PAID
        invoice.paid_at = None
    else:
        invoice.status = Invoice.Status.OPEN
        invoice.paid_at = None

    invoice.amount_paid = _to_money(total_paid)
    invoice.balance_due = _to_money(balance_due)
    invoice.save(update_fields=["status", "paid_at", "amount_paid", "balance_due", "updated_at"])
    return invoice


class CashShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashShift
        fields = [
            "id",
            "branch",
            "cashier",
            "device",
            "opened_at",
            "closed_at",
            "opening_amount",
            "closing_counted_amount",
            "expected_amount",
            "variance",
        ]
        read_only_fields = [
            "id",
            "branch",
            "cashier",
            "opened_at",
            "closed_at",
            "expected_amount",
            "variance",
        ]


class CashShiftOpenSerializer(serializers.Serializer):
    device = serializers.UUIDField()
    opening_amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class CashShiftCloseSerializer(serializers.Serializer):
    closing_counted_amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class CashShiftReportSerializer(serializers.Serializer):
    shift = CashShiftSerializer()
    payments = serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    invoice_count = serializers.IntegerField()


class ShiftSummarySerializer(serializers.Serializer):
    active_shift_count = serializers.IntegerField()
    expected_cash_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    variance_total = serializers.DecimalField(max_digits=12, decimal_places=2)


class RecentActivityItemSerializer(serializers.Serializer):
    transaction_type = serializers.ChoiceField(choices=["invoice", "payment"])
    reference_number = serializers.CharField()
    customer = serializers.CharField(allow_blank=True, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    method_status = serializers.CharField()
    timestamp = serializers.DateTimeField()


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "branch", "name", "phone", "email", "created_at", "updated_at"]
        read_only_fields = ["id", "branch", "created_at", "updated_at"]


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
        return obj.invoice.amount_paid

    def get_invoice_balance_due(self, obj):
        return obj.invoice.balance_due

    def validate(self, attrs):
        if self.instance is None:
            missing = {}
            required_fields = ["invoice", "method", "amount", "device", "event_id", "paid_at"]
            for field in required_fields:
                value = self.initial_data.get(field) if hasattr(self, "initial_data") else attrs.get(field)
                if value in [None, ""]:
                    missing[field] = "This field is required for POS payments."
            if missing:
                raise serializers.ValidationError(missing)

        invoice = attrs["invoice"]
        amount = attrs["amount"]

        if amount <= 0:
            raise serializers.ValidationError({"amount": "Payment amount must be greater than zero."})

        balance_due = invoice.balance_due
        if amount > balance_due:
            raise serializers.ValidationError({"amount": "Payment amount cannot be greater than the remaining balance."})

        shift = _get_active_shift(cashier_id=invoice.user_id, device_id=attrs["device"].id)
        if shift is None:
            raise serializers.ValidationError("An active cash shift is required before recording POS payments.")

        return attrs

    def create(self, validated_data):
        payment = super().create(validated_data)
        refresh_invoice_payment_status(payment.invoice)
        return payment

    def update(self, instance, validated_data):
        payment = super().update(instance, validated_data)
        refresh_invoice_payment_status(payment.invoice)
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
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
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

    def create(self, validated_data):
        if "amount_paid" not in validated_data:
            validated_data["amount_paid"] = Decimal("0.00")
        if "balance_due" not in validated_data:
            validated_data["balance_due"] = validated_data.get("total", Decimal("0.00"))
        return super().create(validated_data)

    def validate(self, attrs):
        if self.instance is None:
            user = attrs.get("user")
            device = attrs.get("device")
            if user and device:
                shift = _get_active_shift(cashier_id=user.id, device_id=device.id)
                if shift is None:
                    raise serializers.ValidationError("An active cash shift is required before creating POS invoices.")
        return attrs


    def get_payment_percentage(self, obj):
        if obj.total == 0:
            return 0
        return round((obj.amount_paid / obj.total) * 100, 2)

    def get_returned_subtotal(self, obj):
        return obj.returns.aggregate(total=Sum("subtotal"))["total"] or 0

    def get_returned_tax_total(self, obj):
        return obj.returns.aggregate(total=Sum("tax_total"))["total"] or 0

    def get_returned_total(self, obj):
        return obj.returns.aggregate(total=Sum("total"))["total"] or 0


class PosInvoiceLineInputSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"))
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False, default=Decimal("0.00"))
    tax_rate = serializers.DecimalField(max_digits=6, decimal_places=4, min_value=Decimal("0.00"), required=False, default=Decimal("0.0000"))


class PosInvoiceCreateSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    lines = PosInvoiceLineInputSerializer(many=True)
    device_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        request = self.context["request"]
        user = request.user
        if not getattr(user, "branch_id", None):
            raise serializers.ValidationError("Authenticated user must belong to a branch to create records.")

        active_shifts = CashShift.objects.filter(cashier=user, branch_id=user.branch_id, closed_at__isnull=True).select_related("device")
        device_id = attrs.get("device_id")
        shift = None
        if device_id:
            shift = active_shifts.filter(device_id=device_id).first()
            if shift is None:
                raise serializers.ValidationError({"device_id": "No active shift found for cashier and device."})
        else:
            shift_count = active_shifts.count()
            if shift_count == 1:
                shift = active_shifts.first()
            elif shift_count > 1:
                raise serializers.ValidationError({"device_id": "Multiple active shifts found. Select device_id explicitly."})
            else:
                raise serializers.ValidationError("An active cash shift is required before creating POS invoices.")

        customer = None
        customer_id = attrs.get("customer_id")
        if customer_id:
            customer = Customer.objects.filter(id=customer_id, branch_id=user.branch_id).first()
            if customer is None:
                raise serializers.ValidationError({"customer_id": "Customer must belong to your branch."})

        lines = attrs.get("lines") or []
        if not lines:
            raise serializers.ValidationError({"lines": "At least one line item is required."})

        product_ids = [line["product_id"] for line in lines]
        products = Product.objects.filter(branch_id=user.branch_id, id__in=product_ids)
        products_by_id = {product.id: product for product in products}

        line_calculations = []
        subtotal = Decimal("0.00")
        tax_total = Decimal("0.00")
        for idx, line in enumerate(lines):
            product = products_by_id.get(line["product_id"])
            if product is None:
                raise serializers.ValidationError({"lines": {idx: {"product_id": "Unknown product for your branch."}}})

            quantity = _to_money(line["quantity"])
            unit_price = _to_money(line["unit_price"])
            discount = _to_money(line.get("discount") or Decimal("0.00"))
            tax_rate = Decimal(str(line.get("tax_rate") or Decimal("0.0000")))

            line_subtotal = _to_money((quantity * unit_price) - discount)
            if line_subtotal < 0:
                raise serializers.ValidationError({"lines": {idx: {"discount": "Discount cannot exceed line subtotal."}}})
            line_tax = _to_money(line_subtotal * tax_rate)

            subtotal += line_subtotal
            tax_total += line_tax
            line_calculations.append(
                {
                    "product": product,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "discount": discount,
                    "tax_rate": tax_rate,
                    "line_total": line_subtotal,
                }
            )

        computed_total = _to_money(subtotal + tax_total)
        requested_total = _to_money(attrs["total"])
        if requested_total > computed_total:
            raise serializers.ValidationError({"total": "Invoice total cannot exceed computed line total."})

        attrs["_shift"] = shift
        attrs["_customer"] = customer
        attrs["_line_calculations"] = line_calculations
        attrs["_subtotal"] = _to_money(subtotal)
        attrs["_tax_total"] = _to_money(tax_total)
        attrs["_discount_total"] = _to_money(computed_total - requested_total)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        user = request.user
        shift = validated_data["_shift"]

        created_at = timezone.now()
        local_invoice_no = f"POS-{created_at.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8].upper()}"

        invoice = Invoice.objects.create(
            branch_id=user.branch_id,
            device=shift.device,
            user=user,
            customer=validated_data["_customer"],
            invoice_number=f"{shift.branch.code}-{local_invoice_no}",
            local_invoice_no=local_invoice_no,
            status=Invoice.Status.OPEN,
            subtotal=validated_data["_subtotal"],
            discount_total=validated_data["_discount_total"],
            tax_total=validated_data["_tax_total"],
            total=_to_money(validated_data["total"]),
            amount_paid=Decimal("0.00"),
            balance_due=_to_money(validated_data["total"]),
            paid_at=None,
            event_id=uuid.uuid4(),
            created_at=created_at,
        )

        for line in validated_data["_line_calculations"]:
            InvoiceLine.objects.create(invoice=invoice, **line)

        return invoice


def get_shift_report(shift):
    close_time = shift.closed_at or timezone.now()
    payments_qs = Payment.objects.filter(
        invoice__branch_id=shift.branch_id,
        invoice__device_id=shift.device_id,
        invoice__user_id=shift.cashier_id,
        paid_at__gte=shift.opened_at,
        paid_at__lte=close_time,
    )
    totals = {method: Decimal("0") for method, _ in Payment.Method.choices}
    for entry in payments_qs.values("method").annotate(total=Sum("amount")):
        totals[entry["method"]] = _to_money(entry["total"] or 0)

    invoice_count = Invoice.objects.filter(
        branch_id=shift.branch_id,
        device_id=shift.device_id,
        user_id=shift.cashier_id,
        created_at__gte=shift.opened_at,
        created_at__lte=close_time,
    ).count()

    return {
        "shift": shift,
        "payments": totals,
        "invoice_count": invoice_count,
    }
