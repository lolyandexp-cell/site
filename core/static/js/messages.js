document.addEventListener('DOMContentLoaded', () => {
    const chat = document.getElementById('chat');
    if (!chat) return;

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

            const editBtn = row?.querySelector('[data-edit-message]');
            if (editBtn) {
                editBtn.setAttribute('data-message-text', encodeURIComponent(trimmedText));
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

    function renderMessage(msg, prevMsg = null) {
        const row = document.createElement('div');
        row.className = 'message-row ' + (msg.is_me ? 'my' : 'other');
        row.setAttribute('data-message-id', msg.id);
        row.setAttribute('data-displayed-sender-id', msg.displayed_sender_id || '');

        const message = document.createElement('div');
        message.className = 'message';

        const isSameSender =
            prevMsg &&
            prevMsg.displayed_sender_id === msg.displayed_sender_id &&
            prevMsg.is_me === msg.is_me;

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

        let metaHtml = '';
        if (!isSameSender) {
            if (msg.is_me) {
                metaHtml = `<div class="meta">${escapeHtml(msg.sender)}</div>`;
            } else {
                metaHtml = `<div class="meta">${escapeHtml(msg.sender)} • ${escapeHtml(msg.time)}</div>`;
            }
        }

        let html = `
            ${menuHtml}
            ${metaHtml}
        `;

        if (msg.text) {
            html += `
                <div class="message-body-inline">
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

    function buildMessagesSignature(messages) {
        return messages.map(msg => JSON.stringify({
            id: msg.id,
            text: msg.text || '',
            time: msg.time || '',
            sender: msg.sender || '',
            displayed_sender_id: msg.displayed_sender_id || '',
            is_read: !!msg.is_read,
            attachments: (msg.attachments || []).map(a => ({
                url: a.url,
                name: a.name,
                is_image: !!a.is_image,
                is_audio: !!a.is_audio
            }))
        })).join('|');
    }

    function updateExistingMessage(msg) {
        const row = chat.querySelector(`.message-row[data-message-id="${msg.id}"]`);
        if (!row) return false;

        const textNode = row.querySelector('.message-text');
        if (textNode && typeof msg.text !== 'undefined') {
            textNode.textContent = msg.text || '';
        }

        const checks = row.querySelector('.message-checks');
        if (checks) {
            checks.textContent = msg.is_read ? '✓✓' : '✓';
            checks.classList.toggle('read', !!msg.is_read);
        }

        const editBtn = row.querySelector('[data-edit-message]');
        if (editBtn) {
            editBtn.setAttribute('data-message-text', encodeURIComponent(msg.text || ''));
        }

        return true;
    }

    function appendMessage(msg) {
        const rows = Array.from(chat.querySelectorAll('.message-row'));
        const lastMessageEl = rows.length ? rows[rows.length - 1] : null;

        let prevMsg = null;
        if (lastMessageEl) {
            prevMsg = {
                displayed_sender_id: Number(lastMessageEl.getAttribute('data-displayed-sender-id')),
                is_me: lastMessageEl.classList.contains('my')
            };
        }

        const node = renderMessage(msg, prevMsg);
        chat.appendChild(node);
        return node;
    }

    async function loadMessages(dialogId) {
        if (!dialogId) return;

        try {
            const res = await fetch(`/api/dialogs/${dialogId}/messages/`);
            if (!res.ok) throw new Error('Ошибка загрузки сообщений');

            const data = await res.json();
            const messages = (data.messages || []).map(msg => ({
                ...msg,
                is_read: !!msg.is_read
            }));

            const newSignature = buildMessagesSignature(messages);
            if (lastRenderedMessageSignature === newSignature) {
                return;
            }

            const existingRows = Array.from(chat.querySelectorAll('.message-row'));
            const existingIds = new Set(
                existingRows.map(row => Number(row.getAttribute('data-message-id')))
            );

            // если чат пустой или IDs сильно разошлись — мягкая полная сборка
            if (!existingRows.length) {
                const fragment = document.createDocumentFragment();
                messages.forEach((msg, index) => {
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    fragment.appendChild(renderMessage(msg, prevMsg));
                });
                chat.replaceChildren(fragment);
                lastRenderedMessageSignature = newSignature;
                return;
            }

            // сначала обновляем существующие
            messages.forEach(msg => {
                if (existingIds.has(Number(msg.id))) {
                    updateExistingMessage(msg);
                }
            });

            // потом добавляем новые
            messages.forEach(msg => {
                if (!existingIds.has(Number(msg.id))) {
                    appendMessage(msg);
                }
            });

            lastRenderedMessageSignature = newSignature;
        } catch (err) {
            console.error(err);
        }
    }

    document.addEventListener('click', function(event) {
        const trigger = event.target.closest('[data-menu-trigger]');
        if (trigger) {
            event.stopPropagation();
            const messageId = trigger.getAttribute('data-menu-trigger');
            toggleMessageMenuById(messageId);
            return;
        }

        const editBtn = event.target.closest('[data-edit-message]');
        if (editBtn) {
            event.stopPropagation();
            const messageId = editBtn.getAttribute('data-edit-message');
            const messageText = editBtn.getAttribute('data-message-text') || '';
            closeAllMessageMenus();
            editMessage(messageId, messageText);
            return;
        }

        const deleteBtn = event.target.closest('[data-delete-message]');
        if (deleteBtn) {
            event.stopPropagation();
            const messageId = deleteBtn.getAttribute('data-delete-message');
            closeAllMessageMenus();
            deleteMessage(messageId);
            return;
        }

        if (!event.target.closest('.message-menu-wrapper')) {
            closeAllMessageMenus();
        }
    });

    window.ChatMessages = {
        getCookie,
        escapeHtml,
        closeAllMessageMenus,
        toggleMessageMenuById,
        deleteMessage,
        editMessage,
        renderChecks,
        renderMessage,
        buildMessagesSignature,
        loadMessages,
        updateExistingMessage,
        appendMessage,
        resetSignature() {
            lastRenderedMessageSignature = null;
        }
    };
});