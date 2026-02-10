from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response

from core.models import Device, User


FORBIDDEN_DEVICE_CODE = "forbidden_device"
VALIDATION_FAILED_CODE = "validation_failed"


def validation_failed_response(details: dict[str, Any], *, status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> Response:
    return Response({"code": VALIDATION_FAILED_CODE, "details": details}, status=status_code)


def forbidden_device_response(details: dict[str, Any], *, status_code: int = status.HTTP_403_FORBIDDEN) -> Response:
    return Response({"code": FORBIDDEN_DEVICE_CODE, "details": details}, status=status_code)


def get_permitted_device(user: User, device_id) -> tuple[Device | None, Response | None]:
    """Resolve a device and verify that the user is allowed to use it."""
    device = Device.objects.select_related("branch").filter(id=device_id).first()
    if device is None:
        return None, forbidden_device_response(
            {"device_id": "Device was not found."},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if not device.is_active:
        return None, forbidden_device_response(
            {"device_id": "Device is inactive."},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if _has_admin_override(user):
        return device, None

    if user.branch_id != device.branch_id:
        return None, forbidden_device_response(
            {"device_id": "Device does not belong to the authenticated user branch."}
        )

    return device, None


def _has_admin_override(user: User) -> bool:
    return bool(user and (user.is_superuser or user.role == User.Role.ADMIN))
