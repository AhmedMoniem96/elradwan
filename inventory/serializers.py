from rest_framework import serializers

from inventory.models import Category, Product, Warehouse


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            "id",
            "branch",
            "name",
            "parent",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id",
            "branch",
            "category",
            "sku",
            "barcode",
            "name",
            "price",
            "cost",
            "tax_rate",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ["id", "branch", "name", "is_primary", "is_active", "created_at", "updated_at"]
        read_only_fields = fields
