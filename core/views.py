from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from core.models import Branch, Device
from core.serializers import BranchSerializer, DeviceSerializer


class BranchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated]


class DeviceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated]
