import json
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from pywebpush import webpush, WebPushException

from .models import GroupMember, Dialog, DialogMember, Message, PushSubscription


@receiver(post_save, sender=GroupMember)
def create_dialogs(sender, instance, created, **kwargs):
    if not created:
        return

    user = instance.user
    group = instance.group
    role = instance.role

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
    existing = Dialog.objects.filter(
        group=group,
        dialog_type=dialog_type
    ).distinct()

    for dialog in existing:
        members = set(dialog.dialogmember_set.values_list('user_id', flat=True))
        if set([u.id for u in users]) == members:
            return

    dialog = Dialog.objects.create(
        group=group,
        dialog_type=dialog_type
    )

    for user in users:
        DialogMember.objects.create(dialog=dialog, user=user)


def get_sender_name_for_receiver(receiver, sender):
    if receiver.role in ['student', 'parent']:
        return sender.display_name or sender.username
    return sender.username


def get_message_preview(message):
    if message.text:
        return message.text[:120]

    first_attachment = message.attachments.first()
    if first_attachment:
        if first_attachment.is_image:
            return '📷 Изображение'
        if first_attachment.is_audio:
            return '🎵 Аудио'
        if first_attachment.is_video:
            return '🎬 Видео'
        if first_attachment.is_pdf:
            return '📄 PDF'
        return f'📎 {first_attachment.filename}'

    return 'Новое сообщение'


@receiver(post_save, sender=Message)
def send_push_on_new_message(sender, instance, created, **kwargs):
    if not created:
        return

    if not settings.VAPID_PUBLIC_KEY or not settings.VAPID_PRIVATE_KEY:
        return

    recipients = instance.dialog.dialogmember_set.exclude(
        user=instance.real_sender
    ).select_related('user')

    for member in recipients:
        receiver = member.user
        subscriptions = PushSubscription.objects.filter(user=receiver)

        if not subscriptions.exists():
            continue

        sender_name = get_sender_name_for_receiver(receiver, instance.real_sender)
        message_preview = get_message_preview(instance)

        payload = {
            'title': sender_name,
            'body': message_preview,
            'url': f'/dialogs/{instance.dialog_id}/',
            'dialog_id': instance.dialog_id,
            'tag': f'dialog-{instance.dialog_id}',
            'icon': '/static/icons/icon-192.png',
            'badge': '/static/icons/badge-72.png',
        }

        for sub in subscriptions:
            subscription_info = {
                'endpoint': sub.endpoint,
                'keys': {
                    'p256dh': sub.p256dh,
                    'auth': sub.auth,
                }
            }

            try:
                webpush(
                    subscription_info=subscription_info,
                    data=json.dumps(payload),
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={
                        'sub': settings.VAPID_ADMIN_EMAIL
                    }
                )
            except WebPushException as exc:
                status_code = getattr(exc.response, 'status_code', None)
                if status_code in (404, 410):
                    sub.delete()