// js/config.js - إعدادات التطبيق
const CONFIG = {
    // إعدادات الخادم
    API_BASE_URL: window.location.origin,
    SOCKET_URL: window.location.origin,
    
    // إعدادات التطبيق
    APP_NAME: 'المنصة التعليمية',
    APP_VERSION: '2.0.0',
    
    // إعدادات الدردشة
    MESSAGE_LIMIT: 50,
    TYPING_TIMEOUT: 2000,
    
    // إعدادات الوسائط
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    ALLOWED_FILE_TYPES: [
        'image/jpeg',
        'image/png', 
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    
    // إعدادات القصص
    STORY_DURATION: 24 * 60 * 60 * 1000, // 24 ساعة
    STORY_VIEW_DURATION: 5000, // 5 ثواني
    
    // إعدادات التخزين
    STORAGE_KEYS: {
        TOKEN: 'edu_platform_token',
        USER: 'edu_platform_user',
        SETTINGS: 'edu_platform_settings'
    },
    
    // إعدادات الواجهة
    THEMES: {
        LIGHT: 'light',
        DARK: 'dark',
        AUTO: 'auto'
    },
    
    // إعدادات الإشعارات
    NOTIFICATION_TIMEOUT: 5000,
    
    // إعدادات الأداء
    DEBOUNCE_DELAY: 300,
    CACHE_TIMEOUT: 5 * 60 * 1000 // 5 دقائق
};

// تصدير الإعدادات للاستخدام العالمي
window.APP_CONFIG = CONFIG;
