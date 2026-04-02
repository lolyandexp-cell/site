import { qs } from './dom.js';
import { initTheme } from './theme.js';
import { initNotifications } from './notifications.js';
import { initFiles, clearSelectedFiles } from './files.js';
import { initMessages } from './messages.js';
import { initDialogs } from './dialogs.js';
import { initSocket, sendTyping } from './socket.js';
import { getCookie } from './dom.js';

const ChatApp = {
    config: readConfig(),
    refs: {},
    state: {
        socket: null,
        isUserNearBottom: true,
        lastRenderedMessageSignature: null,
        typingIndicatorTimeout: null,
        typingThrottleTimeout: null,
        pendingNewMessagesCount: 0,
        newMessagesDivider: null,
        selectedFilesBuffer: [],
        previousUnreadMap: {},
        previousDialogSnapshotString: '',
        dialogsInitialized: false,
        soundUnlocked: false,
        titleBlinkInterval: null,
        titleBlinkCount: 0,
        pollingFallbackActive: false,
        pollingFallbackId: null,
    },

    init() {
        this.cacheRefs();
        this.bindUiShell();
        initTheme(this);
        initNotifications(this);
        initDialogs(this);
        if (this.config.currentDialogId) {
            initMessages(this);
            initFiles(this);
            this.restoreDraft();
            this.autoResizeTextarea();
            this.syncMainDialogTitle();
            this.bindComposer();
            initSocket(this);
            this.loadMessages().catch(console.error);
            window.addEventListener('load', () => {
                this.syncMainDialogTitle();
                this.scrollChatToBottom(true);
                this.focusMessageInput();
            });
        }
        this.loadDialogs().catch(console.error);
        setInterval(() => this.loadDialogs().catch(console.error), 5000);
    },

    cacheRefs() {
        this.refs = {
            pageBody: qs('#pageBody'),
            settingsTrigger: qs('#settingsTrigger'),
            settingsMenu: qs('#settingsMenu'),
            dialogSearch: qs('#dialogSearch'),
            notificationSound: qs('#notificationSound'),
            toastContainer: qs('#toastContainer'),
            pushStatusLabel: qs('#pushStatusLabel'),
            enablePushBtn: qs('#enablePushBtn'),
            imageViewer: qs('#imageViewer'),
            imageViewerImg: qs('#imageViewerImg'),
            imageViewerClose: qs('#imageViewerClose'),
            dialogsList: qs('#dialogsList'),
            chat: qs('#chat'),
            messageInput: qs('#messageInput'),
            messageForm: qs('#messageForm'),
            fileInput: qs('#fileInput'),
            selectedFileName: qs('#selectedFileName'),
            selectedFilesPreview: qs('#selectedFilesPreview'),
            typingIndicator: qs('#typingIndicator'),
            mainDialogTitle: qs('#mainDialogTitle'),
            mainDialogSubtitle: qs('#mainDialogSubtitle'),
            scrollToBottomBtn: qs('#scrollToBottomBtn'),
            scrollBottomCount: qs('#scrollBottomCount'),
            themeToggleBtn: qs('#themeToggleBtn'),
            themeStatusLabel: qs('#themeStatusLabel'),
            themeToggleEmoji: qs('#themeToggleEmoji'),
            themeToggleText: qs('#themeToggleText'),
        };
    },

    bindUiShell() {
        this.updateViewportHeightVar();
        window.addEventListener('resize', () => this.updateViewportHeightVar());
        window.addEventListener('orientationchange', () => this.updateViewportHeightVar());
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.updateViewportHeightVar());
            window.visualViewport.addEventListener('scroll', () => this.updateViewportHeightVar());
        }

        this.refs.settingsTrigger?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.refs.settingsMenu?.classList.toggle('open');
        });

        document.addEventListener('click', (event) => {
            if (!this.refs.settingsMenu || !this.refs.settingsTrigger) return;
            if (!this.refs.settingsMenu.contains(event.target) && !this.refs.settingsTrigger.contains(event.target)) {
                this.closeSettingsMenu();
            }
        });

        document.addEventListener('click', (event) => {
            const image = event.target.closest('.chat-image');
            if (!image) return;
            this.openImageViewer(image.src, image.alt);
        });
        this.refs.imageViewerClose?.addEventListener('click', () => this.closeImageViewer());
        this.refs.imageViewer?.addEventListener('click', (event) => {
            if (event.target === this.refs.imageViewer) this.closeImageViewer();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeImageViewer();
                this.closeSettingsMenu();
            }
        });
    },

    bindComposer() {
        this.refs.messageInput?.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.saveDraft();
            sendTyping(this);
        });
        this.refs.messageInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage().catch(console.error);
            }
        });
        this.refs.messageForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.sendMessage().catch(console.error);
        });
    },

    async sendMessage() {
        const text = this.refs.messageInput?.value.trim() || '';
        const hasFiles = this.state.selectedFilesBuffer.length > 0;
        if (!text && !hasFiles) return;

        if (hasFiles) {
            const formData = new FormData();
            formData.append('text', text);
            this.state.selectedFilesBuffer.forEach((file) => formData.append('file', file));
            const response = await fetch(`/api/dialogs/${this.config.currentDialogId}/send/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCookie('csrftoken') },
                body: formData,
            });
            if (!response.ok) throw new Error('Ошибка отправки файла');
            this.afterSuccessfulSend(true);
            return;
        }

        if (this.state.socket && this.state.socket.readyState === WebSocket.OPEN) {
            this.state.socket.send(JSON.stringify({ type: 'message', message: text }));
            this.afterSuccessfulSend(false);
            return;
        }

        const formData = new FormData();
        formData.append('text', text);
        const response = await fetch(`/api/dialogs/${this.config.currentDialogId}/send/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
            body: formData,
        });
        if (!response.ok) throw new Error('Ошибка отправки');
        this.afterSuccessfulSend(true);
    },

    afterSuccessfulSend(reloadMessages) {
        if (this.refs.messageInput) {
            this.refs.messageInput.value = '';
            this.autoResizeTextarea();
        }
        localStorage.removeItem(this.draftStorageKey());
        clearSelectedFiles(this);
        this.scrollChatToBottom(true);
        this.focusMessageInput();
        if (reloadMessages) {
            this.state.lastRenderedMessageSignature = null;
            this.loadMessages().catch(console.error);
            this.loadDialogs().catch(console.error);
        }
    },

    saveDraft() {
        if (!this.refs.messageInput || !this.config.currentDialogId) return;
        const value = this.refs.messageInput.value || '';
        if (value.trim()) localStorage.setItem(this.draftStorageKey(), value);
        else localStorage.removeItem(this.draftStorageKey());
    },

    restoreDraft() {
        const savedDraft = localStorage.getItem(this.draftStorageKey());
        if (savedDraft && this.refs.messageInput) this.refs.messageInput.value = savedDraft;
    },

    autoResizeTextarea() {
        if (!this.refs.messageInput) return;
        this.refs.messageInput.style.height = 'auto';
        this.refs.messageInput.style.height = `${Math.min(this.refs.messageInput.scrollHeight, 220)}px`;
    },

    draftStorageKey() {
        return `chat_draft_${this.config.currentDialogId}`;
    },

    focusMessageInput() {
        if (!this.refs.messageInput || window.innerWidth <= 768) return;
        this.refs.messageInput.focus();
        const length = this.refs.messageInput.value.length;
        this.refs.messageInput.setSelectionRange(length, length);
    },

    syncMainDialogTitle() {
        const activeName = document.querySelector('.dialog-item.active .dialog-name');
        if (activeName && this.refs.mainDialogTitle) this.refs.mainDialogTitle.textContent = activeName.textContent.trim();
    },

    updateViewportHeightVar() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    },

    openImageViewer(src, alt) {
        if (!this.refs.imageViewer || !this.refs.imageViewerImg || !src) return;
        this.refs.imageViewerImg.src = src;
        this.refs.imageViewerImg.alt = alt || '';
        this.refs.imageViewer.classList.add('open');
        document.body.style.overflow = 'hidden';
    },

    closeImageViewer() {
        if (!this.refs.imageViewer || !this.refs.imageViewerImg) return;
        this.refs.imageViewer.classList.remove('open');
        this.refs.imageViewerImg.src = '';
        this.refs.imageViewerImg.alt = '';
        document.body.style.overflow = '';
    },

    closeSettingsMenu() {
        this.refs.settingsMenu?.classList.remove('open');
    },
};

function readConfig() {
    const node = document.getElementById('chat-config');
    if (!node) return {};

    return {
        currentDialogId: node.dataset.currentDialogId
            ? Number(node.dataset.currentDialogId)
            : null,

        currentUserId: node.dataset.currentUserId
            ? Number(node.dataset.currentUserId)
            : null,

        currentUserRole: node.dataset.currentUserRole || '',

        isAdmin: node.dataset.isAdmin === 'true',

        vapidPublicKey: node.dataset.vapidPublicKey || '',

        defaultPageTitle: node.dataset.defaultPageTitle || document.title,
    };
}

ChatApp.init();
export default ChatApp;
