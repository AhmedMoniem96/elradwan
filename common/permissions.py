import logging

from rest_framework.permissions import BasePermission

from core.models import User

logger = logging.getLogger("security.authorization")

ROLE_CAPABILITY_MATRIX = {
    "sales.dashboard.view": {User.Role.CASHIER, User.Role.SUPERVISOR, User.Role.ADMIN},
    "sales.pos.access": {User.Role.CASHIER, User.Role.SUPERVISOR, User.Role.ADMIN},
    "sales.customers.view": {User.Role.CASHIER, User.Role.SUPERVISOR, User.Role.ADMIN},
    "inventory.view": {User.Role.CASHIER, User.Role.SUPERVISOR, User.Role.ADMIN},
    "sync.view": {User.Role.CASHIER, User.Role.SUPERVISOR, User.Role.ADMIN},
    "device.read": {User.Role.CASHIER, User.Role.SUPERVISOR, User.Role.ADMIN},
    "device.manage": {User.Role.ADMIN},
    "user.manage": {User.Role.ADMIN},
    "admin.records.manage": {User.Role.ADMIN},
    "invoice.void": {User.Role.SUPERVISOR, User.Role.ADMIN},
    "stock.adjust": {User.Role.SUPERVISOR, User.Role.ADMIN},
    "shift.close.self": {User.Role.CASHIER, User.Role.SUPERVISOR, User.Role.ADMIN},
    "shift.close.override": {User.Role.SUPERVISOR, User.Role.ADMIN},
    "stock.transfer.approve": {User.Role.SUPERVISOR, User.Role.ADMIN},
    "stock.transfer.complete": {User.Role.SUPERVISOR, User.Role.ADMIN},
}


def get_user_role(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return User.Role.ADMIN
    role = getattr(user, "role", None)
    if role:
        return role
    if getattr(user, "is_staff", False):
        return User.Role.ADMIN
    return User.Role.CASHIER


def user_has_capability(user, capability):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    allowed_roles = ROLE_CAPABILITY_MATRIX.get(capability)
    if not allowed_roles:
        return False
    return get_user_role(user) in allowed_roles


class RoleCapabilityPermission(BasePermission):
    """Permission class that validates role capability by action/method and logs denied attempts."""

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        capability_map = getattr(view, "permission_action_map", {})
        action_key = getattr(view, "action", None) or request.method.lower()
        capability = capability_map.get(action_key)
        if capability is None:
            return True

        allowed = user_has_capability(request.user, capability)
        if not allowed:
            logger.warning(
                "permission_denied capability=%s user=%s role=%s method=%s path=%s view=%s action=%s",
                capability,
                getattr(request.user, "username", "anonymous"),
                get_user_role(request.user),
                request.method,
                request.path,
                view.__class__.__name__,
                action_key,
            )
        return allowed
