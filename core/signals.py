from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import GroupMember, Dialog, DialogMember


@receiver(post_save, sender=GroupMember)
def create_dialogs(sender, instance, created, **kwargs):
    if not created:
        return

    user = instance.user
    group = instance.group
    role = instance.role

    # =========================
    # 1. УЧЕНИК → РЕПЕТИТОР
    # =========================
    if role == GroupMember.Roles.STUDENT:
        teacher_member = GroupMember.objects.filter(
            group=group,
            role=GroupMember.Roles.TEACHER
        ).select_related('user').first()

        if teacher_member:
            create_dialog_if_not_exists(
                group,
                Dialog.DialogType.TEACHER_STUDENT,
                [user, teacher_member.user]
            )

    # =========================
    # 2. РЕПЕТИТОР → АДМИН
    # =========================
    if role == GroupMember.Roles.TEACHER:
        admin_member = GroupMember.objects.filter(
            group=group,
            role=GroupMember.Roles.ADMIN
        ).select_related('user').first()

        if admin_member:
            create_dialog_if_not_exists(
                group,
                Dialog.DialogType.ADMIN_TEACHER,
                [user, admin_member.user]
            )

    # =========================
    # 3. РОДИТЕЛЬ → АДМИН
    # =========================
    if role == GroupMember.Roles.PARENT:
        admin_member = GroupMember.objects.filter(
            group=group,
            role=GroupMember.Roles.ADMIN
        ).select_related('user').first()

        if admin_member:
            create_dialog_if_not_exists(
                group,
                Dialog.DialogType.ADMIN_PARENT,
                [user, admin_member.user]
            )


def create_dialog_if_not_exists(group, dialog_type, users):
    """
    Создаёт диалог, если такого ещё нет
    """

    existing = Dialog.objects.filter(
        group=group,
        dialog_type=dialog_type
    ).distinct()

    for dialog in existing:
        members = set(dialog.dialogmember_set.values_list('user_id', flat=True))
        if set([u.id for u in users]) == members:
            return  # уже есть такой диалог

    dialog = Dialog.objects.create(
        group=group,
        dialog_type=dialog_type
    )

    for user in users:
        DialogMember.objects.create(dialog=dialog, user=user)