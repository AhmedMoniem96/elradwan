from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.models import Branch, Device

User = get_user_model()

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password", "first_name", "last_name"]

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
