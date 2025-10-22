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
    },
    pingTimeout: 60000,
    pingInterval: 25000
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
    path.join(UPLOAD_DIR, 'groups'),
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
        else if (file.fieldname === 'groupAvatar') uploadPath = path.join(UPLOAD_DIR, 'groups');
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
        'groupAvatar': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'file': ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/zip', 'application/vnd.rar'],
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
            groups: [],
            groupMessages: [],
            channelMessages: [],
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
                totalGroups: 0,
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
                groupsJoined: 0,
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
                    groups: true,
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

    async findUserByEmail(email) {
        const data = this.loadData();
        return data.users.find(user => user.email === email && user.isActive);
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

    // دوال المحادثات والرسائل
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

    async getChannelById(channelId) {
        const data = this.loadData();
        return data.channels.find(channel => channel._id === channelId && channel.isActive);
    }

    async createChannelMessage(messageData) {
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
        
        data.channelMessages.push(message);
        
        // تحديث إحصائيات القناة
        const channelIndex = data.channels.findIndex(channel => channel._id === messageData.channelId);
        if (channelIndex !== -1) {
            data.channels[channelIndex].stats.messageCount += 1;
            data.channels[channelIndex].updatedAt = new Date().toISOString();
        }
        
        this.updateStats(data);
        this.saveData(data);
        return message;
    }

    async getChannelMessages(channelId) {
        const data = this.loadData();
        return data.channelMessages
            .filter(msg => msg.channelId === channelId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    // دوال المجموعات
    async createGroup(groupData) {
        const data = this.loadData();
        const groupId = uuidv4();
        const group = {
            _id: groupId,
            ...groupData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            stats: {
                memberCount: groupData.members?.length || 1,
                messageCount: 0,
                dailyActiveUsers: 0
            }
        };
        
        data.groups.push(group);
        this.updateStats(data);
        this.saveData(data);
        return group;
    }

    async getAllGroups() {
        const data = this.loadData();
        return data.groups.filter(group => group.isActive);
    }

    async getGroupById(groupId) {
        const data = this.loadData();
        return data.groups.find(group => group._id === groupId && group.isActive);
    }

    async createGroupMessage(messageData) {
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
        
        data.groupMessages.push(message);
        
        // تحديث إحصائيات المجموعة
        const groupIndex = data.groups.findIndex(group => group._id === messageData.groupId);
        if (groupIndex !== -1) {
            data.groups[groupIndex].stats.messageCount += 1;
            data.groups[groupIndex].updatedAt = new Date().toISOString();
        }
        
        this.updateStats(data);
        this.saveData(data);
        return message;
    }

    async getGroupMessages(groupId) {
        const data = this.loadData();
        return data.groupMessages
            .filter(msg => msg.groupId === groupId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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
            csvContent += 'الاسم,البريد الإلكتروني,الدور,الحالة,تاريخ الإنشاء\n';
            data.users.forEach(user => {
                csvContent += `"${user.fullName}","${user.email}","${user.role}","${user.isActive ? 'نشط' : 'غير نشط'}","${user.createdAt}"\n`;
            });
            csvContent += '\n';
        }

        // تصدير القنوات
        if (data.channels && data.channels.length > 0) {
            csvContent += 'القنوات\n';
            csvContent += 'الاسم,الوصف,عدد الأعضاء,عدد الرسائل,تاريخ الإنشاء\n';
            data.channels.forEach(channel => {
                csvContent += `"${channel.name}","${channel.description}","${channel.stats?.memberCount || 0}","${channel.stats?.messageCount || 0}","${channel.createdAt}"\n`;
            });
            csvContent += '\n';
        }

        // تصدير المجموعات
        if (data.groups && data.groups.length > 0) {
            csvContent += 'المجموعات\n';
            csvContent += 'الاسم,الوصف,عدد الأعضاء,عدد الرسائل,تاريخ الإنشاء\n';
            data.groups.forEach(group => {
                csvContent += `"${group.name}","${group.description}","${group.stats?.memberCount || 0}","${group.stats?.messageCount || 0}","${group.createdAt}"\n`;
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
            totalGroups: data.groups.length,
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
        email: user.email,
        university: user.university,
        major: user.major,
        batch: user.batch,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        studentId: user.studentId,
        badges: user.badges || [],
        stats: user.stats || {
            messagesSent: 0,
            storiesPosted: 0,
            channelsJoined: 0,
            groupsJoined: 0,
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
                groups: true,
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
                email: 'admin@platform.edu',
                university: 'المنصة التعليمية',
                major: 'إدارة النظام',
                batch: '2024',
                password: hashedPassword,
                role: 'admin',
                studentId: 'ADMIN001',
                badges: ['👑 مدير النظام'],
                stats: {
                    messagesSent: 0,
                    storiesPosted: 0,
                    channelsJoined: 0,
                    groupsJoined: 0,
                    totalLikes: 0
                }
            });
            
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
            console.log('📱 رقم الهاتف: 500000000');
            console.log('📧 البريد الإلكتروني: admin@platform.edu');
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
        message: '🚀 خادم المنصة التعليمية يعمل بنجاح! (الإصدار المحسن)',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        storage: 'local',
        features: {
            realtime_chat: true,
            channels: true,
            groups: true,
            file_upload: true,
            emoji_support: true,
            notifications: true
        },
        endpoints: {
            auth: '/api/auth/*',
            users: '/api/users/*',
            chat: '/api/chat/*',
            channels: '/api/channels/*',
            groups: '/api/groups/*',
            admin: '/api/admin/*',
            health: '/api/health'
        }
    });
});

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, role, password, phone, university, major, batch } = req.body;

        // التحقق من البيانات المطلوبة
        if (!fullName || !email || !role || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة',
                code: 'MISSING_FIELDS'
            });
        }

        // التحقق من عدم وجود مستخدم بنفس البريد الإلكتروني
        const existingUser = await localStorageService.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مسجل مسبقاً',
                code: 'EMAIL_EXISTS'
            });
        }

        // تشفير كلمة المرور
        console.log('🔐 تشفير كلمة المرور للمستخدم:', email);
        const hashedPassword = await bcrypt.hash(password, 12);
        console.log('✅ تم تشفير كلمة المرور، الطول:', hashedPassword.length);

        // إنشاء المستخدم
        const user = await localStorageService.createUser({
            fullName: fullName.trim(),
            email,
            phone: phone || null,
            university: university || null,
            major: major || null,
            batch: batch || null,
            password: hashedPassword,
            role: role
        });

        await auditLog('REGISTER', user._id, 'user', user._id, { email, role });

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
        const { email, password } = req.body;

        console.log('🔐 محاولة تسجيل الدخول:', { email, passwordLength: password ? password.length : 0 });

        if (!email || !password) {
            console.log('❌ بيانات ناقصة:', { email: !!email, password: !!password });
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان',
                code: 'MISSING_CREDENTIALS'
            });
        }

        const user = await localStorageService.findUserByEmail(email);
        
        if (!user) {
            console.log('❌ مستخدم غير موجود:', email);
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        if (!user.isActive) {
            console.log('❌ حساب موقوف:', email);
            return res.status(401).json({
                success: false,
                message: 'الحساب موقوف. يرجى التواصل مع الإدارة',
                code: 'ACCOUNT_SUSPENDED'
            });
        }

        console.log('🔍 بيانات المستخدم:', {
            name: user.fullName,
            hasPassword: !!user.password,
            passwordLength: user.password ? user.password.length : 0
        });

        if (!user.password) {
            console.log('❌ كلمة المرور غير موجودة في قاعدة البيانات');
            return res.status(401).json({
                success: false,
                message: 'كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        console.log('🔐 مقارنة كلمات المرور...');
        const isPasswordValid = await bcrypt.compare(password, user.password);
        console.log('✅ نتيجة المقارنة:', isPasswordValid);

        if (!isPasswordValid) {
            console.log('❌ كلمة المرور غير صحيحة');
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
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

        await auditLog('LOGIN', user._id, 'user', user._id, { email });

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

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await localStorageService.getAllUsers();
        res.json({
            success: true,
            data: {
                users: users.map(user => formatUserResponse(user))
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات الدردشة
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
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
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.get('/api/chat/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const messages = await localStorageService.getMessagesByConversation(conversationId);
        res.json({
            success: true,
            data: {
                messages
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الرسائل:', error);
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
        res.json({
            success: true,
            data: {
                channels
            }
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

app.get('/api/channels/:channelId/messages', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;
        const messages = await localStorageService.getChannelMessages(channelId);
        res.json({
            success: true,
            data: {
                messages
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب رسائل القناة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات المجموعات
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const groups = await localStorageService.getAllGroups();
        res.json({
            success: true,
            data: {
                groups
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المجموعات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const messages = await localStorageService.getGroupMessages(groupId);
        res.json({
            success: true,
            data: {
                messages
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب رسائل المجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسار الحالة الصحية
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            connectedUsers: connectedUsers.size
        }
    });
});

// ==================== نظام السوكت ====================

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    // مصادقة المستخدم
    socket.on('authenticate', async (data) => {
        try {
            const { token } = data;
            if (!token) {
                socket.emit('authentication_failed', { message: 'رمز المصادقة مطلوب' });
                return;
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await localStorageService.findUserById(decoded.userId);
            
            if (!user) {
                socket.emit('authentication_failed', { message: 'المستخدم غير موجود' });
                return;
            }

            // تخزين معلومات الاتصال
            socket.userId = user._id;
            connectedUsers.set(user._id, {
                socketId: socket.id,
                user: formatUserResponse(user),
                lastSeen: new Date().toISOString()
            });
            userSockets.set(socket.id, user._id);

            // تحديث حالة المستخدم إلى متصل
            await localStorageService.updateUser(user._id, {
                isOnline: true,
                lastSeen: new Date().toISOString()
            });

            // إعلام جميع العملاء بتحديث حالة المستخدم
            io.emit('user_status_changed', {
                userId: user._id,
                isOnline: true,
                lastSeen: new Date().toISOString()
            });

            socket.emit('authenticated', { 
                user: formatUserResponse(user),
                message: 'تم المصادقة بنجاح'
            });

            console.log(`✅ تم مصادقة المستخدم: ${user.fullName} (${socket.id})`);

        } catch (error) {
            console.error('❌ خطأ في مصادقة السوكت:', error);
            socket.emit('authentication_failed', { message: 'فشل المصادقة' });
        }
    });

    // إرسال رسالة دردشة
    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { conversationId, content, type = 'text' } = data;
            
            if (!conversationId || !content) {
                socket.emit('error', { message: 'معرف المحادثة والمحتوى مطلوبان' });
                return;
            }

            // إنشاء الرسالة
            const message = await localStorageService.createMessage({
                conversationId,
                senderId: socket.userId,
                content,
                type,
                createdAt: new Date().toISOString()
            });

            // إرسال الرسالة إلى جميع المشاركين في المحادثة
            io.emit('new_message', {
                conversationId,
                message
            });

            console.log(`💬 رسالة جديدة في المحادثة ${conversationId}: ${content.substring(0, 50)}...`);

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'فشل إرسال الرسالة' });
        }
    });

    // إرسال رسالة قناة
    socket.on('send_channel_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { channelId, content, type = 'text' } = data;
            
            if (!channelId || !content) {
                socket.emit('error', { message: 'معرف القناة والمحتوى مطلوبان' });
                return;
            }

            // التحقق من صلاحية المستخدم لإرسال رسائل في القناة
            const channel = await localStorageService.getChannelById(channelId);
            if (!channel) {
                socket.emit('error', { message: 'القناة غير موجودة' });
                return;
            }

            // إنشاء رسالة القناة
            const message = await localStorageService.createChannelMessage({
                channelId,
                senderId: socket.userId,
                content,
                type,
                createdAt: new Date().toISOString()
            });

            // إرسال الرسالة إلى جميع مشتركي القناة
            io.emit('new_channel_message', {
                channelId,
                message
            });

            console.log(`📢 رسالة جديدة في القناة ${channelId}: ${content.substring(0, 50)}...`);

        } catch (error) {
            console.error('❌ خطأ في إرسال رسالة القناة:', error);
            socket.emit('error', { message: 'فشل إرسال رسالة القناة' });
        }
    });

    // إرسال رسالة مجموعة
    socket.on('send_group_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { groupId, content, type = 'text' } = data;
            
            if (!groupId || !content) {
                socket.emit('error', { message: 'معرف المجموعة والمحتوى مطلوبان' });
                return;
            }

            // التحقق من عضوية المستخدم في المجموعة
            const group = await localStorageService.getGroupById(groupId);
            if (!group) {
                socket.emit('error', { message: 'المجموعة غير موجودة' });
                return;
            }

            if (!group.members.includes(socket.userId)) {
                socket.emit('error', { message: 'لست عضواً في هذه المجموعة' });
                return;
            }

            // إنشاء رسالة المجموعة
            const message = await localStorageService.createGroupMessage({
                groupId,
                senderId: socket.userId,
                content,
                type,
                createdAt: new Date().toISOString()
            });

            // إرسال الرسالة إلى جميع أعضاء المجموعة
            io.emit('new_group_message', {
                groupId,
                message
            });

            console.log(`👥 رسالة جديدة في المجموعة ${groupId}: ${content.substring(0, 50)}...`);

        } catch (error) {
            console.error('❌ خطأ في إرسال رسالة المجموعة:', error);
            socket.emit('error', { message: 'فشل إرسال رسالة المجموعة' });
        }
    });

    // كتابة رسالة
    socket.on('typing_start', (data) => {
        const { conversationId } = data;
        if (conversationId && socket.userId) {
            socket.to(conversationId).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: true
            });
        }
    });

    socket.on('typing_stop', (data) => {
        const { conversationId } = data;
        if (conversationId && socket.userId) {
            socket.to(conversationId).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: false
            });
        }
    });

    // قراءة الرسائل
    socket.on('mark_messages_read', async (data) => {
        try {
            const { conversationId, messageIds } = data;
            // هنا يمكن إضافة منطق لتحديث حالة القراءة في قاعدة البيانات
            socket.emit('messages_marked_read', { conversationId, messageIds });
        } catch (error) {
            console.error('❌ خطأ في تحديد الرسائل كمقروءة:', error);
        }
    });

    // انضمام إلى غرفة
    socket.on('join_room', (data) => {
        const { roomId } = data;
        socket.join(roomId);
        console.log(`🚪 المستخدم ${socket.userId} انضم إلى الغرفة ${roomId}`);
    });

    // مغادرة غرفة
    socket.on('leave_room', (data) => {
        const { roomId } = data;
        socket.leave(roomId);
        console.log(`🚪 المستخدم ${socket.userId} غادر الغرفة ${roomId}`);
    });

    // فصل الاتصال
    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منفصل:', socket.id);
        
        const userId = userSockets.get(socket.id);
        if (userId) {
            // تحديث حالة المستخدم إلى غير متصل
            await localStorageService.updateUser(userId, {
                isOnline: false,
                lastSeen: new Date().toISOString()
            });

            // إعلام جميع العملاء بتحديث حالة المستخدم
            io.emit('user_status_changed', {
                userId,
                isOnline: false,
                lastSeen: new Date().toISOString()
            });

            connectedUsers.delete(userId);
            userSockets.delete(socket.id);
        }
    });
});

// بدء الخادم
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 خادم المنصة التعليمية المحسن يعمل بنجاح!
📍 العنوان: http://localhost:${PORT}
📊 البيئة: ${NODE_ENV}
⏰ الوقت: ${new Date().toLocaleString('ar-SA')}
🗄️  التخزين: محلي (JSON/CSV)
👥 المستخدمون المتصلون: ${connectedUsers.size}
💾 المسارات:
   📁 الجذر: ${__dirname}
   📁 الرفع: ${UPLOAD_DIR}
   📁 النسخ الاحتياطي: ${BACKUP_DIR}
   📁 التصدير: ${EXPORT_DIR}
   
🔐 حساب المدير الافتراضي:
   📧 البريد الإلكتروني: admin@platform.edu
   🔑 كلمة المرور: 77007700

✨ المميزات المتاحة:
   💬 دردشة فورية مع الإيموجي
   📢 قنوات بث (مثل تليجرام)
   👥 مجموعات تفاعلية
   📁 رفع الملفات
   🔔 إشعارات فورية
   🌙 وضع ليلي
    `);
});

export default app;
