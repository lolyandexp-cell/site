from django.contrib import admin
from django.urls import path
from django.contrib.auth import views as auth_views
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView


from core.views import (
    dialog_list, dialog_detail, get_messages, get_dialogs, send_message,
    delete_message, edit_message, typing, get_typing,
    save_push_subscription, delete_push_subscription,
    service_worker, web_manifest
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('login/', auth_views.LoginView.as_view(), name='login'),
    path('', dialog_list, name='dialog_list'),
    path('dialogs/<int:dialog_id>/', dialog_detail, name='dialog_detail'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('api/dialogs/<int:dialog_id>/messages/', get_messages),
    path('api/dialogs/', get_dialogs),
    path('api/dialogs/<int:dialog_id>/send/', send_message),
    path('api/messages/<int:message_id>/delete/', delete_message),
    path('api/messages/<int:message_id>/edit/', edit_message),
    path('api/dialogs/<int:dialog_id>/typing/', typing),
    path('api/dialogs/<int:dialog_id>/typing/get/', get_typing),
    path('api/push/subscribe/', save_push_subscription),
    path('api/push/unsubscribe/', delete_push_subscription),
    path('service-worker.js', service_worker, name='service_worker'),
    path('manifest.webmanifest', web_manifest, name='web_manifest'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
