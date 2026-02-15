from django.urls import path

from sync.views import SyncConflictActionView, SyncPullView, SyncPushView

urlpatterns = [
    path("push", SyncPushView.as_view(), name="sync-push"),
    path("pull", SyncPullView.as_view(), name="sync-pull"),
    path("conflict-action", SyncConflictActionView.as_view(), name="sync-conflict-action"),
]
