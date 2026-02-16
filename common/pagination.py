from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Shared pagination behavior for list endpoints.

    Clients can tune page size with `?page_size=` but values are capped to keep
    payload sizes predictable.
    """

    page_size_query_param = "page_size"
    max_page_size = 200

