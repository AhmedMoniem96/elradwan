from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from inventory.models import Category, Product, Warehouse
from inventory.serializers import CategorySerializer, ProductSerializer, WarehouseSerializer


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
