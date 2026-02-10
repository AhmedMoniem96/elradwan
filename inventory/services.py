import csv
import io
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from common.utils import emit_outbox
from inventory.models import InventoryAlert, Product, StockMove, Warehouse

MONEY_QUANT = Decimal("0.01")


def _to_money(value):
    return Decimal(value).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def update_product_cost(product, incoming_qty, incoming_unit_cost, current_stock_qty=Decimal("0")):
    """
    Update product cost using either last cost or weighted average costing.
    Enable weighted average by setting INVENTORY_WEIGHTED_AVERAGE_COST=True.
    """
    incoming_qty = Decimal(incoming_qty or 0)
    incoming_unit_cost = Decimal(incoming_unit_cost or 0)
    current_stock_qty = Decimal(current_stock_qty or 0)

    if incoming_qty <= 0:
        return product.cost

    use_weighted_average = getattr(settings, "INVENTORY_WEIGHTED_AVERAGE_COST", False)
    current_cost = Decimal(product.cost or 0)

    if use_weighted_average:
        total_existing_cost = current_stock_qty * current_cost
        total_incoming_cost = incoming_qty * incoming_unit_cost
        total_qty = current_stock_qty + incoming_qty
        new_cost = incoming_unit_cost if total_qty <= 0 else (total_existing_cost + total_incoming_cost) / total_qty
    else:
        new_cost = incoming_unit_cost

    product.cost = _to_money(new_cost)
    product.save(update_fields=["cost", "updated_at"])
    return product.cost


def get_stock_balance(branch_id, warehouse_id, product_id):
    return (
        StockMove.objects.filter(branch_id=branch_id, warehouse_id=warehouse_id, product_id=product_id).aggregate(total=Sum("quantity"))["total"]
        or Decimal("0")
    )


def ensure_transfer_stock_available(transfer):
    shortages = []
    for line in transfer.lines.select_related("product"):
        available = get_stock_balance(transfer.branch_id, transfer.source_warehouse_id, line.product_id)
        if available < line.quantity:
            shortages.append(
                {
                    "product_id": str(line.product_id),
                    "product_name": line.product.name,
                    "available": str(available),
                    "required": str(line.quantity),
                }
            )
    return shortages


def compute_stock_intelligence(branch_id):
    products = Product.objects.filter(branch_id=branch_id, is_active=True)
    warehouses = Warehouse.objects.filter(branch_id=branch_id, is_active=True)

    rows = []
    low_count = 0
    critical_count = 0

    for warehouse in warehouses:
        for product in products:
            on_hand = get_stock_balance(branch_id, warehouse.id, product.id)
            minimum = Decimal(product.minimum_quantity or 0)
            reorder_qty = Decimal(product.reorder_quantity or 0)

            severity = None
            if on_hand <= 0 and minimum > 0:
                severity = InventoryAlert.Severity.CRITICAL
            elif minimum > 0 and on_hand <= minimum:
                severity = InventoryAlert.Severity.LOW

            if severity == InventoryAlert.Severity.LOW:
                low_count += 1
            if severity == InventoryAlert.Severity.CRITICAL:
                critical_count += 1

            suggested = reorder_qty if reorder_qty > 0 else max(minimum - on_hand, Decimal("0"))
            rows.append(
                {
                    "warehouse_id": warehouse.id,
                    "warehouse_name": warehouse.name,
                    "product_id": product.id,
                    "product_name": product.name,
                    "sku": product.sku,
                    "preferred_supplier_id": product.preferred_supplier_id,
                    "preferred_supplier_name": product.preferred_supplier.name if product.preferred_supplier_id else "Unassigned",
                    "minimum_quantity": minimum,
                    "reorder_quantity": reorder_qty,
                    "on_hand": on_hand,
                    "severity": severity,
                    "suggested_reorder_quantity": max(suggested, Decimal("0")),
                }
            )

    return {
        "generated_at": timezone.now(),
        "rows": rows,
        "low_count": low_count,
        "critical_count": critical_count,
        "unread_alert_count": InventoryAlert.objects.filter(branch_id=branch_id, is_read=False, resolved_at__isnull=True).count(),
    }


def refresh_inventory_alerts(branch_id, intelligence=None):
    intelligence = intelligence or compute_stock_intelligence(branch_id)
    seen_open_keys = set()

    for row in intelligence["rows"]:
        key = (branch_id, row["warehouse_id"], row["product_id"])
        if row["severity"] is None:
            InventoryAlert.objects.filter(
                branch_id=branch_id,
                warehouse_id=row["warehouse_id"],
                product_id=row["product_id"],
                resolved_at__isnull=True,
            ).update(resolved_at=timezone.now(), updated_at=timezone.now())
            continue

        alert, _ = InventoryAlert.objects.update_or_create(
            branch_id=branch_id,
            warehouse_id=row["warehouse_id"],
            product_id=row["product_id"],
            resolved_at__isnull=True,
            defaults={
                "severity": row["severity"],
                "current_quantity": row["on_hand"],
                "threshold_quantity": row["minimum_quantity"],
                "suggested_reorder_quantity": row["suggested_reorder_quantity"],
                "resolved_at": None,
            },
        )
        seen_open_keys.add(key)
        emit_outbox(
            branch_id=branch_id,
            entity="inventory_alert_update",
            entity_id=alert.id,
            op="upsert",
            payload={
                "alert_id": str(alert.id),
                "warehouse_id": str(row["warehouse_id"]),
                "product_id": str(row["product_id"]),
                "severity": row["severity"],
                "is_read": alert.is_read,
            },
        )

    now = timezone.now()
    for alert in InventoryAlert.objects.filter(branch_id=branch_id, resolved_at__isnull=True):
        key = (branch_id, alert.warehouse_id, alert.product_id)
        if key not in seen_open_keys:
            alert.resolved_at = now
            alert.save(update_fields=["resolved_at", "updated_at"])

    return intelligence


def build_reorder_rows_by_supplier(branch_id):
    intelligence = compute_stock_intelligence(branch_id)
    rows = [row for row in intelligence["rows"] if row["severity"] in [InventoryAlert.Severity.LOW, InventoryAlert.Severity.CRITICAL]]
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["preferred_supplier_name"]].append(row)
    return grouped


def export_reorder_csv(branch_id):
    grouped = build_reorder_rows_by_supplier(branch_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["supplier", "warehouse", "sku", "product", "on_hand", "minimum", "reorder", "severity"])
    for supplier, items in grouped.items():
        for row in items:
            writer.writerow(
                [
                    supplier,
                    row["warehouse_name"],
                    row["sku"],
                    row["product_name"],
                    row["on_hand"],
                    row["minimum_quantity"],
                    row["suggested_reorder_quantity"],
                    row["severity"],
                ]
            )
    return output.getvalue()


def export_reorder_pdf_text(branch_id):
    grouped = build_reorder_rows_by_supplier(branch_id)
    lines = ["Reorder Suggestions", "==================="]
    for supplier, items in grouped.items():
        lines.append(f"Supplier: {supplier}")
        for row in items:
            lines.append(
                f"- {row['product_name']} ({row['sku']}) @ {row['warehouse_name']}: on_hand={row['on_hand']} min={row['minimum_quantity']} reorder={row['suggested_reorder_quantity']} severity={row['severity']}"
            )
        lines.append("")
    return "\n".join(lines)
