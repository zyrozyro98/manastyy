import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

// حل مشكلة __dirname في ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    }
});

// إعدادات البيئة
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-2024-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';
const BACKUP_DIR = path.join(__dirname, 'backups');
const EXPORT_DIR = path.join(__dirname, 'exports');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// إنشاء المجلدات اللازمة
const requiredDirs = [
    UPLOAD_DIR, 
    path.join(UPLOAD_DIR, 'profiles'), 
    path.join(UPLOAD_DIR, 'stories'), 
    path.join(UPLOAD_DIR, 'channels'), 
    path.join(UPLOAD_DIR, 'files'), 
    BACKUP_DIR, 
    EXPORT_DIR,
    path.join(__dirname, 'public')
];

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 تم إنشاء المجلد: ${dir}`);
    }
});

// إعداد trust proxy لـ Render
app.set('trust proxy', 1);

// وسائط الأمان والتحسين
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
}));
app.use(compression());
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: NODE_ENV === 'production' ? 100 : 1000,
    message: {
        success: false,
        message: 'تم تجاوز عدد الطلبات المسموح بها، يرجى المحاولة لاحقاً'
    }
});
app.use(limiter);

// وسائط middleware الأساسية
app.use(cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/exports', express.static(EXPORT_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// إعداد multer للتحميلات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = UPLOAD_DIR;
        if (file.fieldname === 'avatar') uploadPath = path.join(UPLOAD_DIR, 'profiles');
        else if (file.fieldname === 'story') uploadPath = path.join(UPLOAD_DIR, 'stories');
        else if (file.fieldname === 'channelAvatar') uploadPath = path.join(UPLOAD_DIR, 'channels');
        else if (file.fieldname === 'file') uploadPath = path.join(UPLOAD_DIR, 'files');
        else if (file.fieldname === 'backup') uploadPath = BACKUP_DIR;
        
        // التأكد من وجود المجلد
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const fileExt = path.extname(file.originalname);
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
        cb(null, fileName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        'avatar': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'story': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'],
        'channelAvatar': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'file': ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        'backup': ['application/json']
    };
    
    if (allowedTypes[file.fieldname]?.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`نوع الملف غير مدعوم للمجال: ${file.fieldname}`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    },
    fileFilter: fileFilter
});

// نظام التخزين المحلي والنسخ الاحتياطي
class LocalStorageService {
    constructor() {
        this.dataFile = path.join(__dirname, 'local_data.json');
        this.init();
    }

    init() {
        if (!fs.existsSync(this.dataFile)) {
            const defaultData = this.getDefaultData();
            this.saveData(defaultData);
            console.log('✅ تم إنشاء ملف البيانات المحلي');
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات المحلية:', error);
            return this.getDefaultData();
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('❌ خطأ في حفظ البيانات المحلية:', error);
            return false;
        }
    }

    getDefaultData() {
        return {
            users: [],
            stories: [],
            messages: [],
            conversations: [],
            channels: [],
            notifications: [],
            reports: [],
            backups: [],
            exports: [],
            auditLogs: [],
            lastBackup: null,
            stats: {
                totalUsers: 0,
                totalMessages: 0,
                totalStories: 0,
                totalChannels: 0,
                totalConversations: 0
            }
        };
    }

    // دوال المستخدمين
    async createUser(userData) {
        const data = this.loadData();
        const userId = uuidv4();
        const user = {
            _id: userId,
            ...userData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isOnline: false,
            lastSeen: new Date().toISOString(),
            isActive: true,
            stats: userData.stats || {
                messagesSent: 0,
                storiesPosted: 0,
                channelsJoined: 0,
                totalLikes: 0
            },
            settings: userData.settings || {
                privacy: {
                    hideOnlineStatus: false,
                    hideLastSeen: false,
                    hideStoryViews: false,
                    profileVisibility: 'public'
                },
                notificationSettings: {
                    messages: true,
                    stories: true,
                    channels: true,
                    system: true,
                    emailNotifications: false
                },
                appearance: {
                    theme: 'auto',
                    fontSize: 'medium',
                    background: 'default',
                    language: 'ar'
                }
            }
        };
        
        data.users.push(user);
        this.updateStats(data);
        this.saveData(data);
        return user;
    }

    async findUserByPhone(phone) {
        const data = this.loadData();
        return data.users.find(user => user.phone === phone && user.isActive);
    }

    async findUserById(userId) {
        const data = this.loadData();
        return data.users.find(user => user._id === userId && user.isActive);
    }

    async updateUser(userId, updates) {
        const data = this.loadData();
        const userIndex = data.users.findIndex(user => user._id === userId);
        
        if (userIndex !== -1) {
            data.users[userIndex] = {
                ...data.users[userIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.saveData(data);
            return data.users[userIndex];
        }
        return null;
    }

    async getAllUsers() {
        const data = this.loadData();
        return data.users.filter(user => user.isActive);
    }

    // دوال الستوريات
    async createStory(storyData) {
        const data = this.loadData();
        const storyId = uuidv4();
        const story = {
            _id: storyId,
            ...storyData,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            views: [],
            reactions: [],
            replies: [],
            metrics: {
                viewCount: 0,
                replyCount: 0,
                reactionCount: 0,
                shareCount: 0
            }
        };
        
        data.stories.push(story);
        this.updateStats(data);
        this.saveData(data);
        return story;
    }

    async getActiveStories() {
        const data = this.loadData();
        const now = new Date().toISOString();
        return data.stories.filter(story => story.expiresAt > now);
    }

    async updateStory(storyId, updates) {
        const data = this.loadData();
        const storyIndex = data.stories.findIndex(story => story._id === storyId);
        
        if (storyIndex !== -1) {
            data.stories[storyIndex] = {
                ...data.stories[storyIndex],
                ...updates
            };
            this.saveData(data);
            return data.stories[storyIndex];
        }
        return null;
    }

    // دوال المحادثات
    async createConversation(conversationData) {
        const data = this.loadData();
        const conversationId = uuidv4();
        const conversation = {
            _id: conversationId,
            ...conversationData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: null,
            unreadCount: {}
        };
        
        data.conversations.push(conversation);
        this.updateStats(data);
        this.saveData(data);
        return conversation;
    }

    async getConversationsByUserId(userId) {
        const data = this.loadData();
        return data.conversations.filter(conv => 
            conv.participants.includes(userId)
        );
    }

    // دوال الرسائل
    async createMessage(messageData) {
        const data = this.loadData();
        const messageId = uuidv4();
        const message = {
            _id: messageId,
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [],
            reactions: [],
            edited: { isEdited: false },
            deleted: { isDeleted: false }
        };
        
        data.messages.push(message);
        
        // تحديث المحادثة الأخيرة
        const convIndex = data.conversations.findIndex(conv => conv._id === messageData.conversationId);
        if (convIndex !== -1) {
            data.conversations[convIndex].lastMessage = messageId;
            data.conversations[convIndex].updatedAt = new Date().toISOString();
        }
        
        this.updateStats(data);
        this.saveData(data);
        return message;
    }

    async getMessagesByConversation(conversationId) {
        const data = this.loadData();
        return data.messages
            .filter(msg => msg.conversationId === conversationId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    // دوال القنوات
    async createChannel(channelData) {
        const data = this.loadData();
        const channelId = uuidv4();
        const channel = {
            _id: channelId,
            ...channelData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            stats: {
                memberCount: channelData.members?.length || 1,
                messageCount: 0,
                dailyActiveUsers: 0
            }
        };
        
        data.channels.push(channel);
        this.updateStats(data);
        this.saveData(data);
        return channel;
    }

    async getAllChannels() {
        const data = this.loadData();
        return data.channels.filter(channel => channel.isActive);
    }

    // النسخ الاحتياطي
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
            
            const backupData = {
                timestamp: new Date().toISOString(),
                data: this.loadData(),
                version: '2.0.0'
            };

            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
            
            // تحديث سجل النسخ الاحتياطية
            const data = this.loadData();
            data.backups.push({
                filename: `backup-${timestamp}.json`,
                timestamp: new Date().toISOString(),
                size: JSON.stringify(backupData).length
            });
            
            // الاحتفاظ بـ 10 نسخ احتياطية فقط
            if (data.backups.length > 10) {
                const oldBackup = data.backups.shift();
                const oldBackupPath = path.join(BACKUP_DIR, oldBackup.filename);
                if (fs.existsSync(oldBackupPath)) {
                    fs.unlinkSync(oldBackupPath);
                }
            }
            
            data.lastBackup = new Date().toISOString();
            this.saveData(data);
            
            return { success: true, filename: `backup-${timestamp}.json` };
        } catch (error) {
            console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
            return { success: false, error: error.message };
        }
    }

    async restoreBackup(backupFile) {
        try {
            const backupPath = path.join(BACKUP_DIR, backupFile);
            if (!fs.existsSync(backupPath)) {
                return { success: false, error: 'النسخة الاحتياطية غير موجودة' };
            }

            const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            
            // استعادة البيانات
            this.saveData(backupData.data);
            
            return { success: true, message: 'تم استعادة النسخة الاحتياطية بنجاح' };
        } catch (error) {
            console.error('❌ خطأ في استعادة النسخة الاحتياطية:', error);
            return { success: false, error: error.message };
        }
    }

    async exportData(format = 'json') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportData = {
                exportInfo: {
                    timestamp: new Date().toISOString(),
                    format: format,
                    version: '2.0.0'
                },
                data: this.loadData()
            };

            let filename, fileContent;

            if (format === 'json') {
                filename = `export-${timestamp}.json`;
                fileContent = JSON.stringify(exportData, null, 2);
            } else if (format === 'csv') {
                filename = `export-${timestamp}.csv`;
                fileContent = this.convertToCSV(exportData.data);
            }

            const exportPath = path.join(EXPORT_DIR, filename);
            fs.writeFileSync(exportPath, fileContent);

            // تحديث سجل التصدير
            const data = this.loadData();
            data.exports.push({
                filename: filename,
                timestamp: new Date().toISOString(),
                format: format,
                size: fileContent.length
            });
            this.saveData(data);

            return { success: true, filename, path: exportPath };
        } catch (error) {
            console.error('❌ خطأ في تصدير البيانات:', error);
            return { success: false, error: error.message };
        }
    }

    convertToCSV(data) {
        let csvContent = '';
        
        // تصدير المستخدمين
        if (data.users && data.users.length > 0) {
            csvContent += 'المستخدمين\n';
            csvContent += 'الاسم,الهاتف,الجامعة,التخصص,الدور,تاريخ الإنشاء\n';
            data.users.forEach(user => {
                csvContent += `"${user.fullName}","${user.phone}","${user.university}","${user.major}","${user.role}","${user.createdAt}"\n`;
            });
            csvContent += '\n';
        }

        // تصدير القنوات
        if (data.channels && data.channels.length > 0) {
            csvContent += 'القنوات\n';
            csvContent += 'الاسم,النوع,الوصف,عدد الأعضاء,تاريخ الإنشاء\n';
            data.channels.forEach(channel => {
                csvContent += `"${channel.name}","${channel.type}","${channel.description}","${channel.stats?.memberCount || 0}","${channel.createdAt}"\n`;
            });
            csvContent += '\n';
        }

        // تصدير الستوريات
        if (data.stories && data.stories.length > 0) {
            csvContent += 'الستوريات\n';
            csvContent += 'النوع,عدد المشاهدات,عدد التفاعلات,تاريخ النشر,تاريخ الانتهاء\n';
            data.stories.forEach(story => {
                csvContent += `"${story.mediaType}","${story.metrics?.viewCount || 0}","${story.metrics?.reactionCount || 0}","${story.createdAt}","${story.expiresAt}"\n`;
            });
        }

        return csvContent;
    }

    async importData(filePath) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const importData = JSON.parse(fileContent);

            if (!importData.data) {
                return { success: false, error: 'تنسيق ملف الاستيراد غير صالح' };
            }

            // استيراد البيانات
            this.saveData(importData.data);

            return { success: true, message: 'تم استيراد البيانات بنجاح' };
        } catch (error) {
            console.error('❌ خطأ في استيراد البيانات:', error);
            return { success: false, error: error.message };
        }
    }

    updateStats(data) {
        data.stats = {
            totalUsers: data.users.length,
            totalMessages: data.messages.length,
            totalStories: data.stories.length,
            totalChannels: data.channels.length,
            totalConversations: data.conversations.length,
            lastUpdate: new Date().toISOString()
        };
        return data.stats;
    }

    getStats() {
        const data = this.loadData();
        return this.updateStats(data);
    }
}

const localStorageService = new LocalStorageService();

// middleware المصادقة
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'رمز الوصول مطلوب',
                code: 'TOKEN_REQUIRED'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await localStorageService.findUserById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({ 
                success: false, 
                message: 'الحساب موقوف. يرجى التواصل مع الإدارة',
                code: 'ACCOUNT_SUSPENDED'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'انتهت صلاحية الرمز',
                code: 'TOKEN_EXPIRED'
            });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false, 
                message: 'رمز وصول غير صالح',
                code: 'INVALID_TOKEN'
            });
        } else {
            console.error('❌ خطأ في المصادقة:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'خطأ في الخادم',
                code: 'SERVER_ERROR'
            });
        }
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'صلاحيات مدير مطلوبة',
            code: 'ADMIN_REQUIRED'
        });
    }
    next();
};

// دوال مساعدة
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

const generateRefreshToken = (userId) => {
    return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '90d' });
};

const formatUserResponse = (user) => {
    return {
        _id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        university: user.university,
        major: user.major,
        batch: user.batch,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        email: user.email,
        studentId: user.studentId,
        badges: user.badges || [],
        stats: user.stats || {
            messagesSent: 0,
            storiesPosted: 0,
            channelsJoined: 0,
            totalLikes: 0
        },
        settings: user.settings || {
            privacy: {
                hideOnlineStatus: false,
                hideLastSeen: false,
                hideStoryViews: false,
                profileVisibility: 'public'
            },
            notificationSettings: {
                messages: true,
                stories: true,
                channels: true,
                system: true,
                emailNotifications: false
            },
            appearance: {
                theme: 'auto',
                fontSize: 'medium',
                background: 'default',
                language: 'ar'
            }
        },
        createdAt: user.createdAt,
        isActive: user.isActive
    };
};

const auditLog = async (action, userId, targetType, targetId, details = {}) => {
    try {
        console.log(`📋 Audit Log: ${action} by ${userId} on ${targetType} ${targetId}`, details);
        
        const data = localStorageService.loadData();
        if (!data.auditLogs) data.auditLogs = [];
        
        data.auditLogs.push({
            action,
            userId,
            targetType,
            targetId,
            details,
            timestamp: new Date().toISOString()
        });
        
        localStorageService.saveData(data);
    } catch (error) {
        console.error('❌ خطأ في تسجيل التدقيق:', error);
    }
};

// إنشاء حساب المدير الافتراضي
async function createDefaultAdmin() {
    try {
        const adminExists = await localStorageService.findUserByPhone('500000000');
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('77007700', 12);
            const admin = await localStorageService.createUser({
                fullName: 'مدير النظام',
                phone: '500000000',
                university: 'المنصة التعليمية',
                major: 'إدارة النظام',
                batch: '2024',
                password: hashedPassword,
                role: 'admin',
                email: 'admin@platform.edu',
                studentId: 'ADMIN001',
                badges: ['👑 مدير النظام'],
                stats: {
                    messagesSent: 0,
                    storiesPosted: 0,
                    channelsJoined: 0,
                    totalLikes: 0
                }
            });
            
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
            console.log('📱 رقم الهاتف: 500000000');
            console.log('🔑 كلمة المرور: 77007700');
        } else {
            console.log('✅ حساب المدير موجود بالفعل');
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء حساب المدير:', error);
    }
}

// تهيئة المدير الافتراضي
createDefaultAdmin();

// تخزين المستخدمين المتصلين
const connectedUsers = new Map();
const userSockets = new Map();

// ==================== مسارات API ====================

// مسار رئيسي
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية يعمل بنجاح! (التخزين المحلي)',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        storage: 'local',
        endpoints: {
            auth: '/api/auth/*',
            users: '/api/users/*',
            stories: '/api/stories/*',
            conversations: '/api/conversations/*',
            channels: '/api/channels/*',
            admin: '/api/admin/*',
            health: '/api/health'
        }
    });
});

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password, email, studentId } = req.body;

        // التحقق من البيانات المطلوبة
        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة',
                code: 'MISSING_FIELDS'
            });
        }

        // التحقق من عدم وجود مستخدم بنفس رقم الهاتف
        const existingUser = await localStorageService.findUserByPhone(phone);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف مسجل مسبقاً',
                code: 'PHONE_EXISTS'
            });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);

        // إنشاء المستخدم
        const user = await localStorageService.createUser({
            fullName: fullName.trim(),
            phone,
            university,
            major,
            batch,
            password: hashedPassword,
            email: email || null,
            studentId: studentId || null,
            role: 'student'
        });

        await auditLog('REGISTER', user._id, 'user', user._id, { phone, university });

        // إنشاء التوكن
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: {
                user: formatUserResponse(user),
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف وكلمة المرور مطلوبان',
                code: 'MISSING_CREDENTIALS'
            });
        }

        const user = await localStorageService.findUserByPhone(phone);
        console.log('🔍 البحث عن المستخدم:', phone, 'وجد:', !!user);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'الحساب موقوف. يرجى التواصل مع الإدارة',
                code: 'ACCOUNT_SUSPENDED'
            });
        }

        console.log('🔐 مقارنة كلمات المرور:', {
            providedPassword: password,
            storedPassword: user.password ? '****' : 'غير موجود',
            passwordLength: user.password ? user.password.length : 0
        });

        const isPasswordValid = await bcrypt.compare(password, user.password);
        console.log('✅ نتيجة المقارنة:', isPasswordValid);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // تحديث حالة الاتصال
        const updatedUser = await localStorageService.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await auditLog('LOGIN', user._id, 'user', user._id, { phone });

        console.log('✅ تسجيل الدخول ناجح للمستخدم:', user.fullName);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: formatUserResponse(updatedUser || user),
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تسجيل الدخول',
            code: 'LOGIN_ERROR',
            error: error.message
        });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await localStorageService.updateUser(req.user._id, {
            isOnline: false,
            lastSeen: new Date().toISOString()
        });

        await auditLog('LOGOUT', req.user._id, 'user', req.user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات المستخدمين
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                user: formatUserResponse(req.user)
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.put('/api/users/me', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { fullName, bio, email, studentId } = req.body;
        const updates = {};

        if (fullName) updates.fullName = fullName.trim();
        if (bio !== undefined) updates.bio = bio;
        if (email !== undefined) updates.email = email;
        if (studentId !== undefined) updates.studentId = studentId;

        if (req.file) {
            updates.avatar = `/uploads/profiles/${req.file.filename}`;
        }

        const user = await localStorageService.updateUser(req.user._id, updates);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }

        await auditLog('UPDATE_PROFILE', req.user._id, 'user', req.user._id, updates);

        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            data: {
                user: formatUserResponse(user)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات الستوريات
app.post('/api/stories', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'الملف مطلوب',
                code: 'FILE_REQUIRED'
            });
        }

        const { caption, allowReplies = true, allowSharing = true } = req.body;
        const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

        const story = await localStorageService.createStory({
            userId: req.user._id,
            mediaUrl: `/uploads/stories/${req.file.filename}`,
            mediaType,
            caption,
            allowReplies,
            allowSharing
        });

        await auditLog('CREATE_STORY', req.user._id, 'story', story._id, { mediaType });

        // تحديث إحصائيات المستخدم
        await localStorageService.updateUser(req.user._id, {
            'stats.storiesPosted': (req.user.stats?.storiesPosted || 0) + 1
        });

        // إرسال إشعار للمستخدمين
        io.emit('new_story', {
            story: {
                ...story,
                user: formatUserResponse(req.user)
            }
        });

        res.status(201).json({
            success: true,
            message: 'تم نشر الستوري بنجاح',
            data: { story }
        });

    } catch (error) {
        console.error('❌ خطأ في نشر الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await localStorageService.getActiveStories();
        
        // جلب بيانات المستخدمين لكل ستوري
        const storiesWithUsers = await Promise.all(
            stories.map(async (story) => {
                const user = await localStorageService.findUserById(story.userId);
                return {
                    ...story,
                    user: user ? formatUserResponse(user) : null
                };
            })
        );

        res.json({
            success: true,
            data: { stories: storiesWithUsers }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الستوريات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات القنوات
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = await localStorageService.getAllChannels();
        
        // جلب بيانات المنشئ لكل قناة
        const channelsWithCreator = await Promise.all(
            channels.map(async (channel) => {
                const creator = await localStorageService.findUserById(channel.creatorId);
                return {
                    ...channel,
                    creator: creator ? formatUserResponse(creator) : null
                };
            })
        );

        res.json({
            success: true,
            data: { channels: channelsWithCreator }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب القنوات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/channels', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description, type, isPublic = true, topics, rules } = req.body;

        if (!name || !type) {
            return res.status(400).json({
                success: false,
                message: 'الاسم والنوع مطلوبان',
                code: 'MISSING_FIELDS'
            });
        }

        const channel = await localStorageService.createChannel({
            name: name.trim(),
            description,
            type,
            isPublic,
            creatorId: req.user._id,
            members: [req.user._id],
            admins: [req.user._id],
            topics: topics ? JSON.parse(topics) : [],
            rules: rules ? JSON.parse(rules) : [],
            avatar: req.file ? `/uploads/channels/${req.file.filename}` : null
        });

        await auditLog('CREATE_CHANNEL', req.user._id, 'channel', channel._id, { name, type });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء القناة بنجاح',
            data: { channel }
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء القناة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات الإدارة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = localStorageService.getStats();
        const users = await localStorageService.getAllUsers();
        
        const onlineUsers = Array.from(connectedUsers.keys()).length;
        
        const detailedStats = {
            users: {
                total: stats.totalUsers,
                active: users.filter(u => u.isActive).length,
                online: onlineUsers,
                byRole: users.reduce((acc, user) => {
                    acc[user.role] = (acc[user.role] || 0) + 1;
                    return acc;
                }, {})
            },
            stories: {
                total: stats.totalStories,
                active: (await localStorageService.getActiveStories()).length
            },
            channels: {
                total: stats.totalChannels,
                active: stats.totalChannels
            },
            messages: {
                total: stats.totalMessages
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            }
        };

        res.json({
            success: true,
            data: { stats: detailedStats }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات الإدارة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات النسخ الاحتياطي
app.post('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await localStorageService.createBackup();
        
        if (result.success) {
            await auditLog('CREATE_BACKUP', req.user._id, 'system', 'backup', { filename: result.filename });
            res.json({
                success: true,
                message: 'تم إنشاء النسخة الاحتياطية بنجاح',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في إنشاء النسخة الاحتياطية',
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/admin/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { format = 'json' } = req.body;
        const result = await localStorageService.exportData(format);
        
        if (result.success) {
            await auditLog('EXPORT_DATA', req.user._id, 'system', 'export', { format, filename: result.filename });
            res.json({
                success: true,
                message: 'تم تصدير البيانات بنجاح',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في تصدير البيانات',
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسار الصحة
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            storage: 'local',
            environment: NODE_ENV,
            version: '2.0.0'
        };

        res.json(health);
    } catch (error) {
        console.error('❌ خطأ في فحص الصحة:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// ==================== Socket.IO Events ====================

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    socket.on('user_online', async (userId) => {
        try {
            connectedUsers.set(userId, socket.id);
            userSockets.set(socket.id, userId);
            
            await localStorageService.updateUser(userId, {
                isOnline: true,
                lastSeen: new Date().toISOString()
            });
            
            socket.broadcast.emit('user_status_changed', {
                userId,
                isOnline: true,
                lastSeen: new Date().toISOString()
            });
            
            console.log(`🟢 المستخدم ${userId} متصل الآن`);
        } catch (error) {
            console.error('❌ خطأ في تحديث حالة الاتصال:', error);
        }
    });

    socket.on('join_channel', (channelId) => {
        socket.join(`channel_${channelId}`);
        console.log(`📢 المستخدم انضم للقناة: ${channelId}`);
    });

    socket.on('disconnect', async () => {
        try {
            const userId = userSockets.get(socket.id);
            
            if (userId) {
                connectedUsers.delete(userId);
                userSockets.delete(socket.id);
                
                await localStorageService.updateUser(userId, {
                    isOnline: false,
                    lastSeen: new Date().toISOString()
                });
                
                socket.broadcast.emit('user_status_changed', {
                    userId,
                    isOnline: false,
                    lastSeen: new Date().toISOString()
                });
                
                console.log(`🔴 المستخدم ${userId} انقطع`);
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة قطع الاتصال:', error);
        }
        
        console.log('🔌 مستخدم منقطع:', socket.id);
    });
});

// معالجة الأخطاء
app.use((error, req, res, next) => {
    console.error('❌ خطأ غير معالج:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'حجم الملف كبير جداً',
                code: 'FILE_TOO_LARGE'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع في الخادم',
        code: 'INTERNAL_SERVER_ERROR'
    });
});

// معالجة المسارات غير الموجودة
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود',
        code: 'ROUTE_NOT_FOUND',
        path: req.originalUrl
    });
});

// بدء الخادم
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 خادم المنصة التعليمية يعمل بنجاح! (التخزين المحلي)
📍 العنوان: http://localhost:${PORT}
📊 البيئة: ${NODE_ENV}
⏰ الوقت: ${new Date().toLocaleString('ar-SA')}
🗄️  التخزين: محلي (JSON/CSV)
💾 المسارات:
   📁 الجذر: ${__dirname}
   📁 الرفع: ${UPLOAD_DIR}
   📁 النسخ الاحتياطي: ${BACKUP_DIR}
   📁 التصدير: ${EXPORT_DIR}
   
🔐 حساب المدير الافتراضي:
   📱 رقم الهاتف: 500000000
   🔑 كلمة المرور: 77007700
    `);
});

// معالجة الإغلاق النظيف
process.on('SIGINT', async () => {
    console.log('\n🛑 إغلاق الخادم...');
    
    try {
        // تحديث جميع المستخدمين المتصلين إلى غير متصلين
        const users = await localStorageService.getAllUsers();
        const onlineUsers = users.filter(user => user.isOnline);
        
        for (const user of onlineUsers) {
            await localStorageService.updateUser(user._id, {
                isOnline: false,
                lastSeen: new Date().toISOString()
            });
        }
        
        // إنشاء نسخة احتياطية نهائية
        await localStorageService.createBackup();
        
        console.log('✅ تم الإغلاق النظيف للخادم');
        process.exit(0);
    } catch (error) {
        console.error('❌ خطأ في الإغلاق النظيف:', error);
        process.exit(1);
    }
});

export default app;
