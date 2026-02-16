from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Branch, Device


class SyncErrorEnvelopeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.branch = Branch.objects.create(code="SY", name="Sync Branch")
        self.user = get_user_model().objects.create_user(
            username="sync-user",
            password="pass1234",
            branch=self.branch,
        )
        self.device = Device.objects.create(branch=self.branch, name="Sync Device", identifier="sync-device")

    def test_unauthenticated_error_uses_standard_envelope(self):
        response = self.client.post(
            "/api/v1/sync/pull",
            {"device_id": str(self.device.id), "cursor": 0, "limit": 5},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "not_authenticated")
        self.assertIn("message", response.json())
        self.assertIn("errors", response.json())
        self.assertEqual(response.json()["status"], 401)

    def test_sync_validation_error_uses_standard_envelope(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/sync/pull",
            {"device_id": str(self.device.id), "cursor": -1, "limit": 5},
            format="json",
        )

        self.assertEqual(response.status_code, 422)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertEqual(payload["message"], "Validation failed.")
        self.assertEqual(payload["status"], 422)
        self.assertIn("cursor", payload["errors"])

    def test_sync_forbidden_device_uses_standard_envelope(self):
        self.client.force_authenticate(user=self.user)
        other_branch = Branch.objects.create(code="SB", name="Secondary Branch")
        other_device = Device.objects.create(branch=other_branch, name="Other Device", identifier="other-device")

        response = self.client.post(
            "/api/v1/sync/pull",
            {"device_id": str(other_device.id), "cursor": 0, "limit": 5},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        payload = response.json()
        self.assertEqual(payload["code"], "forbidden_device")
        self.assertEqual(payload["status"], 403)
        self.assertIn("device_id", payload["errors"])

    def test_sync_device_not_found_uses_standard_envelope(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/sync/pull",
            {"device_id": "00000000-0000-0000-0000-000000000000", "cursor": 0, "limit": 5},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        payload = response.json()
        self.assertEqual(payload["code"], "device_not_found")
        self.assertEqual(payload["status"], 404)
        self.assertIn("device_id", payload["errors"])

    def test_sync_inactive_device_uses_standard_envelope(self):
        self.client.force_authenticate(user=self.user)
        self.device.is_active = False
        self.device.save(update_fields=["is_active"])

        response = self.client.post(
            "/api/v1/sync/pull",
            {"device_id": str(self.device.id), "cursor": 0, "limit": 5},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        payload = response.json()
        self.assertEqual(payload["code"], "device_not_found")
        self.assertEqual(payload["status"], 404)
        self.assertIn("device_id", payload["errors"])

    def test_sync_push_rejections_include_stable_code_and_details(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/sync/push",
            {
                "device_id": str(self.device.id),
                "events": [
                    {
                        "event_id": "11111111-1111-1111-1111-111111111111",
                        "event_type": "customer.upsert",
                        "payload": {
                            "branch_id": "00000000-0000-0000-0000-000000000000",
                            "customer_id": "22222222-2222-2222-2222-222222222222",
                            "name": "Jane",
                        },
                        "created_at": "2025-01-01T12:00:00Z",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["acknowledged"], [])
        self.assertEqual(len(payload["rejected"]), 1)
        rejection = payload["rejected"][0]
        self.assertEqual(rejection["event_id"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(rejection["code"], "validation_failed")
        self.assertEqual(rejection["reason"], "Validation failed.")
        self.assertIn("branch_id", rejection["details"])

