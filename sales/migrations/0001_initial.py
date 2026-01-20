import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("core", "0001_initial"),
        ("inventory", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Customer",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("phone", models.CharField(blank=True, max_length=64, null=True)),
                ("email", models.EmailField(blank=True, max_length=254, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch", "phone"], name="customer_branch_phone_idx"),
                    models.Index(fields=["branch", "email"], name="customer_branch_email_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Invoice",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("invoice_number", models.CharField(max_length=64)),
                ("local_invoice_no", models.CharField(max_length=64)),
                ("status", models.CharField(choices=[("open", "Open"), ("paid", "Paid"), ("void", "Void")], default="open", max_length=16)),
                ("subtotal", models.DecimalField(decimal_places=2, max_digits=12)),
                ("discount_total", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("tax_total", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("total", models.DecimalField(decimal_places=2, max_digits=12)),
                ("event_id", models.UUIDField()),
                ("created_at", models.DateTimeField()),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="sales.customer")),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.device")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.user")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch", "created_at"], name="invoice_branch_created_idx"),
                    models.Index(fields=["status", "created_at"], name="invoice_status_created_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=["branch", "invoice_number"], name="uniq_invoice_number"),
                    models.UniqueConstraint(fields=["event_id", "device"], name="uniq_invoice_event_device"),
                    models.UniqueConstraint(fields=["device", "local_invoice_no"], name="uniq_device_local_invoice"),
                ],
            },
        ),
        migrations.CreateModel(
            name="InvoiceLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.DecimalField(decimal_places=2, max_digits=12)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("discount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("tax_rate", models.DecimalField(decimal_places=4, default=0, max_digits=6)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=12)),
                ("invoice", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="sales.invoice")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="inventory.product")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["invoice"], name="invoiceline_invoice_idx"),
                    models.Index(fields=["product"], name="invoiceline_product_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Payment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("method", models.CharField(choices=[("cash", "Cash"), ("card", "Card"), ("transfer", "Transfer"), ("wallet", "Wallet"), ("other", "Other")], max_length=16)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("paid_at", models.DateTimeField()),
                ("event_id", models.UUIDField()),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.device")),
                ("invoice", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="sales.invoice")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["invoice", "paid_at"], name="payment_invoice_paid_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=["event_id", "device"], name="uniq_payment_event_device"),
                ],
            },
        ),
    ]
