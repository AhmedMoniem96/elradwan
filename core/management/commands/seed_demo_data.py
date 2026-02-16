from decimal import Decimal
import random
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

    def add_arguments(self, parser):
        parser.add_argument("--products", type=int, default=200, help="Number of additional products to create.")
        parser.add_argument("--customers", type=int, default=1000, help="Number of additional customers to create.")
        parser.add_argument("--invoices", type=int, default=5000, help="Number of additional invoices to create.")
        parser.add_argument("--max-lines", type=int, default=4, help="Max invoice lines per generated invoice.")

    def handle(self, *args, **options):
        User = get_user_model()
        products_to_create = max(options["products"], 0)
        customers_to_create = max(options["customers"], 0)
        invoices_to_create = max(options["invoices"], 0)
        max_lines = max(options["max_lines"], 1)

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

        # Generate many demo products (idempotent with deterministic SKU names).
        existing_bulk_products = Product.objects.filter(branch=branch, sku__startswith="SKU-DEMO-").count()
        product_payload = []
        for index in range(existing_bulk_products + 1, existing_bulk_products + products_to_create + 1):
            is_beverage = index % 2 == 0
            cost = Decimal("1.00") + Decimal(index % 17) / Decimal("10")
            price = (cost * Decimal("1.45")).quantize(Decimal("0.01"))
            product_payload.append(
                Product(
                    branch=branch,
                    category=beverages if is_beverage else snacks,
                    sku=f"SKU-DEMO-{index:05d}",
                    barcode=f"629000{index:07d}",
                    name=f"Demo Product {index:05d}",
                    price=price,
                    cost=cost,
                    tax_rate=Decimal("0.1400"),
                    minimum_quantity=Decimal("10"),
                    reorder_quantity=Decimal("50"),
                    preferred_supplier=supplier,
                    is_active=True,
                )
            )
        if product_payload:
            Product.objects.bulk_create(product_payload, batch_size=500, ignore_conflicts=True)

        # Ensure stock exists for generated products in the main warehouse.
        demo_products = list(
            Product.objects.filter(branch=branch, sku__startswith="SKU-DEMO-").only("id", "cost")
        )
        existing_stock_product_ids = set(
            StockMove.objects.filter(branch=branch, source_ref_type="seed-bulk")
            .values_list("product_id", flat=True)
        )
        stock_payload = []
        for product in demo_products:
            if product.id in existing_stock_product_ids:
                continue
            stock_payload.append(
                StockMove(
                    branch=branch,
                    warehouse=warehouse_main,
                    product=product,
                    reason=StockMove.Reason.PURCHASE,
                    source_ref_type="seed-bulk",
                    source_ref_id=uuid.uuid4(),
                    device=device,
                    quantity=Decimal(str(random.randint(50, 250))),
                    unit_cost=product.cost or Decimal("0"),
                    event_id=uuid.uuid4(),
                )
            )
        if stock_payload:
            StockMove.objects.bulk_create(stock_payload, batch_size=500)

        # Generate many customers.
        existing_bulk_customers = Customer.objects.filter(branch=branch, phone__startswith="+201777").count()
        customer_payload = []
        for index in range(existing_bulk_customers + 1, existing_bulk_customers + customers_to_create + 1):
            customer_payload.append(
                Customer(
                    branch=branch,
                    name=f"Demo Customer {index:05d}",
                    phone=f"+201777{index:06d}",
                    email=f"demo.customer.{index:05d}@example.com",
                )
            )
        if customer_payload:
            Customer.objects.bulk_create(customer_payload, batch_size=1000, ignore_conflicts=True)

        # Generate invoices + lines + optional partial/full payments.
        invoice_user = cashier_user
        all_products = list(Product.objects.filter(branch=branch, is_active=True).only("id", "price", "tax_rate"))
        all_customers = list(Customer.objects.filter(branch=branch).only("id"))
        if all_products and invoices_to_create > 0:
            existing_bulk_invoices = Invoice.objects.filter(branch=branch, local_invoice_no__startswith="LOCAL-BULK-").count()

            invoices_payload = []
            lines_payload = []
            payments_payload = []
            for index in range(existing_bulk_invoices + 1, existing_bulk_invoices + invoices_to_create + 1):
                line_count = random.randint(1, max_lines)
                line_rows = []
                subtotal = Decimal("0.00")
                tax_total = Decimal("0.00")

                for _ in range(line_count):
                    product = random.choice(all_products)
                    quantity = Decimal(str(random.randint(1, 5)))
                    unit_price = (product.price or Decimal("0.00")).quantize(Decimal("0.01"))
                    tax_rate = product.tax_rate if product.tax_rate is not None else Decimal("0.1400")
                    line_subtotal = (quantity * unit_price).quantize(Decimal("0.01"))
                    line_tax = (line_subtotal * tax_rate).quantize(Decimal("0.01"))
                    line_total = (line_subtotal + line_tax).quantize(Decimal("0.01"))
                    subtotal += line_subtotal
                    tax_total += line_tax
                    line_rows.append((product.id, quantity, unit_price, tax_rate, line_total))

                subtotal = subtotal.quantize(Decimal("0.01"))
                tax_total = tax_total.quantize(Decimal("0.01"))
                total = (subtotal + tax_total).quantize(Decimal("0.01"))

                status_roll = random.random()
                if status_roll < 0.60:
                    amount_paid = total
                    status_value = Invoice.Status.PAID
                    paid_at = timezone.now()
                elif status_roll < 0.85:
                    amount_paid = (total * Decimal(str(random.uniform(0.2, 0.8)))).quantize(Decimal("0.01"))
                    amount_paid = min(amount_paid, total)
                    status_value = Invoice.Status.PARTIALLY_PAID
                    paid_at = None
                else:
                    amount_paid = Decimal("0.00")
                    status_value = Invoice.Status.OPEN
                    paid_at = None

                balance_due = (total - amount_paid).quantize(Decimal("0.01"))
                created_at = timezone.now()
                invoice = Invoice(
                    branch=branch,
                    device=device,
                    user=invoice_user,
                    customer=random.choice(all_customers) if all_customers else None,
                    invoice_number=f"INV-BULK-{index:07d}",
                    local_invoice_no=f"LOCAL-BULK-{index:07d}",
                    status=status_value,
                    subtotal=subtotal,
                    discount_total=Decimal("0.00"),
                    tax_total=tax_total,
                    total=total,
                    amount_paid=amount_paid,
                    balance_due=balance_due,
                    event_id=uuid.uuid4(),
                    created_at=created_at,
                    paid_at=paid_at,
                )
                invoice._seed_lines = line_rows
                invoices_payload.append(invoice)

            Invoice.objects.bulk_create(invoices_payload, batch_size=500, ignore_conflicts=True)

            created_invoice_rows = list(
                Invoice.objects.filter(branch=branch, local_invoice_no__startswith="LOCAL-BULK-")
                .order_by("created_at")
                .only("id", "local_invoice_no", "amount_paid", "created_at")
            )[-invoices_to_create:]

            invoice_by_local_no = {row.local_invoice_no: row for row in created_invoice_rows}
            for index in range(existing_bulk_invoices + 1, existing_bulk_invoices + invoices_to_create + 1):
                local_no = f"LOCAL-BULK-{index:07d}"
                invoice_row = invoice_by_local_no.get(local_no)
                if not invoice_row:
                    continue
                source = next((x for x in invoices_payload if x.local_invoice_no == local_no), None)
                if not source:
                    continue

                for product_id, quantity, unit_price, tax_rate, line_total in source._seed_lines:
                    lines_payload.append(
                        InvoiceLine(
                            invoice_id=invoice_row.id,
                            product_id=product_id,
                            quantity=quantity,
                            unit_price=unit_price,
                            discount=Decimal("0.00"),
                            tax_rate=tax_rate,
                            line_total=line_total,
                        )
                    )

                if invoice_row.amount_paid > 0:
                    payments_payload.append(
                        Payment(
                            invoice_id=invoice_row.id,
                            method=random.choice([
                                Payment.Method.CASH,
                                Payment.Method.CARD,
                                Payment.Method.TRANSFER,
                                Payment.Method.WALLET,
                            ]),
                            amount=invoice_row.amount_paid,
                            paid_at=invoice_row.created_at,
                            event_id=uuid.uuid4(),
                            device=device,
                        )
                    )

            if lines_payload:
                InvoiceLine.objects.bulk_create(lines_payload, batch_size=1500)
            if payments_payload:
                Payment.objects.bulk_create(payments_payload, batch_size=1000)

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
        self.stdout.write(
            f"Generated: +{products_to_create} products, +{customers_to_create} customers, +{invoices_to_create} invoices"
        )
