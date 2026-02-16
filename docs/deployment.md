# Deployment configuration

## Required environment variables for production

Set the following variables when `DJANGO_ENV=prod`:

- `SECRET_KEY`: Django secret key (required outside dev).
- Database configuration (choose one option):
  - `DATABASE_URL`: Full Postgres URL in the form `postgres://USER:PASSWORD@HOST:PORT/DB_NAME`.
  - OR all of `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`.
- `ALLOWED_HOSTS`: Comma-separated backend hostnames.
- `CORS_ALLOWED_ORIGINS`: Comma-separated frontend origins.
- `DEFAULT_FROM_EMAIL`: Global sender address used by Django mail.
- `PASSWORD_RESET_FROM_EMAIL`: Sender used specifically for password reset emails.
- `PASSWORD_RESET_FRONTEND_URL`: Absolute frontend reset route base (for example `https://app.example.com/reset-password`).

> `DJANGO_ENV=staging` uses the same strict requirements as production.

## Database configuration behavior by environment

- `DJANGO_ENV=dev`:
  - Supports `DATABASE_URL` and individual `DB_*` vars.
  - Falls back to local defaults (`pos`/`pos`/`pos123`/`localhost`/`5432`) when DB vars are omitted.
- `DJANGO_ENV=staging` or `DJANGO_ENV=prod`:
  - No local fallback defaults are allowed.
  - Startup raises `ImproperlyConfigured` if database settings are incomplete.

## Example environment configurations

### Option A: Single URL

```env
DJANGO_ENV=prod
SECRET_KEY=<your-secret>
DATABASE_URL=postgres://pos:strongpassword@db.example.com:5432/pos
ALLOWED_HOSTS=api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
```

### Option B: Individual DB variables

```env
DJANGO_ENV=staging
SECRET_KEY=<your-secret>
DB_NAME=pos
DB_USER=pos
DB_PASSWORD=strongpassword
DB_HOST=db.internal
DB_PORT=5432
ALLOWED_HOSTS=staging-api.example.com
CORS_ALLOWED_ORIGINS=https://staging-app.example.com
```

## Password reset link behavior

The backend now sends a click-through URL in email using:

`{PASSWORD_RESET_FRONTEND_URL}/{uid}/{token}?email={email}&token={token}`

This supports both:

- Path-based reset entry (`uid`/`token`), and
- Query-based prefill (`email`/`token`) for compatibility.

If email delivery fails, the backend logs `password_reset_email_send_failed` with user/email context so failures are observable in logs/monitoring.
