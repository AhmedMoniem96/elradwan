# Dependency Management Policy

## Cadence

- **Monthly security pass**
  - Run Python and npm vulnerability scans.
  - Apply high/critical security updates quickly.
- **Quarterly maintenance pass**
  - Review backend/frontend dependencies for stable patch/minor updates.
  - Run full compatibility checks before merge.
- **Major version upgrades (as-needed)**
  - Use a dedicated PR.
  - Include migration steps, breaking changes, and rollback notes.

## Compatibility checks

### Backend

- Install from `requirements.txt` using pinned versions.
- `python -m pip check` to detect resolver/runtime conflicts.
- `python manage.py check` to validate Django project configuration.

### Frontend

- Install using `npm ci` to enforce lockfile integrity.
- `npm run build` to verify React + Vite compatibility.
- `npm audit --audit-level=high` for vulnerability scanning.

## Lockfile and pinning policy

- Python dependencies in `requirements.txt` must be exact pins (`==`).
- Frontend dependency graph must be committed in `frontend/package-lock.json`.
- CI fails if lockfile integrity checks or pinning checks fail.
