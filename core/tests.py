from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Branch, Device


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
        ids = {item["id"] for item in response.json()}
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
