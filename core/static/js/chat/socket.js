import { ensureNewMessagesDivider } from './messages.js';
import { playNotificationSound } from './notifications.js';

export function initSocket(app) {
    if (!app.config.currentDialogId) return;
    connect(app);
}

function connect(app) {
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    app.state.socket = new WebSocket(`${wsScheme}://${window.location.host}/ws/dialogs/${app.config.currentDialogId}/`);

    app.state.socket.onopen = () => {
        app.state.pollingFallbackActive = false;
        if (app.state.pollingFallbackId) {
            clearInterval(app.state.pollingFallbackId);
            app.state.pollingFallbackId = null;
        }
    };

    app.state.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event_type === 'typing') {
            handleTyping(app, data);
            return;
        }
        if (data.event_type === 'message') {
            handleMessage(app, data.message);
        }
    };

    app.state.socket.onclose = () => {
        if (!app.state.pollingFallbackActive) {
            app.state.pollingFallbackActive = true;
            app.state.pollingFallbackId = setInterval(() => {
                if (!document.hidden) {
                    app.loadMessages().catch(console.error);
                    app.loadDialogs().catch(console.error);
                }
            }, 7000);
            setTimeout(() => connect(app), 2500);
        }
    };

    app.state.socket.onerror = (error) => {
        console.error('WebSocket ошибка', error);
    };
}

function handleTyping(app, data) {
    if (!app.refs.typingIndicator || Number(data.user_id) === Number(app.config.currentUserId)) return;
    app.refs.typingIndicator.textContent = `${data.username} печатает...`;
    if (app.state.typingIndicatorTimeout) clearTimeout(app.state.typingIndicatorTimeout);
    app.state.typingIndicatorTimeout = setTimeout(() => {
        app.refs.typingIndicator.textContent = '';
    }, 2000);
}

function handleMessage(app, message) {
    const msg = {
        ...message,
        sender: ['student', 'parent'].includes(app.config.currentUserRole)
            ? (message.sender_display_name || message.sender_username)
            : message.sender_username,
        is_me: Number(message.real_sender_id) === Number(app.config.currentUserId),
        can_edit: app.config.isAdmin || Number(message.real_sender_id) === Number(app.config.currentUserId),
        can_delete: app.config.isAdmin || Number(message.real_sender_id) === Number(app.config.currentUserId),
        is_read: !!message.is_read,
    };

    if (document.querySelector(`[data-message-id="${msg.id}"]`)) return;
    const rows = app.refs.chat ? Array.from(app.refs.chat.querySelectorAll('.message-row')) : [];
    const last = rows.length ? rows[rows.length - 1] : null;
    const prevMsg = last ? {
        displayed_sender_id: Number(last.getAttribute('data-displayed-sender-id')),
        is_me: last.classList.contains('my'),
    } : null;

    const wasNearBottom = app.state.isUserNearBottom;
    if (app.refs.chat) {
        if (!wasNearBottom && !msg.is_me) ensureNewMessagesDivider(app);
        app.refs.chat.appendChild(app.renderMessage(msg, prevMsg, true));
    }

    if (wasNearBottom || msg.is_me) app.scrollChatToBottom(true);
    else {
        app.state.pendingNewMessagesCount += 1;
        app.updateScrollButtonVisibility();
    }

    if (!msg.is_me) playNotificationSound(app);
    app.loadDialogs().catch(console.error);
    if (msg.attachments?.length) app.state.lastRenderedMessageSignature = null;
}

export function sendTyping(app) {
    if (!app.state.socket || app.state.socket.readyState !== WebSocket.OPEN || app.state.typingThrottleTimeout) return;
    app.state.socket.send(JSON.stringify({ type: 'typing' }));
    app.state.typingThrottleTimeout = setTimeout(() => {
        app.state.typingThrottleTimeout = null;
    }, 1200);
}
