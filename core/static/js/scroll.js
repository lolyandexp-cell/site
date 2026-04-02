document.addEventListener('DOMContentLoaded', () => {
    const chat = document.getElementById('chat');
    const scrollBtn = document.getElementById('scrollToBottomBtn');
    const scrollCount = document.getElementById('scrollBottomCount');

    if (!chat) return;

    function isNearBottom() {
        return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
    }

    function scrollToBottom(force = false) {
        if (force || isNearBottom()) {
            chat.scrollTop = chat.scrollHeight;
        }
    }

    function updateScrollButton() {
        if (!scrollBtn) return;

        if (isNearBottom()) {
            scrollBtn.classList.remove('visible');
            if (scrollCount) {
                scrollCount.classList.remove('visible');
                scrollCount.textContent = '0';
            }
        } else {
            scrollBtn.classList.add('visible');
        }
    }

    scrollBtn?.addEventListener('click', () => {
        scrollToBottom(true);
    });

    chat.addEventListener('scroll', updateScrollButton);

    // при загрузке
    scrollToBottom(true);
});