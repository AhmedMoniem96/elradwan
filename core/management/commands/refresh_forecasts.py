from django.core.management.base import BaseCommand

from core.models import Branch
from inventory.forecasting import refresh_demand_forecasts


class Command(BaseCommand):
    help = "Refresh demand forecast snapshots for one branch or all active branches."

    def add_arguments(self, parser):
        parser.add_argument("--branch-id", dest="branch_id", help="Optional branch UUID.")
        parser.add_argument("--lookback-days", type=int, default=90, help="History window in days (default: 90).")

    def handle(self, *args, **options):
        branch_id = options.get("branch_id")
        lookback_days = max(options.get("lookback_days") or 90, 14)

        branches = Branch.objects.filter(is_active=True)
        if branch_id:
            branches = branches.filter(id=branch_id)

        total_rows = 0
        for branch in branches:
            rows = refresh_demand_forecasts(branch.id, lookback_days=lookback_days)
            total_rows += len(rows)
            self.stdout.write(self.style.SUCCESS(f"Branch {branch.code}: created {len(rows)} forecast snapshots."))

        self.stdout.write(self.style.SUCCESS(f"Forecast refresh complete. Total snapshots: {total_rows}."))
