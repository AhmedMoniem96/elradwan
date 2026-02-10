from rest_framework import generics, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView

from core.models import Branch, Device
from core.serializers import (
    BranchSerializer,
    DeviceSerializer,
    EmailOrUsernameTokenObtainPairSerializer,
    UserRegistrationSerializer,
)


def scoped_queryset_for_user(queryset, user):
    if not user.is_authenticated:
        return queryset.none()

    if user.is_superuser:
        return queryset

    if getattr(user, "branch_id", None):
        return queryset.filter(branch_id=user.branch_id)

    return queryset.none()


class RegisterView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]


class EmailOrUsernameTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenObtainPairSerializer


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.is_superuser:
            return queryset
        if getattr(user, "branch_id", None):
            return queryset.filter(id=user.branch_id)
        return queryset.none()


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scoped_queryset_for_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        user = self.request.user
        if not getattr(user, "branch_id", None):
            raise ValidationError("Authenticated user must belong to a branch to create devices.")
        serializer.save(branch_id=user.branch_id)
