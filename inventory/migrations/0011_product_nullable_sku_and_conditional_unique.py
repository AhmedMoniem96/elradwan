from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0010_demandforecast"),
    ]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="sku",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AlterUniqueTogether(
            name="product",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.UniqueConstraint(
                condition=models.Q(sku__isnull=False) & ~models.Q(sku=""),
                fields=("branch", "sku"),
                name="uniq_product_branch_sku_non_empty",
            ),
        ),
    ]
