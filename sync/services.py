from dataclasses import dataclass
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone

from inventory.models import Product, StockMove, StockTransfer, StockTransferLine, Warehouse
from sales.models import CashShift, Customer, Invoice, InvoiceLine, Payment
from common.utils import emit_outbox


@dataclass
class EventResult:
    accepted: bool
    reason: str | None = None
    details: dict | None = None


class EventRejectError(Exception):
    def __init__(self, reason: str, details: dict | None = None):
        self.reason = reason
        self.details = details or {}
        super().__init__(reason)


def _get_active_shift(branch_id, device_id, user_id):
    return CashShift.objects.filter(
        branch_id=branch_id,
        device_id=device_id,
        cashier_id=user_id,
        closed_at__isnull=True,
    ).first()


def _build_shift_summary(shift):
    if shift is None:
        return None
    close_time = shift.closed_at or timezone.now()
    cash_total = (
        Payment.objects.filter(
            invoice__branch_id=shift.branch_id,
            invoice__device_id=shift.device_id,
            invoice__user_id=shift.cashier_id,
            method=Payment.Method.CASH,
            paid_at__gte=shift.opened_at,
            paid_at__lte=close_time,
        ).aggregate(total=models.Sum("amount"))["total"]
        or Decimal("0")
    )
    expected = shift.expected_amount if shift.expected_amount is not None else (shift.opening_amount + cash_total)
    return {
        "id": str(shift.id),
        "cashier_id": str(shift.cashier_id),
        "device_id": str(shift.device_id),
        "opened_at": shift.opened_at.isoformat(),
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
        "opening_amount": str(shift.opening_amount),
        "expected_amount": str(expected),
        "variance": str(shift.variance) if shift.variance is not None else None,
    }


SUPPORTED_EVENT_TYPES = {
    "invoice.create",
    "customer.upsert",
    "customer.delete",
    "stock.adjust",
    "product.stock_status.set",
    "stock.transfer.create",
    "stock.transfer.approve",
    "stock.transfer.complete",
}


def process_sync_event(sync_event):
    event_type = sync_event.event_type
    if event_type not in SUPPORTED_EVENT_TYPES:
        return EventResult(
            accepted=False,
            reason="validation_failed",
            details={"event_type": f"Unsupported event_type '{event_type}'"},
        )

    handler = {
        "invoice.create": _handle_invoice_create,
        "customer.upsert": _handle_customer_upsert,
        "customer.delete": _handle_customer_delete,
        "stock.adjust": _handle_stock_adjust,
        "product.stock_status.set": _handle_product_stock_status_set,
        "stock.transfer.create": _handle_stock_transfer_create,
        "stock.transfer.approve": _handle_stock_transfer_approve,
        "stock.transfer.complete": _handle_stock_transfer_complete,
    }[event_type]

    try:
        with transaction.atomic():
            handler(sync_event)
        return EventResult(accepted=True)
    except EventRejectError as exc:
        return EventResult(accepted=False, reason=exc.reason, details=exc.details)


def _validate_required(payload, fields):
    missing = [field for field in fields if payload.get(field) in (None, "")]
    if missing:
        raise EventRejectError("validation_failed", {"missing_fields": missing})


def _validate_branch_scope(payload, sync_event):
    payload_branch_id = str(payload.get("branch_id", ""))
    if payload_branch_id != str(sync_event.branch_id):
        raise EventRejectError(
            "forbidden",
            {"branch_id": "Payload branch_id does not match device branch."},
        )


def _handle_customer_upsert(sync_event):
    payload = sync_event.payload
    _validate_required(payload, ["branch_id", "customer_id", "name"])
    _validate_branch_scope(payload, sync_event)

    customer_id = payload["customer_id"]
    defaults = {
        "branch": sync_event.branch,
        "name": payload["name"],
        "phone": payload.get("phone"),
        "email": payload.get("email"),
    }
    customer, _ = Customer.objects.update_or_create(id=customer_id, defaults=defaults)

    emit_outbox(
        branch_id=sync_event.branch_id,
        entity="customer",
        entity_id=customer.id,
        op="upsert",
        payload={
            "id": str(customer.id),
            "name": customer.name,
            "phone": customer.phone,
            "email": customer.email,
        },
    )


def _handle_customer_delete(sync_event):
    payload = sync_event.payload
    _validate_required(payload, ["branch_id", "customer_id"])
    _validate_branch_scope(payload, sync_event)

    customer = Customer.objects.filter(id=payload["customer_id"], branch=sync_event.branch).first()
    if customer is None:
        raise EventRejectError("validation_failed", {"customer_id": "Customer not found in branch."})

    customer_id = customer.id
    customer.delete()

    emit_outbox(
        branch_id=sync_event.branch_id,
        entity="customer",
        entity_id=customer_id,
        op="delete",
        payload={
            "id": str(customer_id),
        },
    )


def _handle_stock_adjust(sync_event):
    payload = sync_event.payload
    _validate_required(payload, ["branch_id", "warehouse_id", "product_id", "quantity", "reason"])
    _validate_branch_scope(payload, sync_event)

    quantity = Decimal(str(payload["quantity"]))
    if quantity == 0:
        raise EventRejectError("validation_failed", {"quantity": "Quantity must be non-zero."})

    product = Product.objects.filter(id=payload["product_id"], branch=sync_event.branch).first()
    if product is None:
        raise EventRejectError("validation_failed", {"product_id": "Product not found in branch."})
    if not product.is_active:
        raise EventRejectError("forbidden", {"product_id": "Product is inactive."})

    warehouse = Warehouse.objects.filter(id=payload["warehouse_id"], branch=sync_event.branch).first()
    if warehouse is None:
        raise EventRejectError("forbidden", {"warehouse_id": "Warehouse is not in branch."})

    reason = payload["reason"]
    valid_reasons = {choice[0] for choice in StockMove.Reason.choices}
    if reason not in valid_reasons:
        raise EventRejectError("validation_failed", {"reason": "Invalid reason."})

    stock_move = StockMove.objects.create(
        branch=sync_event.branch,
        warehouse=warehouse,
        product=product,
        quantity=quantity,
        reason=reason,
        source_ref_type="sync.event",
        source_ref_id=sync_event.id,
        event_id=sync_event.event_id,
        device=sync_event.device,
    )

    emit_outbox(
        branch_id=sync_event.branch_id,
        entity="stock_move",
        entity_id=stock_move.id,
        op="upsert",
        payload={
            "id": str(stock_move.id),
            "warehouse_id": str(stock_move.warehouse_id),
            "product_id": str(stock_move.product_id),
            "quantity": str(stock_move.quantity),
            "reason": stock_move.reason,
            "event_id": str(stock_move.event_id),
        },
    )


def _handle_product_stock_status_set(sync_event):
    payload = sync_event.payload
    _validate_required(payload, ["branch_id", "product_id", "stock_status"])
    _validate_branch_scope(payload, sync_event)

    product = Product.objects.filter(id=payload["product_id"], branch=sync_event.branch).first()
    if product is None:
        raise EventRejectError("validation_failed", {"product_id": "Product not found in branch."})

    product.stock_status = payload["stock_status"]
    product.save(update_fields=["stock_status", "updated_at"])

    emit_outbox(
        branch_id=sync_event.branch_id,
        entity="product",
        entity_id=product.id,
        op="upsert",
        payload={
            "id": str(product.id),
            "sku": product.sku,
            "name": product.name,
            "price": str(product.price),
            "stock_status": product.stock_status,
            "updated_at": product.updated_at.isoformat(),
        },
    )



def _serialize_transfer(transfer):
    return {
        "id": str(transfer.id),
        "branch": str(transfer.branch_id),
        "source_warehouse": str(transfer.source_warehouse_id),
        "destination_warehouse": str(transfer.destination_warehouse_id),
        "reference": transfer.reference,
        "status": transfer.status,
        "requires_supervisor_approval": transfer.requires_supervisor_approval,
        "approved_by": str(transfer.approved_by_id) if transfer.approved_by_id else None,
        "approved_at": transfer.approved_at.isoformat() if transfer.approved_at else None,
        "completed_at": transfer.completed_at.isoformat() if transfer.completed_at else None,
        "notes": transfer.notes,
        "lines": [
            {
                "id": str(line.id),
                "product": str(line.product_id),
                "quantity": str(line.quantity),
            }
            for line in transfer.lines.all()
        ],
    }


def _handle_stock_transfer_create(sync_event):
    payload = sync_event.payload
    _validate_required(payload, ["branch_id", "source_warehouse_id", "destination_warehouse_id", "reference", "lines"])
    _validate_branch_scope(payload, sync_event)

    source = Warehouse.objects.filter(id=payload["source_warehouse_id"], branch=sync_event.branch).first()
    destination = Warehouse.objects.filter(id=payload["destination_warehouse_id"], branch=sync_event.branch).first()
    if source is None or destination is None:
        raise EventRejectError("validation_failed", {"warehouse": "Source and destination warehouses must belong to branch."})
    if source.id == destination.id:
        raise EventRejectError("validation_failed", {"destination_warehouse_id": "Destination must differ from source warehouse."})

    lines = payload.get("lines") or []
    if not isinstance(lines, list) or not lines:
        raise EventRejectError("validation_failed", {"lines": "At least one transfer line is required."})

    transfer = StockTransfer.objects.create(
        branch=sync_event.branch,
        source_warehouse=source,
        destination_warehouse=destination,
        reference=payload["reference"],
        requires_supervisor_approval=bool(payload.get("requires_supervisor_approval", False)),
        notes=payload.get("notes", ""),
    )

    for line in lines:
        if line.get("product_id") in (None, "") or line.get("quantity") in (None, ""):
            raise EventRejectError("validation_failed", {"lines": "Each line requires product_id and quantity."})
        qty = Decimal(str(line["quantity"]))
        if qty <= 0:
            raise EventRejectError("validation_failed", {"lines": "Line quantity must be positive."})
        product = Product.objects.filter(id=line["product_id"], branch=sync_event.branch).first()
        if product is None:
            raise EventRejectError("validation_failed", {"product_id": f"Unknown product {line['product_id']}"})
        StockTransferLine.objects.create(transfer=transfer, product=product, quantity=qty)

    emit_outbox(sync_event.branch_id, "stock_transfer", transfer.id, "upsert", _serialize_transfer(transfer))


def _handle_stock_transfer_approve(sync_event):
    payload = sync_event.payload
    _validate_required(payload, ["branch_id", "transfer_id"])
    _validate_branch_scope(payload, sync_event)

    transfer = StockTransfer.objects.filter(id=payload["transfer_id"], branch=sync_event.branch).first()
    if transfer is None:
        raise EventRejectError("validation_failed", {"transfer_id": "Transfer not found."})
    if transfer.status != StockTransfer.Status.DRAFT:
        raise EventRejectError("validation_failed", {"status": "Only draft transfers can be approved."})

    transfer.status = StockTransfer.Status.APPROVED
    transfer.approved_by = sync_event.user
    transfer.approved_at = timezone.now()
    transfer.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    emit_outbox(sync_event.branch_id, "stock_transfer", transfer.id, "upsert", _serialize_transfer(transfer))


def _handle_stock_transfer_complete(sync_event):
    payload = sync_event.payload
    _validate_required(payload, ["branch_id", "transfer_id"])
    _validate_branch_scope(payload, sync_event)

    transfer = StockTransfer.objects.prefetch_related("lines").filter(id=payload["transfer_id"], branch=sync_event.branch).first()
    if transfer is None:
        raise EventRejectError("validation_failed", {"transfer_id": "Transfer not found."})
    if transfer.status != StockTransfer.Status.APPROVED:
        raise EventRejectError("validation_failed", {"status": "Only approved transfers can be completed."})

    shortages = []
    for line in transfer.lines.all():
        available = (
            StockMove.objects.filter(
                branch=sync_event.branch, warehouse_id=transfer.source_warehouse_id, product_id=line.product_id
            ).aggregate(total=models.Sum("quantity"))["total"]
            or Decimal("0")
        )
        if available < line.quantity:
            shortages.append({"product_id": str(line.product_id), "available": str(available), "required": str(line.quantity)})

    if shortages:
        raise EventRejectError("validation_failed", {"shortages": shortages})

    for line in transfer.lines.all():
        StockMove.objects.create(
            branch=sync_event.branch,
            warehouse_id=transfer.source_warehouse_id,
            product_id=line.product_id,
            quantity=-line.quantity,
            reason=StockMove.Reason.TRANSFER,
            source_ref_type="inventory.stock_transfer",
            source_ref_id=transfer.id,
            event_id=sync_event.event_id,
            device=sync_event.device,
        )
        StockMove.objects.create(
            branch=sync_event.branch,
            warehouse_id=transfer.destination_warehouse_id,
            product_id=line.product_id,
            quantity=line.quantity,
            reason=StockMove.Reason.TRANSFER,
            source_ref_type="inventory.stock_transfer",
            source_ref_id=transfer.id,
            event_id=sync_event.event_id,
            device=sync_event.device,
        )

    transfer.status = StockTransfer.Status.COMPLETED
    transfer.completed_at = timezone.now()
    transfer.save(update_fields=["status", "completed_at", "updated_at"])

    emit_outbox(sync_event.branch_id, "stock_transfer", transfer.id, "upsert", _serialize_transfer(transfer))

def _handle_invoice_create(sync_event):
    payload = sync_event.payload
    _validate_required(
        payload,
        [
            "branch_id",
            "device_id",
            "user_id",
            "local_invoice_no",
            "lines",
            "totals",
            "created_at",
        ],
    )
    _validate_branch_scope(payload, sync_event)

    if str(payload["device_id"]) != str(sync_event.device_id):
        raise EventRejectError("forbidden", {"device_id": "Payload device_id mismatch."})
    if str(payload["user_id"]) != str(sync_event.user_id):
        raise EventRejectError("forbidden", {"user_id": "Payload user_id mismatch."})

    active_shift = _get_active_shift(sync_event.branch_id, sync_event.device_id, sync_event.user_id)
    if active_shift is None:
        raise EventRejectError("forbidden", {"shift": "Open shift required before creating invoices."})

    lines = payload.get("lines") or []
    if not isinstance(lines, list) or not lines:
        raise EventRejectError("validation_failed", {"lines": "At least one line is required."})

    totals = payload.get("totals") or {}
    required_total_fields = ["subtotal", "discount_total", "tax_total", "total"]
    if any(field not in totals for field in required_total_fields):
        raise EventRejectError("validation_failed", {"totals": "Missing totals fields."})

    customer = None
    customer_payload = payload.get("customer")
    if customer_payload:
        customer_id = customer_payload.get("customer_id")
        if not customer_id:
            raise EventRejectError("validation_failed", {"customer.customer_id": "Required when customer is provided."})
        customer, _ = Customer.objects.update_or_create(
            id=customer_id,
            defaults={
                "branch": sync_event.branch,
                "name": customer_payload.get("name") or "Unnamed Customer",
                "phone": customer_payload.get("phone"),
                "email": customer_payload.get("email"),
            },
        )

    invoice_number = payload.get("invoice_number") or f"{sync_event.branch.code}-{payload['local_invoice_no']}"
    total_paid = Decimal("0")
    for payment_payload in payload.get("payments") or []:
        for field in ["method", "amount", "paid_at"]:
            if payment_payload.get(field) in (None, ""):
                raise EventRejectError("validation_failed", {f"payments.{field}": "Required."})
        total_paid += Decimal(str(payment_payload["amount"]))

    invoice_status = Invoice.Status.OPEN
    paid_at = None
    if total_paid >= Decimal(str(totals["total"])) and total_paid > 0:
        invoice_status = Invoice.Status.PAID
        paid_at = timezone.now()
    elif total_paid > 0:
        invoice_status = Invoice.Status.PARTIALLY_PAID

    invoice = Invoice.objects.create(
        branch=sync_event.branch,
        device=sync_event.device,
        user=sync_event.user,
        customer=customer,
        invoice_number=invoice_number,
        local_invoice_no=payload["local_invoice_no"],
        subtotal=Decimal(str(totals["subtotal"])),
        discount_total=Decimal(str(totals["discount_total"])),
        tax_total=Decimal(str(totals["tax_total"])),
        total=Decimal(str(totals["total"])),
        event_id=sync_event.event_id,
        created_at=payload["created_at"],
        status=invoice_status,
        paid_at=paid_at,
    )

    for line in lines:
        for field in ["product_id", "qty", "unit_price", "discount", "tax_rate"]:
            if line.get(field) in (None, ""):
                raise EventRejectError("validation_failed", {f"lines.{field}": "Required."})
        product = Product.objects.filter(id=line["product_id"], branch=sync_event.branch).first()
        if product is None:
            raise EventRejectError("validation_failed", {"product_id": f"Unknown product {line['product_id']}"})

        quantity = Decimal(str(line["qty"]))
        unit_price = Decimal(str(line["unit_price"]))
        discount = Decimal(str(line.get("discount", "0")))
        tax_rate = Decimal(str(line.get("tax_rate", "0")))
        line_total = (quantity * unit_price) - discount

        InvoiceLine.objects.create(
            invoice=invoice,
            product=product,
            quantity=quantity,
            unit_price=unit_price,
            discount=discount,
            tax_rate=tax_rate,
            line_total=line_total,
        )

    for payment_payload in payload.get("payments") or []:
        Payment.objects.create(
            invoice=invoice,
            method=payment_payload["method"],
            amount=Decimal(str(payment_payload["amount"])),
            paid_at=payment_payload["paid_at"],
            event_id=sync_event.event_id,
            device=sync_event.device,
        )

    emit_outbox(
        branch_id=sync_event.branch_id,
        entity="invoice",
        entity_id=invoice.id,
        op="upsert",
        payload={
            "id": str(invoice.id),
            "device_id": str(invoice.device_id),
            "user_id": str(invoice.user_id),
            "customer_id": str(invoice.customer_id) if invoice.customer_id else None,
            "invoice_number": invoice.invoice_number,
            "local_invoice_no": invoice.local_invoice_no,
            "status": invoice.status,
            "subtotal": str(invoice.subtotal),
            "discount_total": str(invoice.discount_total),
            "tax_total": str(invoice.tax_total),
            "total": str(invoice.total),
            "event_id": str(invoice.event_id),
            "shift_summary": _build_shift_summary(active_shift),
        },
    )
