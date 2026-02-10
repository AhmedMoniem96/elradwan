import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("sales", "0003_return_returnline_refund"),
    ]

    operations = [
        migrations.CreateModel(
            name="CashShift",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("opened_at", models.DateTimeField(auto_now_add=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("opening_amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("closing_counted_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("expected_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("variance", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("cashier", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.user")),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.device")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch", "opened_at"], name="sales_cashsh_branch__e09d5c_idx"),
                    models.Index(fields=["cashier", "device", "opened_at"], name="sales_cashsh_cashier_8176c2_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(closed_at__isnull=True),
                        fields=("cashier", "device"),
                        name="uniq_open_shift_per_cashier_device",
                    ),
                ],
            },
        ),
    ]
