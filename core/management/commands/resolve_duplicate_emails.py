from collections import defaultdict

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Detect and optionally resolve duplicate user emails (case-insensitive)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply a deterministic fix by normalizing emails and suffixing duplicates.",
        )

    def _normalized(self, email):
        return (email or "").strip().lower()

    def _dedupe_email(self, email, suffix):
        local, at, domain = email.partition("@")
        if not at:
            return f"{email}+dup{suffix}"
        return f"{local}+dup{suffix}@{domain}"

    def handle(self, *args, **options):
        User = get_user_model()
        apply_changes = options["apply"]

        users = list(User.objects.exclude(email="").order_by("date_joined", "id"))
        grouped = defaultdict(list)
        for user in users:
            normalized_email = self._normalized(user.email)
            if normalized_email:
                grouped[normalized_email].append(user)

        duplicate_groups = {email: group for email, group in grouped.items() if len(group) > 1}

        if not duplicate_groups:
            self.stdout.write(self.style.SUCCESS("No duplicate emails found."))
            return

        self.stdout.write(self.style.WARNING(f"Found {len(duplicate_groups)} duplicate email group(s)."))
        for email, group in duplicate_groups.items():
            usernames = ", ".join(user.username for user in group)
            self.stdout.write(f"- {email}: {usernames}")

        if not apply_changes:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply to resolve duplicates."))
            return

        updated_count = 0
        for email, group in duplicate_groups.items():
            for index, user in enumerate(group):
                desired_email = email if index == 0 else self._dedupe_email(email, index)
                if user.email != desired_email:
                    user.email = desired_email
                    user.save(update_fields=["email"])
                    updated_count += 1

        self.stdout.write(self.style.SUCCESS(f"Resolved duplicates. Updated {updated_count} user record(s)."))
