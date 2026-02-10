from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings

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
