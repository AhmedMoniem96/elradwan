from rest_framework import serializers

from core.models import Branch, Device


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "code", "name", "timezone", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["id", "branch", "name", "identifier", "last_seen_at", "is_active"]
        read_only_fields = fields
