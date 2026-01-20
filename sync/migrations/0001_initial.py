import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SyncEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("event_id", models.UUIDField()),
                ("event_type", models.CharField(max_length=64)),
                ("payload", models.JSONField()),
                ("status", models.CharField(choices=[("accepted", "Accepted"), ("rejected", "Rejected"), ("processed", "Processed")], default="accepted", max_length=16)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.branch")),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.device")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="core.user")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["device", "created_at"], name="syncevent_device_created_idx"),
                    models.Index(fields=["branch", "created_at"], name="syncevent_branch_created_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=["event_id", "device"], name="uniq_syncevent_event_device"),
                ],
            },
        ),
        migrations.CreateModel(
            name="SyncOutbox",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("branch_id", models.UUIDField()),
                ("entity", models.CharField(max_length=64)),
                ("entity_id", models.UUIDField()),
                ("op", models.CharField(max_length=16)),
                ("payload", models.JSONField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["branch_id", "id"], name="syncoutbox_branch_id_idx"),
                    models.Index(fields=["entity", "id"], name="syncoutbox_entity_id_idx"),
                ],
            },
        ),
    ]
