import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
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
        
        console.log('✅ تم إنشاء المستخدم:', {
            id: userId,
            name: user.fullName,
            phone: user.phone,
            hasPassword: !!user.password,
            passwordLength: user.password ? user.password.length : 0
        });
        
        return user;
    }

    async findUserByPhone(phone) {
        const data = this.loadData();
        const user = data.users.find(user => user.phone === phone && user.isActive);
        
        if (user) {
            console.log('🔍 تم العثور على المستخدم:', {
                phone: user.phone,
                name: user.fullName,
                hasPassword: !!user.password,
                passwordLength: user.password ? user.password.length : 0
            });
        } else {
            console.log('❌ لم يتم العثور على مستخدم بالرقم:', phone);
        }
        
        return user;
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

    // دوال جديدة للإحصائيات
    async getUserStats(userId) {
        const data = this.loadData();
        const userMessages = data.messages.filter(msg => msg.senderId === userId);
        const userStories = data.stories.filter(story => story.userId === userId);
        const userChannels = data.channels.filter(channel => 
            channel.members?.includes(userId)
        );

        return {
            messages: {
                total: userMessages.length,
                today: userMessages.filter(msg => 
                    new Date(msg.createdAt).toDateString() === new Date().toDateString()
                ).length
            },
            stories: {
                total: userStories.length,
                active: userStories.filter(story => 
                    new Date(story.expiresAt) > new Date()
                ).length
            },
            channels: {
                joined: userChannels.length,
                created: userChannels.filter(channel => 
                    channel.createdBy === userId
                ).length
            },
            overall: {
                score: userMessages.length + (userStories.length * 2) + (userChannels.length * 3)
            }
        };
    }

    async getAdminStats() {
        const data = this.loadData();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const todayMessages = data.messages.filter(msg => 
            new Date(msg.createdAt) >= today
        );
        const activeStories = data.stories.filter(story => 
            new Date(story.expiresAt) > now
        );

        return {
            totalUsers: data.users.length,
            totalMessages: data.messages.length,
            totalStories: data.stories.length,
            totalChannels: data.channels.length,
            todayMessages: todayMessages.length,
            activeStories: activeStories.length,
            sheetsRecords: data.users.length + data.messages.length + data.stories.length
        };
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
            const admin = await localStorageService.createUser({
                fullName: 'مدير النظام',
                phone: '500000000',
                university: 'المنصة التعليمية',
                major: 'إدارة النظام',
                batch: '2024',
                password: '77007700', // كلمة مرور غير مشفرة
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

// إنشاء مستخدمين افتراضيين
async function createDefaultUsers() {
    const defaultUsers = [
        {
            fullName: "أحمد محمد",
            phone: "512345678",
            university: "جامعة الملك سعود",
            major: "هندسة الحاسب",
            batch: "2024",
            password: "12345678", // كلمة مرور غير مشفرة
            role: "student"
        },
        {
            fullName: "سارة عبدالله",
            phone: "511111111", 
            university: "جامعة الأميرة نورة",
            major: "الطب",
            batch: "2023",
            password: "12345678", // كلمة مرور غير مشفرة
            role: "student"
        },
        {
            fullName: "محمد الخالد",
            phone: "522222222",
            university: "جامعة الملك فهد",
            major: "إدارة الأعمال", 
            batch: "2024",
            password: "12345678", // كلمة مرور غير مشفرة
            role: "moderator"
        }
    ];

    for (const userData of defaultUsers) {
        const existingUser = await localStorageService.findUserByPhone(userData.phone);
        if (!existingUser) {
            await localStorageService.createUser({
                ...userData
            });
            console.log(`✅ تم إنشاء المستخدم الافتراضي: ${userData.fullName} (${userData.phone})`);
        }
    }
}

// تهيئة المستخدمين الافتراضيين
createDefaultAdmin().then(() => {
    createDefaultUsers().then(() => {
        console.log('✅ تم إنشاء المستخدمين الافتراضيين');
    });
});

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

        console.log('🔐 إنشاء مستخدم جديد:', phone);

        // إنشاء المستخدم (بدون تشفير كلمة المرور)
        const user = await localStorageService.createUser({
            fullName: fullName.trim(),
            phone,
            university,
            major,
            batch,
            password: password, // حفظ كلمة المرور كما هي
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
            code: 'SERVER_ERROR',
            error: error.message
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        console.log('🔐 محاولة تسجيل الدخول:', { phone, password });

        if (!phone || !password) {
            console.log('❌ بيانات ناقصة:', { phone: !!phone, password: !!password });
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف وكلمة المرور مطلوبان',
                code: 'MISSING_CREDENTIALS'
            });
        }

        const user = await localStorageService.findUserByPhone(phone);
        
        if (!user) {
            console.log('❌ مستخدم غير موجود:', phone);
            return res.status(401).json({
                success: false,
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        if (!user.isActive) {
            console.log('❌ حساب موقوف:', phone);
            return res.status(401).json({
                success: false,
                message: 'الحساب موقوف. يرجى التواصل مع الإدارة',
                code: 'ACCOUNT_SUSPENDED'
            });
        }

        console.log('🔍 بيانات المستخدم:', {
            name: user.fullName,
            hasPassword: !!user.password,
            storedPassword: user.password,
            inputPassword: password
        });

        if (!user.password) {
            console.log('❌ كلمة المرور غير موجودة في قاعدة البيانات');
            return res.status(401).json({
                success: false,
                message: 'كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // مقارنة كلمات المرور مباشرة (بدون تشفير)
        const isPasswordValid = user.password === password;
        console.log('✅ نتيجة المقارنة:', isPasswordValid);

        if (!isPasswordValid) {
            console.log('❌ كلمة المرور غير صحيحة');
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
        console.error('تفاصيل الخطأ:', error.message);
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

// مسار التحقق من حالة المستخدم
app.get('/api/auth/me', authenticateToken, async (req, res) => {
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
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسار تحديث التوكن
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'رمز التحديث مطلوب'
            });
        }

        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        
        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: 'نوع التوكن غير صالح'
            });
        }

        const user = await localStorageService.findUserById(decoded.userId);
        
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود أو غير نشط'
            });
        }

        const newToken = generateToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        res.json({
            success: true,
            data: {
                token: newToken,
                refreshToken: newRefreshToken,
                user: formatUserResponse(user)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث التوكن:', error);
        res.status(401).json({
            success: false,
            message: 'رمز التحديث غير صالح'
        });
    }
});

// مسار إنشاء مستخدم جديد (للاختبار)
app.post('/api/auth/create-test-user', async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password } = req.body;

        // التحقق من البيانات
        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة'
            });
        }

        // التحقق من عدم وجود مستخدم بنفس الرقم
        const existingUser = await localStorageService.findUserByPhone(phone);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف مسجل مسبقاً'
            });
        }

        // إنشاء المستخدم (بدون تشفير كلمة المرور)
        const user = await localStorageService.createUser({
            fullName,
            phone,
            university,
            major,
            batch,
            password: password, // حفظ كلمة المرور كما هي
            role: 'student'
        });

        await auditLog('TEST_USER_CREATED', 'system', 'user', user._id, { phone });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب التجريبي بنجاح',
            data: {
                user: formatUserResponse(user)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم التجريبي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات المستخدمين
app.get('/api/users/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await localStorageService.getUserStats(req.user._id);
        
        res.json({
            success: true,
            data: {
                stats
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات الستوريات
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await localStorageService.getActiveStories();
        
        // إضافة معلومات المستخدم لكل قصة
        const storiesWithUserInfo = await Promise.all(
            stories.map(async (story) => {
                const user = await localStorageService.findUserById(story.userId);
                return {
                    ...story,
                    userId: user ? formatUserResponse(user) : null
                };
            })
        );

        res.json({
            success: true,
            data: {
                stories: storiesWithUserInfo
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الستوريات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات المحادثات
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await localStorageService.getConversationsByUserId(req.user._id);
        
        res.json({
            success: true,
            data: {
                conversations
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات النسخ الاحتياطي
app.get('/api/backup/list', authenticateToken, async (req, res) => {
    try {
        const data = localStorageService.loadData();
        
        res.json({
            success: true,
            data: {
                backups: data.backups || []
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب قائمة النسخ:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/backup/create', authenticateToken, async (req, res) => {
    try {
        const result = await localStorageService.createBackup();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'تم إنشاء النسخة الاحتياطية بنجاح',
                data: {
                    filename: result.filename
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات الإدارة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = await localStorageService.getAdminStats();
        
        res.json({
            success: true,
            data: {
                stats
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات الإدارة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات التصدير
app.get('/api/export/json', authenticateToken, async (req, res) => {
    try {
        const result = await localStorageService.exportData('json');
        
        if (result.success) {
            res.json({
                success: true,
                message: 'تم تصدير البيانات بنجاح',
                data: {
                    filename: result.filename,
                    downloadUrl: `/exports/${result.filename}`
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسار الصحة
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'الخادم يعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: NODE_ENV
    });
});

// ==================== Socket.IO Events ====================

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    socket.on('user_connected', async (data) => {
        try {
            const { userId } = data;
            
            if (userId) {
                connectedUsers.set(userId, socket.id);
                userSockets.set(socket.id, userId);
                
                await localStorageService.updateUser(userId, {
                    isOnline: true,
                    lastSeen: new Date().toISOString()
                });

                // إعلام جميع المستخدمين باتصال المستخدم
                socket.broadcast.emit('user_online', { userId });
                
                console.log(`✅ المستخدم ${userId} متصل الآن`);
            }
        } catch (error) {
            console.error('❌ خطأ في اتصال المستخدم:', error);
        }
    });

    socket.on('send_message', async (data) => {
        try {
            const { conversationId, content, messageType } = data;
            const userId = userSockets.get(socket.id);
            
            if (!userId) {
                socket.emit('error', { message: 'المستخدم غير معروف' });
                return;
            }

            // إنشاء الرسالة
            const message = await localStorageService.createMessage({
                conversationId,
                senderId: userId,
                content,
                messageType: messageType || 'text'
            });

            // إرسال الرسالة لجميع المشاركين في المحادثة
            io.emit('new_message', { message });

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'فشل إرسال الرسالة' });
        }
    });

    socket.on('typing_start', (data) => {
        const { conversationId, userId, userName } = data;
        socket.to(conversationId).emit('user_typing', {
            userId,
            userName,
            isTyping: true
        });
    });

    socket.on('typing_stop', (data) => {
        const { conversationId, userId } = data;
        socket.to(conversationId).emit('user_typing', {
            userId,
            isTyping: false
        });
    });

    socket.on('view_story', async (data) => {
        try {
            const { storyId } = data;
            const userId = userSockets.get(socket.id);
            
            if (userId) {
                const story = await localStorageService.updateStory(storyId, {
                    $addToSet: { views: userId },
                    $inc: { 'metrics.viewCount': 1 }
                });

                if (story) {
                    io.emit('story_viewed', { storyId, views: story.views });
                }
            }
        } catch (error) {
            console.error('❌ خطأ في مشاهدة الستوري:', error);
        }
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

                // إعلام جميع المستخدمين بفصل المستخدم
                socket.broadcast.emit('user_offline', { userId });
                
                console.log(`❌ المستخدم ${userId} انقطع عن الاتصال`);
            }
        } catch (error) {
            console.error('❌ خطأ في فصل المستخدم:', error);
        }
    });
});

// معالجة الأخطاء
app.use((error, req, res, next) => {
    console.error('❌ خطأ غير معالج:', error);
    res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع في الخادم',
        error: NODE_ENV === 'development' ? error.message : undefined
    });
});

// معالجة المسارات غير الموجودة
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود',
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
   
🔐 حسابات الاختبار المتاحة (بدون تشفير):
   👑 المدير: 500000000 / 77007700
   👨‍🎓 أحمد: 512345678 / 12345678
   👩‍🎓 سارة: 511111111 / 12345678
   👨‍💼 محمد: 522222222 / 12345678
    `);
});

export default app;
