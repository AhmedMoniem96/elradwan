import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def env_list(name: str, default: list[str] | None = None) -> list[str]:
    value = os.getenv(name)
    if value is None:
        return default or []
    return [item.strip() for item in value.split(",") if item.strip()]


DJANGO_ENV = os.getenv("DJANGO_ENV", "dev").strip().lower()
if DJANGO_ENV not in {"dev", "staging", "prod"}:
    raise ImproperlyConfigured("DJANGO_ENV must be one of: dev, staging, prod.")

DEBUG = env_bool("DEBUG", default=DJANGO_ENV == "dev")

if DJANGO_ENV == "dev":
    SECRET_KEY = os.getenv("SECRET_KEY", "django-insecure-dev-only-key")
else:
    SECRET_KEY = os.getenv("SECRET_KEY")
    if not SECRET_KEY:
        raise ImproperlyConfigured("SECRET_KEY must be set when DJANGO_ENV is staging or prod.")

if DJANGO_ENV == "dev":
    ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
else:
    ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", default=[])

if DJANGO_ENV in {"staging", "prod"} and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must be configured when DJANGO_ENV is staging or prod.")

if DJANGO_ENV == "dev":
    CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", default=True)
    CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", default=[])
else:
    CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", default=False)
    CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", default=[])

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "core",
    "inventory",
    "sales",
    "sync",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "common.logging.RequestLogMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"



def _db_config_from_url(database_url: str) -> dict[str, str]:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ImproperlyConfigured("DATABASE_URL must use postgres:// or postgresql:// scheme.")
    if not parsed.path or parsed.path == "/":
        raise ImproperlyConfigured("DATABASE_URL must include a database name in the path.")

    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username or "",
        "PASSWORD": parsed.password or "",
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or ""),
    }


def _db_config_from_parts() -> dict[str, str]:
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", ""),
        "USER": os.getenv("DB_USER", ""),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", ""),
        "PORT": os.getenv("DB_PORT", ""),
    }


def _validate_non_dev_db_config(db_config: dict[str, str]) -> None:
    required_fields = ("NAME", "USER", "PASSWORD", "HOST", "PORT")
    missing_fields = [field for field in required_fields if not db_config.get(field)]
    if missing_fields:
        env_var_names = ", ".join(f"DB_{field}" for field in missing_fields)
        raise ImproperlyConfigured(
            "Database configuration is incomplete for staging/prod. "
            f"Set DATABASE_URL or all DB_* vars. Missing: {env_var_names}."
        )


database_url = os.getenv("DATABASE_URL", "").strip()
if database_url:
    default_db = _db_config_from_url(database_url)
else:
    default_db = _db_config_from_parts()

if DJANGO_ENV == "dev":
    if not all(default_db[field] for field in ("NAME", "USER", "PASSWORD", "HOST", "PORT")):
        default_db = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": "pos",
            "USER": "pos",
            "PASSWORD": "pos123",
            "HOST": "localhost",
            "PORT": "5432",
        }
else:
    _validate_non_dev_db_config(default_db)

DATABASES = {"default": default_db}

AUTH_USER_MODEL = "core.User"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 50,
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("DRF_THROTTLE_ANON", "100/hour"),
        "user": os.getenv("DRF_THROTTLE_USER", "1000/hour"),
        "auth": os.getenv("DRF_THROTTLE_AUTH", "30/minute"),
        "password_reset": os.getenv("DRF_THROTTLE_PASSWORD_RESET", "10/hour"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}


CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "elradwan-report-cache",
    }
}


MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"


DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@localhost")
PASSWORD_RESET_FROM_EMAIL = os.getenv("PASSWORD_RESET_FROM_EMAIL", DEFAULT_FROM_EMAIL)

PASSWORD_RESET_FRONTEND_URL = os.getenv("PASSWORD_RESET_FRONTEND_URL", "http://localhost:5173/reset-password")
parsed_password_reset_url = urlparse(PASSWORD_RESET_FRONTEND_URL)
if not (parsed_password_reset_url.scheme and parsed_password_reset_url.netloc):
    raise ImproperlyConfigured("PASSWORD_RESET_FRONTEND_URL must be an absolute URL including scheme and host.")


# Security defaults (strict in staging/prod, relaxed in dev)
IS_PRODUCTION_LIKE = DJANGO_ENV in {"staging", "prod"}
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", default=IS_PRODUCTION_LIKE)
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", default=IS_PRODUCTION_LIKE)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", default=IS_PRODUCTION_LIKE)
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000" if IS_PRODUCTION_LIKE else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=IS_PRODUCTION_LIKE)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", default=False)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = os.getenv("X_FRAME_OPTIONS", "DENY")
REFERRER_POLICY = os.getenv("REFERRER_POLICY", "same-origin")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if env_bool("SECURE_PROXY_SSL_HEADER_ENABLED", default=IS_PRODUCTION_LIKE) else None

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "common.logging.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "api.request": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
    },
}
