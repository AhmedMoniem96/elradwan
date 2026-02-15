import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0008_inventoryalert_po_tracking_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseorder",
            name="due_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="purchaseorder",
            name="payment_due_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="received_cost_variance",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="received_line_total",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="purchaseorderline",
            name="received_unit_cost",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.CreateModel(
            name="SupplierPayment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "method",
                    models.CharField(
                        choices=[
                            ("cash", "Cash"),
                            ("bank_transfer", "Bank transfer"),
                            ("card", "Card"),
                            ("cheque", "Cheque"),
                            ("other", "Other"),
                        ],
                        max_length=32,
                    ),
                ),
                ("paid_at", models.DateTimeField()),
                ("reference", models.CharField(blank=True, default="", max_length=128)),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                (
                    "supplier",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="inventory.supplier"),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="supplierpayment",
            index=models.Index(fields=["branch", "paid_at"], name="inventory_su_branch__fd8d96_idx"),
        ),
        migrations.AddIndex(
            model_name="supplierpayment",
            index=models.Index(fields=["supplier", "paid_at"], name="inventory_su_supplie_86198f_idx"),
        ),
    ]
