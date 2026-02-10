import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("sales", "0002_alter_invoice_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="Return",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("reason", models.CharField(blank=True, max_length=255, null=True)),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("tax_total", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("total", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("event_id", models.UUIDField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "branch",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch"),
                ),
                (
                    "device",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.device"),
                ),
                (
                    "invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="returns",
                        to="sales.invoice",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.user"),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["invoice", "created_at"], name="return_invoice_created_idx"),
                    models.Index(fields=["branch", "created_at"], name="return_branch_created_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=["event_id", "device"], name="uniq_return_event_device"),
                ],
            },
        ),
        migrations.CreateModel(
            name="ReturnLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.DecimalField(decimal_places=2, max_digits=12)),
                ("refunded_subtotal", models.DecimalField(decimal_places=2, max_digits=12)),
                ("refunded_tax", models.DecimalField(decimal_places=2, max_digits=12)),
                ("refunded_total", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "invoice_line",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="return_lines",
                        to="sales.invoiceline",
                    ),
                ),
                (
                    "return_txn",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="sales.return",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["return_txn"], name="returnline_return_txn_idx"),
                    models.Index(fields=["invoice_line"], name="returnline_invoice_line_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Refund",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("method", models.CharField(choices=[("cash", "Cash"), ("card", "Card"), ("transfer", "Transfer")], max_length=16)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("refunded_at", models.DateTimeField(auto_now_add=True)),
                (
                    "return_txn",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="refunds",
                        to="sales.return",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["return_txn", "refunded_at"], name="refund_return_refunded_idx"),
                ],
            },
        ),
    ]
