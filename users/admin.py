from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    model = User

    fieldsets = (
        (None, {'fields': ('username', 'password')}),

        ('Личная информация', {
            'fields': ('first_name', 'last_name', 'email', 'display_name')  # ← добавили сюда
        }),

        ('Роль', {'fields': ('role',)}),

        ('Права', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),

        ('Важные даты', {'fields': ('last_login', 'date_joined')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': (
                'username',
                'email',
                'password1',
                'password2',
                'role',
                'display_name',  # ← и сюда тоже
                'is_active',
                'is_staff'
            )
        }),
    )

    list_display = ('id', 'username', 'display_name', 'email', 'role', 'is_staff', 'is_active')  # ← добавили
    list_filter = ('role', 'is_staff', 'is_active')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'display_name')  # ← добавили
    ordering = ('id',)