from collections import defaultdict

from django.db import migrations, models
from django.db.models import Q
from django.db.models.functions import Lower


def _normalized(email):
    return (email or "").strip().lower()


def _dedupe_email(email, suffix):
    local, at, domain = email.partition("@")
    if not at:
        return f"{email}+dup{suffix}"
    return f"{local}+dup{suffix}@{domain}"


def normalize_and_resolve_duplicate_emails(apps, schema_editor):
    User = apps.get_model("core", "User")

    users = list(User.objects.exclude(email="").order_by("date_joined", "id"))
    grouped = defaultdict(list)
    for user in users:
        normalized_email = _normalized(user.email)
        if normalized_email:
            grouped[normalized_email].append(user)

    for email, group in grouped.items():
        for index, user in enumerate(group):
            desired_email = email if index == 0 else _dedupe_email(email, index)
            if user.email != desired_email:
                User.objects.filter(pk=user.pk).update(email=desired_email)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_alter_user_options_and_more"),
    ]

    operations = [
        migrations.RunPython(normalize_and_resolve_duplicate_emails, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                Lower("email"),
                condition=~Q(email=""),
                name="core_user_email_ci_unique",
            ),
        ),
    ]
