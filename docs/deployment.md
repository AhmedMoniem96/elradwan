# Deployment configuration

## Required environment variables for production

Set the following variables when `DJANGO_ENV=prod`:

- `SECRET_KEY`: Django secret key (required outside dev).
- `ALLOWED_HOSTS`: Comma-separated backend hostnames.
- `CORS_ALLOWED_ORIGINS`: Comma-separated frontend origins.
- `DEFAULT_FROM_EMAIL`: Global sender address used by Django mail.
- `PASSWORD_RESET_FROM_EMAIL`: Sender used specifically for password reset emails.
- `PASSWORD_RESET_FRONTEND_URL`: Absolute frontend reset route base (for example `https://app.example.com/reset-password`).

## Password reset link behavior

The backend now sends a click-through URL in email using:

`{PASSWORD_RESET_FRONTEND_URL}/{uid}/{token}?email={email}&token={token}`

This supports both:

- Path-based reset entry (`uid`/`token`), and
- Query-based prefill (`email`/`token`) for compatibility.

If email delivery fails, the backend logs `password_reset_email_send_failed` with user/email context so failures are observable in logs/monitoring.
