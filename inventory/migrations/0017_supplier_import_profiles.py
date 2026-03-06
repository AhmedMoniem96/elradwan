from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0016_purchaseimport_receipt_and_stockmove_traceability"),
    ]

    operations = [
        migrations.CreateModel(
            name="SupplierImportProfile",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("version", models.PositiveIntegerField()),
                ("file_type", models.CharField(choices=[("csv", "CSV"), ("pdf", "PDF")], default="csv", max_length=8)),
                ("detected_columns", models.JSONField(blank=True, default=list)),
                ("column_mapping", models.JSONField(blank=True, default=dict)),
                ("format_signature", models.CharField(blank=True, default="", max_length=128)),
                ("default_tax_rate", models.DecimalField(decimal_places=4, default=0, max_digits=6)),
                ("notes", models.CharField(blank=True, default="", max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                ("parse_runs", models.PositiveIntegerField(default=0)),
                ("parse_total_rows", models.PositiveIntegerField(default=0)),
                ("parse_error_rows", models.PositiveIntegerField(default=0)),
                ("parse_error_rate", models.DecimalField(decimal_places=4, default=0, max_digits=6)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("default_warehouse", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="inventory.warehouse")),
                ("supplier", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="import_profiles", to="inventory.supplier")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch", "supplier", "is_active", "version"], name="inventory_su_branch__87925a_idx"),
                    models.Index(fields=["branch", "supplier", "format_signature"], name="inventory_su_branch__5fd4ec_idx"),
                    models.Index(fields=["branch", "supplier", "parse_error_rate"], name="inventory_su_branch__dc1137_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("branch", "supplier", "version"), name="uniq_supplier_import_profile_version"),
                ],
            },
        ),
        migrations.AddField(
            model_name="purchaseimportjob",
            name="supplier_template",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="jobs", to="inventory.supplierimportprofile"),
        ),
        migrations.AddField(
            model_name="purchaseimportjob",
            name="supplier_template_version",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
