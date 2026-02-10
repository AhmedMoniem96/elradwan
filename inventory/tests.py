import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Branch
from inventory.models import Product, Warehouse


class BranchScopedInventoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch_a = Branch.objects.create(code="A", name="Branch A")
        self.branch_b = Branch.objects.create(code="B", name="Branch B")

        self.admin_a = self.user_model.objects.create_user(
            username="admin-a",
            password="pass1234",
            is_staff=True,
            branch=self.branch_a,
        )

        self.product_a = Product.objects.create(
            branch=self.branch_a,
            sku="A-001",
            name="A Product",
            price=Decimal("10.00"),
        )
        self.product_b = Product.objects.create(
            branch=self.branch_b,
            sku="B-001",
            name="B Product",
            price=Decimal("20.00"),
        )

    def test_user_cannot_read_other_branch_products(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.get("/api/v1/products/")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.json()}
        self.assertIn(str(self.product_a.id), ids)
        self.assertNotIn(str(self.product_b.id), ids)

    def test_admin_create_product_ignores_injected_branch(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/admin/products/",
            {
                "branch": str(self.branch_b.id),
                "sku": "A-NEW",
                "name": "Created Product",
                "price": "11.00",
                "tax_rate": "0.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = Product.objects.get(id=response.json()["id"])
        self.assertEqual(created.branch_id, self.branch_a.id)

    def test_admin_create_warehouse_ignores_injected_branch(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/admin/warehouses/",
            {
                "branch": str(self.branch_b.id),
                "name": f"WH-{uuid.uuid4().hex[:8]}",
                "is_primary": False,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = Warehouse.objects.get(id=response.json()["id"])
        self.assertEqual(created.branch_id, self.branch_a.id)

    def test_admin_cannot_read_other_branch_product_detail(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.get(f"/api/v1/admin/products/{self.product_b.id}/")

        self.assertEqual(response.status_code, 404)


class ProcurementFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="PR", name="Procurement")
        self.admin = self.user_model.objects.create_user(
            username="proc-admin",
            password="pass1234",
            is_staff=True,
            branch=self.branch,
        )

        self.product = Product.objects.create(
            branch=self.branch,
            sku="PR-001",
            name="Proc Item",
            price=Decimal("20.00"),
            cost=Decimal("5.00"),
        )
        self.warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)

    def test_receive_purchase_order_creates_stock_move_and_updates_cost(self):
        self.client.force_authenticate(user=self.admin)

        supplier_res = self.client.post(
            "/api/v1/admin/suppliers/",
            {"name": "Supplier One", "code": "SUP-1", "branch": str(self.branch.id)},
            format="json",
        )
        self.assertEqual(supplier_res.status_code, 201)

        po_res = self.client.post(
            "/api/v1/admin/purchase-orders/",
            {
                "supplier": supplier_res.json()["id"],
                "po_number": "PO-1",
                "status": "approved",
                "amount_paid": "0.00",
                "lines": [
                    {
                        "product": str(self.product.id),
                        "quantity": "5.00",
                        "unit_cost": "12.00",
                        "tax_rate": "0.0000",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(po_res.status_code, 201)

        receive_res = self.client.post(
            f"/api/v1/admin/purchase-orders/{po_res.json()['id']}/receive/",
            {
                "warehouse_id": str(self.warehouse.id),
                "event_id": str(uuid.uuid4()),
                "lines": [{"line_id": po_res.json()["lines"][0]["id"], "quantity_received": "5.00"}],
            },
            format="json",
        )
        self.assertEqual(receive_res.status_code, 200)

        move = StockMove.objects.get(source_ref_id=po_res.json()["id"])
        self.assertEqual(move.reason, StockMove.Reason.PURCHASE)
        self.assertEqual(move.quantity, Decimal("5.00"))

        self.product.refresh_from_db()
        self.assertEqual(self.product.cost, Decimal("12.00"))

        pending_res = self.client.get("/api/v1/purchase-orders/pending/")
        self.assertEqual(pending_res.status_code, 200)
        self.assertEqual(len(pending_res.json()), 0)

        history_res = self.client.get("/api/v1/reports/purchases/received-history/")
        self.assertEqual(history_res.status_code, 200)
        self.assertEqual(len(history_res.json()), 1)

        balance_res = self.client.get("/api/v1/reports/supplier-balances/")
        self.assertEqual(balance_res.status_code, 200)
        self.assertEqual(Decimal(balance_res.json()[0]["balance_due"]), Decimal("60.00"))
