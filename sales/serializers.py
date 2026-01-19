from rest_framework import serializers

from sales.models import Customer, Invoice, InvoiceLine, Payment


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "branch", "name", "phone", "email", "created_at", "updated_at"]
        read_only_fields = fields


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
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "invoice", "method", "amount", "paid_at"]
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

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
            "lines",
            "payments",
        ]
        read_only_fields = fields
