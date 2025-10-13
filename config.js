// إعدادات وتكوين التطبيق

const AppConfig = {
    // إعدادات عامة
    appName: "المنصة التعليمية",
    version: "2.0.0",
    environment: "production", // development, production
    
    // إعدادات الدردشة
    chat: {
        maxMessageLength: 1000,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
        typingTimeout: 3000, // 3 seconds
        messageRetention: 30, // days
        maxGroupMembers: 100,
        maxChannelSubscribers: 1000
    },
    
    // إعدادات الـ Stories
    stories: {
        maxDuration: 15000, // 15 seconds
        maxFileSize: 5 * 1024 * 1024, // 5MB
        retentionHours: 24,
        maxStoriesPerUser: 10
    },
    
    // إعدادات الوسائط
    media: {
        maxUploadSize: 20 * 1024 * 1024, // 20MB
        supportedFormats: {
            images: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            videos: ['mp4', 'webm', 'ogg'],
            documents: ['pdf', 'doc', 'docx', 'txt']
        },
        compression: {
            images: {
                maxWidth: 1920,
                maxHeight: 1080,
                quality: 0.8
            }
        }
    },
    
    // إعدادات الأداء
    performance: {
        debounceTime: 300, // ms
        cacheTimeout: 300000, // 5 minutes
        lazyLoading: true,
        virtualScrolling: true
    },
    
    // إعدادات الأمان
    security: {
        passwordMinLength: 8,
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        maxLoginAttempts: 5,
        encryption: true
    },
    
    // إعدادات التخصيص
    customization: {
        themes: ['light', 'dark', 'blue', 'green'],
        languages: ['ar', 'en'],
        rtl: true,
        animations: true
    },
    
    // إعدادات API
    api: {
        baseURL: "https://api.education-platform.com/v1",
        endpoints: {
            auth: {
                login: "/auth/login",
                register: "/auth/register",
                logout: "/auth/logout",
                refresh: "/auth/refresh"
            },
            chat: {
                conversations: "/chat/conversations",
                messages: "/chat/messages",
                groups: "/chat/groups",
                channels: "/chat/channels"
            },
            stories: {
                list: "/stories",
                create: "/stories/create",
                view: "/stories/view"
            },
            media: {
                upload: "/media/upload",
                delete: "/media/delete"
            }
        },
        timeout: 10000 // 10 seconds
    },
    
    // إعدادات الإشعارات
    notifications: {
        enabled: true,
        types: {
            messages: true,
            stories: true,
            groups: true,
            system: true
        },
        sound: true,
        vibration: true
    },
    
    // إعدادات التحليلات
    analytics: {
        enabled: true,
        provider: "google", // google, mixpanel, custom
        trackingId: "UA-XXXXX-Y"
    }
};

// وظائف التهيئة
class ConfigManager {
    constructor() {
        this.config = AppConfig;
        this.userPreferences = this.loadUserPreferences();
    }
    
    loadUserPreferences() {
        const saved = localStorage.getItem('userPreferences');
        return saved ? JSON.parse(saved) : this.getDefaultPreferences();
    }
    
    getDefaultPreferences() {
        return {
            theme: 'light',
            language: 'ar',
            animations: true,
            notifications: true,
            sound: true
        };
    }
    
    saveUserPreferences() {
        localStorage.setItem('userPreferences', JSON.stringify(this.userPreferences));
    }
    
    updatePreference(key, value) {
        this.userPreferences[key] = value;
        this.saveUserPreferences();
        this.applyPreferences();
    }
    
    applyPreferences() {
        // تطبيق السمة
        document.documentElement.setAttribute('data-theme', this.userPreferences.theme);
        
        // تطبيق اللغة
        document.documentElement.lang = this.userPreferences.language;
        
        // تطبيق الحركات
        if (!this.userPreferences.animations) {
            document.documentElement.classList.add('reduce-motion');
        } else {
            document.documentElement.classList.remove('reduce-motion');
        }
    }
    
    // التحقق من دعم المتصفح
    checkBrowserCompatibility() {
        const features = {
            serviceWorker: 'serviceWorker' in navigator,
            pushNotifications: 'PushManager' in window,
            webRTC: 'RTCPeerConnection' in window,
            webGL: 'WebGLRenderingContext' in window,
            fileSystem: 'showOpenFilePicker' in window,
            webShare: 'share' in navigator
        };
        
        return features;
    }
    
    // الحصول على إعدادات البيئة
    getEnvironmentConfig() {
        const env = this.config.environment;
        const envConfigs = {
            development: {
                debug: true,
                logLevel: 'debug',
                apiURL: 'http://localhost:3000/api'
            },
            staging: {
                debug: true,
                logLevel: 'info',
                apiURL: 'https://staging.api.education-platform.com/v1'
            },
            production: {
                debug: false,
                logLevel: 'warn',
                apiURL: 'https://api.education-platform.com/v1'
            }
        };
        
        return { ...this.config, ...envConfigs[env] };
    }
}

// تهيئة مدير الإعدادات
const configManager = new ConfigManager();

// تطبيق الإعدادات عند التحميل
document.addEventListener('DOMContentLoaded', function() {
    configManager.applyPreferences();
});

// تصدير للإستخدام العام
window.AppConfig = AppConfig;
window.configManager = configManager;
