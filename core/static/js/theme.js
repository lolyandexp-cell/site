function updateThemeToggleUI() {
    const body = document.getElementById('pageBody');
    const themeStatusLabel = document.getElementById('themeStatusLabel');
    const themeToggleEmoji = document.getElementById('themeToggleEmoji');
    const themeToggleText = document.getElementById('themeToggleText');
    const isDark = body?.classList.contains('theme-dark');

    if (themeStatusLabel) {
        themeStatusLabel.textContent = isDark ? 'Тёмная' : 'Светлая';
    }

    if (themeToggleEmoji) {
        themeToggleEmoji.textContent = isDark ? '☀️' : '🌙';
    }

    if (themeToggleText) {
        themeToggleText.textContent = isDark ? 'Переключить на светлую' : 'Переключить на тёмную';
    }
}

function applySavedTheme() {
    const body = document.getElementById('pageBody');
    if (!body) return;

    const savedTheme = localStorage.getItem('chat_theme') || 'dark';
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(`theme-${savedTheme}`);
    updateThemeToggleUI();
}

function setTheme(theme) {
    localStorage.setItem('chat_theme', theme);
    applySavedTheme();
}

function toggleTheme() {
    const body = document.getElementById('pageBody');
    if (!body) return;

    const nextTheme = body.classList.contains('theme-dark') ? 'light' : 'dark';
    setTheme(nextTheme);
}

function toggleThemeAndClose() {
    toggleTheme();

    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsMenu) {
        settingsMenu.classList.remove('open');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applySavedTheme();

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleThemeAndClose);
    }
});