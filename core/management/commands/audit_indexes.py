from collections import defaultdict

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Index


class Command(BaseCommand):
    help = (
        "Audit PostgreSQL index drift by comparing model-declared index names "
        "(Meta.indexes / Meta.index_together) with pg_indexes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            default="public",
            help="PostgreSQL schema to inspect (default: public).",
        )

    def handle(self, *args, **options):
        schema_name = options["schema"]
        if connection.vendor != "postgresql":
            self.stdout.write(
                self.style.WARNING(
                    "audit_indexes currently supports PostgreSQL only; "
                    f"detected vendor={connection.vendor!r}."
                )
            )
            return

        expected = self._expected_indexes()
        actual = self._actual_indexes(schema_name)

        any_mismatch = False
        self.stdout.write(self.style.MIGRATE_HEADING(f"Index audit for schema '{schema_name}'"))

        for table_name in sorted(set(expected) | set(actual)):
            expected_names = expected.get(table_name, set())
            actual_names = actual.get(table_name, set())

            missing = sorted(expected_names - actual_names)
            unexpected = sorted(actual_names - expected_names)

            if missing or unexpected:
                any_mismatch = True
                self.stdout.write(self.style.WARNING(f"\n{table_name}"))
                if missing:
                    self.stdout.write("  Missing expected indexes:")
                    for name in missing:
                        self.stdout.write(f"    - {name}")
                if unexpected:
                    self.stdout.write("  Extra indexes not declared in model state:")
                    for name in unexpected:
                        self.stdout.write(f"    - {name}")

        if any_mismatch:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "Detected index drift. Review missing/extra indexes above before running migrations."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS("No index drift detected."))

    def _expected_indexes(self):
        expected_by_table = defaultdict(set)

        for model in apps.get_models():
            opts = model._meta
            if opts.proxy or not opts.managed:
                continue

            table_name = opts.db_table

            for index in opts.indexes:
                if isinstance(index, Index) and index.name:
                    expected_by_table[table_name].add(index.name)

            # index_together is legacy but still appears in some projects.
            for fields in getattr(opts, "index_together", ()):
                index_name = self._index_together_name(opts, tuple(fields))
                expected_by_table[table_name].add(index_name)

        return expected_by_table

    def _actual_indexes(self, schema_name):
        actual_by_table = defaultdict(set)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT tablename, indexname
                FROM pg_indexes
                WHERE schemaname = %s
                ORDER BY tablename, indexname
                """,
                [schema_name],
            )
            for tablename, indexname in cursor.fetchall():
                actual_by_table[tablename].add(indexname)

        return actual_by_table

    def _index_together_name(self, opts, fields):
        # Use Django's built-in naming strategy for legacy index_together entries.
        return opts._get_index_name(opts.db_table, list(fields), suffix="idx")
