from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL


class StudyGroup(models.Model):
    name = models.CharField(max_length=255, verbose_name='Название группы')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class GroupMember(models.Model):
    class Roles(models.TextChoices):
        ADMIN = 'admin', 'Админ'
        TEACHER = 'teacher', 'Репетитор'
        STUDENT = 'student', 'Ученик'
        PARENT = 'parent', 'Родитель'

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=Roles.choices)

    def __str__(self):
        return f'{self.user} → {self.group} ({self.role})'


class Dialog(models.Model):
    class DialogType(models.TextChoices):
        TEACHER_STUDENT = 'teacher_student', 'Репетитор ↔ Ученик'
        ADMIN_PARENT = 'admin_parent', 'Админ ↔ Родитель'
        ADMIN_TEACHER = 'admin_teacher', 'Админ ↔ Репетитор'

    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE)
    dialog_type = models.CharField(max_length=50, choices=DialogType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.dialog_type} (Group {self.group.id})'


class DialogMember(models.Model):
    dialog = models.ForeignKey(Dialog, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return f'{self.user} in dialog {self.dialog.id}'


class Message(models.Model):
    dialog = models.ForeignKey(Dialog, on_delete=models.CASCADE)
    real_sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='real_messages')
    displayed_sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='displayed_messages')
    text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Message {self.id} in dialog {self.dialog.id}'


class Attachment(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='attachments/%Y/%m/%d/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename

    @property
    def filename(self):
        return self.file.name.split('/')[-1]

    @property
    def extension(self):
        if '.' in self.filename:
            return self.filename.split('.')[-1].lower()
        return ''

    @property
    def is_image(self):
        return self.extension in ['jpg', 'jpeg', 'png', 'gif', 'webp']

    @property
    def is_audio(self):
        return self.extension in ['mp3', 'wav', 'ogg', 'm4a']

    @property
    def is_video(self):
        return self.extension in ['mp4', 'webm', 'mov']

    @property
    def is_pdf(self):
        return self.extension == 'pdf'


class MessageRead(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='reads')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE)
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('message', 'user')


class PushSubscription(models.Model):
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint = models.TextField(unique=True)
    p256dh = models.TextField()
    auth = models.TextField()
    user_agent = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'PushSubscription({self.user_id})'