# elradwan

POS & Inventory management system.

## Supported runtime versions

| Runtime | Supported versions | Notes |
| --- | --- | --- |
| Python | 3.12.x, 3.13.x | Backend is pinned to Django 6 and tested on current CPython releases. |
| Django | 6.0.x | Keep within latest 6.0 patch releases. |
| Django REST Framework | 3.16.x | Keep DRF aligned with Django 6 compatibility matrix. |
| Node.js | 22.x LTS | Frontend CI uses Node 22 for install/build/audit steps. |
| React | 18.x | Application currently targets React 18 runtime APIs. |
| Vite | 5.x | Frontend bundling/build pipeline is based on Vite 5. |

## Dependency update cadence

- **Monthly**: run security updates and vulnerability scans (`pip-audit`, `npm audit`).
- **Quarterly**: review and apply non-breaking minor/patch upgrades for backend and frontend.
- **Per release**: evaluate major upgrades (Django, DRF, React, Vite, Node) in dedicated PRs with migration notes.

See detailed policy and CI compatibility checks in [`docs/dependency_management.md`](docs/dependency_management.md).
## System hardening quick wins

- See [`docs/system_edit_suggestions.md`](docs/system_edit_suggestions.md) for a prioritized set of operational and security edits you can apply to this system.

