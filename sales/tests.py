import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditLog, Branch, Device
from inventory.models import Product, ProductBundle, ProductBundleLine, StockMove, Warehouse
from sales.models import CashShift, Customer, Invoice, InvoiceLine, Payment, PriceChangeAudit, PriceList, PriceListItem, Return


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
        payload = response.json()
        self.assertEqual(sorted(payload.keys()), ["count", "next", "previous", "results"])
        ids = {item["id"] for item in payload["results"]}
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
        self.assertIsInstance(payload, list)
        self.assertTrue(payload)

        for item in payload:
            self.assertEqual(
                sorted(item.keys()),
                ["amount", "customer", "method_status", "reference_number", "timestamp", "transaction_type"],
            )
            self.assertIn(item["transaction_type"], ["invoice", "payment"])
            self.assertEqual(item["reference_number"], "INV-A-1")
            self.assertEqual(item["customer"], self.customer_a.name)

    def test_customer_list_supports_pricing_mode_filter(self):
        self.customer_a.pricing_mode = Customer.PricingMode.PACKAGE
        self.customer_a.save(update_fields=["pricing_mode"])
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.get("/api/v1/customers/?pricing_mode=package")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["results"][0]["id"], str(self.customer_a.id))

    def test_pos_create_customer_assigns_authenticated_user_branch(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/customers/",
            {
                "name": "Walk-in Customer",
                "phone": "5551000",
                "email": "walkin@example.com",
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


    def test_return_preview_includes_available_quantities_and_payment_split(self):
        existing_return = Return.objects.create(
            invoice=self.invoice,
            branch=self.branch,
            device=self.device,
            user=self.user,
            subtotal=Decimal("60.00"),
            tax_total=Decimal("6.00"),
            total=Decimal("66.00"),
            event_id=uuid.uuid4(),
        )
        self.invoice_line.return_lines.create(
            return_txn=existing_return,
            invoice_line=self.invoice_line,
            quantity=Decimal("0.50"),
            refunded_subtotal=Decimal("30.00"),
            refunded_tax=Decimal("3.00"),
            refunded_total=Decimal("33.00"),
        )
        Payment.objects.create(
            invoice=self.invoice,
            method=Payment.Method.CASH,
            amount=Decimal("100.00"),
            paid_at=timezone.now(),
            event_id=uuid.uuid4(),
            device=self.device,
        )
        Payment.objects.create(
            invoice=self.invoice,
            method=Payment.Method.CARD,
            amount=Decimal("32.00"),
            paid_at=timezone.now(),
            event_id=uuid.uuid4(),
            device=self.device,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/returns/preview/", {"invoice": str(self.invoice.id)})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["invoice"], str(self.invoice.id))
        self.assertEqual(len(payload["lines"]), 1)
        self.assertEqual(Decimal(payload["lines"][0]["available_quantity"]), Decimal("1.50"))
        self.assertEqual(Decimal(payload["max_return_total"]), Decimal("99.00"))
        self.assertEqual(len(payload["payment_methods"]), 2)

    def test_return_quantity_cannot_exceed_remaining_after_previous_returns(self):
        self.client.force_authenticate(user=self.user)
        initial = self.client.post(
            "/api/v1/returns/",
            {
                "invoice": str(self.invoice.id),
                "device": str(self.device.id),
                "event_id": str(uuid.uuid4()),
                "reason": "First",
                "lines": [{"invoice_line": str(self.invoice_line.id), "quantity": "1.00"}],
                "refunds": [{"method": "cash", "amount": "66.00"}],
            },
            format="json",
        )
        self.assertEqual(initial.status_code, 201)

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/returns/",
            {
                "invoice": str(self.invoice.id),
                "device": str(self.device.id),
                "event_id": str(uuid.uuid4()),
                "reason": "Too much",
                "lines": [{"invoice_line": str(self.invoice_line.id), "quantity": "1.50"}],
                "refunds": [{"method": "cash", "amount": "99.00"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("quantity", response.json())

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
        self.admin = self.user_model.objects.create_user(
            username="cashier-admin",
            password="pass1234",
            branch=self.branch,
            role="admin",
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

    def test_payment_contract_requires_all_fields(self):
        CashShift.objects.create(branch=self.branch, cashier=self.user, device=self.device, opening_amount=Decimal("10.00"))
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/payments/",
            {
                "invoice": str(self.invoice.id),
                "amount": "10.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {
                "method": ["This field is required for POS payments."],
                "device": ["This field is required for POS payments."],
                "event_id": ["This field is required for POS payments."],
                "paid_at": ["This field is required for POS payments."],
            },
        )

    def test_invoice_status_transitions_follow_persisted_payments(self):
        CashShift.objects.create(branch=self.branch, cashier=self.user, device=self.device, opening_amount=Decimal("10.00"))
        self.client.force_authenticate(user=self.user)

        first_payment = self.client.post(
            "/api/v1/payments/",
            {
                "invoice": str(self.invoice.id),
                "method": "cash",
                "amount": "40.00",
                "paid_at": timezone.now().isoformat(),
                "event_id": str(uuid.uuid4()),
                "device": str(self.device.id),
            },
            format="json",
        )
        self.assertEqual(first_payment.status_code, 201)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PARTIALLY_PAID)
        self.assertEqual(self.invoice.amount_paid, Decimal("40.00"))
        self.assertEqual(self.invoice.balance_due, Decimal("60.00"))

        second_payment = self.client.post(
            "/api/v1/payments/",
            {
                "invoice": str(self.invoice.id),
                "method": "card",
                "amount": "60.00",
                "paid_at": timezone.now().isoformat(),
                "event_id": str(uuid.uuid4()),
                "device": str(self.device.id),
            },
            format="json",
        )
        self.assertEqual(second_payment.status_code, 201)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.amount_paid, Decimal("100.00"))
        self.assertEqual(self.invoice.balance_due, Decimal("0.00"))

        self.client.force_authenticate(user=self.admin)
        delete_response = self.client.delete(f"/api/v1/payments/{second_payment.json()['id']}/")
        self.assertEqual(delete_response.status_code, 204)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PARTIALLY_PAID)
        self.assertEqual(self.invoice.amount_paid, Decimal("40.00"))
        self.assertEqual(self.invoice.balance_due, Decimal("60.00"))

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
        self.user_model = user_model

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

    def test_bundle_sales_vs_unit_sales_report(self):
        bundle = ProductBundle.objects.create(
            branch=self.branch,
            code="RP-B1",
            name="Report Bundle",
            standalone_sku="RP-BUNDLE",
        )
        ProductBundleLine.objects.create(bundle=bundle, component_product=self.product, quantity=Decimal("2.00"))
        InvoiceLine.objects.create(
            invoice=self.invoice,
            product=self.product,
            product_bundle=bundle,
            quantity_mode="unit",
            quantity=Decimal("1.00"),
            unit_price=Decimal("90.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.0000"),
            line_total=Decimal("90.00"),
            margin_warning=True,
        )

        response = self.client.get("/api/v1/reports/bundle-sales-vs-units/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(Decimal(payload["bundle_sales"]["quantity"]), Decimal("1.00"))
        self.assertEqual(Decimal(payload["unit_sales"]["quantity"]), Decimal("2.00"))

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

    def test_dashboard_metrics_report_aggregates_current_and_previous_ranges(self):
        response = self.client.get(
            "/api/v1/reports/dashboard-metrics/?date_from=2024-01-01&date_to=2024-01-07&timezone=UTC"
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("sales_totals", payload)
        self.assertIn("accounts_receivable_totals", payload)
        self.assertIn("Cache-Control", response)
        self.assertEqual(response["Cache-Control"], "private, max-age=60")

    def test_dashboard_metrics_requires_date_range(self):
        response = self.client.get("/api/v1/reports/dashboard-metrics/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["date_range"], "Both date_from and date_to are required.")


class PosInvoiceCreateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user_model = user_model

        self.branch = Branch.objects.create(code="PI", name="POS Invoice")
        self.device = Device.objects.create(branch=self.branch, name="POS Device", identifier="pos-invoice-device")
        self.customer = Customer.objects.create(branch=self.branch, name="POS Customer")
        self.product = Product.objects.create(
            branch=self.branch,
            sku="POS-INV-1",
            name="POS Product",
            price=Decimal("25.00"),
            cost=Decimal("10.00"),
        )
        self.component_b = Product.objects.create(
            branch=self.branch,
            sku="POS-INV-2",
            name="POS Product B",
            price=Decimal("15.00"),
            cost=Decimal("8.00"),
        )
        self.bundle = ProductBundle.objects.create(
            branch=self.branch,
            code="B-1",
            name="Combo",
            standalone_sku="COMBO-1",
            custom_price=Decimal("14.00"),
        )
        ProductBundleLine.objects.create(bundle=self.bundle, component_product=self.product, quantity=Decimal("1.00"))
        ProductBundleLine.objects.create(bundle=self.bundle, component_product=self.component_b, quantity=Decimal("1.00"))

        self.cashier = user_model.objects.create_user(
            username="pos-cashier",
            password="pass1234",
            branch=self.branch,
            role="cashier",
        )
        self.admin = user_model.objects.create_user(
            username="pos-admin",
            password="pass1234",
            branch=self.branch,
            role="admin",
        )

    def test_cashier_can_create_pos_invoice(self):
        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "customer_id": str(self.customer.id),
                "total": "50.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "2.00",
                        "unit_price": "25.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        invoice = Invoice.objects.get(id=response.json()["id"])
        self.assertEqual(invoice.user_id, self.cashier.id)
        self.assertEqual(invoice.device_id, self.device.id)
        self.assertEqual(invoice.status, Invoice.Status.OPEN)
        self.assertEqual(invoice.amount_paid, Decimal("0.00"))
        self.assertEqual(invoice.balance_due, Decimal("50.00"))
        self.assertEqual(invoice.lines.count(), 1)
        self.assertEqual(invoice.payments.count(), 0)

    def test_create_pos_invoice_requires_open_shift(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "total": "25.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "unit_price": "25.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("active cash shift", str(response.json()).lower())

    def test_package_customer_cannot_be_charged_with_unit_mode_without_override_permission(self):
        self.customer.pricing_mode = Customer.PricingMode.PACKAGE
        self.customer.allow_unit_override = True
        self.customer.save(update_fields=["pricing_mode", "allow_unit_override"])
        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "customer_id": str(self.customer.id),
                "total": "25.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "quantity_mode": "unit",
                        "unit_price": "25.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("quantity_mode", str(response.json()))

    def test_supervisor_can_override_package_customer_to_unit_mode(self):
        self.customer.pricing_mode = Customer.PricingMode.PACKAGE
        self.customer.allow_unit_override = True
        self.customer.save(update_fields=["pricing_mode", "allow_unit_override"])
        supervisor = self.user_model.objects.create_user(
            username="pos-supervisor",
            password="pass1234",
            branch=self.branch,
            role="supervisor",
        )
        CashShift.objects.create(branch=self.branch, cashier=supervisor, device=self.device, opening_amount=Decimal("20.00"))
        self.client.force_authenticate(user=supervisor)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "customer_id": str(self.customer.id),
                "total": "25.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "quantity_mode": "unit",
                        "unit_price": "25.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        invoice = Invoice.objects.get(id=response.json()["id"])
        self.assertEqual(invoice.lines.first().quantity_mode, Customer.PricingMode.UNIT)


    def test_pos_invoice_bundle_decrements_component_stock_and_sets_margin_warning(self):
        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "total": "14.00",
                "lines": [
                    {
                        "product_bundle_id": str(self.bundle.id),
                        "quantity": "1.00",
                        "unit_price": "14.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        invoice = Invoice.objects.get(id=response.json()["id"])
        line = invoice.lines.first()
        self.assertEqual(line.product_bundle_id, self.bundle.id)
        self.assertTrue(line.margin_warning)
        self.assertTrue(response.json()["has_margin_warning"])

        component_moves = StockMove.objects.filter(source_ref_id=invoice.id, source_ref_type="invoice.bundle")
        self.assertEqual(component_moves.count(), 2)
        self.assertEqual(component_moves.get(product=self.product).quantity, Decimal("-1.00"))
        self.assertEqual(component_moves.get(product=self.component_b).quantity, Decimal("-1.00"))


    def test_line_below_margin_requires_supervisor_token(self):
        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "total": "6.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "unit_price": "10.00",
                        "discount": "4.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("approval", str(response.json()).lower())

    def test_supervisor_override_is_saved_and_audited(self):
        supervisor = self.user_model.objects.create_user(
            username="override-supervisor",
            password="pass1234",
            branch=self.branch,
            role="supervisor",
        )
        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "total": "6.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "unit_price": "10.00",
                        "discount": "4.00",
                        "supervisor_approval_token": supervisor.username,
                        "override_reason": "Approved loyalty exception",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        line = InvoiceLine.objects.get(invoice_id=response.json()["id"])
        self.assertTrue(line.override_applied)
        self.assertEqual(line.override_reason, "Approved loyalty exception")
        self.assertEqual(line.override_approver_id, supervisor.id)
        self.assertTrue(line.risk_flag)

        audit = AuditLog.objects.filter(action="invoice.override.applied", entity_id=line.id).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.after_snapshot["approver"], supervisor.username)

    def test_pos_invoice_policy_preview_returns_warning_badges(self):
        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.put(
            "/api/v1/pos/invoices/",
            {
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "unit_price": "10.00",
                        "discount": "4.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["warnings"])
        self.assertEqual(response.json()["warnings"][0]["type"], "min_margin")

    def test_pos_invoice_uses_direct_customer_price_list_before_segment_fallback(self):
        fallback_list = PriceList.objects.create(branch=self.branch, name="Retail fallback", segment=Customer.Segment.RETAIL)
        PriceListItem.objects.create(
            price_list=fallback_list,
            product=self.product,
            unit_type=Customer.PricingMode.UNIT,
            price=Decimal("21.00"),
            effective_from=timezone.now() - timedelta(days=1),
        )
        direct_list = PriceList.objects.create(branch=self.branch, name="Customer direct")
        PriceListItem.objects.create(
            price_list=direct_list,
            product=self.product,
            unit_type=Customer.PricingMode.UNIT,
            price=Decimal("18.00"),
            effective_from=timezone.now() - timedelta(days=1),
        )
        self.customer.segment = Customer.Segment.RETAIL
        self.customer.price_list = direct_list
        self.customer.save(update_fields=["segment", "price_list"])

        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "customer_id": str(self.customer.id),
                "total": "18.00",
                "lines": [{"product_id": str(self.product.id), "quantity": "1.00"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        line = InvoiceLine.objects.get(invoice_id=response.json()["id"])
        self.assertEqual(line.unit_price, Decimal("18.00"))
        self.assertEqual(line.price_source, InvoiceLine.PriceSource.CUSTOMER_SPECIFIC)

    def test_pos_invoice_uses_segment_price_list_when_customer_has_no_direct_price_list(self):
        segment_list = PriceList.objects.create(branch=self.branch, name="VIP list", segment=Customer.Segment.VIP)
        PriceListItem.objects.create(
            price_list=segment_list,
            product=self.product,
            unit_type=Customer.PricingMode.UNIT,
            price=Decimal("22.00"),
            effective_from=timezone.now() - timedelta(days=1),
        )
        self.customer.segment = Customer.Segment.VIP
        self.customer.price_list = None
        self.customer.save(update_fields=["segment", "price_list"])

        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "customer_id": str(self.customer.id),
                "total": "22.00",
                "lines": [{"product_id": str(self.product.id), "quantity": "1.00"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        line = InvoiceLine.objects.get(invoice_id=response.json()["id"])
        self.assertEqual(line.unit_price, Decimal("22.00"))
        self.assertEqual(line.price_source, InvoiceLine.PriceSource.PRICE_LIST)

    def test_pos_invoice_ignores_expired_promo_price(self):
        direct_list = PriceList.objects.create(branch=self.branch, name="Expired promo")
        PriceListItem.objects.create(
            price_list=direct_list,
            product=self.product,
            unit_type=Customer.PricingMode.UNIT,
            price=Decimal("9.00"),
            effective_from=timezone.now() - timedelta(days=5),
            effective_to=timezone.now() - timedelta(days=1),
        )
        self.customer.price_list = direct_list
        self.customer.save(update_fields=["price_list"])

        CashShift.objects.create(branch=self.branch, cashier=self.cashier, device=self.device, opening_amount=Decimal("50.00"))
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "customer_id": str(self.customer.id),
                "total": "25.00",
                "lines": [{"product_id": str(self.product.id), "quantity": "1.00"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        line = InvoiceLine.objects.get(invoice_id=response.json()["id"])
        self.assertEqual(line.unit_price, Decimal("25.00"))
        self.assertEqual(line.price_source, InvoiceLine.PriceSource.DEFAULT)

    def test_price_list_item_change_creates_price_change_audit_log(self):
        price_list = PriceList.objects.create(branch=self.branch, name="Audit list")
        item = PriceListItem.objects.create(
            price_list=price_list,
            product=self.product,
            unit_type=Customer.PricingMode.UNIT,
            price=Decimal("20.00"),
            effective_from=timezone.now(),
        )
        item.price = Decimal("19.50")
        item.save(update_fields=["price", "updated_at"])

        self.assertEqual(PriceChangeAudit.objects.filter(price_list_item=item).count(), 2)
        latest = PriceChangeAudit.objects.filter(price_list_item=item).order_by("-created_at").first()
        self.assertEqual(latest.old_price, Decimal("20.00"))
        self.assertEqual(latest.new_price, Decimal("19.50"))

    def test_admin_can_create_pos_invoice_with_sales_pos_access(self):
        CashShift.objects.create(branch=self.branch, cashier=self.admin, device=self.device, opening_amount=Decimal("20.00"))
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/pos/invoices/",
            {
                "total": "25.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "unit_price": "25.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
