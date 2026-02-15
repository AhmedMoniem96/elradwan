from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from inventory.models import DemandForecast, StockMove, Warehouse
from sales.models import Invoice, InvoiceLine

QUANT = Decimal("0.01")


def _q(value):
    return Decimal(value or 0).quantize(QUANT, rounding=ROUND_HALF_UP)


def _daily_series(values_by_day, start_date, lookback_days):
    return [Decimal(values_by_day.get(start_date + timedelta(days=i), 0)) for i in range(lookback_days)]


def _moving_average(series, window):
    window = max(int(window), 1)
    if not series:
        return Decimal("0")
    sample = series[-window:] if len(series) >= window else series
    return sum(sample) / Decimal(len(sample) or 1)


def _seasonal_factor(series):
    if len(series) < 14:
        return Decimal("1")

    overall_avg = sum(series) / Decimal(len(series) or 1)
    if overall_avg <= 0:
        return Decimal("1")

    weekday_pattern = series[-7:]
    weekday_avg = sum(weekday_pattern) / Decimal(len(weekday_pattern))
    if weekday_avg <= 0:
        return Decimal("1")

    factor = weekday_avg / overall_avg
    return min(max(factor, Decimal("0.75")), Decimal("1.25"))


def _compute_horizons(series):
    ma7 = _moving_average(series, 7)
    ma30 = _moving_average(series, 30)
    base_daily = ((ma7 * Decimal("0.6")) + (ma30 * Decimal("0.4"))) * _seasonal_factor(series)
    base_daily = max(base_daily, Decimal("0"))

    return {
        "daily_demand": _q(base_daily),
        "demand_7d": _q(base_daily * Decimal("7")),
        "demand_14d": _q(base_daily * Decimal("14")),
        "demand_30d": _q(base_daily * Decimal("30")),
    }


def _current_stock_by_pair(branch_id):
    rows = (
        StockMove.objects.filter(branch_id=branch_id)
        .values("warehouse_id", "product_id")
        .annotate(on_hand=Sum("quantity"))
    )
    return {(row["warehouse_id"], row["product_id"]): Decimal(row["on_hand"] or 0) for row in rows}


def _stock_move_demand(branch_id, start_dt):
    rows = (
        StockMove.objects.filter(
            branch_id=branch_id,
            created_at__gte=start_dt,
            quantity__lt=0,
            reason=StockMove.Reason.SALE,
        )
        .annotate(day=TruncDate("created_at"))
        .values("warehouse_id", "product_id", "day")
        .annotate(total=Sum("quantity"))
    )

    demand = defaultdict(lambda: defaultdict(Decimal))
    for row in rows:
        pair = (row["warehouse_id"], row["product_id"])
        demand[pair][row["day"]] += abs(Decimal(row["total"] or 0))
    return demand


def _invoice_demand(branch_id, start_dt):
    primary_warehouse = Warehouse.objects.filter(branch_id=branch_id, is_active=True, is_primary=True).first()
    if not primary_warehouse:
        primary_warehouse = Warehouse.objects.filter(branch_id=branch_id, is_active=True).first()
    if not primary_warehouse:
        return defaultdict(lambda: defaultdict(Decimal))

    rows = (
        InvoiceLine.objects.filter(
            invoice__branch_id=branch_id,
            invoice__created_at__gte=start_dt,
        )
        .exclude(invoice__status=Invoice.Status.VOID)
        .annotate(day=TruncDate("invoice__created_at"))
        .values("product_id", "day")
        .annotate(total=Sum("quantity"))
    )

    demand = defaultdict(lambda: defaultdict(Decimal))
    for row in rows:
        pair = (primary_warehouse.id, row["product_id"])
        demand[pair][row["day"]] += Decimal(row["total"] or 0)
    return demand


def refresh_demand_forecasts(branch_id, *, lookback_days=90):
    today = timezone.localdate()
    start_date = today - timedelta(days=lookback_days - 1)
    start_dt = timezone.make_aware(datetime.combine(start_date, time.min))

    stock_move_demand = _stock_move_demand(branch_id, start_dt)
    invoice_demand = _invoice_demand(branch_id, start_dt)

    merged = defaultdict(lambda: defaultdict(Decimal))
    for source in (stock_move_demand, invoice_demand):
        for pair, days in source.items():
            for day, qty in days.items():
                merged[pair][day] += qty

    on_hand_map = _current_stock_by_pair(branch_id)
    pairs = set(on_hand_map.keys()) | set(merged.keys())
    snapshot_ts = timezone.now()
    created = []

    for warehouse_id, product_id in pairs:
        series = _daily_series(merged[(warehouse_id, product_id)], start_date, lookback_days)
        horizons = _compute_horizons(series)
        on_hand = on_hand_map.get((warehouse_id, product_id), Decimal("0"))
        daily_demand = Decimal(horizons["daily_demand"])

        days_of_cover = None
        projected_stockout_date = None
        if on_hand <= 0:
            days_of_cover = Decimal("0")
            projected_stockout_date = today
        elif daily_demand > 0:
            days_of_cover = on_hand / daily_demand
            projected_stockout_date = today + timedelta(days=int(days_of_cover))

        recommended_reorder_qty = max(Decimal(horizons["demand_30d"]) - on_hand, Decimal("0"))

        forecast = DemandForecast.objects.create(
            branch_id=branch_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            snapshot_at=snapshot_ts,
            daily_demand=daily_demand,
            demand_7d=horizons["demand_7d"],
            demand_14d=horizons["demand_14d"],
            demand_30d=horizons["demand_30d"],
            on_hand=on_hand,
            days_of_cover=_q(days_of_cover) if days_of_cover is not None else None,
            projected_stockout_date=projected_stockout_date,
            recommended_reorder_quantity=_q(recommended_reorder_qty),
        )
        created.append(forecast)

    return created


def latest_forecasts_for_branch(branch_id):
    latest_ts = DemandForecast.objects.filter(branch_id=branch_id).order_by("-snapshot_at").values_list("snapshot_at", flat=True).first()
    if not latest_ts:
        return DemandForecast.objects.none()
    return DemandForecast.objects.filter(branch_id=branch_id, snapshot_at=latest_ts).select_related("warehouse", "product")
