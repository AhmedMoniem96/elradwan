from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="invoice",
            name="status",
            field=models.CharField(
                choices=[
                    ("open", "Open"),
                    ("partially_paid", "Partially Paid"),
                    ("paid", "Paid"),
                    ("void", "Void"),
                ],
                default="open",
                max_length=16,
            ),
        ),
    ]
