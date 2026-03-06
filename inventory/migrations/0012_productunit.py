from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0011_product_nullable_sku_and_conditional_unique"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductUnit",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("unit_name", models.CharField(max_length=64)),
                ("conversion_to_base", models.DecimalField(decimal_places=4, max_digits=12)),
                ("barcode", models.CharField(blank=True, max_length=128, null=True)),
                ("is_sellable", models.BooleanField(default=True)),
                ("cost_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("sell_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("min_sell_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="units", to="inventory.product"),
                ),
            ],
            options={
                "indexes": [models.Index(fields=["product", "is_sellable"], name="inventory_p_product_93f707_idx"), models.Index(fields=["barcode"], name="inventory_p_barcode_6c1dcf_idx")],
                "constraints": [
                    models.UniqueConstraint(fields=("product", "unit_name"), name="uniq_product_unit_name"),
                    models.UniqueConstraint(condition=models.Q(("barcode__isnull", False), models.Q(("barcode", ""), _negated=True)), fields=("barcode",), name="uniq_product_unit_barcode_non_empty"),
                ],
            },
        ),
    ]
