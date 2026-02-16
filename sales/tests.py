import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Branch, Device
from inventory.models import Product, StockMove, Warehouse
from sales.models import Customer, Invoice, InvoiceLine, Payment, Return


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

    def test_recent_activity_is_branch_scoped_and_compact(self):
        invoice_a = Invoice.objects.create(
            branch=self.branch_a,
            device=self.device_a,
            user=self.admin_a,
            customer=self.customer_a,
            invoice_number="INV-A-1",
            local_invoice_no="L-A-1",
            subtotal=Decimal("55.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("55.00"),
            event_id=uuid.uuid4(),
            created_at=timezone.now(),
        )
        Payment.objects.create(
            invoice=invoice_a,
            method=Payment.Method.CARD,
            amount=Decimal("20.00"),
            paid_at=timezone.now(),
            event_id=uuid.uuid4(),
            device=self.device_a,
        )
        Payment.objects.create(
            invoice=self.invoice_b,
            method=Payment.Method.CASH,
            amount=Decimal("10.00"),
            paid_at=timezone.now(),
            event_id=uuid.uuid4(),
            device=self.device_b,
        )

        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get("/api/v1/invoices/recent-activity/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload)

        for item in payload:
            self.assertEqual(
                sorted(item.keys()),
                ["amount", "customer", "method_status", "reference_number", "timestamp", "transaction_type"],
            )
            self.assertIn(item["transaction_type"], ["invoice", "payment"])
            self.assertEqual(item["reference_number"], "INV-A-1")
            self.assertEqual(item["customer"], self.customer_a.name)

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
        self.inactive_device = Device.objects.create(
            branch=self.branch,
            name="POS Inactive",
            identifier="pos-inactive",
            is_active=False,
        )
        self.other_branch = Branch.objects.create(code="CS2", name="Cash Shift 2")
        self.other_branch_device = Device.objects.create(branch=self.other_branch, name="POS 2", identifier="pos-2")
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

    def test_cannot_open_shift_with_other_branch_device(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/shifts/open/",
            {
                "device": str(self.other_branch_device.id),
                "opening_amount": "50.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"device": ["Device does not belong to the authenticated user branch."]},
        )

    def test_cannot_open_shift_with_inactive_device(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/shifts/open/",
            {
                "device": str(self.inactive_device.id),
                "opening_amount": "50.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"device": ["Device is inactive."]})

    def test_open_shift_succeeds_with_valid_branch_device(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/shifts/open/",
            {
                "device": str(self.device.id),
                "opening_amount": "50.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["device"], str(self.device.id))

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


class RolePermissionSalesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.branch = Branch.objects.create(code="SR", name="Sales Role")

        self.cashier = self.user_model.objects.create_user(
            username="sales-cashier",
            password="pass1234",
            branch=self.branch,
            role="cashier",
        )
        self.supervisor = self.user_model.objects.create_user(
            username="sales-supervisor",
            password="pass1234",
            branch=self.branch,
            role="supervisor",
        )
        self.admin = self.user_model.objects.create_user(
            username="sales-admin",
            password="pass1234",
            branch=self.branch,
            role="admin",
        )
        self.device = Device.objects.create(branch=self.branch, name="Sales Device", identifier="sales-dev-rbac")
        self.customer = Customer.objects.create(branch=self.branch, name="Role Customer")
        self.invoice = Invoice.objects.create(
            branch=self.branch,
            device=self.device,
            user=self.cashier,
            customer=self.customer,
            invoice_number="INV-RBAC-1",
            local_invoice_no="L-RBAC-1",
            subtotal=Decimal("10.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("10.00"),
            event_id=uuid.uuid4(),
            created_at=timezone.now(),
        )

    def test_cashier_cannot_void_invoice(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(f"/api/v1/admin/invoices/{self.invoice.id}/void/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_supervisor_can_void_invoice(self):
        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(f"/api/v1/admin/invoices/{self.invoice.id}/void/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.VOID)

    def test_supervisor_can_override_shift_close(self):
        shift = CashShift.objects.create(
            branch=self.branch,
            cashier=self.cashier,
            device=self.device,
            opening_amount=Decimal("15.00"),
        )
        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(
            f"/api/v1/shifts/{shift.id}/close/",
            {"closing_counted_amount": "15.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_cashier_cannot_override_shift_close(self):
        shift = CashShift.objects.create(
            branch=self.branch,
            cashier=self.supervisor,
            device=self.device,
            opening_amount=Decimal("15.00"),
        )
        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(
            f"/api/v1/shifts/{shift.id}/close/",
            {"closing_counted_amount": "15.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

class ReportingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()

        self.branch = Branch.objects.create(code="RP", name="Reporting", timezone="UTC")
        self.user = user_model.objects.create_user(
            username="report-admin",
            password="pass1234",
            branch=self.branch,
            role="admin",
        )
        self.device = Device.objects.create(branch=self.branch, name="R-Device", identifier="r-dev")
        self.customer = Customer.objects.create(branch=self.branch, name="ACME")
        self.product = Product.objects.create(branch=self.branch, sku="R-1", name="Report Product", price=Decimal("100.00"), cost=Decimal("60.00"))

        self.invoice = Invoice.objects.create(
            branch=self.branch,
            device=self.device,
            user=self.user,
            customer=self.customer,
            invoice_number="INV-REP-1",
            local_invoice_no="L-REP-1",
            status=Invoice.Status.PARTIALLY_PAID,
            subtotal=Decimal("200.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("200.00"),
            amount_paid=Decimal("120.00"),
            balance_due=Decimal("80.00"),
            event_id=uuid.uuid4(),
            created_at=timezone.now(),
        )
        InvoiceLine.objects.create(
            invoice=self.invoice,
            product=self.product,
            quantity=Decimal("2.00"),
            unit_price=Decimal("100.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.0000"),
            line_total=Decimal("200.00"),
        )
        Payment.objects.create(
            invoice=self.invoice,
            method=Payment.Method.CARD,
            amount=Decimal("120.00"),
            paid_at=timezone.now(),
            event_id=uuid.uuid4(),
            device=self.device,
        )

        self.client.force_authenticate(user=self.user)

    def test_reports_endpoints_return_expected_payloads(self):
        daily = self.client.get("/api/v1/reports/daily-sales/")
        self.assertEqual(daily.status_code, 200)
        self.assertGreaterEqual(len(daily.json()["results"]), 1)

        top_products = self.client.get("/api/v1/reports/top-products/")
        self.assertEqual(top_products.status_code, 200)
        self.assertEqual(top_products.json()["results"][0]["product__name"], "Report Product")

        ar = self.client.get("/api/v1/reports/accounts-receivable/")
        self.assertEqual(ar.status_code, 200)
        self.assertEqual(Decimal(ar.json()["results"][0]["balance_due"]), Decimal("80.00"))

    def test_reports_support_csv_export(self):
        response = self.client.get("/api/v1/reports/top-customers/?format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")

    def test_top_reports_reject_invalid_limit(self):
        response = self.client.get("/api/v1/reports/top-products/?limit=0")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["limit"], "Limit must be between 1 and 1000.")

        response = self.client.get("/api/v1/reports/top-customers/?limit=invalid")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["limit"], "Limit must be an integer between 1 and 1000.")

    def test_reports_reject_invalid_timezone(self):
        response = self.client.get("/api/v1/reports/daily-sales/?timezone=Not/AZone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["timezone"], "Invalid IANA timezone.")

        response = self.client.get("/api/v1/reports/accounts-receivable/?timezone=Not/AZone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["timezone"], "Invalid IANA timezone.")
