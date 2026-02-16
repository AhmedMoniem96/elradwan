from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase, override_settings
from django.core import mail
from rest_framework.test import APIClient
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from unittest.mock import patch

from core.models import AuditLog, Branch, Device


class BranchScopedCoreTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch_a = Branch.objects.create(code="CA", name="Core A")
        self.branch_b = Branch.objects.create(code="CB", name="Core B")

        self.user_a = self.user_model.objects.create_user(
            username="core-user-a",
            password="pass1234",
            branch=self.branch_a,
        )

        self.device_a = Device.objects.create(branch=self.branch_a, name="Device A", identifier="core-dev-a")
        self.device_b = Device.objects.create(branch=self.branch_b, name="Device B", identifier="core-dev-b")

    def test_user_cannot_read_other_branch_devices(self):
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get("/api/v1/devices/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(sorted(payload.keys()), ["count", "next", "previous", "results"])
        ids = {item["id"] for item in payload["results"]}
        self.assertIn(str(self.device_a.id), ids)
        self.assertNotIn(str(self.device_b.id), ids)

    def test_user_create_device_ignores_injected_branch(self):
        self.client.force_authenticate(user=self.user_a)

        response = self.client.post(
            "/api/v1/devices/",
            {
                "branch": str(self.branch_b.id),
                "name": "Injected Branch Device",
                "identifier": "core-new-dev",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = Device.objects.get(id=response.json()["id"])
        self.assertEqual(created.branch_id, self.branch_a.id)


class RolePermissionCoreTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.branch = Branch.objects.create(code="RP", name="Role Perm")
        self.cashier = self.user_model.objects.create_user(
            username="cashier-core",
            password="pass1234",
            branch=self.branch,
            role="cashier",
        )
        self.admin = self.user_model.objects.create_user(
            username="admin-core",
            password="pass1234",
            branch=self.branch,
            role="admin",
        )

    def test_cashier_cannot_manage_device_and_denial_is_logged(self):
        self.client.force_authenticate(user=self.cashier)
        with self.assertLogs("security.authorization", level="WARNING") as cm:
            response = self.client.post(
                "/api/v1/devices/",
                {"name": "Cashier Device", "identifier": "cashier-device", "is_active": True},
                format="json",
            )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(any("permission_denied" in message for message in cm.output))

    def test_admin_can_manage_device(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/devices/",
            {"name": "Admin Device", "identifier": "admin-device", "is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, 201)


class BranchAccessRoleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.branch_a = Branch.objects.create(code="BA", name="Branch A")
        self.branch_b = Branch.objects.create(code="BB", name="Branch B")

        self.admin = self.user_model.objects.create_user(
            username="branch-admin",
            password="pass1234",
            branch=self.branch_a,
            role="admin",
        )
        self.cashier = self.user_model.objects.create_user(
            username="branch-cashier",
            password="pass1234",
            branch=self.branch_a,
            role="cashier",
        )

    def test_admin_can_list_multiple_branches(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/branches/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(sorted(payload.keys()), ["count", "next", "previous", "results"])
        ids = {item["id"] for item in payload["results"]}
        self.assertIn(str(self.branch_a.id), ids)
        self.assertIn(str(self.branch_b.id), ids)

    def test_non_admin_branch_scope_is_preserved(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.get("/api/v1/branches/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(sorted(payload.keys()), ["count", "next", "previous", "results"])
        ids = {item["id"] for item in payload["results"]}
        self.assertIn(str(self.branch_a.id), ids)
        self.assertNotIn(str(self.branch_b.id), ids)


class AuditLogTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.branch = Branch.objects.create(code="AL", name="Audit")
        self.admin = self.user_model.objects.create_user(
            username="audit-admin",
            password="pass1234",
            branch=self.branch,
            role="admin",
        )

    def test_device_create_writes_audit_log(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            "/api/v1/devices/",
            {"name": "Audit Device", "identifier": "audit-device", "is_active": True},
            format="json",
            HTTP_X_REQUEST_ID="req-123",
        )

        self.assertEqual(res.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action="device.create", entity="device", request_id="req-123").exists())

    def test_audit_logs_are_read_only(self):
        self.client.force_authenticate(user=self.admin)
        log = AuditLog.objects.create(action="test.action", entity="test", branch=self.branch, actor=self.admin)

        patch_res = self.client.patch(f"/api/v1/admin/audit-logs/{log.id}/", {"action": "changed"}, format="json")
        delete_res = self.client.delete(f"/api/v1/admin/audit-logs/{log.id}/")

        self.assertEqual(patch_res.status_code, 405)
        self.assertEqual(delete_res.status_code, 405)


class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            username="reset-user",
            email="reset@example.com",
            password="old-pass-123",
        )

    def test_password_reset_request_returns_generic_message_for_known_and_unknown_email(self):
        known_response = self.client.post(
            "/api/v1/password-reset/request/",
            {"email": self.user.email},
            format="json",
        )
        unknown_response = self.client.post(
            "/api/v1/password-reset/request/",
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(known_response.status_code, 200)
        self.assertEqual(unknown_response.status_code, 200)
        self.assertEqual(known_response.json()["detail"], unknown_response.json()["detail"])

    def test_password_reset_confirm_updates_password_with_valid_token(self):
        token = default_token_generator.make_token(self.user)
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        response = self.client.post(
            "/api/v1/password-reset/confirm/",
            {
                "uid": uid,
                "token": token,
                "new_password": "new-safe-pass-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-safe-pass-123"))

    @override_settings(
        PASSWORD_RESET_FRONTEND_URL="https://app.example.com/reset-password",
        PASSWORD_RESET_FROM_EMAIL="support@example.com",
    )
    def test_password_reset_request_sends_clickable_link(self):
        response = self.client.post(
            "/api/v1/password-reset/request/",
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.from_email, "support@example.com")

        token = default_token_generator.make_token(self.user)
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.assertIn(f"https://app.example.com/reset-password/{uid}/", message.body)
        self.assertNotIn("email=", message.body)

    def test_password_reset_confirm_updates_password_with_uid_token(self):
        token = default_token_generator.make_token(self.user)
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))

        response = self.client.post(
            "/api/v1/password-reset/confirm/",
            {
                "uid": uid,
                "token": token,
                "new_password": "new-safe-pass-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-safe-pass-123"))

    def test_password_reset_request_logs_mail_send_failures(self):
        with patch("core.views.send_mail", side_effect=RuntimeError("mail down")):
            with self.assertLogs("core.views", level="ERROR") as logs:
                response = self.client.post(
                    "/api/v1/password-reset/request/",
                    {"email": self.user.email},
                    format="json",
                )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(any("password_reset_email_send_failed" in entry for entry in logs.output))

    def test_password_reset_confirm_rejects_invalid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        response = self.client.post(
            "/api/v1/password-reset/confirm/",
            {
                "uid": uid,
                "token": "invalid-token",
                "new_password": "new-safe-pass-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-pass-123"))

    def test_password_reset_confirm_requires_uid(self):
        token = default_token_generator.make_token(self.user)
        response = self.client.post(
            "/api/v1/password-reset/confirm/",
            {
                "token": token,
                "new_password": "new-safe-pass-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)


class UserRegistrationSerializerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.user_model.objects.create_user(
            username="existing-user",
            email="existing@example.com",
            password="pass1234",
        )

    def test_registration_rejects_case_insensitive_duplicate_email(self):
        response = self.client.post(
            "/api/v1/register/",
            {
                "username": "new-user",
                "email": "EXISTING@example.com",
                "password": "pass12345",
                "first_name": "New",
                "last_name": "User",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"email": ["A user with this email already exists."]})
