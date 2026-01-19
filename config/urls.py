from django.urls import include, path

urlpatterns = [
    path("api/v1/sync/", include("sync.urls")),
    path("api/v1/", include("core.urls")),
    path("api/v1/", include("inventory.urls")),
    path("api/v1/", include("sales.urls")),
]
