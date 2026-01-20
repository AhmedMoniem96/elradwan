from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from sales.models import Customer, Invoice
from sales.serializers import CustomerSerializer, InvoiceSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]
