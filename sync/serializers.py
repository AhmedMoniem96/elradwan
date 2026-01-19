from rest_framework import serializers


class SyncEventPayloadSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    event_type = serializers.CharField()
    payload = serializers.JSONField()
    created_at = serializers.DateTimeField()


class SyncPushSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    events = SyncEventPayloadSerializer(many=True)


class SyncPullSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    cursor = serializers.IntegerField(min_value=0)
    limit = serializers.IntegerField(min_value=1, max_value=1000, default=500)
