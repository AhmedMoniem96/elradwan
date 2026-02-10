from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from inventory.models import Product, StockMove, Warehouse
from sales.models import Customer, Invoice, InvoiceLine, Payment
from sync.models import SyncOutbox


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


SUPPORTED_EVENT_TYPES = {
    "invoice.create",
    "customer.upsert",
    "stock.adjust",
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
        "stock.adjust": _handle_stock_adjust,
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

    SyncOutbox.objects.create(
        branch_id=sync_event.branch_id,
        entity="customer",
        entity_id=customer.id,
        op="upsert",
        payload={
            "id": str(customer.id),
            "branch_id": str(customer.branch_id),
            "name": customer.name,
            "phone": customer.phone,
            "email": customer.email,
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

    SyncOutbox.objects.create(
        branch_id=sync_event.branch_id,
        entity="stock_move",
        entity_id=stock_move.id,
        op="upsert",
        payload={
            "id": str(stock_move.id),
            "branch_id": str(stock_move.branch_id),
            "warehouse_id": str(stock_move.warehouse_id),
            "product_id": str(stock_move.product_id),
            "quantity": str(stock_move.quantity),
            "reason": stock_move.reason,
            "event_id": str(stock_move.event_id),
        },
    )


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

    total_paid = Decimal("0")
    for payment_payload in payload.get("payments") or []:
        for field in ["method", "amount", "paid_at"]:
            if payment_payload.get(field) in (None, ""):
                raise EventRejectError("validation_failed", {f"payments.{field}": "Required."})
        payment = Payment.objects.create(
            invoice=invoice,
            method=payment_payload["method"],
            amount=Decimal(str(payment_payload["amount"])),
            paid_at=payment_payload["paid_at"],
            event_id=sync_event.event_id,
            device=sync_event.device,
        )
        total_paid += payment.amount

    if total_paid >= invoice.total and total_paid > 0:
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
    elif total_paid > 0:
        invoice.status = Invoice.Status.PARTIALLY_PAID
    invoice.save(update_fields=["status", "paid_at", "updated_at"])

    SyncOutbox.objects.create(
        branch_id=sync_event.branch_id,
        entity="invoice",
        entity_id=invoice.id,
        op="upsert",
        payload={
            "id": str(invoice.id),
            "branch_id": str(invoice.branch_id),
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
        },
    )
