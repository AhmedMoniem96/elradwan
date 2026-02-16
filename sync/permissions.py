from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response

from common.exceptions import error_response
from core.models import Device, User


FORBIDDEN_DEVICE_CODE = "forbidden_device"
DEVICE_NOT_FOUND_CODE = "device_not_found"
VALIDATION_FAILED_CODE = "validation_error"


def _device_error_details(message: str) -> dict[str, list[str]]:
    return {"device_id": [message]}


def validation_failed_response(errors: dict[str, Any], *, status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> Response:
    return error_response(
        code=VALIDATION_FAILED_CODE,
        message="Validation failed.",
        errors=errors,
        status_code=status_code,
    )


def forbidden_device_response(errors: dict[str, Any], *, status_code: int = status.HTTP_403_FORBIDDEN) -> Response:
    code = FORBIDDEN_DEVICE_CODE if status_code == status.HTTP_403_FORBIDDEN else DEVICE_NOT_FOUND_CODE
    message = "Device access is not allowed." if status_code == status.HTTP_403_FORBIDDEN else "Device was not found."
    return error_response(
        code=code,
        message=message,
        errors=errors,
        status_code=status_code,
    )


def resolve_device_for_user(
    user: User,
    device_id,
    *,
    allow_admin_override: bool = True,
) -> tuple[Device | None, str | None, int | None]:
    """Resolve and authorize a device for a user, returning an error message and status code on failure."""
    device = Device.objects.select_related("branch").filter(id=device_id).first()
    if device is None:
        return None, "Device was not found.", status.HTTP_404_NOT_FOUND

    if not device.is_active:
        return None, "Device is inactive.", status.HTTP_404_NOT_FOUND

    if allow_admin_override and _has_admin_override(user):
        return device, None, None

    if user.branch_id != device.branch_id:
        return None, "Device does not belong to the authenticated user branch.", status.HTTP_403_FORBIDDEN

    return device, None, None


def get_permitted_device(user: User, device_id) -> tuple[Device | None, Response | None]:
    """Resolve a device and verify that the user is allowed to use it."""
    device, error_message, status_code = resolve_device_for_user(user, device_id)
    if device is not None:
        return device, None

    return None, forbidden_device_response(_device_error_details(error_message), status_code=status_code)


def _has_admin_override(user: User) -> bool:
    return bool(user and (user.is_superuser or user.role == User.Role.ADMIN))
