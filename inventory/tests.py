import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Branch
from sync.models import SyncOutbox
from inventory.models import DemandForecast, InventoryAlert, Product, PurchaseImportJob, PurchaseOrder, StockMove, StockTransfer, Supplier, SupplierImportProfile, SupplierImportResolvedMapping, Warehouse


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
        payload = response.json()
        self.assertEqual(sorted(payload.keys()), ["count", "next", "previous", "results"])
        ids = {item["id"] for item in payload["results"]}
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

    def test_admin_create_product_allows_blank_nullable_fields_in_multipart(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/admin/products/",
            {
                "sku": "A-MULTI",
                "name": "Multipart Product",
                "price": "11.00",
                "tax_rate": "0.0000",
                "category": "",
                "cost": "",
                "preferred_supplier": "",
                "slug": "",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        created = Product.objects.get(id=response.json()["id"])
        self.assertIsNone(created.category)
        self.assertIsNone(created.cost)
        self.assertIsNone(created.preferred_supplier)
        self.assertIsNone(created.slug)

    def test_admin_update_product_allows_blank_nullable_fields_in_multipart(self):
        self.client.force_authenticate(user=self.admin_a)

        supplier = Supplier.objects.create(branch=self.branch_a, name="Supplier A", code="SUP-A")
        product = Product.objects.create(
            branch=self.branch_a,
            sku="A-UPD",
            name="Updatable Product",
            price=Decimal("12.00"),
            cost=Decimal("3.00"),
            preferred_supplier=supplier,
            slug="updatable-product",
        )

        response = self.client.patch(
            f"/api/v1/admin/products/{product.id}/",
            {
                "category": "",
                "cost": "",
                "preferred_supplier": "",
                "slug": "",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertIsNone(product.category)
        self.assertIsNone(product.cost)
        self.assertIsNone(product.preferred_supplier)
        self.assertIsNone(product.slug)


    def test_admin_create_product_handles_uuid_in_outbox_payload(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/admin/products/",
            {
                "sku": "A-UUID",
                "name": "UUID Product",
                "price": "11.00",
                "tax_rate": "0.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        outbox_row = SyncOutbox.objects.filter(entity="product", op="upsert").latest("id")
        self.assertEqual(outbox_row.payload["entity_id"], response.json()["id"])

    def test_admin_create_product_duplicate_sku_returns_validation_error(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/admin/products/",
            {
                "sku": self.product_a.sku,
                "name": "Duplicate SKU",
                "price": "11.00",
                "tax_rate": "0.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"sku": ["A product with this SKU already exists in your branch."]})

    def test_admin_create_product_without_sku_and_barcode(self):
        self.client.force_authenticate(user=self.admin_a)

        response = self.client.post(
            "/api/v1/admin/products/",
            {
                "name": "No SKU Product",
                "price": "11.00",
                "tax_rate": "0.0000",
                "sku": "   ",
                "barcode": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = Product.objects.get(id=response.json()["id"])
        self.assertIsNone(created.sku)
        self.assertIsNone(created.barcode)

    def test_admin_create_products_with_blank_sku_do_not_conflict(self):
        self.client.force_authenticate(user=self.admin_a)

        first_response = self.client.post(
            "/api/v1/admin/products/",
            {
                "name": "Blank SKU Product 1",
                "price": "11.00",
                "tax_rate": "0.0000",
                "sku": "",
            },
            format="json",
        )
        second_response = self.client.post(
            "/api/v1/admin/products/",
            {
                "name": "Blank SKU Product 2",
                "price": "12.00",
                "tax_rate": "0.0000",
                "sku": "  ",
            },
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)

    def test_admin_update_product_clears_sku_and_barcode_with_blank_values(self):
        self.client.force_authenticate(user=self.admin_a)

        product = Product.objects.create(
            branch=self.branch_a,
            sku="TO-CLEAR",
            barcode="BAR-1",
            name="Clearable Product",
            price=Decimal("12.00"),
        )

        response = self.client.patch(
            f"/api/v1/admin/products/{product.id}/",
            {
                "sku": " ",
                "barcode": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertIsNone(product.sku)
        self.assertIsNone(product.barcode)

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
        self.assertIsInstance(pending_res.json(), list)
        self.assertEqual(len(pending_res.json()), 0)

        history_res = self.client.get("/api/v1/reports/purchases/received-history/")
        self.assertEqual(history_res.status_code, 200)
        self.assertEqual(len(history_res.json()), 1)

        balance_res = self.client.get("/api/v1/reports/supplier-balances/")
        self.assertEqual(balance_res.status_code, 200)
        self.assertEqual(Decimal(balance_res.json()[0]["balance_due"]), Decimal("60.00"))


class StockTransferFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="TR", name="Transfers")
        self.admin = self.user_model.objects.create_user(
            username="transfer-admin",
            password="pass1234",
            is_staff=True,
            role="admin",
            branch=self.branch,
        )

        self.product = Product.objects.create(branch=self.branch, sku="TR-001", name="Transfer Item", price=Decimal("10.00"))
        self.source = Warehouse.objects.create(branch=self.branch, name="Source", is_primary=True)
        self.destination = Warehouse.objects.create(branch=self.branch, name="Destination")
        StockMove.objects.create(
            branch=self.branch,
            warehouse=self.source,
            product=self.product,
            quantity=Decimal("10.00"),
            reason=StockMove.Reason.ADJUSTMENT,
            source_ref_type="test",
            source_ref_id=uuid.uuid4(),
            event_id=uuid.uuid4(),
        )

    def test_transfer_lifecycle_creates_paired_moves(self):
        self.client.force_authenticate(user=self.admin)

        create_res = self.client.post(
            "/api/v1/admin/stock-transfers/",
            {
                "source_warehouse": str(self.source.id),
                "destination_warehouse": str(self.destination.id),
                "reference": "TR-0001",
                "requires_supervisor_approval": False,
                "lines": [{"product": str(self.product.id), "quantity": "3.00"}],
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        transfer_id = create_res.json()["id"]

        approve_res = self.client.post(f"/api/v1/admin/stock-transfers/{transfer_id}/approve/", {}, format="json")
        self.assertEqual(approve_res.status_code, 200)

        complete_res = self.client.post(f"/api/v1/admin/stock-transfers/{transfer_id}/complete/", {}, format="json")
        self.assertEqual(complete_res.status_code, 200)

        transfer = StockTransfer.objects.get(id=transfer_id)
        self.assertEqual(transfer.status, StockTransfer.Status.COMPLETED)

        moves = StockMove.objects.filter(source_ref_id=transfer.id, reason=StockMove.Reason.TRANSFER).order_by("quantity")
        self.assertEqual(moves.count(), 2)
        self.assertEqual(moves.first().quantity, Decimal("-3.00"))
        self.assertEqual(moves.last().quantity, Decimal("3.00"))

    def test_transfer_complete_validates_source_stock(self):
        self.client.force_authenticate(user=self.admin)

        create_res = self.client.post(
            "/api/v1/admin/stock-transfers/",
            {
                "source_warehouse": str(self.source.id),
                "destination_warehouse": str(self.destination.id),
                "reference": "TR-0002",
                "requires_supervisor_approval": False,
                "lines": [{"product": str(self.product.id), "quantity": "99.00"}],
            },
            format="json",
        )
        transfer_id = create_res.json()["id"]
        self.client.post(f"/api/v1/admin/stock-transfers/{transfer_id}/approve/", {}, format="json")

        complete_res = self.client.post(f"/api/v1/admin/stock-transfers/{transfer_id}/complete/", {}, format="json")
        self.assertEqual(complete_res.status_code, 400)
        self.assertIn("shortages", complete_res.json())


class StockIntelligenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="SI", name="Stock Intelligence")
        self.admin = self.user_model.objects.create_user(
            username="stock-admin",
            password="pass1234",
            is_staff=True,
            branch=self.branch,
        )

        self.warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)
        self.product = Product.objects.create(
            branch=self.branch,
            sku="SI-001",
            name="Low Item",
            price=Decimal("10.00"),
            minimum_quantity=Decimal("5.00"),
            reorder_quantity=Decimal("8.00"),
        )

    def test_stock_intelligence_and_alert_mark_read(self):
        self.client.force_authenticate(user=self.admin)

        intel_res = self.client.get("/api/v1/stock-intelligence/")
        self.assertEqual(intel_res.status_code, 200)
        self.assertEqual(intel_res.json()["critical_count"], 1)

        unread_res = self.client.get("/api/v1/alerts/unread/")
        self.assertEqual(unread_res.status_code, 200)
        self.assertIsInstance(unread_res.json(), list)
        self.assertEqual(len(unread_res.json()), 1)

        mark_read_res = self.client.post(
            "/api/v1/alerts/mark-read/",
            {"alert_ids": [unread_res.json()[0]["id"]]},
            format="json",
        )
        self.assertEqual(mark_read_res.status_code, 200)

        unread_after = self.client.get("/api/v1/alerts/unread/")
        self.assertEqual(len(unread_after.json()), 0)

    def test_reorder_export_endpoints(self):
        self.client.force_authenticate(user=self.admin)

        csv_res = self.client.get("/api/v1/reorder-suggestions/export/?format=csv")
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("supplier,warehouse,sku", csv_res.content.decode())

        pdf_res = self.client.get("/api/v1/reorder-suggestions/export/?format=pdf")
        self.assertEqual(pdf_res.status_code, 200)
        self.assertIn("Reorder Suggestions", pdf_res.content.decode())


class RolePermissionInventoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.branch = Branch.objects.create(code="RI", name="Role Inventory")
        self.cashier = self.user_model.objects.create_user(
            username="inv-cashier",
            password="pass1234",
            branch=self.branch,
            role="cashier",
        )
        self.supervisor = self.user_model.objects.create_user(
            username="inv-supervisor",
            password="pass1234",
            branch=self.branch,
            role="supervisor",
        )
        self.product = Product.objects.create(branch=self.branch, sku="INV-R-1", name="RBAC Product", price=Decimal("5.00"), cost=Decimal("2.00"))
        self.src = Warehouse.objects.create(branch=self.branch, name="Src", is_primary=True)
        self.dst = Warehouse.objects.create(branch=self.branch, name="Dst", is_primary=False)
        StockMove.objects.create(
            branch=self.branch,
            warehouse=self.src,
            product=self.product,
            quantity=Decimal("10.00"),
            unit_cost=Decimal("2.00"),
            reason=StockMove.Reason.ADJUSTMENT,
            source_ref_type="seed",
            source_ref_id=uuid.uuid4(),
            event_id=uuid.uuid4(),
        )
        self.transfer = StockTransfer.objects.create(
            branch=self.branch,
            transfer_number="TR-RBAC-1",
            source_warehouse=self.src,
            destination_warehouse=self.dst,
            status=StockTransfer.Status.DRAFT,
            requires_supervisor_approval=False,
        )
        self.transfer.lines.create(product=self.product, quantity=Decimal("2.00"))

    def test_cashier_cannot_approve_stock_transfer(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(f"/api/v1/admin/stock-transfers/{self.transfer.id}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_supervisor_can_approve_stock_transfer(self):
        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(f"/api/v1/admin/stock-transfers/{self.transfer.id}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 200)


class AlertToPurchaseOrderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="AP", name="Alert PO")
        self.admin = self.user_model.objects.create_user(
            username="alert-po-admin",
            password="pass1234",
            is_staff=True,
            branch=self.branch,
        )

        self.supplier = Supplier.objects.create(branch=self.branch, name="Supplier A", code="SUP-A")
        self.warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)
        self.product = Product.objects.create(
            branch=self.branch,
            sku="AP-001",
            name="Alert Product",
            price=Decimal("11.00"),
            cost=Decimal("4.00"),
            minimum_quantity=Decimal("5.00"),
            reorder_quantity=Decimal("10.00"),
            preferred_supplier=self.supplier,
        )

    def test_create_po_from_alerts_and_idempotency(self):
        self.client.force_authenticate(user=self.admin)

        stock_intel_res = self.client.get("/api/v1/stock-intelligence/")
        self.assertEqual(stock_intel_res.status_code, 200)

        create_res = self.client.post(
            "/api/v1/reorder-suggestions/create-po/",
            {"warehouse_id": str(self.warehouse.id), "severity": "critical", "min_stockout_days": 0},
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        payload = create_res.json()
        self.assertEqual(payload["created_count"], 1)

        po_id = payload["created_purchase_orders"][0]["purchase_order_id"]
        self.assertTrue(PurchaseOrder.objects.filter(id=po_id).exists())

        alert = InventoryAlert.objects.get(branch=self.branch, warehouse=self.warehouse, product=self.product)
        self.assertIsNotNone(alert.generated_po_id)
        self.assertIsNotNone(alert.resolved_at)
        self.assertTrue(alert.po_grouping_token)

        repeat_res = self.client.post(
            "/api/v1/reorder-suggestions/create-po/",
            {"warehouse_id": str(self.warehouse.id), "severity": "critical", "min_stockout_days": 0},
            format="json",
        )
        self.assertEqual(repeat_res.status_code, 200)
        repeat_payload = repeat_res.json()
        self.assertEqual(repeat_payload["created_count"], 0)

        self.assertEqual(PurchaseOrder.objects.filter(branch=self.branch).count(), 1)



class ForecastingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="FC", name="Forecast")
        self.admin = self.user_model.objects.create_user(
            username="forecast-admin",
            password="pass1234",
            is_staff=True,
            role="admin",
            branch=self.branch,
        )

        self.product = Product.objects.create(branch=self.branch, sku="FC-001", name="Forecast Item", price=Decimal("10.00"))
        self.warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)
        DemandForecast.objects.create(
            branch=self.branch,
            warehouse=self.warehouse,
            product=self.product,
            snapshot_at=timezone.now(),
            daily_demand=Decimal("2.00"),
            demand_7d=Decimal("14.00"),
            demand_14d=Decimal("28.00"),
            demand_30d=Decimal("60.00"),
            on_hand=Decimal("10.00"),
            days_of_cover=Decimal("5.00"),
            projected_stockout_date=timezone.localdate(),
            recommended_reorder_quantity=Decimal("50.00"),
        )

    def test_stock_intelligence_includes_forecast_fields(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/stock-intelligence/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["rows"])
        row = response.json()["rows"][0]
        self.assertIn("days_of_cover", row)
        self.assertIn("projected_stockout_date", row)
        self.assertIn("recommended_reorder_quantity", row)

    def test_forecast_and_stockout_risk_endpoints(self):
        self.client.force_authenticate(user=self.admin)

        forecast_response = self.client.get("/api/v1/stock-intelligence/forecast/")
        risk_response = self.client.get("/api/v1/stock-intelligence/stockout-risk/?days=30")

        self.assertEqual(forecast_response.status_code, 200)
        self.assertEqual(risk_response.status_code, 200)
        self.assertEqual(len(forecast_response.json()), 1)
        self.assertEqual(forecast_response.json()[0]["recommended_reorder_quantity"], "50.00")

    def test_refresh_forecasts_command_runs(self):
        call_command("refresh_forecasts", branch_id=str(self.branch.id), lookback_days=30)


class PurchaseImportMatchingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch = Branch.objects.create(code="IMP", name="Imports")
        self.admin = self.user_model.objects.create_user(
            username="import-admin",
            password="pass1234",
            is_staff=True,
            role="admin",
            branch=self.branch,
        )
        self.supplier = Supplier.objects.create(branch=self.branch, name="Acme", code="ACME")

        self.client.force_authenticate(user=self.admin)

    def _upload_csv(self, text):
        file = SimpleUploadedFile("supplier.csv", text.encode("utf-8"), content_type="text/csv")
        response = self.client.post(
            "/api/v1/purchase-import-jobs/",
            {"source_file": file, "supplier": str(self.supplier.id)},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def test_matching_priority_prefers_barcode(self):
        barcode_product = Product.objects.create(
            branch=self.branch,
            name="Barcode Winner",
            sku="INT-111",
            barcode="BAR-999",
            price=Decimal("12.00"),
        )
        Product.objects.create(
            branch=self.branch,
            name="Name Match",
            sku="INT-222",
            price=Decimal("15.00"),
        )

        payload = self._upload_csv("name,barcode,sku,quantity,price\nWidget,BAR-999,INT-222,2,9.5\n")

        self.assertEqual(payload["state"], PurchaseImportJob.State.REVIEW)
        self.assertEqual(len(payload["parsed_rows"]), 1)
        row = payload["parsed_rows"][0]
        self.assertEqual(row["match_strategy"], "barcode")
        self.assertEqual(row["suggested_product_id"], str(barcode_product.id))
        self.assertFalse(row["low_confidence"])

    def test_multiple_matches_require_selection_and_apply_saves_mapping(self):
        first = Product.objects.create(branch=self.branch, name="Shared Name", sku="S-1", price=Decimal("10.00"))
        Product.objects.create(branch=self.branch, name="Shared Name", sku="S-2", price=Decimal("11.00"))

        payload = self._upload_csv("name,supplier_sku,quantity,price\nShared Name,SUP-42,1,4\n")
        job_id = payload["id"]
        row = payload["parsed_rows"][0]
        self.assertTrue(row["requires_selection"])

        invalid_apply = self.client.post(
            f"/api/v1/purchase-import-jobs/{job_id}/apply/",
            {"row_actions": {"1": {"action": "match_existing"}}},
            format="json",
        )
        self.assertEqual(invalid_apply.status_code, 400)

        valid_apply = self.client.post(
            f"/api/v1/purchase-import-jobs/{job_id}/apply/",
            {"row_actions": {"1": {"action": "match_existing", "product_id": str(first.id)}}},
            format="json",
        )
        self.assertEqual(valid_apply.status_code, 200)

        self.assertTrue(
            SupplierImportResolvedMapping.objects.filter(
                branch=self.branch,
                supplier=self.supplier,
                key_type=SupplierImportResolvedMapping.MatchKeyType.SUPPLIER_SKU,
                key_value="SUP-42",
                product=first,
            ).exists()
        )

    def test_apply_builds_draft_purchase_receipt_without_posting(self):
        product = Product.objects.create(branch=self.branch, name="Widget", sku="W-1", price=Decimal("10.00"))
        warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)

        payload = self._upload_csv("name,sku,quantity,price\nWidget,W-1,2,4.5\n")
        job_id = payload["id"]

        response = self.client.post(
            f"/api/v1/purchase-import-jobs/{job_id}/apply/",
            {
                "row_actions": {
                    "1": {
                        "action": "match_existing",
                        "product_id": str(product.id),
                        "warehouse_id": str(warehouse.id),
                    }
                },
                "supplier_invoice_reference": "INV-1001",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["state"], PurchaseImportJob.State.REVIEW)
        self.assertEqual(body["supplier_invoice_reference"], "INV-1001")
        self.assertEqual(body["draft_receipt"]["type"], "PurchaseReceipt")
        self.assertEqual(len(body["draft_receipt"]["lines"]), 1)
        self.assertEqual(StockMove.objects.filter(import_job_id=job_id).count(), 0)


    def test_confirm_posts_stockmove_and_links_to_job(self):
        product = Product.objects.create(branch=self.branch, name="Posted", sku="P-1", price=Decimal("10.00"), cost=Decimal("1.00"))
        warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)

        payload = self._upload_csv("name,sku,quantity,price\nPosted,P-1,2,4.5\n")
        job_id = payload["id"]

        response = self.client.post(
            f"/api/v1/purchase-import-jobs/{job_id}/apply/",
            {
                "confirm": True,
                "supplier_invoice_reference": "INV-CONFIRM",
                "row_actions": {
                    "1": {"action": "match_existing", "product_id": str(product.id), "warehouse_id": str(warehouse.id)}
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["state"], PurchaseImportJob.State.APPLIED)
        self.assertEqual(body["supplier_invoice_reference"], "INV-CONFIRM")
        move = StockMove.objects.get(import_job_id=job_id)
        self.assertEqual(move.quantity, Decimal("2.00"))
        self.assertEqual(move.reason, StockMove.Reason.PURCHASE)
    def test_confirm_posts_stockmove_and_rolls_back_on_midway_failure(self):
        first = Product.objects.create(branch=self.branch, name="First", sku="F-1", price=Decimal("10.00"))
        second = Product.objects.create(branch=self.branch, name="Second", sku="S-1", price=Decimal("10.00"))
        warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)

        payload = self._upload_csv("name,sku,quantity,price\nFirst,F-1,2,4.5\nSecond,S-1,3,5.0\n")
        job_id = payload["id"]

        from unittest.mock import patch
        from inventory import views as inventory_views

        original_update = inventory_views.update_product_cost
        calls = {"count": 0}

        def flaky(*args, **kwargs):
            calls["count"] += 1
            if calls["count"] == 2:
                raise RuntimeError("boom")
            return original_update(*args, **kwargs)

        with patch("inventory.views.update_product_cost", side_effect=flaky):
            response = self.client.post(
                f"/api/v1/purchase-import-jobs/{job_id}/apply/",
                {
                    "confirm": True,
                    "supplier_invoice_reference": "INV-ROLLBACK",
                    "row_actions": {
                        "1": {"action": "match_existing", "product_id": str(first.id), "warehouse_id": str(warehouse.id)},
                        "2": {"action": "match_existing", "product_id": str(second.id), "warehouse_id": str(warehouse.id)},
                    },
                },
                format="json",
            )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(StockMove.objects.filter(import_job_id=job_id).count(), 0)

    def test_supplier_template_auto_applies_and_tracks_preview_error_rate(self):
        warehouse = Warehouse.objects.create(branch=self.branch, name="Main", is_primary=True)
        profile = SupplierImportProfile.objects.create(
            branch=self.branch,
            supplier=self.supplier,
            version=1,
            file_type=PurchaseImportJob.FileType.CSV,
            column_mapping={"sku": "vendor_sku", "quantity": "qty"},
            default_warehouse=warehouse,
            default_tax_rate=Decimal("0.1500"),
            is_active=True,
        )

        lines = ["name,qty,price", "A,invalid,10", "B,2,11"] + [f"P{i},1,1" for i in range(30)]
        csv_text = "\n".join(lines) + "\n"
        file = SimpleUploadedFile("supplier.csv", csv_text.encode("utf-8"), content_type="text/csv")
        response = self.client.post(
            "/api/v1/purchase-import-jobs/",
            {"source_file": file, "supplier": str(self.supplier.id), "test_parse": "true"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["supplier_template"], str(profile.id))
        self.assertEqual(body["supplier_template_version"], 1)
        self.assertEqual(len(body["parsed_rows"]), 20)
        self.assertEqual(body["column_mapping"], {"sku": "vendor_sku", "quantity": "qty"})

        profile.refresh_from_db()
        self.assertEqual(profile.parse_runs, 1)
        self.assertEqual(profile.parse_total_rows, 20)
        self.assertEqual(profile.parse_error_rows, 1)

    def test_supplier_template_endpoint_returns_latest_active_version(self):
        SupplierImportProfile.objects.create(
            branch=self.branch,
            supplier=self.supplier,
            version=1,
            file_type=PurchaseImportJob.FileType.CSV,
            column_mapping={"sku": "sku"},
            is_active=False,
        )
        latest = SupplierImportProfile.objects.create(
            branch=self.branch,
            supplier=self.supplier,
            version=2,
            file_type=PurchaseImportJob.FileType.CSV,
            column_mapping={"sku": "vendor_sku"},
            is_active=True,
        )

        response = self.client.get(f"/api/v1/purchase-import-jobs/supplier-template/?supplier_id={self.supplier.id}&file_type=csv")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"]["id"], str(latest.id))
