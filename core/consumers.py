import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from channels.db import database_sync_to_async

from .models import Dialog, Message, DialogMember


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.dialog_id = self.scope['url_route']['kwargs']['dialog_id']
        self.room_group_name = f'dialog_{self.dialog_id}'

        user = self.scope["user"]

        if isinstance(user, AnonymousUser):
            await self.close()
            return

        is_member = await self.is_member(user.id)
        if not is_member:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        event_type = data.get('type')

        if event_type == 'typing':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'typing_event',
                    'username': self.scope["user"].username,
                    'display_name': self.scope["user"].display_name,
                    'user_id': self.scope["user"].id,
                }
            )
            return

        if event_type == 'message':
            message_text = (data.get('message') or '').strip()

            if not message_text:
                return

            message_data = await self.create_message(message_text)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'message': message_data,
                }
            )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'event_type': 'message',
            'message': event['message'],
        }))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps({
            'event_type': 'typing',
            'username': event['username'],
            'display_name': event['display_name'],
            'user_id': event['user_id'],
        }))

    @database_sync_to_async
    def is_member(self, user_id):
        return DialogMember.objects.filter(
            dialog_id=self.dialog_id,
            user_id=user_id
        ).exists()

    @database_sync_to_async
    def create_message(self, text):
        user = self.scope["user"]
        dialog = Dialog.objects.get(id=self.dialog_id)

        message = Message.objects.create(
            dialog=dialog,
            real_sender=user,
            displayed_sender=user,
            text=text
        )

        can_manage = user.role == 'admin'

        return {
            'id': message.id,
            'text': message.text,
            'sender_username': user.username,
            'sender_display_name': user.display_name,
            'real_sender_id': user.id,
            'displayed_sender_id': user.id,
            'time': message.created_at.strftime('%H:%M'),
            'attachments': [],
            'can_edit': True if can_manage or message.real_sender_id == user.id else False,
            'can_delete': True if can_manage or message.real_sender_id == user.id else False,
        }