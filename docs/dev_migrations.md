# Migration drift and idempotent index operations

This project has had real-world schema drift in some PostgreSQL environments where index names in the database no longer matched the historical migration assumptions.

Examples we hit:
- A migration attempted to rename an old index name that no longer existed.
- A migration attempted to create an index that already existed under the target name.

## Why conditional SQL is used in historical migrations

`RenameIndex` and `AddIndex` are normally correct on fresh databases, but they are strict and can fail on drifted databases.

To keep migrations reliable in both cases, some historical operations were wrapped with:
- `migrations.SeparateDatabaseAndState`
- `migrations.RunSQL` with PostgreSQL `DO $$ ... $$` blocks that check `pg_indexes`

This ensures:
1. Fresh DBs still end up with the intended schema.
2. Drifted DBs skip no-op rename/create operations instead of crashing.
3. Django migration state remains correct via `state_operations` (`RenameIndex` / `AddIndex`).

## Auditing index drift

Use the management command below to compare model-declared index names against PostgreSQL `pg_indexes`:

```bash
python manage.py audit_indexes
```

The command reports:
- Missing expected indexes
- Extra indexes not declared in model state

If drift is detected, fix indexes deliberately (or make migration operations idempotent) before deploying.
