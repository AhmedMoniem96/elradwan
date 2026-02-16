from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from typing import Any

from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    NotFound,
    NotAcceptable,
    ParseError,
    PermissionDenied,
    Throttled,
    UnsupportedMediaType,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)

GENERIC_SERVER_ERROR_MESSAGE = "An unexpected error occurred."

EXCEPTION_CODE_MAP: dict[type[Exception], str] = {
    ValidationError: "validation_error",
    NotAuthenticated: "not_authenticated",
    AuthenticationFailed: "authentication_failed",
    PermissionDenied: "permission_denied",
    NotFound: "not_found",
    MethodNotAllowed: "method_not_allowed",
    NotAcceptable: "not_acceptable",
    UnsupportedMediaType: "unsupported_media_type",
    ParseError: "parse_error",
    Throttled: "throttled",
}


def build_error_envelope(
    *,
    code: str,
    message: str,
    errors: Any,
    status_code: int,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "errors": errors,
        "status": status_code,
    }


def error_response(
    *,
    code: str,
    message: str,
    errors: Any = None,
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> Response:
    return Response(
        build_error_envelope(
            code=code,
            message=message,
            errors=errors,
            status_code=status_code,
        ),
        status=status_code,
    )


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    response = drf_exception_handler(exc, context)

    if response is None:
        view_name = context.get("view").__class__.__name__ if context.get("view") else "unknown"
        logger.exception("Unhandled API exception in %s", view_name)
        return error_response(
            code="internal_server_error",
            message=GENERIC_SERVER_ERROR_MESSAGE,
            errors=None,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    status_code = response.status_code
    errors = _normalize_errors(response.data)
    message = _build_message(exc, response.data)
    code = _build_code(exc)

    response.data = build_error_envelope(
        code=code,
        message=message,
        errors=errors,
        status_code=status_code,
    )
    return response


def _build_code(exc: Exception) -> str:
    for exception_type, stable_code in EXCEPTION_CODE_MAP.items():
        if isinstance(exc, exception_type):
            return stable_code

    if isinstance(exc, APIException):
        return str(getattr(exc, "default_code", "api_error"))

    return "internal_server_error"


def _build_message(exc: Exception, data: Any) -> str:
    if isinstance(exc, ValidationError):
        return "Validation failed."

    detail = None
    if isinstance(data, Mapping):
        detail = data.get("detail")
    elif isinstance(data, str):
        detail = data

    if detail:
        return str(detail)

    if isinstance(exc, Throttled):
        return "Request was throttled."

    if isinstance(exc, APIException):
        return str(getattr(exc, "detail", "Request failed."))

    return GENERIC_SERVER_ERROR_MESSAGE


def _normalize_errors(data: Any) -> Any:
    if isinstance(data, Mapping):
        if set(data.keys()) == {"detail"}:
            return None
        return data

    if isinstance(data, Sequence) and not isinstance(data, str):
        return data

    return None
