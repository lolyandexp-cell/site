import json
from datetime import timedelta

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.utils import timezone

from .models import (
    DialogMember,
    Dialog,
    Message,
    Attachment,
    MessageRead,
    PushSubscription,
)

typing_users = {}
TYPING_TIMEOUT_SECONDS = 3


def get_user_status(user):
    if not getattr(user, 'last_seen', None):
        return 'был давно'

    now = timezone.now()
    delta = now - user.last_seen

    if delta <= timedelta(seconds=30):
        return 'в сети'
    elif delta <= timedelta(minutes=1):
        return 'был только что'
    elif delta <= timedelta(minutes=5):
        return 'был недавно'
    else:
        return 'не в сети'


def build_dialogs_for_user(user):
    def get_dialog_display_name(viewer, other_user):
        if viewer.role in ['student', 'parent']:
            return other_user.display_name or other_user.username
        return other_user.username

    dialog_members = DialogMember.objects.filter(user=user).select_related('dialog')

    dialogs = []
    for dm in dialog_members:
        dialog = dm.dialog

        members_for_dialog = list(
            dialog.dialogmember_set.select_related('user')
        )

        other_members = [m for m in members_for_dialog if m.user != user]
        other_users = [m.user for m in other_members]

        other_names = [
            get_dialog_display_name(user, other_user)
            for other_user in other_users
        ]

        if dialog.name and dialog.name.strip():
            dialog_name = dialog.name.strip()
        else:
            if not other_names:
                other_names = [dialog.get_dialog_type_display()]
            dialog_name = " / ".join(other_names)

        dialog_status = ''
        if len(other_users) == 1 and not (dialog.name and dialog.name.strip()):
            dialog_status = get_user_status(other_users[0])

        last_message = Message.objects.filter(dialog=dialog).select_related(
            'displayed_sender'
        ).order_by('-created_at').first()

        last_message_text = ''
        last_message_time = ''
        last_message_timestamp = 0

        if last_message:
            if last_message.text:
                last_message_text = last_message.text[:40]
            elif last_message.attachments.exists():
                first_attachment = last_message.attachments.first()
                last_message_text = f'Файл: {first_attachment.filename}'
            else:
                last_message_text = 'Сообщение'

            last_message_time = last_message.created_at.strftime('%H:%M')
            last_message_timestamp = last_message.created_at.timestamp()

        unread_count = Message.objects.filter(dialog=dialog).exclude(
            reads__user=user
        ).exclude(
            real_sender=user
        ).count()

        dialogs.append({
            'id': dialog.id,
            'name': dialog_name,
            'type': dialog.get_dialog_type_display(),
            'status': dialog_status,
            'last_message': last_message_text,
            'last_message_time': last_message_time,
            'last_message_timestamp': last_message_timestamp,
            'unread': unread_count,
        })

    dialogs.sort(key=lambda d: d['last_message_timestamp'], reverse=True)
    return dialogs


@login_required
def dialog_list(request):
    dialogs = build_dialogs_for_user(request.user)

    return render(request, 'core/chat_layout.html', {
        'dialogs': dialogs,
        'current_dialog': None,
        'messages': [],
        'members': [],
        'vapid_public_key': settings.VAPID_PUBLIC_KEY,
    })


def get_dialog_display_name_for_user(viewer, dialog):
    if dialog.name and dialog.name.strip():
        return dialog.name.strip()

    members = dialog.dialogmember_set.select_related('user')
    other_users = []

    for m in members:
        if m.user == viewer:
            continue

        if viewer.role in ['student', 'parent']:
            other_users.append(m.user.display_name or m.user.username)
        else:
            other_users.append(m.user.username)

    if not other_users:
        return dialog.get_dialog_type_display()

    return " / ".join(other_users)


@login_required
def dialog_detail(request, dialog_id):
    dialog = get_object_or_404(Dialog, id=dialog_id)

    is_member = DialogMember.objects.filter(dialog=dialog, user=request.user).exists()
    if not is_member:
        return render(request, 'core/access_denied.html', status=403)

    dialogs = build_dialogs_for_user(request.user)
    members = DialogMember.objects.filter(dialog=dialog).select_related('user')
    other_member = next((m for m in members if m.user != request.user), None)
    current_dialog_status = ''

    if other_member and not (dialog.name and dialog.name.strip()):
        current_dialog_status = get_user_status(other_member.user)

    # грузим только последние 30 сообщений для первичного HTML
    messages = list(
        Message.objects.filter(dialog=dialog)
        .select_related('real_sender', 'displayed_sender')
        .prefetch_related('attachments')
        .order_by('-id')[:30]
    )[::-1]

    current_dialog_name = get_dialog_display_name_for_user(request.user, dialog)

    return render(request, 'core/chat_layout.html', {
        'dialogs': dialogs,
        'current_dialog': {
            'id': dialog.id,
            'name': current_dialog_name,
            'type': dialog.get_dialog_type_display(),
            'status': current_dialog_status,
        },
        'messages': messages,
        'members': members,
        'vapid_public_key': settings.VAPID_PUBLIC_KEY,
    })


@login_required
def get_messages(request, dialog_id):
    dialog = get_object_or_404(Dialog, id=dialog_id)

    is_member = DialogMember.objects.filter(dialog=dialog, user=request.user).exists()
    if not is_member:
        return JsonResponse({'error': 'forbidden'}, status=403)

    try:
        limit = int(request.GET.get('limit', 30))
    except (TypeError, ValueError):
        limit = 30

    limit = max(1, min(limit, 100))
    before_id = request.GET.get('before_id')

    messages_qs = (
        Message.objects.filter(dialog=dialog)
        .select_related('real_sender', 'displayed_sender')
        .prefetch_related('attachments')
        .order_by('-id')
    )

    if before_id:
        try:
            before_id = int(before_id)
            messages_qs = messages_qs.filter(id__lt=before_id)
        except (TypeError, ValueError):
            return JsonResponse({'error': 'invalid_before_id'}, status=400)

    messages = list(messages_qs[:limit])[::-1]

    for m in messages:
        MessageRead.objects.get_or_create(
            message=m,
            user=request.user
        )

    def get_sender_name(viewer, sender):
        if viewer.role in ['student', 'parent']:
            return sender.display_name or sender.username
        return sender.username

    data = []
    for m in messages:
        attachments = []
        for a in m.attachments.all():
            attachments.append({
                'url': a.file.url,
                'name': a.filename,
                'is_image': a.is_image,
                'is_audio': a.is_audio,
            })

        is_read = m.reads.exclude(user=request.user).exists()

        data.append({
            'id': m.id,
            'text': m.text,
            'sender': get_sender_name(request.user, m.displayed_sender),
            'displayed_sender_id': m.displayed_sender_id,
            'real_sender_id': m.real_sender_id,
            'is_me': m.real_sender_id == request.user.id,
            'is_read': is_read,
            'time': m.created_at.strftime('%H:%M'),
            'attachments': attachments,
            'can_delete': request.user.role == 'admin' or m.real_sender_id == request.user.id,
            'can_edit': request.user.role == 'admin' or m.real_sender_id == request.user.id,
        })

    has_more = False
    if data:
        oldest_loaded_id = data[0]['id']
        has_more = Message.objects.filter(dialog=dialog, id__lt=oldest_loaded_id).exists()

    return JsonResponse({
        'messages': data,
        'has_more': has_more,
    })


@login_required
def get_dialogs(request):
    dialogs = build_dialogs_for_user(request.user)
    return JsonResponse({'dialogs': dialogs})


@login_required
@require_POST
def send_message(request, dialog_id):
    dialog = get_object_or_404(Dialog, id=dialog_id)

    is_member = DialogMember.objects.filter(dialog=dialog, user=request.user).exists()
    if not is_member:
        return JsonResponse({'error': 'forbidden'}, status=403)

    text = (request.POST.get('text') or '').strip()
    uploaded_files = request.FILES.getlist('file')

    displayed_user = request.user

    if request.user.role == 'admin':
        displayed_sender_id = request.POST.get('displayed_sender')
        if displayed_sender_id:
            member = dialog.dialogmember_set.filter(user_id=displayed_sender_id).first()
            if member:
                displayed_user = member.user

    if not text and not uploaded_files:
        return JsonResponse({'error': 'empty_message'}, status=400)

    message = Message.objects.create(
        dialog=dialog,
        real_sender=request.user,
        displayed_sender=displayed_user,
        text=text
    )

    for uploaded_file in uploaded_files:
        Attachment.objects.create(
            message=message,
            file=uploaded_file
        )

    attachments = []
    for a in message.attachments.all():
        attachments.append({
            'url': a.file.url,
            'name': a.filename,
            'is_image': a.is_image,
            'is_audio': a.is_audio,
        })

    return JsonResponse({
        'ok': True,
        'message': {
            'id': message.id,
            'text': message.text,
            'sender': message.displayed_sender.username,
            'is_me': True,
            'time': message.created_at.strftime('%H:%M'),
            'attachments': attachments
        }
    })


@login_required
@require_POST
def delete_message(request, message_id):
    message = get_object_or_404(Message, id=message_id)

    is_member = DialogMember.objects.filter(
        dialog=message.dialog,
        user=request.user
    ).exists()

    if not is_member:
        return JsonResponse({'error': 'forbidden'}, status=403)

    can_delete = (
        request.user.role == 'admin' or
        message.real_sender == request.user
    )

    if not can_delete:
        return JsonResponse({'error': 'forbidden'}, status=403)

    message.delete()
    return JsonResponse({'ok': True})


@login_required
@require_POST
def edit_message(request, message_id):
    message = get_object_or_404(Message, id=message_id)

    is_member = DialogMember.objects.filter(
        dialog=message.dialog,
        user=request.user
    ).exists()

    if not is_member:
        return JsonResponse({'error': 'forbidden'}, status=403)

    can_edit = (
        request.user.role == 'admin' or
        message.real_sender == request.user
    )

    if not can_edit:
        return JsonResponse({'error': 'forbidden'}, status=403)

    new_text = (request.POST.get('text') or '').strip()

    if not new_text:
        return JsonResponse({'error': 'empty_text'}, status=400)

    message.text = new_text
    message.save(update_fields=['text'])

    return JsonResponse({
        'ok': True,
        'message': {
            'id': message.id,
            'text': message.text,
        }
    })


@require_POST
@login_required
def typing(request, dialog_id):
    dialog = get_object_or_404(Dialog, id=dialog_id)

    is_member = DialogMember.objects.filter(dialog=dialog, user=request.user).exists()
    if not is_member:
        return JsonResponse({'error': 'forbidden'}, status=403)

    typing_users[dialog_id] = {
        'username': request.user.username,
        'timestamp': timezone.now().timestamp(),
    }

    return JsonResponse({'status': 'ok'})


@login_required
def get_typing(request, dialog_id):
    data = typing_users.get(dialog_id)

    if not data:
        return JsonResponse({'typing': None})

    username = data.get('username')
    timestamp = data.get('timestamp')

    if not username or not timestamp:
        return JsonResponse({'typing': None})

    now_ts = timezone.now().timestamp()

    if now_ts - timestamp > TYPING_TIMEOUT_SECONDS:
        typing_users.pop(dialog_id, None)
        return JsonResponse({'typing': None})

    if username == request.user.username:
        return JsonResponse({'typing': None})

    return JsonResponse({'typing': username})


@login_required
@require_POST
def save_push_subscription(request):
    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({'error': 'invalid_json'}, status=400)

    endpoint = data.get('endpoint')
    keys = data.get('keys', {})
    p256dh = keys.get('p256dh')
    auth = keys.get('auth')

    if not endpoint or not p256dh or not auth:
        return JsonResponse({'error': 'invalid_subscription'}, status=400)

    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            'user': request.user,
            'p256dh': p256dh,
            'auth': auth,
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
        }
    )

    return JsonResponse({'ok': True})


@login_required
@require_POST
def delete_push_subscription(request):
    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({'error': 'invalid_json'}, status=400)

    endpoint = data.get('endpoint')
    if not endpoint:
        return JsonResponse({'error': 'missing_endpoint'}, status=400)

    PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
    return JsonResponse({'ok': True})


def service_worker(request):
    response = render(request, 'core/service-worker.js', content_type='application/javascript')
    response['Service-Worker-Allowed'] = '/'
    return response


def web_manifest(request):
    return render(request, 'core/manifest.webmanifest', content_type='application/manifest+json')