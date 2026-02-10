from rest_framework import serializers
from django.db.models import Sum
from django.utils import timezone

from sales.models import Customer, Invoice, InvoiceLine, Payment


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


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    amount_paid = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()
    payment_percentage = serializers.SerializerMethodField()

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
            "lines",
            "payments",
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
