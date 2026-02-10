import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Branch, Device
from sales.models import Customer, Invoice


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
