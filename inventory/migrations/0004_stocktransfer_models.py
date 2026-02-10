import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("inventory", "0003_procurement_models"),
    ]

    operations = [
        migrations.CreateModel(
            name="StockTransfer",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("reference", models.CharField(max_length=64)),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("approved", "Approved"), ("completed", "Completed")],
                        default="draft",
                        max_length=16,
                    ),
                ),
                ("requires_supervisor_approval", models.BooleanField(default=False)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="approved_stock_transfers",
                        to="core.user",
                    ),
                ),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                (
                    "destination_warehouse",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="incoming_transfers",
                        to="inventory.warehouse",
                    ),
                ),
                (
                    "source_warehouse",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="outgoing_transfers",
                        to="inventory.warehouse",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch", "status", "created_at"], name="inventory_st_branch__c3f870_idx"),
                    models.Index(
                        fields=["source_warehouse", "destination_warehouse"],
                        name="inventory_st_source__83a7de_idx",
                    ),
                ],
                "unique_together": {("branch", "reference")},
            },
        ),
        migrations.CreateModel(
            name="StockTransferLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="inventory.product"),
                ),
                (
                    "transfer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="inventory.stocktransfer",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["transfer"], name="inventory_st_transfer_96b7ed_idx"),
                    models.Index(fields=["product"], name="inventory_st_product_814f35_idx"),
                ],
                "unique_together": {("transfer", "product")},
            },
        ),
    ]
