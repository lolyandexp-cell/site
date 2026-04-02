import { escapeHtml } from './dom.js';

export function initFiles(app) {
    const { fileInput, chat } = app.refs;
    if (fileInput) {
        fileInput.addEventListener('change', () => addFilesToSelection(app, fileInput.files, false));
    }
    if (chat) {
        chat.addEventListener('dragover', (event) => event.preventDefault());
        chat.addEventListener('drop', (event) => {
            event.preventDefault();
            if (event.dataTransfer.files?.length) addFilesToSelection(app, event.dataTransfer.files, true);
        });
    }
    renderSelectedFilesPreview(app);
}

export function addFilesToSelection(app, files, append = true) {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;
    app.state.selectedFilesBuffer = append ? [...app.state.selectedFilesBuffer, ...incoming] : incoming;
    syncFileInputWithBuffer(app);
    renderSelectedFilesPreview(app);
}

export function clearSelectedFiles(app) {
    app.state.selectedFilesBuffer = [];
    syncFileInputWithBuffer(app);
    renderSelectedFilesPreview(app);
}

function removeSelectedFile(app, index) {
    app.state.selectedFilesBuffer = app.state.selectedFilesBuffer.filter((_, i) => i !== index);
    syncFileInputWithBuffer(app);
    renderSelectedFilesPreview(app);
}

function syncFileInputWithBuffer(app) {
    if (!app.refs.fileInput) return;
    const dt = new DataTransfer();
    app.state.selectedFilesBuffer.forEach((file) => dt.items.add(file));
    app.refs.fileInput.files = dt.files;
}

function revokePreviewUrls(app) {
    app.refs.selectedFilesPreview?.querySelectorAll('[data-preview-url]').forEach((element) => {
        const url = element.getAttribute('data-preview-url');
        if (url) URL.revokeObjectURL(url);
    });
}

function getFileIcon(file) {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('audio/')) return '🎵';
    if (name.endsWith('.pdf')) return '📄';
    if (name.endsWith('.doc') || name.endsWith('.docx')) return '📝';
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) return '📊';
    if (name.endsWith('.zip') || name.endsWith('.rar')) return '🗜️';
    if (name.endsWith('.txt')) return '📃';
    return '📎';
}

function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let value = size;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function renderSelectedFilesPreview(app) {
    const preview = app.refs.selectedFilesPreview;
    const label = app.refs.selectedFileName;
    if (!preview || !label) return;

    revokePreviewUrls(app);
    preview.innerHTML = '';

    const files = app.state.selectedFilesBuffer;
    if (!files.length) {
        preview.classList.remove('has-files');
        label.textContent = '';
        label.classList.remove('has-file');
        return;
    }

    preview.classList.add('has-files');
    files.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'selected-file-card';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'selected-file-remove';
        removeBtn.setAttribute('aria-label', `Удалить ${file.name}`);
        removeBtn.title = 'Удалить файл';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => removeSelectedFile(app, index));

        let previewTop = '';
        if ((file.type || '').startsWith('image/')) {
            const previewUrl = URL.createObjectURL(file);
            previewTop = `<img src="${previewUrl}" alt="${escapeHtml(file.name)}" class="selected-file-thumb" data-preview-url="${previewUrl}">`;
        } else {
            previewTop = `<div class="selected-file-generic">${getFileIcon(file)}</div>`;
        }

        card.innerHTML = `
            ${previewTop}
            <div class="selected-file-info">
                <div class="selected-file-title">${escapeHtml(file.name)}</div>
                <div class="selected-file-meta">${escapeHtml(formatFileSize(file.size))}</div>
            </div>
        `;
        card.appendChild(removeBtn);
        preview.appendChild(card);
    });

    label.textContent = files.length === 1 ? `Файл: ${files[0].name}` : `Файлов выбрано: ${files.length}`;
    label.classList.add('has-file');
}
