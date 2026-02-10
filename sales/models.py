import uuid

from django.db import models

from core.models import Branch, Device, User
from inventory.models import Product


class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=64, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "phone"]),
            models.Index(fields=["branch", "email"]),
        ]


class Invoice(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        PAID = "paid", "Paid"
        VOID = "void", "Void"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    device = models.ForeignKey(Device, on_delete=models.PROTECT)
    user = models.ForeignKey(User, on_delete=models.PROTECT)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, null=True, blank=True)
    invoice_number = models.CharField(max_length=64)
    local_invoice_no = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    event_id = models.UUIDField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["branch", "invoice_number"], name="uniq_invoice_number"),
            models.UniqueConstraint(fields=["event_id", "device"], name="uniq_invoice_event_device"),
            models.UniqueConstraint(fields=["device", "local_invoice_no"], name="uniq_device_local_invoice"),
        ]


class InvoiceLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=6, decimal_places=4, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        indexes = [
            models.Index(fields=["invoice"]),
            models.Index(fields=["product"]),
        ]


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        TRANSFER = "transfer", "Transfer"
        WALLET = "wallet", "Wallet"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=16, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateTimeField()
    event_id = models.UUIDField()
    device = models.ForeignKey(Device, on_delete=models.PROTECT)

    class Meta:
        indexes = [
            models.Index(fields=["invoice", "paid_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["event_id", "device"], name="uniq_payment_event_device"),
        ]


class Return(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="returns")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    device = models.ForeignKey(Device, on_delete=models.PROTECT)
    user = models.ForeignKey(User, on_delete=models.PROTECT)
    reason = models.CharField(max_length=255, null=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    event_id = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["invoice", "created_at"]),
            models.Index(fields=["branch", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["event_id", "device"], name="uniq_return_event_device"),
        ]


class ReturnLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    return_txn = models.ForeignKey(Return, on_delete=models.CASCADE, related_name="lines")
    invoice_line = models.ForeignKey(InvoiceLine, on_delete=models.PROTECT, related_name="return_lines")
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    refunded_subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    refunded_tax = models.DecimalField(max_digits=12, decimal_places=2)
    refunded_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        indexes = [
            models.Index(fields=["return_txn"]),
            models.Index(fields=["invoice_line"]),
        ]


class Refund(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        TRANSFER = "transfer", "Transfer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    return_txn = models.ForeignKey(Return, on_delete=models.CASCADE, related_name="refunds")
    method = models.CharField(max_length=16, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    refunded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["return_txn", "refunded_at"]),
        ]


class CashShift(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    cashier = models.ForeignKey(User, on_delete=models.PROTECT)
    device = models.ForeignKey(Device, on_delete=models.PROTECT)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    opening_amount = models.DecimalField(max_digits=12, decimal_places=2)
    closing_counted_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    expected_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    variance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "opened_at"]),
            models.Index(fields=["cashier", "device", "opened_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["cashier", "device"],
                condition=models.Q(closed_at__isnull=True),
                name="uniq_open_shift_per_cashier_device",
            ),
        ]
