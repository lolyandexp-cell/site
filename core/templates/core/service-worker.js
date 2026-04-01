self.addEventListener('push', function(event) {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = {};
    }

    const title = data.title || 'Новое сообщение';
    const options = {
        body: data.body || 'У вас новое сообщение',
        icon: data.icon || '/static/icons/icon-192.png',
        badge: data.badge || '/static/icons/badge-72.png',
        tag: data.tag || 'chat-notification',
        data: {
            url: data.url || '/',
            dialog_id: data.dialog_id || null
        },
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const targetUrl = event.notification.data && event.notification.data.url
        ? event.notification.data.url
        : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});