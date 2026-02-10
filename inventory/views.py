from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser, IsAuthenticated

from common.utils import emit_outbox
from inventory.models import Category, Product, Warehouse
from inventory.serializers import CategorySerializer, ProductSerializer, WarehouseSerializer


class OutboxMutationMixin:
    outbox_entity = None

    def _emit(self, instance, op):
        emit_outbox(
            branch_id=instance.branch_id,
            entity=self.outbox_entity,
            entity_id=instance.id,
            op=op,
            payload=self.get_serializer(instance).data,
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._emit(instance, "upsert")

    def perform_update(self, serializer):
        instance = serializer.save()
        self._emit(instance, "upsert")

    def perform_destroy(self, instance):
        self._emit(instance, "delete")
        instance.delete()


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]


class WarehouseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]


class AdminCategoryViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "category"


class AdminProductViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "product"


class AdminWarehouseViewSet(OutboxMutationMixin, viewsets.ModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAdminUser]
    outbox_entity = "warehouse"
