from django.contrib import admin
from .models import StudyGroup, GroupMember
from .models import StudyGroup, GroupMember, Dialog, DialogMember, Message, Attachment

@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'message', 'file', 'uploaded_at')

@admin.register(StudyGroup)
class StudyGroupAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'created_at', 'is_active')


@admin.register(GroupMember)
class GroupMemberAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'group', 'role')
    list_filter = ('role',)

from .models import Dialog, DialogMember, Message


@admin.register(Dialog)
class DialogAdmin(admin.ModelAdmin):
    list_display = ('id', 'dialog_type', 'group', 'created_at')


@admin.register(DialogMember)
class DialogMemberAdmin(admin.ModelAdmin):
    list_display = ('id', 'dialog', 'user')


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'dialog', 'real_sender', 'displayed_sender', 'created_at')

