from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Simple JSON formatter for structured logs."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for key in (
            "request_id",
            "path",
            "method",
            "status_code",
            "duration_ms",
            "remote_addr",
            "user_id",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


class RequestLogMiddleware:
    """Attach/propagate request ID and emit per-request access logs."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.logger = logging.getLogger("api.request")

    def __call__(self, request):
        started_at = time.perf_counter()
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.request_id = request_id

        response = self.get_response(request)

        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        user_id = None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            user_id = str(user.id)

        self.logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "remote_addr": request.META.get("REMOTE_ADDR"),
                "user_id": user_id,
            },
        )
        response["X-Request-ID"] = request_id
        return response
