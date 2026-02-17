# System edit suggestions

This document lists practical, high-impact edits you can apply to improve reliability, security, and maintainability of this system.

## 1) Move secrets and host config fully to environment variables

**Edit**
- Ensure `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, database URL/credentials, and CORS/CSRF origins are injected from environment variables in all environments.

**Why**
- Prevents accidental secret leakage and makes deployments predictable.

## 2) Add strict production security defaults in Django settings

**Edit**
- Enable/verify settings such as:
  - `SECURE_SSL_REDIRECT = True`
  - `SESSION_COOKIE_SECURE = True`
  - `CSRF_COOKIE_SECURE = True`
  - `SECURE_HSTS_SECONDS` (with preload/include subdomains when ready)
  - `X_FRAME_OPTIONS = 'DENY'`

**Why**
- Reduces common attack surface (cookie theft, downgrade attacks, clickjacking).

## 3) Add `/healthz` and `/readyz` endpoints

**Edit**
- Add lightweight health and readiness endpoints that verify database connectivity and critical dependencies.

**Why**
- Improves observability and enables safer container/orchestrator rollouts.

## 4) Add centralized structured logging

**Edit**
- Emit JSON logs for API requests, errors, and background tasks, including correlation/request IDs.

**Why**
- Speeds up incident debugging and works better with log aggregation platforms.

## 5) Enforce API throttling and safer defaults in DRF

**Edit**
- Configure global DRF throttling defaults and endpoint-specific overrides for auth-heavy routes.

**Why**
- Mitigates abuse and accidental load spikes.

## 6) Tighten frontend API configuration by environment

**Edit**
- Ensure frontend API base URL, timeout, and retry behavior are environment-driven (dev/staging/prod).

**Why**
- Avoids shipping wrong endpoints and improves failure behavior.

## 7) Add CI gates for formatting, linting, tests, and migrations

**Edit**
- In CI, run at minimum:
  - backend tests
  - frontend build/tests
  - migration sanity checks
  - dependency vulnerability scans

**Why**
- Catches regressions before deploy and keeps dependency hygiene consistent.

## 8) Add backup + restore runbook and verification cadence

**Edit**
- Document DB backup frequency, retention policy, restore procedure, and periodic restore drills.

**Why**
- Reduces recovery time and surprises during incidents.

## 9) Add SLO-aligned monitoring and alerts

**Edit**
- Track p95 latency, error rate, queue lag (if any), and critical business events (invoice/stock sync failures), with actionable alert thresholds.

**Why**
- Makes reliability measurable and alerting less noisy.

## 10) Add deployment safety controls

**Edit**
- Use rolling/canary deploys where possible and automatic rollback triggers on health check degradation.

**Why**
- Minimizes blast radius of bad releases.

---

## Suggested order (lowest risk first)

1. Environment variable hardening (1)  
2. Logging + health endpoints (3, 4)  
3. CI quality gates (7)  
4. Security hardening (2, 5)  
5. Monitoring/alerts + deploy controls (9, 10)  
6. Backup/restore validation (8)
