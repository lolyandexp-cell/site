from django.utils import timezone
from datetime import timedelta


class LastSeenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            now = timezone.now()

            if not user.last_seen or now - user.last_seen > timedelta(seconds=30):
                user.last_seen = now
                user.save(update_fields=['last_seen'])

        return response