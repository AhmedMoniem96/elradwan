from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0006_rename_sales_cashsh_branch__e09d5c_idx_sales_cashs_branch__c95ed4_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="allow_package_override",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="customer",
            name="allow_unit_override",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="customer",
            name="pricing_mode",
            field=models.CharField(
                choices=[("package", "Package"), ("unit", "Unit")],
                default="unit",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="quantity_mode",
            field=models.CharField(
                choices=[("package", "Package"), ("unit", "Unit")],
                default="unit",
                max_length=16,
            ),
        ),
    ]
