import { escapeHtml, getCookie } from './dom.js';

export function initNotifications(app) {
    ['click', 'keydown', 'touchstart', 'pointerdown'].forEach((eventName) => {
        document.addEventListener(eventName, () => unlockNotificationSound(app), { once: true, passive: true });
        document.addEventListener(eventName, requestBrowserNotificationPermission, { once: true, passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) stopTitleBlink(app);
    });

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                await getServiceWorkerRegistration();
            } catch (error) {
                console.error('Ошибка регистрации service worker:', error);
            }
            updatePushStatusLabel(app);
        });
    } else {
        updatePushStatusLabel(app);
    }

    if (app.refs.enablePushBtn) {
        app.refs.enablePushBtn.addEventListener('click', async () => {
            await enablePushNotifications(app);
            app.closeSettingsMenu();
        });
    }
}

export function unlockNotificationSound(app) {
    const audio = app.refs.notificationSound;
    if (!audio || app.state.soundUnlocked) return;
    audio.muted = true;
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
            app.state.soundUnlocked = true;
        }).catch(() => {
            audio.muted = false;
        });
    }
}

export function requestBrowserNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

export function playNotificationSound(app) {
    const audio = app.refs.notificationSound;
    if (!audio || !document.hidden) return;
    try {
        const sound = audio.cloneNode(true);
        sound.volume = 1;
        sound.currentTime = 0;
        const playPromise = sound.play();
        if (playPromise !== undefined) playPromise.catch(() => {});
    } catch (error) {
        console.error(error);
    }
}

export function showToast(app, title, text, dialogName, dialogUrl) {
    const toastContainer = app.refs.toastContainer;
    if (!toastContainer) return;

    const toast = document.createElement('a');
    toast.className = 'toast';
    toast.href = dialogUrl || '#';
    toast.innerHTML = `
        <div class="toast-title">${escapeHtml(title || 'Новое сообщение')}</div>
        <div class="toast-text">${escapeHtml(text || 'Новое сообщение')}</div>
        ${dialogName ? `<div class="toast-dialog">${escapeHtml(dialogName)}</div>` : ''}
    `;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 220);
    }, 4200);
}

export function showBrowserNotification(dialogName, messageText, dialogUrl) {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
            const notification = new Notification(dialogName || 'Новое сообщение', {
                body: messageText || 'У вас новое сообщение',
                icon: '/static/icons/icon-192.png',
                tag: dialogUrl || (dialogName || 'chat-notification'),
                renotify: true,
            });
            notification.onclick = () => {
                window.focus();
                if (dialogUrl) window.location.href = dialogUrl;
                notification.close();
            };
            setTimeout(() => notification.close(), 6000);
        } catch (error) {
            console.error(error);
        }
    }
}

export function startTitleBlink(app, unreadCount) {
    if (!document.hidden) {
        stopTitleBlink(app);
        return;
    }
    if (app.state.titleBlinkInterval) return;

    const alertTitle = `(${unreadCount}) Новые сообщения`;
    let toggled = false;
    app.state.titleBlinkCount = 0;
    app.state.titleBlinkInterval = setInterval(() => {
        document.title = toggled ? app.config.defaultPageTitle : alertTitle;
        toggled = !toggled;
        app.state.titleBlinkCount += 1;
        if (!document.hidden || app.state.titleBlinkCount > 20) {
            stopTitleBlink(app);
        }
    }, 1000);
}

export function stopTitleBlink(app) {
    if (app.state.titleBlinkInterval) {
        clearInterval(app.state.titleBlinkInterval);
        app.state.titleBlinkInterval = null;
    }
    document.title = app.config.defaultPageTitle;
}

function urlBase64ToUint8Array(base64String) {
    const normalized = (base64String || '').replace(/\s+/g, '');
    const padding = '='.repeat((4 - normalized.length % 4) % 4);
    const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

async function getServiceWorkerRegistration() {
    let registration = await navigator.serviceWorker.getRegistration('/service-worker.js');
    if (!registration) registration = await navigator.serviceWorker.getRegistration();
    if (!registration) registration = await navigator.serviceWorker.register('/service-worker.js');
    return registration;
}

async function saveSubscriptionOnServer(subscription) {
    const response = await fetch('/api/push/subscribe/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
        },
        body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) throw new Error('Не удалось сохранить push-подписку');
    return response.json();
}

export async function updatePushStatusLabel(app) {
    const label = app.refs.pushStatusLabel;
    if (!label) return;

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        label.textContent = 'Не поддерживается';
        label.classList.remove('status-on');
        label.classList.add('status-off');
        return;
    }

    try {
        const registration = await getServiceWorkerRegistration();
        const subscription = await registration.pushManager.getSubscription();
        const isEnabled = Notification.permission === 'granted' && !!subscription;
        label.textContent = isEnabled ? 'Включены' : 'Выключены';
        label.classList.toggle('status-on', isEnabled);
        label.classList.toggle('status-off', !isEnabled);
    } catch {
        label.textContent = 'Ошибка';
        label.classList.remove('status-on');
        label.classList.add('status-off');
    }
}

async function enablePushNotifications(app) {
    try {
        if (!('Notification' in window)) {
            alert('Этот браузер не поддерживает уведомления');
            return;
        }
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('Push-уведомления не поддерживаются в этом браузере');
            return;
        }
        if (!app.config.vapidPublicKey) {
            alert('VAPID ключ не передан из backend');
            return;
        }

        const registration = await getServiceWorkerRegistration();
        let permission = Notification.permission;
        if (permission !== 'granted') permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            await updatePushStatusLabel(app);
            alert('Разрешение на уведомления не выдано');
            return;
        }

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(app.config.vapidPublicKey),
            });
        }

        await saveSubscriptionOnServer(subscription);
        await updatePushStatusLabel(app);
        alert('Push-уведомления включены');
    } catch (error) {
        console.error(error);
        await updatePushStatusLabel(app);
        alert('Не удалось включить push-уведомления');
    }
}
