import { escapeHtml, getCookie } from './dom.js';

export function initMessages(app) {
    app.updateScrollButtonVisibility = () => updateScrollButtonVisibility(app);
    app.scrollChatToBottom = (force = false) => scrollChatToBottom(app, force);
    app.resetPendingNewMessages = () => resetPendingNewMessages(app);
    app.loadMessages = () => loadMessages(app);
    app.renderMessage = (msg, prevMsg = null, isNew = false) => renderMessage(app, msg, prevMsg, isNew);

    if (app.refs.chat) {
        app.refs.chat.addEventListener('scroll', () => {
            const threshold = 100;
            app.state.isUserNearBottom = app.refs.chat.scrollHeight - app.refs.chat.scrollTop - app.refs.chat.clientHeight < threshold;
            if (app.state.isUserNearBottom) resetPendingNewMessages(app); else updateScrollButtonVisibility(app);
        });
    }

    if (app.refs.scrollToBottomBtn) {
        app.refs.scrollToBottomBtn.addEventListener('click', () => scrollChatToBottom(app));
    }

    document.addEventListener('click', () => closeAllMessageMenus());
    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-menu-trigger]');
        if (trigger) {
            event.stopPropagation();
            toggleMessageMenu(trigger.dataset.menuTrigger);
        }

        const deleteBtn = event.target.closest('[data-delete-message]');
        if (deleteBtn) {
            event.stopPropagation();
            deleteMessage(app, deleteBtn.dataset.deleteMessage);
        }

        const editBtn = event.target.closest('[data-edit-message]');
        if (editBtn) {
            event.stopPropagation();
            editMessage(app, editBtn.dataset.editMessage, editBtn.dataset.messageText || '');
        }
    });
}

function toggleMessageMenu(messageId) {
    const menu = document.getElementById(`message-menu-${messageId}`);
    if (!menu) return;
    const row = menu.closest('.message-row');
    const isOpen = menu.classList.contains('open');
    closeAllMessageMenus();
    if (!isOpen) {
        menu.classList.add('open');
        row?.classList.add('menu-open');
    }
}

export function closeAllMessageMenus() {
    document.querySelectorAll('.message-dropdown.open').forEach((menu) => menu.classList.remove('open'));
    document.querySelectorAll('.message-row.menu-open').forEach((row) => row.classList.remove('menu-open'));
}

function updateScrollButtonVisibility(app) {
    const { chat, scrollToBottomBtn, scrollBottomCount } = app.refs;
    if (!chat || !scrollToBottomBtn) return;
    scrollToBottomBtn.classList.toggle('visible', !app.state.isUserNearBottom && chat.scrollHeight > chat.clientHeight + 100);
    if (scrollBottomCount) {
        scrollBottomCount.textContent = app.state.pendingNewMessagesCount > 99 ? '99+' : String(app.state.pendingNewMessagesCount);
        scrollBottomCount.classList.toggle('visible', app.state.pendingNewMessagesCount > 0);
    }
}

function createNewMessagesDivider() {
    const divider = document.createElement('div');
    divider.className = 'new-messages-divider';
    divider.textContent = 'Новые сообщения';
    return divider;
}

export function ensureNewMessagesDivider(app) {
    if (!app.refs.chat || app.state.newMessagesDivider) return;
    app.state.newMessagesDivider = createNewMessagesDivider();
    app.refs.chat.appendChild(app.state.newMessagesDivider);
}

export function removeNewMessagesDivider(app) {
    if (app.state.newMessagesDivider) {
        app.state.newMessagesDivider.remove();
        app.state.newMessagesDivider = null;
    }
}

function resetPendingNewMessages(app) {
    app.state.pendingNewMessagesCount = 0;
    removeNewMessagesDivider(app);
    updateScrollButtonVisibility(app);
}

function scrollChatToBottom(app, force = false) {
    const { chat } = app.refs;
    if (!chat) return;
    if (force) chat.scrollTop = chat.scrollHeight;
    else chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
    app.state.isUserNearBottom = true;
    resetPendingNewMessages(app);
}

function renderChecks(isRead, time) {
    return `
        <span class="message-status-line">
            <span class="message-time-inline">${escapeHtml(time || '')}</span>
            <span class="message-checks ${isRead ? 'read' : ''}">${isRead ? '✓✓' : '✓'}</span>
        </span>
    `;
}

function renderMessage(app, msg, prevMsg = null, isNew = false) {
    const row = document.createElement('div');
    row.className = `message-row ${msg.is_me ? 'my' : 'other'}`;
    if (isNew) row.classList.add('new-message');
    row.setAttribute('data-message-id', msg.id);
    row.setAttribute('data-displayed-sender-id', msg.displayed_sender_id || '');

    const message = document.createElement('div');
    message.className = 'message';
    const isSameSender = prevMsg && prevMsg.displayed_sender_id === msg.displayed_sender_id && prevMsg.is_me === msg.is_me;
    if (msg.can_edit || msg.can_delete) message.classList.add('has-menu');

    let menuHtml = '';
    if (msg.can_edit || msg.can_delete) {
        menuHtml = `
            <div class="message-menu-wrapper">
                <button type="button" class="menu-trigger" data-menu-trigger="${msg.id}">⋯</button>
                <div class="message-dropdown" id="message-menu-${msg.id}">
                    ${msg.can_edit ? `<button type="button" data-edit-message="${msg.id}" data-message-text="${encodeURIComponent(msg.text || '')}">✏️ Изменить</button>` : ''}
                    ${msg.can_delete ? `<button type="button" class="danger-item" data-delete-message="${msg.id}">🗑 Удалить</button>` : ''}
                </div>
            </div>
        `;
    }

    let metaHtml = '';
    if (!isSameSender) {
        metaHtml = msg.is_me
            ? `<div class="meta">${escapeHtml(msg.sender)}</div>`
            : `<div class="meta">${escapeHtml(msg.sender)} • ${escapeHtml(msg.time)}</div>`;
    }

    let html = `${menuHtml}${metaHtml}`;
    if (msg.text) {
        html += `
            <div class="message-body-inline">
                <span class="message-text">${escapeHtml(msg.text)}</span>
                ${msg.is_me ? renderChecks(!!msg.is_read, msg.time) : ''}
            </div>
        `;
    }

    (msg.attachments || []).forEach((attachment) => {
        const safeUrl = escapeHtml(attachment.url);
        const safeName = escapeHtml(attachment.name);
        if (attachment.is_image) {
            html += `<div class="file"><img src="${safeUrl}" class="chat-image" alt="${safeName}" loading="lazy"></div>`;
        } else if (attachment.is_audio) {
            html += `<div class="file"><div>${safeName}</div><audio controls preload="metadata" src="${safeUrl}"></audio></div>`;
        } else {
            html += `<div class="file"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">📎 ${safeName}</a></div>`;
        }
    });

    if (!msg.text && msg.is_me) html += renderChecks(!!msg.is_read, msg.time);
    message.innerHTML = html;
    row.appendChild(message);
    return row;
}

function buildMessagesSignature(messages) {
    return messages.map((msg) => JSON.stringify({
        id: msg.id,
        text: msg.text || '',
        time: msg.time || '',
        sender: msg.sender || '',
        displayed_sender_id: msg.displayed_sender_id || '',
        is_read: !!msg.is_read,
        attachments: (msg.attachments || []).map((a) => ({
            url: a.url,
            name: a.name,
            is_image: !!a.is_image,
            is_audio: !!a.is_audio,
        })),
    })).join('|');
}

async function loadMessages(app) {
    if (!app.config.currentDialogId || !app.refs.chat) return;
    const response = await fetch(`/api/dialogs/${app.config.currentDialogId}/messages/`);
    if (!response.ok) throw new Error('Ошибка загрузки сообщений');
    const data = await response.json();
    const messages = (data.messages || []).map((msg) => ({ ...msg, is_read: !!msg.is_read }));
    const signature = buildMessagesSignature(messages);
    if (signature === app.state.lastRenderedMessageSignature) {
        updateScrollButtonVisibility(app);
        return;
    }

    const wasNearBottom = app.state.isUserNearBottom;
    removeNewMessagesDivider(app);
    const fragment = document.createDocumentFragment();
    messages.forEach((msg, index) => {
        const prevMsg = index > 0 ? messages[index - 1] : null;
        fragment.appendChild(renderMessage(app, msg, prevMsg, false));
    });
    app.refs.chat.replaceChildren(fragment);
    app.state.lastRenderedMessageSignature = signature;
    if (wasNearBottom) scrollChatToBottom(app, true);
    else updateScrollButtonVisibility(app);
}

async function deleteMessage(app, messageId) {
    if (!window.confirm('Удалить сообщение?')) return;
    const response = await fetch(`/api/messages/${messageId}/delete/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': getCookie('csrftoken') },
    });
    if (!response.ok) throw new Error('Ошибка удаления');
    app.state.lastRenderedMessageSignature = null;
    await loadMessages(app);
    await app.loadDialogs();
}

async function editMessage(app, messageId, encodedText) {
    const currentText = decodeURIComponent(encodedText || '');
    const newText = window.prompt('Редактировать сообщение:', currentText);
    if (newText === null) return;
    const trimmed = newText.trim();
    if (!trimmed) {
        window.alert('Текст сообщения не может быть пустым');
        return;
    }
    const formData = new FormData();
    formData.append('text', trimmed);
    const response = await fetch(`/api/messages/${messageId}/edit/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': getCookie('csrftoken') },
        body: formData,
    });
    if (!response.ok) throw new Error('Ошибка редактирования');
    app.state.lastRenderedMessageSignature = null;
    await loadMessages(app);
    await app.loadDialogs();
}
