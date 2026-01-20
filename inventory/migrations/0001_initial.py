import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Category",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="inventory.category")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch", "is_active"], name="category_branch_active_idx"),
                    models.Index(fields=["parent"], name="category_parent_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sku", models.CharField(max_length=64)),
                ("barcode", models.CharField(blank=True, max_length=128, null=True)),
                ("name", models.CharField(max_length=255)),
                ("price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("cost", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("tax_rate", models.DecimalField(decimal_places=4, default=0, max_digits=6)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("category", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="inventory.category")),
            ],
            options={
                "unique_together": {("branch", "sku")},
                "indexes": [
                    models.Index(fields=["branch", "barcode"], name="product_branch_barcode_idx"),
                    models.Index(fields=["branch", "is_active"], name="product_branch_active_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Warehouse",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("is_primary", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
            ],
            options={
                "unique_together": {("branch", "name")},
                "indexes": [
                    models.Index(fields=["branch", "is_active"], name="warehouse_branch_active_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="StockMove",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.DecimalField(decimal_places=2, max_digits=12)),
                ("unit_cost", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("reason", models.CharField(choices=[("sale", "Sale"), ("purchase", "Purchase"), ("transfer", "Transfer"), ("adjustment", "Adjustment"), ("return", "Return")], max_length=32)),
                ("source_ref_type", models.CharField(blank=True, max_length=64, null=True)),
                ("source_ref_id", models.UUIDField(blank=True, null=True)),
                ("event_id", models.UUIDField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("device", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="core.device")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="inventory.product")),
                ("warehouse", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="inventory.warehouse")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["warehouse", "product", "created_at"], name="stockmove_wh_prod_created_idx"),
                    models.Index(fields=["branch", "created_at"], name="stockmove_branch_created_idx"),
                    models.Index(fields=["source_ref_id", "source_ref_type"], name="stockmove_source_ref_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=["event_id", "device"], name="uniq_stockmove_event_device"),
                ],
            },
        ),
    ]
