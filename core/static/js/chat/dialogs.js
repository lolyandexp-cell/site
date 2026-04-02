import { escapeHtml } from './dom.js';
import { playNotificationSound, showToast, showBrowserNotification, startTitleBlink, stopTitleBlink } from './notifications.js';

export function initDialogs(app) {
    if (app.refs.dialogSearch) {
        app.refs.dialogSearch.addEventListener('input', () => applyDialogFilter(app));
    }
    app.loadDialogs = () => loadDialogs(app);
}

function applyDialogFilter(app) {
    const query = (app.refs.dialogSearch?.value || '').toLowerCase().trim();
    document.querySelectorAll('.dialog-item').forEach((item) => {
        const name = item.dataset.name || '';
        const preview = item.dataset.preview || '';
        item.style.display = name.includes(query) || preview.includes(query) ? 'block' : 'none';
    });
}

function renderDialogItem(app, dialog) {
    const unread = Number(dialog.unread || 0);
    const el = document.createElement('a');
    el.href = `/dialogs/${dialog.id}/`;
    el.className = 'dialog-item';
    if (Number(dialog.id) === Number(app.config.currentDialogId)) el.classList.add('active');
    if (unread > 0) el.classList.add('has-new');

    const safeName = escapeHtml(dialog.name || 'Чат');
    const safeMessage = escapeHtml(dialog.last_message || 'Нет сообщений');
    const safeTime = escapeHtml(dialog.last_message_time || '');
    el.dataset.name = String(dialog.name || '').toLowerCase();
    el.dataset.preview = String(dialog.last_message || '').toLowerCase();
    el.innerHTML = `
        <div class="dialog-top">
            <div class="dialog-left">
                <div class="dialog-avatar">${safeName.charAt(0).toUpperCase() || '?'}</div>
                <div class="dialog-name">${safeName}</div>
            </div>
            <div class="dialog-right">
                ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
                <div class="dialog-time">${safeTime}</div>
            </div>
        </div>
        <div class="dialog-preview">${safeMessage}</div>
    `;
    return el;
}

async function loadDialogs(app) {
    const response = await fetch('/api/dialogs/');
    const data = await response.json();
    const dialogs = data.dialogs || [];
    const snapshot = JSON.stringify(dialogs.map((d) => ({
        id: d.id,
        unread: d.unread,
        last_message: d.last_message,
        last_message_time: d.last_message_time,
        name: d.name,
        status: d.status || '',
    })));

    let shouldPlaySound = false;
    let totalUnread = 0;
    const newUnreadMap = {};
    dialogs.forEach((dialog) => {
        const unread = Number(dialog.unread || 0);
        newUnreadMap[dialog.id] = unread;
        totalUnread += unread;
        const previousUnread = app.state.previousUnreadMap[dialog.id] || 0;
        const isNewUnread = app.state.dialogsInitialized && Number(dialog.id) !== Number(app.config.currentDialogId) && unread > previousUnread;
        if (isNewUnread) {
            shouldPlaySound = true;
            const dialogUrl = `/dialogs/${dialog.id}/`;
            showToast(app, dialog.name || 'Новый диалог', dialog.last_message || 'У вас новое сообщение', 'Нажми, чтобы открыть', dialogUrl);
            showBrowserNotification(dialog.name || 'Новое сообщение', dialog.last_message || 'У вас новое сообщение', dialogUrl);
        }
    });

    if (snapshot !== app.state.previousDialogSnapshotString && app.refs.dialogsList) {
        app.refs.dialogsList.innerHTML = '';
        dialogs.forEach((dialog) => app.refs.dialogsList.appendChild(renderDialogItem(app, dialog)));
        app.state.previousDialogSnapshotString = snapshot;
        applyDialogFilter(app);
        app.syncMainDialogTitle();
    }

    if (app.refs.mainDialogSubtitle && app.config.currentDialogId) {
        const current = dialogs.find((dialog) => Number(dialog.id) === Number(app.config.currentDialogId));
        if (current) app.refs.mainDialogSubtitle.textContent = current.status || '';
    }

    if (shouldPlaySound) playNotificationSound(app);
    if (totalUnread > 0) startTitleBlink(app, totalUnread); else stopTitleBlink(app);

    app.state.previousUnreadMap = newUnreadMap;
    app.state.dialogsInitialized = true;
}
