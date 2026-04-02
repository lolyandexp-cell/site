document.addEventListener('DOMContentLoaded', () => {
    const settingsTrigger = document.getElementById('settingsTrigger');
    const settingsMenu = document.getElementById('settingsMenu');

    settingsTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu?.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!settingsMenu || !settingsTrigger) return;
        if (!settingsMenu.contains(e.target) && !settingsTrigger.contains(e.target)) {
            settingsMenu.classList.remove('open');
        }
    });
});