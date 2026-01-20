from django.urls import include, path
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import EmailOrUsernameTokenObtainPairView

urlpatterns = [
    path("api/v1/token/", EmailOrUsernameTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/v1/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/v1/sync/", include("sync.urls")),
    path("api/v1/", include("core.urls")),
    path("api/v1/", include("inventory.urls")),
    path("api/v1/", include("sales.urls")),
]
