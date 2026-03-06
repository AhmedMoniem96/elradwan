from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0015_purchaseimport_matching_resolution"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseimportjob",
            name="draft_receipt",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="purchaseimportjob",
            name="supplier_invoice_reference",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="stockmove",
            name="import_job",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="stock_moves", to="inventory.purchaseimportjob"),
        ),
        migrations.AddIndex(
            model_name="stockmove",
            index=models.Index(fields=["import_job", "created_at"], name="inventory_st_import__8461ba_idx"),
        ),
    ]
