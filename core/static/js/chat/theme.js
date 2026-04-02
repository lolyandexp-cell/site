export function initTheme(app) {
    const body = app.refs.pageBody;
    const savedTheme = localStorage.getItem('chat_theme') || 'dark';
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(`theme-${savedTheme}`);
    updateThemeUi(app);

    if (app.refs.themeToggleBtn) {
        app.refs.themeToggleBtn.addEventListener('click', () => {
            const nextTheme = body.classList.contains('theme-dark') ? 'light' : 'dark';
            localStorage.setItem('chat_theme', nextTheme);
            body.classList.remove('theme-light', 'theme-dark');
            body.classList.add(`theme-${nextTheme}`);
            updateThemeUi(app);
            app.closeSettingsMenu();
        });
    }
}

function updateThemeUi(app) {
    const isDark = app.refs.pageBody.classList.contains('theme-dark');
    if (app.refs.themeStatusLabel) app.refs.themeStatusLabel.textContent = isDark ? 'Тёмная' : 'Светлая';
    if (app.refs.themeToggleEmoji) app.refs.themeToggleEmoji.textContent = isDark ? '☀️' : '🌙';
    if (app.refs.themeToggleText) app.refs.themeToggleText.textContent = isDark ? 'Переключить на светлую' : 'Переключить на тёмную';
}
