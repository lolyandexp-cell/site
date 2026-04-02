document.addEventListener('DOMContentLoaded', () => {
    const viewer = document.getElementById('imageViewer');
    const img = document.getElementById('imageViewerImg');
    const closeBtn = document.getElementById('imageViewerClose');

    function open(src, alt) {
        if (!viewer || !img) return;
        img.src = src;
        img.alt = alt || '';
        viewer.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function close() {
        if (!viewer || !img) return;
        viewer.classList.remove('open');
        img.src = '';
        img.alt = '';
        document.body.style.overflow = '';
    }

    document.addEventListener('click', (e) => {
        const image = e.target.closest('.chat-image');
        if (!image) return;
        open(image.src, image.alt);
    });

    closeBtn?.addEventListener('click', close);

    viewer?.addEventListener('click', (e) => {
        if (e.target === viewer) close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
});