const chat = document.getElementById('chat');

if (chat) {
    const body = document.getElementById('pageBody');
    const currentUserId = body?.dataset.currentUserId ? Number(body.dataset.currentUserId) : null;
    const isAdmin = body?.dataset.isAdmin === 'true';

    let lastRenderedMessageSignature = null;

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeMessage(msg) {
        const realSenderId = Number(
            msg.real_sender_id ||
            msg.sender_id ||
            (msg.real_sender && msg.real_sender.id) ||
            0
        ) || null;

        const isMe = typeof msg.is_me !== 'undefined'
            ? !!msg.is_me
            : (realSenderId !== null && currentUserId !== null && realSenderId === currentUserId);

        const canManage = isAdmin || isMe;

        return {
            ...msg,
            real_sender_id: realSenderId,
            is_me: isMe,
            can_edit: typeof msg.can_edit !== 'undefined' ? !!msg.can_edit : canManage,
            can_delete: typeof msg.can_delete !== 'undefined' ? !!msg.can_delete : canManage,
            is_read: !!msg.is_read,
        };
    }

    function closeAllMessageMenus() {
        document.querySelectorAll('.message-dropdown.open').forEach(menu => {
            menu.classList.remove('open');
        });
        document.querySelectorAll('.message-row.menu-open').forEach(row => {
            row.classList.remove('menu-open');
        });
    }

    function toggleMessageMenuById(messageId) {
        const menu = document.getElementById(`message-menu-${messageId}`);
        if (!menu) return;

        const row = menu.closest('.message-row');
        const isOpen = menu.classList.contains('open');

        closeAllMessageMenus();

        if (!isOpen) {
            menu.classList.add('open');
            if (row) row.classList.add('menu-open');
        }
    }

    async function deleteMessage(messageId) {
        if (!confirm('Удалить сообщение?')) return;

        try {
            const res = await fetch(`/api/messages/${messageId}/delete/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCookie('csrftoken') }
            });

            if (!res.ok) throw new Error('Ошибка удаления');

            const row = document.querySelector(`.message-row[data-message-id="${messageId}"]`);
            if (row) row.remove();

            lastRenderedMessageSignature = null;
        } catch (err) {
            console.error(err);
        }
    }

    async function editMessage(messageId, encodedText) {
        const currentText = decodeURIComponent(encodedText || '');
        const newText = prompt('Редактировать сообщение:', currentText);

        if (newText === null) return;

        const trimmedText = newText.trim();
        if (!trimmedText) {
            alert('Текст сообщения не может быть пустым');
            return;
        }

        const formData = new FormData();
        formData.append('text', trimmedText);

        try {
            const res = await fetch(`/api/messages/${messageId}/edit/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCookie('csrftoken') },
                body: formData
            });

            if (!res.ok) throw new Error('Ошибка редактирования');

            const row = document.querySelector(`.message-row[data-message-id="${messageId}"]`);
            const textNode = row?.querySelector('.message-text');
            if (textNode) {
                textNode.textContent = trimmedText;
            }

            lastRenderedMessageSignature = null;
        } catch (err) {
            console.error(err);
        }
    }

    function renderChecks(isRead, time) {
        return `
            <span class="message-status-line">
                <span class="message-time-inline">${escapeHtml(time || '')}</span>
                <span class="message-checks ${isRead ? 'read' : ''}">
                    ${isRead ? '✓✓' : '✓'}
                </span>
            </span>
        `;
    }

   function renderMessage(rawMsg, prevMsg = null) {
        const msg = normalizeMessage(rawMsg);

        const row = document.createElement('div');
        row.className = 'message-row ' + (msg.is_me ? 'my' : 'other');
        row.setAttribute('data-message-id', msg.id);
        row.setAttribute('data-displayed-sender-id', msg.displayed_sender_id || '');

        const message = document.createElement('div');
        message.className = 'message';

        if (msg.can_edit || msg.can_delete) {
            message.classList.add('has-menu');
        }

        let menuHtml = '';
        if (msg.can_edit || msg.can_delete) {
            const encodedText = encodeURIComponent(msg.text || '');
            menuHtml = `
                <div class="message-menu-wrapper">
                    <button type="button" class="menu-trigger" data-menu-trigger="${msg.id}">⋯</button>
                    <div class="message-dropdown" id="message-menu-${msg.id}">
                        ${msg.can_edit ? `
                            <button type="button" data-edit-message="${msg.id}" data-message-text="${encodedText}">
                                ✏️ Изменить
                            </button>
                        ` : ''}
                        ${msg.can_delete ? `
                            <button type="button" class="danger-item" data-delete-message="${msg.id}">
                                🗑 Удалить
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        const senderName =
            msg.sender_display_name ||
            msg.sender_username ||
            msg.sender ||
            'Пользователь';

        let metaHtml = '';
        if (msg.is_me) {
            metaHtml = `<div class="meta">${escapeHtml(senderName)}</div>`;
        } else {
            metaHtml = `<div class="meta">${escapeHtml(senderName)} • ${escapeHtml(msg.time || '')}</div>`;
        }

        let html = `
            ${menuHtml}
            ${metaHtml}
        `;

        if (msg.text) {
            html += `
                <div class="message-content-inline">
                    <span class="message-text">${escapeHtml(msg.text)}</span>
                    ${msg.is_me ? renderChecks(!!msg.is_read, msg.time) : ''}
                </div>
            `;
        } else if (msg.is_me) {
            html += renderChecks(!!msg.is_read, msg.time);
        }

        (msg.attachments || []).forEach(a => {
            const safeUrl = escapeHtml(a.url);
            const safeName = escapeHtml(a.name);

            if (a.is_image) {
                html += `<div class="file"><img src="${safeUrl}" class="chat-image" alt="${safeName}" loading="lazy"></div>`;
            } else if (a.is_audio) {
                html += `<div class="file"><div>${safeName}</div><audio controls preload="metadata" src="${safeUrl}"></audio></div>`;
            } else {
                html += `<div class="file"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">📎 ${safeName}</a></div>`;
            }
        });

        message.innerHTML = html;
        row.appendChild(message);
        return row;
    }

    function appendMessage(msg) {
        const node = renderMessage(msg);
        chat.appendChild(node);
    }

    async function loadMessages(dialogId) {
        const res = await fetch(`/api/dialogs/${dialogId}/messages/`);
        const data = await res.json();

        chat.innerHTML = '';
        (data.messages || []).forEach(msg => appendMessage(msg));
    }

    // =========================
    // 🔥 ОТПРАВКА СООБЩЕНИЙ
    // =========================

    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');

    function sendMessage() {
        if (!messageInput) return;

        const text = messageInput.value.trim();
        if (!text) return;

        if (!window.chatSocket || window.chatSocket.readyState !== WebSocket.OPEN) {
            console.log('Socket not ready');
            return;
        }

        window.chatSocket.send(JSON.stringify({
            type: 'message',
            message: text
        }));

        messageInput.value = '';
        messageInput.style.height = 'auto';
    }

    if (messageForm) {
        messageForm.addEventListener('submit', function (e) {
            e.preventDefault();
            sendMessage();
        });
    }

    if (messageInput) {
        messageInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // =========================

    window.ChatMessages = {
        loadMessages,
        appendMessage
    };
}