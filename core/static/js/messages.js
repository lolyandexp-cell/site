document.addEventListener('DOMContentLoaded', () => {
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
});