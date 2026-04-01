from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Roles(models.TextChoices):
        ADMIN = 'admin', 'Админ'
        TEACHER = 'teacher', 'Репетитор'
        STUDENT = 'student', 'Ученик'
        PARENT = 'parent', 'Родитель'

    role = models.CharField(
        max_length=20,
        choices=Roles.choices,
        default=Roles.STUDENT,
        verbose_name='Роль'
    )

    last_seen = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Последняя активность'
    )

    def __str__(self):
        return f'{self.username} ({self.get_role_display()})'

    display_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Отображаемое имя'
    )