from rest_framework import serializers


class SyncEventPayloadSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    event_type = serializers.CharField()
    payload = serializers.JSONField()
    created_at = serializers.DateTimeField()
    client_action = serializers.JSONField(required=False)


class SyncPushSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    events = SyncEventPayloadSerializer(many=True)
    validate_only = serializers.BooleanField(required=False, default=False)


class SyncPullSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    cursor = serializers.IntegerField(min_value=0)
    limit = serializers.IntegerField(min_value=1, max_value=1000, default=500)


class SyncConflictActionSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=["retry_exact", "clone_edit", "discard"])
    event_id = serializers.UUIDField(required=False)
    event_type = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(required=False, allow_blank=True)
    payload_snapshot = serializers.JSONField(required=False)
    details = serializers.JSONField(required=False)
