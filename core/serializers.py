from rest_framework import serializers
from django.contrib.auth import password_validation
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth import get_user_model
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.models import AuditLog, Branch, Device

User = get_user_model()

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password", "first_name", "last_name"]

    def validate_email(self, value):
        normalized_email = value.strip().lower()
        if normalized_email and User.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalized_email

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
        )
        return user


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = getattr(user, "role", None)
        token["is_superuser"] = user.is_superuser
        token["is_staff"] = user.is_staff
        return token

    def validate(self, attrs):
        username = attrs.get("username", "")
        if username and "@" in username:
            try:
                user = User.objects.get(email__iexact=username)
                attrs["username"] = user.get_username()
            except User.DoesNotExist:
                pass
        return super().validate(attrs)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)

    default_error_messages = {
        "invalid_reset_credentials": "Invalid password reset credentials.",
    }

    def _get_user(self, attrs):
        uid = attrs.get("uid")

        if uid:
            try:
                user_id = force_str(urlsafe_base64_decode(uid))
                return User.objects.filter(pk=user_id).first()
            except (TypeError, ValueError, OverflowError):
                return None

        return None

    def validate(self, attrs):
        token = attrs.get("token", "")
        user = self._get_user(attrs)

        if not user:
            self.fail("invalid_reset_credentials")

        if not default_token_generator.check_token(user, token):
            self.fail("invalid_reset_credentials")

        password_validation.validate_password(attrs["new_password"], user=user)
        attrs["user"] = user
        return attrs

    def save(self):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user

class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "code", "name", "timezone", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["id", "branch", "name", "identifier", "last_seen_at", "is_active"]
        read_only_fields = ["id", "last_seen_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    device_name = serializers.CharField(source="device.name", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_username",
            "branch",
            "branch_name",
            "device",
            "device_name",
            "action",
            "entity",
            "entity_id",
            "before_snapshot",
            "after_snapshot",
            "event_id",
            "request_id",
            "created_at",
        ]
        read_only_fields = fields
