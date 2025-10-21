import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';

// معدل الحد من الطلبات
export const createRateLimit = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            success: false,
            message: message || 'تم تجاوز عدد الطلبات المسموح بها'
        },
        standardHeaders: true,
        legacyHeaders: false
    });
};

// إعدادات معدل الحد المحددة
export const authLimiter = createRateLimit(
    15 * 60 * 1000, // 15 دقيقة
    5, // 5 محاولات فقط
    'تم تجاوز عدد محاولات تسجيل الدخول، يرجى المحاولة بعد 15 دقيقة'
);

export const generalLimiter = createRateLimit(
    15 * 60 * 1000, // 15 دقيقة
    100, // 100 طلب
    'تم تجاوز عدد الطلبات المسموح بها'
);

export const uploadLimiter = createRateLimit(
    60 * 60 * 1000, // ساعة واحدة
    10, // 10 رفع ملفات
    'تم تجاوز عدد رفع الملفات المسموح بها'
);

// إعدادات Helmet للأمان
export const securityHeaders = helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});

// منع هجمات الـ Brute Force
export class BruteForceProtection {
    constructor() {
        this.failedAttempts = new Map();
        this.lockedAccounts = new Map();
    }

    recordFailedAttempt(identifier) {
        const now = Date.now();
        const attempts = this.failedAttempts.get(identifier) || [];
        
        // إضافة المحاولة الفاشلة
        attempts.push(now);
        
        // الاحتفاظ بالمحاولات في آخر 15 دقيقة فقط
        const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
        this.failedAttempts.set(identifier, recentAttempts);
        
        // التحقق إذا تجاوز الحد
        if (recentAttempts.length >= 5) {
            this.lockAccount(identifier);
            return true; // الحساب مغلق الآن
        }
        
        return false;
    }

    lockAccount(identifier) {
        const lockUntil = Date.now() + 30 * 60 * 1000; // 30 دقيقة
        this.lockedAccounts.set(identifier, lockUntil);
        
        // تنظيف تلقائي بعد انتهاء المدة
        setTimeout(() => {
            this.lockedAccounts.delete(identifier);
            this.failedAttempts.delete(identifier);
        }, 30 * 60 * 1000);
    }

    isAccountLocked(identifier) {
        const lockUntil = this.lockedAccounts.get(identifier);
        if (!lockUntil) return false;
        
        if (Date.now() > lockUntil) {
            this.lockedAccounts.delete(identifier);
            this.failedAttempts.delete(identifier);
            return false;
        }
        
        return true;
    }

    getRemainingLockTime(identifier) {
        const lockUntil = this.lockedAccounts.get(identifier);
        if (!lockUntil) return 0;
        
        return Math.max(0, lockUntil - Date.now());
    }

    resetAttempts(identifier) {
        this.failedAttempts.delete(identifier);
        this.lockedAccounts.delete(identifier);
    }
}

// إنشاء نسخة وحيدة
export const bruteForceProtection = new BruteForceProtection();

// middleware للتحقق من Brute Force
export const checkBruteForce = (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress;
    
    if (bruteForceProtection.isAccountLocked(identifier)) {
        const remainingTime = bruteForceProtection.getRemainingLockTime(identifier);
        const minutes = Math.ceil(remainingTime / (60 * 1000));
        
        return res.status(429).json({
            success: false,
            message: `الحساب مؤقتاً مغلق due to multiple failed attempts. يرجى المحاولة بعد ${minutes} دقيقة`,
            code: 'ACCOUNT_LOCKED',
            retryAfter: minutes * 60
        });
    }
    
    next();
};

// التحقق من قوة كلمة المرور
export const validatePasswordStrength = (password) => {
    const requirements = {
        minLength: 6,
        hasNumber: /\d/,
        hasLetter: /[a-zA-Z]/,
        hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/
    };

    const issues = [];

    if (password.length < requirements.minLength) {
        issues.push(`كلمة المرور يجب أن تكون على الأقل ${requirements.minLength} أحرف`);
    }

    if (!requirements.hasNumber.test(password)) {
        issues.push('كلمة المرور يجب أن تحتوي على رقم واحد على الأقل');
    }

    if (!requirements.hasLetter.test(password)) {
        issues.push('كلمة المرور يجب أن تحتوي على حرف واحد على الأقل');
    }

    return {
        isValid: issues.length === 0,
        issues
    };
};

// توليد كلمة مرور قوية
export const generateStrongPassword = (length = 12) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    // التأكد من وجود حرف كبير، صغير، رقم، ورمز خاص
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    // إكمال الباقي
    for (let i = 4; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // خلط الأحرف
    return password.split('').sort(() => 0.5 - Math.random()).join('');
};

// middleware للتحقق من بيانات الإدخال
export const sanitizeInput = (req, res, next) => {
    // تنظيف بيانات الجسم
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
                
                // منع بعض الأحرف الخطرة
                req.body[key] = req.body[key].replace(/[<>]/g, '');
            }
        });
    }
    
    // تنظيف معاملات URL
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].trim().replace(/[<>]/g, '');
            }
        });
    }
    
    next();
};

// middleware للتحقق من نوع المحتوى
export const validateContentType = (req, res, next) => {
    const allowedContentTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data'
    ];
    
    if (req.headers['content-type'] && !allowedContentTypes.some(type => 
        req.headers['content-type'].includes(type)
    )) {
        return res.status(415).json({
            success: false,
            message: 'نوع المحتوى غير مدعوم',
            code: 'UNSUPPORTED_MEDIA_TYPE'
        });
    }
    
    next();
};

// middleware للتحقق من حجم الطلب
export const validatePayloadSize = (maxSize = '10mb') => {
    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length'] || '0');
        const maxSizeBytes = parseMaxSize(maxSize);
        
        if (contentLength > maxSizeBytes) {
            return res.status(413).json({
                success: false,
                message: `حجم الطلب كبير جداً. الحد الأقصى المسموح به هو ${maxSize}`,
                code: 'PAYLOAD_TOO_LARGE'
            });
        }
        
        next();
    };
};

// دالة مساعدة لتحويل الحجم إلى بايت
function parseMaxSize(size) {
    const units = {
        'b': 1,
        'kb': 1024,
        'mb': 1024 * 1024,
        'gb': 1024 * 1024 * 1024
    };
    
    const match = size.match(/^(\d+)\s*([a-z]*)$/i);
    if (!match) return 10 * 1024 * 1024; // 10MB افتراضي
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    return value * (units[unit] || 1);
}

// middleware للتحقق من أصل الطلب (CORS)
export const validateOrigin = (allowedOrigins) => {
    return (req, res, next) => {
        const origin = req.headers.origin;
        
        if (origin && !allowedOrigins.includes(origin)) {
            return res.status(403).json({
                success: false,
                message: 'الأصل غير مسموح به',
                code: 'ORIGIN_NOT_ALLOWED'
            });
        }
        
        next();
    };
};

// تسجيل أحداث الأمان
export const securityLogger = (req, res, next) => {
    const securityEvents = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/admin/',
        '/api/backup/',
        '/api/export/'
    ];
    
    const shouldLog = securityEvents.some(path => req.path.startsWith(path));
    
    if (shouldLog) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.get('User-Agent'),
            userId: req.user?._id || 'anonymous'
        };
        
        console.log('🔒 حدث أمني:', logEntry);
        
        // يمكن حفظ هذا في ملف أو قاعدة بيانات
        const logsDir = './security-logs';
        if (!require('fs').existsSync(logsDir)) {
            require('fs').mkdirSync(logsDir, { recursive: true });
        }
        
        const logFile = `${logsDir}/security-${new Date().toISOString().split('T')[0]}.log`;
        require('fs').appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }
    
    next();
};

export default {
    createRateLimit,
    authLimiter,
    generalLimiter,
    uploadLimiter,
    securityHeaders,
    bruteForceProtection,
    checkBruteForce,
    validatePasswordStrength,
    generateStrongPassword,
    sanitizeInput,
    validateContentType,
    validatePayloadSize,
    validateOrigin,
    securityLogger
};
