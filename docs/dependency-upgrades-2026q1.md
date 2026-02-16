# Dependency Upgrade Review — 2026 Q1 (Dedicated PR Notes)

This PR establishes dependency governance and CI enforcement, and records the upgrade review status.

## Review summary

- Backend and frontend dependency sets were reviewed for upgrade readiness.
- In this execution environment, external package registries are access-restricted (HTTP 403), so live version refreshes were not executable from CI/terminal during this pass.
- CI now includes automated vulnerability and lockfile checks so upgrades can be applied and validated as soon as registry access is available.

## Planned upgrade batch (next network-enabled pass)

| Area | Current baseline | Target strategy | Breaking change expectation |
| --- | --- | --- | --- |
| Django / DRF | Django 6.0.x, DRF 3.16.x | Keep latest patch within current major lines | Low (patch-only) |
| Python libs (`requirements.txt`) | Exact-pinned set | Monthly security patch bumps | Low–Medium (library-specific) |
| React + router + MUI | React 18.x ecosystem | Latest compatible minor/patch releases | Low (minor/patch) |
| Vite toolchain | Vite 5.x | Latest compatible patch or next major in separate PR | Medium for major Vite jump |

## Breaking change handling template

When majors are introduced, add notes for:

1. **Dependency** and old/new versions.
2. **Key upstream breaking changes**.
3. **Code migrations performed**.
4. **Validation evidence** (tests/build/manual checks).
5. **Rollback notes**.
