from decimal import Decimal

from django.db import migrations, models
from django.db.models import Sum


def populate_invoice_balances(apps, schema_editor):
    Invoice = apps.get_model("sales", "Invoice")
    Payment = apps.get_model("sales", "Payment")

    for invoice in Invoice.objects.all().iterator():
        paid = Payment.objects.filter(invoice_id=invoice.id).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        balance = max(Decimal(invoice.total) - Decimal(paid), Decimal("0.00"))
        invoice.amount_paid = paid
        invoice.balance_due = balance
        if paid >= invoice.total:
            invoice.status = "paid"
        elif paid > 0 and invoice.status != "void":
            invoice.status = "partially_paid"
        elif paid == 0 and invoice.status != "void":
            invoice.status = "open"
        invoice.save(update_fields=["amount_paid", "balance_due", "status", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0004_cashshift"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="amount_paid",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="invoice",
            name="balance_due",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.RunPython(populate_invoice_balances, migrations.RunPython.noop),
    ]
