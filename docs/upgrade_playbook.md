# Upgrade Playbook

Use this checklist for any dependency upgrade PR.

## 1) Scope and planning

- Identify target packages and target versions.
- Confirm runtime support (Python/Node/Django/React/Vite).
- Decide whether the PR is patch/minor (maintenance) or major (migration).

## 2) Implement upgrades

- Update backend pins in `requirements.txt`.
- Update frontend dependencies and regenerate `frontend/package-lock.json`.
- Record notable dependency changelog links in the PR description.

## 3) Migration + compatibility checks

- Backend checks:
  - `python -m pip check`
  - `python manage.py check`
  - project test suite
- Frontend checks:
  - `npm ci`
  - `npm run build`
  - frontend test/lint commands

## 4) Security checks

- `pip-audit -r requirements.txt`
- `npm audit --audit-level=high`

## 5) Breaking changes notes

For each major upgrade, capture:

- What changed.
- Impacted modules/features.
- Required code migrations.
- Rollback plan.

## 6) Release readiness

- Ensure CI dependency workflow passes.
- Update user/developer docs if behavior changed.
- Merge only after reviewer sign-off on migration risk.
