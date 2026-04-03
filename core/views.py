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

        # имена других участников
        other_names = [
            get_dialog_display_name(user, other_user)
            for other_user in other_users
        ]

        # 🔥 ГЛАВНОЕ: если есть имя диалога — используем его
        if dialog.name and dialog.name.strip():
            dialog_name = dialog.name.strip()
        else:
            if not other_names:
                other_names = [dialog.get_dialog_type_display()]
            dialog_name = " / ".join(other_names)

        # статус показываем только в личке
        dialog_status = ''
        if len(other_users) == 1 and not (dialog.name and dialog.name.strip()):
            dialog_status = get_user_status(other_users[0])

        # последнее сообщение
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

        # непрочитанные
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