// config.js - ملف الإعدادات والتكوين للمنصة التعليمية
// GitHub: https://github.com/zyrozyro98/manastyy/blob/main/config.js

const config = {
    // ============ إعدادات التطبيق العامة ============
    APP: {
        NAME: "المنصة التعليمية",
        VERSION: "2.1.0",
        DESCRIPTION: "نظام إدارة تعليمي متكامل ومتطور",
        AUTHOR: "فريق المنصة التعليمية",
        SUPPORT_EMAIL: "support@manastyy.edu",
        WEBSITE: "https://manastyy.edu"
    },

    // ============ إعدادات الخادم ============
    SERVER: {
        PORT: process.env.PORT || 3000,
        HOST: process.env.HOST || 'localhost',
        NODE_ENV: process.env.NODE_ENV || 'development',
        CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000'
    },

    // ============ إعدادات قاعدة البيانات ============
    DATABASE: {
        // إعدادات MongoDB
        MONGODB: {
            URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/manastyy',
            OPTIONS: {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                // إعدادات إضافية للأداء
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000
            }
        },

        // إعدادات Redis (للتخزين المؤقت والجلسات)
        REDIS: {
            HOST: process.env.REDIS_HOST || 'localhost',
            PORT: process.env.REDIS_PORT || 6379,
            PASSWORD: process.env.REDIS_PASSWORD || '',
            DB: process.env.REDIS_DB || 0
        }
    },

    // ============ إعدادات المصادقة والأمان ============
    AUTH: {
        JWT: {
            SECRET: process.env.JWT_SECRET || 'manastyy_educational_platform_secret_key_2024',
            EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
            REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'manastyy_refresh_secret_key_2024',
            REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '90d'
        },

        // إعدادات كلمة المرور
        PASSWORD: {
            SALT_ROUNDS: 12,
            MIN_LENGTH: 6,
            REQUIRE_SPECIAL_CHAR: true,
            REQUIRE_NUMBER: true,
            REQUIRE_UPPERCASE: false
        },

        // إعدادات الجلسات
        SESSION: {
            SECRET: process.env.SESSION_SECRET || 'manastyy_session_secret_2024',
            COOKIE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 ساعة
            HTTP_ONLY: true,
            SECURE: process.env.NODE_ENV === 'production'
        }
    },

    // ============ إعدادات التخزين والملفات ============
    STORAGE: {
        // التخزين المحلي
        LOCAL: {
            UPLOAD_PATH: process.env.UPLOAD_PATH || 'uploads/',
            MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
            ALLOWED_FILE_TYPES: [
                'image/jpeg',
                'image/png',
                'image/gif',
                'application/pdf',
                'video/mp4',
                'audio/mpeg',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ]
        },

        // إعدادات التخزين السحابي (Cloudinary)
        CLOUDINARY: {
            CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
            API_KEY: process.env.CLOUDINARY_API_KEY,
            API_SECRET: process.env.CLOUDINARY_API_SECRET,
            FOLDER: 'manastyy'
        },

        // إعدادات AWS S3
        AWS: {
            ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
            SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
            REGION: process.env.AWS_REGION || 'me-south-1',
            BUCKET_NAME: process.env.AWS_BUCKET_NAME || 'manastyy'
        }
    },

    // ============ إعدادات البريد الإلكتروني ============
    EMAIL: {
        // إعدادات SMTP
        SMTP: {
            HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
            PORT: process.env.SMTP_PORT || 587,
            SECURE: false,
            AUTH: {
                USER: process.env.SMTP_USER,
                PASS: process.env.SMTP_PASS
            }
        },

        // إعدادات SendGrid
        SENDGRID: {
            API_KEY: process.env.SENDGRID_API_KEY,
            FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || 'noreply@manastyy.edu',
            FROM_NAME: 'المنصة التعليمية'
        },

        // قوالب البريد الإلكتروني
        TEMPLATES: {
            WELCOME: 'welcome',
            PASSWORD_RESET: 'password_reset',
            COURSE_INVITATION: 'course_invitation',
            NOTIFICATION: 'notification'
        }
    },

    // ============ إعدادات الدفع ============
    PAYMENT: {
        // إعدادات Stripe
        STRIPE: {
            SECRET_KEY: process.env.STRIPE_SECRET_KEY,
            PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY,
            WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET
        },

        // إعدادات PayPal
        PAYPAL: {
            CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
            CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
            MODE: process.env.PAYPAL_MODE || 'sandbox'
        },

        // العملات المدعومة
        CURRENCIES: ['SAR', 'USD', 'EUR'],
        DEFAULT_CURRENCY: 'SAR'
    },

    // ============ إعدادات الوسائط المتعددة ============
    MEDIA: {
        // إعدادات الفيديو
        VIDEO: {
            MAX_DURATION: 120, // دقائق
            ALLOWED_FORMATS: ['mp4', 'mov', 'avi', 'webm'],
            MAX_SIZE: 500 * 1024 * 1024 // 500MB
        },

        // إعدادات الصوت
        AUDIO: {
            MAX_DURATION: 60, // دقائق
            ALLOWED_FORMATS: ['mp3', 'wav', 'ogg', 'm4a'],
            MAX_SIZE: 50 * 1024 * 1024 // 50MB
        },

        // إعدادات الصور
        IMAGE: {
            MAX_WIDTH: 1920,
            MAX_HEIGHT: 1080,
            ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            MAX_SIZE: 10 * 1024 * 1024 // 10MB
        },

        // إعدادات المستندات
        DOCUMENT: {
            ALLOWED_FORMATS: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'],
            MAX_SIZE: 20 * 1024 * 1024 // 20MB
        }
    },

    // ============ إعدادات الدردشة والوقت الحقيقي ============
    CHAT: {
        // إعدادات Socket.IO
        SOCKET: {
            CORS_ORIGIN: process.env.CLIENT_URL || 'http://localhost:3000',
            PING_TIMEOUT: 60000,
            PING_INTERVAL: 25000
        },

        // إعدادات الرسائل
        MESSAGES: {
            MAX_LENGTH: 1000,
            RATE_LIMIT: {
                WINDOW_MS: 60000, // 1 دقيقة
                MAX_REQUESTS: 60 // 60 رسالة في الدقيقة
            },
            HISTORY_LIMIT: 100 // عدد الرسائل المحفوظة في التاريخ
        },

        // إعدادات المكالمات
        CALLS: {
            MAX_DURATION: 60, // دقائق
            ALLOW_VIDEO: true,
            ALLOW_AUDIO: true,
            MAX_PARTICIPANTS: 10
        }
    },

    // ============ إعدادات الإشعارات ============
    NOTIFICATIONS: {
        // إعدادات الإشعارات الدفعية (Push)
        PUSH: {
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
            SUBJECT: 'mailto:support@manastyy.edu'
        },

        // أنواع الإشعارات
        TYPES: {
            COURSE: 'course',
            CHAT: 'chat',
            SYSTEM: 'system',
            ASSIGNMENT: 'assignment',
            GRADE: 'grade'
        },

        // إعدادات التكرار
        PREFERENCES: {
            EMAIL: true,
            PUSH: true,
            IN_APP: true
        }
    },

    // ============ إعدادات التطوير ============
    DEVELOPMENT: {
        // إعدادات التطوير
        DEBUG: process.env.NODE_ENV !== 'production',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        CORS_ORIGINS: [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://manastyy.vercel.app'
        ],

        // إعدادات الأداء
        PERFORMANCE: {
            COMPRESSION: true,
            CACHE_CONTROL: true,
            ETAG: true
        }
    },

    // ============ إعدادات الإنتاج ============
    PRODUCTION: {
        // إعدادات الأمان
        SECURITY: {
            RATE_LIMIT: {
                WINDOW_MS: 15 * 60 * 1000, // 15 دقيقة
                MAX_REQUESTS: 100 // 100 طلب لكل IP
            },
            HELMET: true,
            CORS: {
                origin: process.env.CLIENT_URL || 'https://manastyy.edu',
                credentials: true
            }
        },

        // إعدادات المراقبة
        MONITORING: {
            ENABLED: true,
            LOG_LEVEL: 'warn',
            METRICS_INTERVAL: 60000 // كل دقيقة
        }
    },

    // ============ إعدادات الميزات ============
    FEATURES: {
        // ميزات الطلاب
        STUDENT: {
            MAX_COURSES: 10,
            MAX_GROUPS: 5,
            ALLOW_FILE_UPLOAD: true,
            ALLOW_VIDEO_CALLS: true
        },

        // ميزات المعلمين
        TEACHER: {
            MAX_COURSES: 20,
            MAX_STUDENTS_PER_COURSE: 100,
            ALLOW_COURSE_CREATION: true,
            ALLOW_ASSIGNMENT_CREATION: true
        },

        // ميزات المسؤولين
        ADMIN: {
            MAX_USERS: 1000,
            ALLOW_SYSTEM_CONFIG: true,
            ALLOW_USER_MANAGEMENT: true
        },

        // الميزات العامة
        GENERAL: {
            ENABLE_CHAT: true,
            ENABLE_VIDEO_CALLS: true,
            ENABLE_FILE_SHARING: true,
            ENABLE_NOTIFICATIONS: true,
            ENABLE_DARK_MODE: true
        }
    },

    // ============ إعدادات المحتوى ============
    CONTENT: {
        // إعدادات الدورات
        COURSES: {
            MAX_TITLE_LENGTH: 100,
            MAX_DESCRIPTION_LENGTH: 1000,
            MAX_LESSONS_PER_COURSE: 50,
            MAX_ASSIGNMENTS_PER_COURSE: 20
        },

        // إعدادات المجموعات
        GROUPS: {
            MAX_NAME_LENGTH: 50,
            MAX_DESCRIPTION_LENGTH: 500,
            MAX_MEMBERS: 50,
            MAX_POSTS_PER_DAY: 10
        },

        // إعدادات القنوات
        CHANNELS: {
            MAX_NAME_LENGTH: 50,
            MAX_DESCRIPTION_LENGTH: 500,
            MAX_SUBSCRIBERS: 1000
        }
    },

    // ============ إعدادات التوطين ============
    LOCALIZATION: {
        DEFAULT_LANGUAGE: 'ar',
        SUPPORTED_LANGUAGES: ['ar', 'en', 'fr'],
        RTL_LANGUAGES: ['ar'],
        
        // تنسيقات التاريخ والوقت
        DATE_FORMATS: {
            ar: 'DD/MM/YYYY',
            en: 'MM/DD/YYYY',
            fr: 'DD/MM/YYYY'
        },
        
        TIME_FORMATS: {
            ar: 'HH:mm',
            en: 'h:mm A',
            fr: 'HH:mm'
        }
    },

    // ============ إعدادات التحليلات ============
    ANALYTICS: {
        // إعدادات Google Analytics
        GOOGLE_ANALYTICS: {
            TRACKING_ID: process.env.GA_TRACKING_ID
        },

        // إعدادات التحليلات الداخلية
        INTERNAL: {
            TRACK_USER_ACTIVITY: true,
            TRACK_COURSE_PROGRESS: true,
            TRACK_SYSTEM_USAGE: true
        }
    },

    // ============ إعدادات النسخ الاحتياطي ============
    BACKUP: {
        ENABLED: process.env.NODE_ENV === 'production',
        SCHEDULE: '0 2 * * *', // كل يوم الساعة 2 صباحاً
        RETENTION_DAYS: 30,
        STORAGE: {
            TYPE: 'local', // local, s3, google-cloud
            PATH: process.env.BACKUP_PATH || 'backups/'
        }
    }
};

// ============ دوال مساعدة ============

// الحصول على الإعدادات بناءً على البيئة
config.getEnvConfig = function() {
    const isProduction = this.SERVER.NODE_ENV === 'production';
    return isProduction ? this.PRODUCTION : this.DEVELOPMENT;
};

// التحقق من صحة الإعدادات
config.validate = function() {
    const requiredEnvVars = [
        'JWT_SECRET',
        'MONGODB_URI'
    ];

    const missingVars = requiredEnvVars.filter(varName => 
        !process.env[varName] && !this.getDefaultValue(varName)
    );

    if (missingVars.length > 0) {
        console.error('❌ متغيرات البيئة المطلوبة مفقودة:', missingVars);
        return false;
    }

    console.log('✅ تم التحقق من إعدادات التطبيق بنجاح');
    return true;
};

// الحصول على القيمة الافتراضية للمتغير
config.getDefaultValue = function(envVarName) {
    const defaults = {
        'JWT_SECRET': this.AUTH.JWT.SECRET,
        'MONGODB_URI': this.DATABASE.MONGODB.URI,
        'PORT': this.SERVER.PORT
    };

    return defaults[envVarName];
};

// الحصول على إعدادات قاعدة البيانات
config.getDatabaseConfig = function() {
    return {
        mongodb: this.DATABASE.MONGODB,
        redis: this.DATABASE.REDIS
    };
};

// الحصول على إعدادات الأمان
config.getSecurityConfig = function() {
    const envConfig = this.getEnvConfig();
    return {
        jwt: this.AUTH.JWT,
        password: this.AUTH.PASSWORD,
        session: this.AUTH.SESSION,
        rateLimit: envConfig.SECURITY?.RATE_LIMIT || {}
    };
};

// الحصول على إعدادات التخزين
config.getStorageConfig = function() {
    return {
        local: this.STORAGE.LOCAL,
        cloudinary: this.STORAGE.CLOUDINARY,
        aws: this.STORAGE.AWS
    };
};

// التحقق إذا كانت البيئة إنتاج
config.isProduction = function() {
    return this.SERVER.NODE_ENV === 'production';
};

// التحقق إذا كانت البيئة تطوير
config.isDevelopment = function() {
    return this.SERVER.NODE_ENV === 'development';
};

// الحصول على عنوان URL الأساسي
config.getBaseUrl = function() {
    return this.SERVER.CLIENT_URL;
};

// تصدير الكائن
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
} else {
    window.AppConfig = config;
}

console.log(`🚀 ${config.APP.NAME} v${config.APP.VERSION} - ${config.SERVER.NODE_ENV}`);
