from collections import OrderedDict
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.cache import cache
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import RoleCapabilityPermission
from core.models import Branch
from sales.models import Invoice, InvoiceLine, Payment


class BaseReportView(APIView):
    permission_classes = [IsAuthenticated, RoleCapabilityPermission]
    permission_action_map = {"get": "sales.dashboard.view"}
    cache_timeout = 60

    def _branch_ids(self, request):
        user = request.user
        branch_id = request.query_params.get("branch_id")
        if user.is_superuser:
            if branch_id:
                return [branch_id]
            return list(Branch.objects.values_list("id", flat=True))

        if not getattr(user, "branch_id", None):
            return []

        if branch_id and str(user.branch_id) != branch_id:
            raise ValidationError({"branch_id": "You can only query your own branch."})
        return [user.branch_id]

    def _parse_timezone(self, tz_name):
        try:
            return ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValidationError({"timezone": "Invalid IANA timezone."})

    def _parse_limit(self, request, default=10, minimum=1, maximum=1000):
        raw_limit = request.query_params.get("limit")
        if raw_limit is None:
            return default

        try:
            limit = int(raw_limit)
        except (TypeError, ValueError):
            raise ValidationError({"limit": f"Limit must be an integer between {minimum} and {maximum}."})

        if not minimum <= limit <= maximum:
            raise ValidationError({"limit": f"Limit must be between {minimum} and {maximum}."})
        return limit

    def _date_range(self, request, tz):
        date_from = parse_date(request.query_params.get("date_from", ""))
        date_to = parse_date(request.query_params.get("date_to", ""))
        if not date_from and not date_to:
            return None, None

        if not date_from or not date_to:
            raise ValidationError({"date_range": "Both date_from and date_to are required."})
        if date_from > date_to:
            raise ValidationError({"date_range": "date_from must be before or equal to date_to."})

        start = datetime.combine(date_from, time.min).replace(tzinfo=tz)
        end = datetime.combine(date_to, time.max).replace(tzinfo=tz)
        return start, end

    def _tz_name(self, request, branch_ids):
        tz_name = request.query_params.get("timezone")
        if tz_name:
            return tz_name
        if len(branch_ids) == 1:
            branch = Branch.objects.filter(id=branch_ids[0]).only("timezone").first()
            return branch.timezone if branch else "UTC"
        return "UTC"

    def _csv_response(self, filename, rows):
        import csv

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        if not rows:
            return response

        writer = csv.DictWriter(response, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        return response

    def _cached(self, request, key, callback):
        cache_key = f"reports:{key}:{request.get_full_path()}"
        payload = cache.get(cache_key)
        if payload is None:
            payload = callback()
            cache.set(cache_key, payload, self.cache_timeout)
        return payload


class DailySalesReportView(BaseReportView):
    def get(self, request):
        branch_ids = self._branch_ids(request)
        tz_name = self._tz_name(request, branch_ids)
        tz = self._parse_timezone(tz_name)
        start, end = self._date_range(request, tz)

        def run():
            qs = Invoice.objects.exclude(status=Invoice.Status.VOID).filter(branch_id__in=branch_ids)
            if start and end:
                qs = qs.filter(created_at__gte=start, created_at__lte=end)
            rows = list(
                qs.annotate(day=TruncDate("created_at", tzinfo=tz))
                .values("day")
                .annotate(
                    invoice_count=Count("id"),
                    gross_sales=Coalesce(Sum("total"), Decimal("0.00")),
                    tax_total=Coalesce(Sum("tax_total"), Decimal("0.00")),
                    discount_total=Coalesce(Sum("discount_total"), Decimal("0.00")),
                )
                .order_by("day")
            )
            return [{**row, "day": row["day"].isoformat()} for row in rows]

        rows = self._cached(request, "daily-sales", run)
        if request.query_params.get("format") == "csv":
            return self._csv_response("daily_sales.csv", rows)
        return Response({"timezone": tz_name, "results": rows})


class TopProductsReportView(BaseReportView):
    def get(self, request):
        branch_ids = self._branch_ids(request)
        tz_name = self._tz_name(request, branch_ids)
        tz = self._parse_timezone(tz_name)
        start, end = self._date_range(request, tz)
        limit = self._parse_limit(request)

        def run():
            cogs_expr = ExpressionWrapper(
                F("quantity") * Coalesce(F("product__cost"), Value(0), output_field=DecimalField(max_digits=12, decimal_places=2)),
                output_field=DecimalField(max_digits=16, decimal_places=2),
            )
            qs = InvoiceLine.objects.exclude(invoice__status=Invoice.Status.VOID).filter(invoice__branch_id__in=branch_ids)
            if start and end:
                qs = qs.filter(invoice__created_at__gte=start, invoice__created_at__lte=end)
            rows = list(
                qs.values("product_id", "product__sku", "product__name")
                .annotate(
                    quantity=Coalesce(Sum("quantity"), Decimal("0.00")),
                    revenue=Coalesce(Sum("line_total"), Decimal("0.00")),
                    cogs=Coalesce(Sum(cogs_expr), Decimal("0.00")),
                )
                .annotate(gross_margin=ExpressionWrapper(F("revenue") - F("cogs"), output_field=DecimalField(max_digits=16, decimal_places=2)))
                .order_by("-revenue")[:limit]
            )
            return rows

        rows = self._cached(request, "top-products", run)
        if request.query_params.get("format") == "csv":
            return self._csv_response("top_products.csv", rows)
        return Response({"results": rows})


class TopCustomersReportView(BaseReportView):
    def get(self, request):
        branch_ids = self._branch_ids(request)
        tz_name = self._tz_name(request, branch_ids)
        tz = self._parse_timezone(tz_name)
        start, end = self._date_range(request, tz)
        limit = self._parse_limit(request)

        def run():
            qs = Invoice.objects.exclude(status=Invoice.Status.VOID).filter(branch_id__in=branch_ids, customer__isnull=False)
            if start and end:
                qs = qs.filter(created_at__gte=start, created_at__lte=end)
            rows = list(
                qs.values("customer_id", "customer__name")
                .annotate(
                    invoice_count=Count("id"),
                    gross_sales=Coalesce(Sum("total"), Decimal("0.00")),
                    amount_paid=Coalesce(Sum("amount_paid"), Decimal("0.00")),
                    balance_due=Coalesce(Sum("balance_due"), Decimal("0.00")),
                )
                .order_by("-gross_sales")[:limit]
            )
            return rows

        rows = self._cached(request, "top-customers", run)
        if request.query_params.get("format") == "csv":
            return self._csv_response("top_customers.csv", rows)
        return Response({"results": rows})


class PaymentMethodSplitReportView(BaseReportView):
    def get(self, request):
        branch_ids = self._branch_ids(request)
        tz_name = self._tz_name(request, branch_ids)
        tz = self._parse_timezone(tz_name)
        start, end = self._date_range(request, tz)

        def run():
            qs = Payment.objects.filter(invoice__branch_id__in=branch_ids)
            if start and end:
                qs = qs.filter(paid_at__gte=start, paid_at__lte=end)
            rows = list(qs.values("method").annotate(amount=Coalesce(Sum("amount"), Decimal("0.00"))).order_by("-amount"))
            total = sum((row["amount"] for row in rows), Decimal("0.00"))
            formatted = []
            for row in rows:
                pct = Decimal("0.00") if total == 0 else (row["amount"] / total * Decimal("100"))
                formatted.append({**row, "percentage": round(pct, 2)})
            return formatted

        rows = self._cached(request, "payment-split", run)
        if request.query_params.get("format") == "csv":
            return self._csv_response("payment_method_split.csv", rows)
        return Response({"results": rows})


class GrossMarginReportView(BaseReportView):
    def get(self, request):
        branch_ids = self._branch_ids(request)
        tz_name = self._tz_name(request, branch_ids)
        tz = self._parse_timezone(tz_name)
        start, end = self._date_range(request, tz)

        def run():
            cogs_expr = ExpressionWrapper(
                F("quantity") * Coalesce(F("product__cost"), Value(0), output_field=DecimalField(max_digits=12, decimal_places=2)),
                output_field=DecimalField(max_digits=16, decimal_places=2),
            )
            qs = InvoiceLine.objects.exclude(invoice__status=Invoice.Status.VOID).filter(invoice__branch_id__in=branch_ids)
            if start and end:
                qs = qs.filter(invoice__created_at__gte=start, invoice__created_at__lte=end)

            totals = qs.aggregate(
                revenue=Coalesce(Sum("line_total"), Decimal("0.00")),
                cogs=Coalesce(Sum(cogs_expr), Decimal("0.00")),
            )
            margin = totals["revenue"] - totals["cogs"]
            pct = Decimal("0.00") if totals["revenue"] == 0 else round((margin / totals["revenue"]) * Decimal("100"), 2)
            return OrderedDict(revenue=totals["revenue"], cogs=totals["cogs"], gross_margin=margin, margin_pct=pct)

        payload = self._cached(request, "gross-margin", run)
        if request.query_params.get("format") == "csv":
            return self._csv_response("gross_margin.csv", [payload])
        return Response(payload)


class AccountsReceivableReportView(BaseReportView):
    def get(self, request):
        branch_ids = self._branch_ids(request)
        tz_name = self._tz_name(request, branch_ids)
        tz = self._parse_timezone(tz_name)
        start, end = self._date_range(request, tz)

        def run():
            qs = Invoice.objects.exclude(status=Invoice.Status.VOID).filter(branch_id__in=branch_ids, balance_due__gt=0)
            if start and end:
                qs = qs.filter(created_at__gte=start, created_at__lte=end)

            rows = []
            now = datetime.now(tz=tz)
            for invoice in qs.select_related("customer", "branch").order_by("-balance_due", "created_at"):
                age_days = max((now - invoice.created_at.astimezone(tz)).days, 0)
                rows.append(
                    {
                        "invoice_id": str(invoice.id),
                        "invoice_number": invoice.invoice_number,
                        "branch_id": str(invoice.branch_id),
                        "customer": invoice.customer.name if invoice.customer else "Walk-in",
                        "status": invoice.status,
                        "created_at": invoice.created_at.isoformat(),
                        "total": invoice.total,
                        "amount_paid": invoice.amount_paid,
                        "balance_due": invoice.balance_due,
                        "age_days": age_days,
                        "is_partial_payment": invoice.status == Invoice.Status.PARTIALLY_PAID,
                    }
                )
            return rows

        rows = self._cached(request, "accounts-receivable", run)
        if request.query_params.get("format") == "csv":
            return self._csv_response("accounts_receivable.csv", rows)
        return Response({"timezone": tz_name, "results": rows})


class DashboardMetricsReportView(BaseReportView):
    def get(self, request):
        branch_ids = self._branch_ids(request)
        tz_name = self._tz_name(request, branch_ids)
        tz = self._parse_timezone(tz_name)
        start, end = self._date_range(request, tz)

        if not start or not end:
            raise ValidationError({"date_range": "Both date_from and date_to are required."})

        date_from = parse_date(request.query_params.get("date_from", ""))
        date_to = parse_date(request.query_params.get("date_to", ""))
        range_days = (date_to - date_from).days + 1

        previous_date_to = date_from - timedelta(days=1)
        previous_date_from = previous_date_to - timedelta(days=range_days - 1)
        previous_start = datetime.combine(previous_date_from, time.min).replace(tzinfo=tz)
        previous_end = datetime.combine(previous_date_to, time.max).replace(tzinfo=tz)

        def aggregate_sales(range_start, range_end):
            return Invoice.objects.exclude(status=Invoice.Status.VOID).filter(
                branch_id__in=branch_ids,
                created_at__gte=range_start,
                created_at__lte=range_end,
            ).aggregate(total=Coalesce(Sum("total"), Decimal("0.00")))["total"]

        def aggregate_receivables(range_start, range_end):
            return Invoice.objects.exclude(status=Invoice.Status.VOID).filter(
                branch_id__in=branch_ids,
                balance_due__gt=0,
                created_at__gte=range_start,
                created_at__lte=range_end,
            ).aggregate(total=Coalesce(Sum("balance_due"), Decimal("0.00")))["total"]

        def run():
            return OrderedDict(
                timezone=tz_name,
                range=OrderedDict(date_from=date_from.isoformat(), date_to=date_to.isoformat()),
                previous_range=OrderedDict(
                    date_from=previous_date_from.isoformat(),
                    date_to=previous_date_to.isoformat(),
                ),
                sales_totals=OrderedDict(
                    current=aggregate_sales(start, end),
                    previous=aggregate_sales(previous_start, previous_end),
                ),
                accounts_receivable_totals=OrderedDict(
                    current=aggregate_receivables(start, end),
                    previous=aggregate_receivables(previous_start, previous_end),
                ),
            )

        payload = self._cached(request, "dashboard-metrics", run)
        response = Response(payload)
        response["Cache-Control"] = f"private, max-age={self.cache_timeout}"
        return response
