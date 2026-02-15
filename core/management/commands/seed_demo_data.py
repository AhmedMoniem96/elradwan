from decimal import Decimal
import uuid

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Branch, Device
from inventory.models import (
    Category,
    InventoryAlert,
    Product,
    StockMove,
    Supplier,
    SupplierContact,
    Warehouse,
)
from sales.models import CashShift, Customer, Invoice, InvoiceLine, Payment


class Command(BaseCommand):
    help = "Seed demo POS/inventory data for local development."

    def handle(self, *args, **options):
        User = get_user_model()

        branch, _ = Branch.objects.get_or_create(
            code="MAIN",
            defaults={"name": "Main Branch", "timezone": "UTC", "is_active": True},
        )

        admin_user, admin_created = User.objects.get_or_create(
            username="admin",
            defaults={
                "email": "admin@example.com",
                "role": User.Role.ADMIN,
                "branch": branch,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        if admin_created:
            admin_user.set_password("admin1234")
            admin_user.save(update_fields=["password"])

        supervisor_user, supervisor_created = User.objects.get_or_create(
            username="supervisor",
            defaults={
                "email": "supervisor@example.com",
                "role": User.Role.SUPERVISOR,
                "branch": branch,
                "is_active": True,
            },
        )
        if supervisor_created:
            supervisor_user.set_password("supervisor1234")
            supervisor_user.save(update_fields=["password"])

        cashier_user, cashier_created = User.objects.get_or_create(
            username="cashier",
            defaults={
                "email": "cashier@example.com",
                "role": User.Role.CASHIER,
                "branch": branch,
                "is_active": True,
            },
        )
        if cashier_created:
            cashier_user.set_password("cashier1234")
            cashier_user.save(update_fields=["password"])

        device, _ = Device.objects.get_or_create(
            identifier="dev-main-001",
            defaults={"branch": branch, "name": "POS Device 1", "is_active": True},
        )

        warehouse_main, _ = Warehouse.objects.get_or_create(
            branch=branch,
            name="Main Warehouse",
            defaults={"is_primary": True, "is_active": True},
        )
        warehouse_store, _ = Warehouse.objects.get_or_create(
            branch=branch,
            name="Store Front",
            defaults={"is_primary": False, "is_active": True},
        )

        beverages, _ = Category.objects.get_or_create(branch=branch, name="Beverages")
        snacks, _ = Category.objects.get_or_create(branch=branch, name="Snacks")

        supplier, _ = Supplier.objects.get_or_create(
            branch=branch,
            code="SUP-001",
            defaults={"name": "Local Supplier", "is_active": True},
        )
        SupplierContact.objects.get_or_create(
            supplier=supplier,
            email="supplier@example.com",
            defaults={"name": "Supplier Contact", "phone": "+100000000", "is_primary": True},
        )

        cola, _ = Product.objects.get_or_create(
            branch=branch,
            sku="SKU-COLA-001",
            defaults={
                "category": beverages,
                "name": "Cola 330ml",
                "price": Decimal("1.50"),
                "cost": Decimal("0.90"),
                "tax_rate": Decimal("0.1400"),
                "minimum_quantity": Decimal("20"),
                "reorder_quantity": Decimal("80"),
                "preferred_supplier": supplier,
                "is_active": True,
                "is_sellable_online": True,
            },
        )

        chips, _ = Product.objects.get_or_create(
            branch=branch,
            sku="SKU-CHIPS-001",
            defaults={
                "category": snacks,
                "name": "Potato Chips",
                "price": Decimal("2.00"),
                "cost": Decimal("1.10"),
                "tax_rate": Decimal("0.1400"),
                "minimum_quantity": Decimal("10"),
                "reorder_quantity": Decimal("40"),
                "preferred_supplier": supplier,
                "is_active": True,
            },
        )

        for product, qty in [(cola, Decimal("120")), (chips, Decimal("60"))]:
            StockMove.objects.get_or_create(
                branch=branch,
                warehouse=warehouse_main,
                product=product,
                reason=StockMove.Reason.PURCHASE,
                source_ref_type="seed",
                source_ref_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                device=device,
                defaults={
                    "quantity": qty,
                    "unit_cost": product.cost or Decimal("0"),
                    "event_id": uuid.uuid4(),
                },
            )

        customer, _ = Customer.objects.get_or_create(
            branch=branch,
            phone="+201000000001",
            defaults={"name": "Demo Customer", "email": "customer@example.com"},
        )

        shift, _ = CashShift.objects.get_or_create(
            branch=branch,
            cashier=cashier_user,
            device=device,
            closed_at__isnull=True,
            defaults={"opening_amount": Decimal("100.00")},
        )

        invoice, created_invoice = Invoice.objects.get_or_create(
            branch=branch,
            device=device,
            local_invoice_no="LOCAL-0001",
            defaults={
                "user": cashier_user,
                "customer": customer,
                "invoice_number": "INV-0001",
                "status": Invoice.Status.PAID,
                "subtotal": Decimal("3.50"),
                "discount_total": Decimal("0.00"),
                "tax_total": Decimal("0.49"),
                "total": Decimal("3.99"),
                "amount_paid": Decimal("3.99"),
                "balance_due": Decimal("0.00"),
                "event_id": uuid.uuid4(),
                "created_at": timezone.now(),
                "paid_at": timezone.now(),
            },
        )

        if created_invoice:
            InvoiceLine.objects.create(
                invoice=invoice,
                product=cola,
                quantity=Decimal("1"),
                unit_price=Decimal("1.50"),
                discount=Decimal("0.00"),
                tax_rate=Decimal("0.1400"),
                line_total=Decimal("1.71"),
            )
            InvoiceLine.objects.create(
                invoice=invoice,
                product=chips,
                quantity=Decimal("1"),
                unit_price=Decimal("2.00"),
                discount=Decimal("0.00"),
                tax_rate=Decimal("0.1400"),
                line_total=Decimal("2.28"),
            )
            Payment.objects.create(
                invoice=invoice,
                method=Payment.Method.CASH,
                amount=Decimal("3.99"),
                paid_at=timezone.now(),
                event_id=uuid.uuid4(),
                device=device,
            )

        InventoryAlert.objects.get_or_create(
            branch=branch,
            warehouse=warehouse_store,
            product=chips,
            resolved_at=None,
            defaults={
                "severity": InventoryAlert.Severity.LOW,
                "current_quantity": Decimal("6"),
                "threshold_quantity": Decimal("10"),
                "suggested_reorder_quantity": Decimal("30"),
                "is_read": False,
            },
        )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))
        self.stdout.write("Credentials: admin/admin1234, supervisor/supervisor1234, cashier/cashier1234")
        self.stdout.write(f"Branch: {branch.code} | Device: {device.identifier} | Active shift: {shift.id}")
