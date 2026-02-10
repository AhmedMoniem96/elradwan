import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("inventory", "0002_product_stock_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="Supplier",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("code", models.CharField(max_length=64)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
            ],
            options={
                "indexes": [models.Index(fields=["branch", "is_active"], name="inventory_su_branch__69bd64_idx")],
                "unique_together": {("branch", "code")},
            },
        ),
        migrations.CreateModel(
            name="PurchaseOrder",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("po_number", models.CharField(max_length=64)),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("approved", "Approved"), ("received", "Received"), ("cancelled", "Cancelled")],
                        default="draft",
                        max_length=16,
                    ),
                ),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("tax_total", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("total", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("amount_paid", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("expected_at", models.DateTimeField(blank=True, null=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("received_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                (
                    "supplier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="purchase_orders",
                        to="inventory.supplier",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch", "status", "created_at"], name="inventory_pu_branch__34e1df_idx"),
                    models.Index(fields=["supplier", "status"], name="inventory_pu_supplie_469c0e_idx"),
                ],
                "unique_together": {("branch", "po_number")},
            },
        ),
        migrations.CreateModel(
            name="SupplierContact",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("phone", models.CharField(blank=True, max_length=64, null=True)),
                ("email", models.EmailField(blank=True, max_length=254, null=True)),
                ("role", models.CharField(blank=True, max_length=128, null=True)),
                ("is_primary", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "supplier",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="contacts", to="inventory.supplier"),
                ),
            ],
            options={
                "indexes": [models.Index(fields=["supplier", "is_primary"], name="inventory_su_supplie_0f38fd_idx")],
            },
        ),
        migrations.CreateModel(
            name="PurchaseOrderLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.DecimalField(decimal_places=2, max_digits=12)),
                ("quantity_received", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("unit_cost", models.DecimalField(decimal_places=2, max_digits=12)),
                ("tax_rate", models.DecimalField(decimal_places=4, default=0, max_digits=6)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="inventory.product"),
                ),
                (
                    "purchase_order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="inventory.purchaseorder",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["purchase_order"], name="inventory_pu_purchase_ebf860_idx"),
                    models.Index(fields=["product"], name="inventory_pu_product_a1ac0f_idx"),
                ],
            },
        ),
    ]
