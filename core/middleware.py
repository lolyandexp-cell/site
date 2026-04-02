from datetime import timedelta
from django.utils import timezone


class LastSeenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            now = timezone.now()

            # Обновляем чаще, чтобы статус "в сети" был живее
            if not user.last_seen or now - user.last_seen > timedelta(seconds=10):
                user.last_seen = now
                user.save(update_fields=['last_seen'])

        return response