from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_user_email_ci_unique"),
        ("sales", "0009_pricelist_and_pricing_audit"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoiceline",
            name="discount_pct",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="max_discount_pct_allowed",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="min_margin_pct_applied",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="override_approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="override_approver",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_invoice_line_overrides", to="core.user"),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="override_applied",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="override_reason",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="risk_flag",
            field=models.BooleanField(default=False),
        ),
    ]
