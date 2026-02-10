import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Branch, Device
from inventory.models import Product, StockMove, Warehouse
from sales.models import Customer, Invoice, InvoiceLine, Return


class BranchScopedSalesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch_a = Branch.objects.create(code="SA", name="Sales A")
        self.branch_b = Branch.objects.create(code="SB", name="Sales B")

        self.admin_a = self.user_model.objects.create_user(
            username="sales-admin-a",
            password="pass1234",
            is_staff=True,
            branch=self.branch_a,
        )
        self.user_b = self.user_model.objects.create_user(
            username="sales-user-b",
            password="pass1234",
            branch=self.branch_b,
        )

        self.device_a = Device.objects.create(branch=self.branch_a, name="A Device", identifier="dev-a")
        self.device_b = Device.objects.create(branch=self.branch_b, name="B Device", identifier="dev-b")

        self.customer_a = Customer.objects.create(branch=self.branch_a, name="Customer A")
        self.customer_b = Customer.objects.create(branch=self.branch_b, name="Customer B")

        self.invoice_b = Invoice.objects.create(
            branch=self.branch_b,
            device=self.device_b,
            user=self.user_b,
            customer=self.customer_b,
            invoice_number="INV-B-1",
            local_invoice_no="L-B-1",
            subtotal=Decimal("100.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("100.00"),
            event_id=uuid.uuid4(),
            created_at=timezone.now(),
        )

    def test_user_cannot_read_other_branch_customers(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.get("/api/v1/customers/")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.json()}
        self.assertIn(str(self.customer_a.id), ids)
        self.assertNotIn(str(self.customer_b.id), ids)

    def test_admin_create_customer_ignores_injected_branch(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/admin/customers/",
            {
                "branch": str(self.branch_b.id),
                "name": "Injected Branch Customer",
                "phone": "123456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = Customer.objects.get(id=response.json()["id"])
        self.assertEqual(created.branch_id, self.branch_a.id)

    def test_user_cannot_create_payment_for_other_branch_invoice(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/payments/",
            {
                "invoice": str(self.invoice_b.id),
                "method": "cash",
                "amount": "10.00",
                "paid_at": timezone.now().isoformat(),
                "event_id": str(uuid.uuid4()),
                "device": str(self.device_a.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("invoice", response.json())


class ReturnFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="RC", name="Returns")
        self.user = self.user_model.objects.create_user(
            username="returns-admin",
            password="pass1234",
            is_staff=True,
            branch=self.branch,
        )
        self.device = Device.objects.create(branch=self.branch, name="Returns Device", identifier="ret-dev")
        self.customer = Customer.objects.create(branch=self.branch, name="Return Customer")
        self.warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)
        self.product = Product.objects.create(
            branch=self.branch,
            sku="SKU-1",
            name="Product",
            price=Decimal("60.00"),
            tax_rate=Decimal("0.1000"),
        )

        self.invoice = Invoice.objects.create(
            branch=self.branch,
            device=self.device,
            user=self.user,
            customer=self.customer,
            invoice_number="INV-R-1",
            local_invoice_no="L-R-1",
            subtotal=Decimal("120.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("12.00"),
            total=Decimal("132.00"),
            event_id=uuid.uuid4(),
            created_at=timezone.now(),
        )
        self.invoice_line = InvoiceLine.objects.create(
            invoice=self.invoice,
            product=self.product,
            quantity=Decimal("2.00"),
            unit_price=Decimal("60.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.1000"),
            line_total=Decimal("120.00"),
        )

    def test_create_partial_return_creates_stock_moves_and_totals(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/returns/",
            {
                "invoice": str(self.invoice.id),
                "device": str(self.device.id),
                "event_id": str(uuid.uuid4()),
                "reason": "Damaged",
                "lines": [
                    {
                        "invoice_line": str(self.invoice_line.id),
                        "quantity": "1.00",
                    }
                ],
                "refunds": [
                    {"method": "cash", "amount": "66.00"},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        return_txn = Return.objects.get(id=response.json()["id"])
        self.assertEqual(return_txn.subtotal, Decimal("60.00"))
        self.assertEqual(return_txn.tax_total, Decimal("6.00"))
        self.assertEqual(return_txn.total, Decimal("66.00"))
        self.assertEqual(return_txn.lines.count(), 1)
        self.assertEqual(return_txn.refunds.count(), 1)

        stock_move = StockMove.objects.get(source_ref_id=return_txn.id)
        self.assertEqual(stock_move.reason, StockMove.Reason.RETURN)
        self.assertEqual(stock_move.quantity, Decimal("1.00"))

    def test_invoice_detail_includes_return_totals(self):
        Return.objects.create(
            invoice=self.invoice,
            branch=self.branch,
            device=self.device,
            user=self.user,
            subtotal=Decimal("20.00"),
            tax_total=Decimal("2.00"),
            total=Decimal("22.00"),
            event_id=uuid.uuid4(),
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/v1/invoices/{self.invoice.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.json()["returned_subtotal"]), Decimal("20.00"))
        self.assertEqual(Decimal(response.json()["returned_tax_total"]), Decimal("2.00"))
        self.assertEqual(Decimal(response.json()["returned_total"]), Decimal("22.00"))


class CashShiftTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="CS", name="Cash Shift")
        self.user = self.user_model.objects.create_user(
            username="cashier",
            password="pass1234",
            branch=self.branch,
        )
        self.device = Device.objects.create(branch=self.branch, name="POS", identifier="pos-1")
        self.customer = Customer.objects.create(branch=self.branch, name="Customer")

        self.invoice = Invoice.objects.create(
            branch=self.branch,
            device=self.device,
            user=self.user,
            customer=self.customer,
            invoice_number="INV-C-1",
            local_invoice_no="L-C-1",
            subtotal=Decimal("100.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("100.00"),
            event_id=uuid.uuid4(),
            created_at=timezone.now(),
        )

    def test_payment_requires_open_shift(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/payments/",
            {
                "invoice": str(self.invoice.id),
                "method": "cash",
                "amount": "10.00",
                "paid_at": timezone.now().isoformat(),
                "event_id": str(uuid.uuid4()),
                "device": str(self.device.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("active cash shift", str(response.json()).lower())

    def test_open_and_close_shift_report(self):
        self.client.force_authenticate(user=self.user)
        open_response = self.client.post(
            "/api/v1/shifts/open/",
            {
                "device": str(self.device.id),
                "opening_amount": "50.00",
            },
            format="json",
        )
        self.assertEqual(open_response.status_code, 201)

        payment_response = self.client.post(
            "/api/v1/payments/",
            {
                "invoice": str(self.invoice.id),
                "method": "cash",
                "amount": "100.00",
                "paid_at": timezone.now().isoformat(),
                "event_id": str(uuid.uuid4()),
                "device": str(self.device.id),
            },
            format="json",
        )
        self.assertEqual(payment_response.status_code, 201)

        close_response = self.client.post(
            f"/api/v1/shifts/{open_response.json()['id']}/close/",
            {
                "closing_counted_amount": "149.00",
            },
            format="json",
        )
        self.assertEqual(close_response.status_code, 200)
        self.assertEqual(Decimal(close_response.json()["shift"]["expected_amount"]), Decimal("150.00"))
        self.assertEqual(Decimal(close_response.json()["shift"]["variance"]), Decimal("-1.00"))
