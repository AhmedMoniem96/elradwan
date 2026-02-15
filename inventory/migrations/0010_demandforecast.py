import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0009_supplier_finance"),
    ]

    operations = [
        migrations.CreateModel(
            name="DemandForecast",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("snapshot_at", models.DateTimeField()),
                ("daily_demand", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("demand_7d", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("demand_14d", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("demand_30d", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("on_hand", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("days_of_cover", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("projected_stockout_date", models.DateField(blank=True, null=True)),
                ("recommended_reorder_quantity", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="inventory.product")),
                ("warehouse", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="inventory.warehouse")),
            ],
        ),
        migrations.AddIndex(
            model_name="demandforecast",
            index=models.Index(fields=["branch", "snapshot_at"], name="inventory_de_branch__4fda90_idx"),
        ),
        migrations.AddIndex(
            model_name="demandforecast",
            index=models.Index(fields=["branch", "warehouse", "product", "snapshot_at"], name="inventory_de_branch__2a4d9a_idx"),
        ),
        migrations.AddIndex(
            model_name="demandforecast",
            index=models.Index(fields=["branch", "projected_stockout_date"], name="inventory_de_branch__98cc87_idx"),
        ),
    ]
