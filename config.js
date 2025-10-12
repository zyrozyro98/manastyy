// التهيئة الأساسية
const CONFIG = {
    API_BASE: window.location.origin + '/api',
    APP_NAME: 'إديوتك',
    VERSION: '3.0.0',
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    MAX_MESSAGE_LENGTH: 1000,
    AUTO_REFRESH_INTERVAL: 5000, // 5 ثواني
    TYPING_TIMEOUT: 2000, // 2 ثانية
    EMOJIS: ['😀', '😂', '🥰', '😍', '🤩', '😎', '🤔', '🙂', '😊', '😇', '🥳', '😭', '😡', '🤢', '❤️', '🔥', '⭐', '🎉', '👍', '👎']
};

// المتغيرات العامة
let currentUser = null;
let currentConversation = null;
let chatInterval = null;
let connectionManager = null;
let typingTimer = null;
let isTyping = false;

// نظام الإيموجي
const EMOJI_CATEGORIES = {
    smileys: ['😀', '😂', '🥰', '😍', '🤩', '😎', '🤔', '🙂', '😊', '😇'],
    hearts: ['❤️', '💖', '💕', '💞', '💓', '💗', '💘', '💝'],
    objects: ['🔥', '⭐', '🎉', '🎁', '📱', '💻', '📚', '✏️'],
    symbols: ['👍', '👎', '👏', '🙏', '💪', '👀', '👋', '🤝']
};
