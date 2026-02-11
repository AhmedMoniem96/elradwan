from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0007_product_catalog_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="inventoryalert",
            name="generated_po",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="source_alerts", to="inventory.purchaseorder"),
        ),
        migrations.AddField(
            model_name="inventoryalert",
            name="po_grouping_token",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddIndex(
            model_name="inventoryalert",
            index=models.Index(fields=["po_grouping_token"], name="inventory_in_po_grou_48e3b8_idx"),
        ),
    ]
