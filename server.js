import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';
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

// نماذج MongoDB
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, index: true },
    university: { type: String, required: true },
    major: { type: String, required: true },
    batch: { type: String, required: true },
    password: { type: String, required: true },
    avatar: { type: String },
    bio: { type: String, maxlength: 500 },
    role: { type: String, enum: ['student', 'moderator', 'admin'], default: 'student' },
    isActive: { type: Boolean, default: true },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    email: { type: String, sparse: true },
    studentId: { type: String, sparse: true },
    badges: [{ type: String }],
    stats: {
        messagesSent: { type: Number, default: 0 },
        storiesPosted: { type: Number, default: 0 },
        channelsJoined: { type: Number, default: 0 },
        totalLikes: { type: Number, default: 0 }
    },
    settings: {
        privacy: {
            hideOnlineStatus: { type: Boolean, default: false },
            hideLastSeen: { type: Boolean, default: false },
            hideStoryViews: { type: Boolean, default: false },
            profileVisibility: { type: String, enum: ['public', 'private', 'contacts'], default: 'public' }
        },
        notificationSettings: {
            messages: { type: Boolean, default: true },
            stories: { type: Boolean, default: true },
            channels: { type: Boolean, default: true },
            system: { type: Boolean, default: true },
            emailNotifications: { type: Boolean, default: false }
        },
        appearance: {
            theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
            fontSize: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
            background: { type: String, default: 'default' },
            language: { type: String, default: 'ar' }
        }
    },
    security: {
        lastPasswordChange: { type: Date, default: Date.now },
        loginAttempts: { type: Number, default: 0 },
        lockUntil: { type: Date },
        twoFactorEnabled: { type: Boolean, default: false }
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

userSchema.virtual('isLocked').get(function() {
    return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

userSchema.methods.incrementLoginAttempts = function() {
    if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { 'security.loginAttempts': 1 },
            $unset: { 'security.lockUntil': 1 }
        });
    }
    
    const updates = { $inc: { 'security.loginAttempts': 1 } };
    if (this.security.loginAttempts + 1 >= 5) {
        updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 };
    }
    return this.updateOne(updates);
};

const storySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    thumbnailUrl: { type: String },
    caption: { type: String, maxlength: 500 },
    allowReplies: { type: Boolean, default: true },
    allowSharing: { type: Boolean, default: true },
    views: [{ 
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        viewedAt: { type: Date, default: Date.now }
    }],
    reactions: [{ 
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, enum: ['like', 'love', 'laugh', 'wow', 'sad', 'angry'] },
        reactedAt: { type: Date, default: Date.now }
    }],
    replies: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, required: true, maxlength: 1000 },
        createdAt: { type: Date, default: Date.now },
        replies: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            text: { type: String, required: true, maxlength: 1000 },
            createdAt: { type: Date, default: Date.now }
        }]
    }],
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] }
    },
    tags: [{ type: String }],
    expiresAt: { type: Date, required: true },
    metrics: {
        viewCount: { type: Number, default: 0 },
        replyCount: { type: Number, default: 0 },
        reactionCount: { type: Number, default: 0 },
        shareCount: { type: Number, default: 0 }
    }
}, { 
    timestamps: true,
    indexes: [
        { expiresAt: 1 },
        { userId: 1, createdAt: -1 },
        { location: '2dsphere' }
    ]
});

const messageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    messageType: { type: String, enum: ['text', 'image', 'video', 'file', 'voice', 'location'], default: 'text' },
    fileUrl: { type: String },
    fileSize: { type: Number },
    duration: { type: Number },
    location: {
        latitude: { type: Number },
        longitude: { type: Number },
        address: { type: String }
    },
    readBy: [{ 
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now }
    }],
    reactions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String },
        reactedAt: { type: Date, default: Date.now }
    }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    edited: { 
        isEdited: { type: Boolean, default: false },
        editedAt: { type: Date }
    },
    deleted: {
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date }
    }
}, { 
    timestamps: true,
    indexes: [
        { conversationId: 1, createdAt: -1 },
        { senderId: 1, createdAt: -1 }
    ]
});

const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, trim: true },
    groupAvatar: { type: String },
    groupDescription: { type: String, maxlength: 500 },
    groupAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    },
    settings: {
        allowInvites: { type: Boolean, default: true },
        approvalRequired: { type: Boolean, default: false },
        slowMode: { type: Boolean, default: false },
        slowModeDelay: { type: Number, default: 0 }
    },
    metadata: {
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }]
    }
}, { 
    timestamps: true,
    indexes: [
        { participants: 1 },
        { updatedAt: -1 }
    ]
});

const channelSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, maxlength: 1000 },
    type: { type: String, enum: ['channel', 'group', 'broadcast', 'course'], required: true },
    avatar: { type: String },
    banner: { type: String },
    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    settings: {
        allowMessages: { type: Boolean, default: true },
        allowFiles: { type: Boolean, default: true },
        approvalRequired: { type: Boolean, default: false },
        membersCanInvite: { type: Boolean, default: true },
        maxMembers: { type: Number, default: 1000 }
    },
    topics: [{ type: String }],
    rules: [{ type: String }],
    stats: {
        memberCount: { type: Number, default: 0 },
        messageCount: { type: Number, default: 0 },
        dailyActiveUsers: { type: Number, default: 0 }
    },
    metadata: {
        category: { type: String },
        level: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
        tags: [{ type: String }]
    }
}, { 
    timestamps: true,
    indexes: [
        { name: 'text', description: 'text' },
        { type: 1, isPublic: 1 },
        { 'metadata.tags': 1 }
    ]
});

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['message', 'story', 'channel', 'system', 'friend_request'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    isRead: { type: Boolean, default: false },
    actionUrl: { type: String },
    expiresAt: { type: Date }
}, { timestamps: true });

const reportSchema = new mongoose.Schema({
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['user', 'message', 'story', 'channel'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['pending', 'reviewed', 'resolved', 'dismissed'], default: 'pending' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolution: {
        action: { type: String },
        notes: { type: String },
        resolvedAt: { type: Date },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
}, { timestamps: true });

// إنشاء النماذج
const User = mongoose.model('User', userSchema);
const Story = mongoose.model('Story', storySchema);
const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Channel = mongoose.model('Channel', channelSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Report = mongoose.model('Report', reportSchema);

// نظام التخزين المحلي والنسخ الاحتياطي
class LocalStorageService {
    constructor() {
        this.dataFile = path.join(__dirname, 'local_data.json');
        this.init();
    }

    init() {
        if (!fs.existsSync(this.dataFile)) {
            this.saveData({
                users: [],
                messages: [],
                stories: [],
                channels: [],
                backups: [],
                exports: [],
                auditLogs: [],
                lastBackup: null,
                stats: {
                    totalUsers: 0,
                    totalMessages: 0,
                    totalStories: 0,
                    totalChannels: 0
                }
            });
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('خطأ في تحميل البيانات المحلية:', error);
            return this.getDefaultData();
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('خطأ في حفظ البيانات المحلية:', error);
            return false;
        }
    }

    getDefaultData() {
        return {
            users: [],
            messages: [],
            stories: [],
            channels: [],
            backups: [],
            exports: [],
            auditLogs: [],
            lastBackup: null,
            stats: {
                totalUsers: 0,
                totalMessages: 0,
                totalStories: 0,
                totalChannels: 0
            }
        };
    }

    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
            
            const backupData = {
                timestamp: new Date().toISOString(),
                data: this.loadData(),
                collections: {
                    users: await User.find().select('-password').lean(),
                    stories: await Story.find().lean(),
                    messages: await Message.find().lean(),
                    channels: await Channel.find().lean()
                }
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
            console.error('خطأ في إنشاء النسخة الاحتياطية:', error);
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
            
            // استعادة البيانات المحلية
            this.saveData(backupData.data);
            
            // استعادة بيانات MongoDB
            if (backupData.collections) {
                if (backupData.collections.users) {
                    await User.deleteMany({});
                    await User.insertMany(backupData.collections.users);
                }
                
                if (backupData.collections.stories) {
                    await Story.deleteMany({});
                    await Story.insertMany(backupData.collections.stories);
                }
                
                if (backupData.collections.messages) {
                    await Message.deleteMany({});
                    await Message.insertMany(backupData.collections.messages);
                }
                
                if (backupData.collections.channels) {
                    await Channel.deleteMany({});
                    await Channel.insertMany(backupData.collections.channels);
                }
            }

            return { success: true, message: 'تم استعادة النسخة الاحتياطية بنجاح' };
        } catch (error) {
            console.error('خطأ في استعادة النسخة الاحتياطية:', error);
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
                    version: '1.0'
                },
                collections: {
                    users: await User.find().select('-password -security').lean(),
                    stories: await Story.find().lean(),
                    messages: await Message.find().lean(),
                    channels: await Channel.find().lean(),
                    localData: this.loadData()
                }
            };

            let filename, fileContent;

            if (format === 'json') {
                filename = `export-${timestamp}.json`;
                fileContent = JSON.stringify(exportData, null, 2);
            } else {
                filename = `export-${timestamp}.json`;
                fileContent = JSON.stringify(exportData, null, 2);
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
            console.error('خطأ في تصدير البيانات:', error);
            return { success: false, error: error.message };
        }
    }

    async importData(filePath) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const importData = JSON.parse(fileContent);

            if (!importData.collections) {
                return { success: false, error: 'تنسيق ملف الاستيراد غير صالح' };
            }

            // استيراد البيانات
            if (importData.collections.users) {
                await User.deleteMany({});
                await User.insertMany(importData.collections.users);
            }

            if (importData.collections.stories) {
                await Story.deleteMany({});
                await Story.insertMany(importData.collections.stories);
            }

            if (importData.collections.messages) {
                await Message.deleteMany({});
                await Message.insertMany(importData.collections.messages);
            }

            if (importData.collections.channels) {
                await Channel.deleteMany({});
                await Channel.insertMany(importData.collections.channels);
            }

            if (importData.collections.localData) {
                this.saveData(importData.collections.localData);
            }

            return { success: true, message: 'تم استيراد البيانات بنجاح' };
        } catch (error) {
            console.error('خطأ في استيراد البيانات:', error);
            return { success: false, error: error.message };
        }
    }

    updateStats() {
        const data = this.loadData();
        data.stats = {
            totalUsers: data.users.length,
            totalMessages: data.messages.length,
            totalStories: data.stories.length,
            totalChannels: data.channels.length,
            lastUpdate: new Date().toISOString()
        };
        this.saveData(data);
        return data.stats;
    }
}

const localStorageService = new LocalStorageService();

// دوال التخزين المحلي
const saveUserToLocal = async (user) => {
    try {
        const data = localStorageService.loadData();
        const userIndex = data.users.findIndex(u => u._id === user._id.toString());
        
        const userData = {
            _id: user._id.toString(),
            fullName: user.fullName,
            phone: user.phone,
            university: user.university,
            major: user.major,
            batch: user.batch,
            role: user.role,
            isOnline: user.isOnline,
            isActive: user.isActive,
            createdAt: user.createdAt,
            lastSeen: user.lastSeen
        };

        if (userIndex >= 0) {
            data.users[userIndex] = userData;
        } else {
            data.users.push(userData);
        }

        localStorageService.saveData(data);
        localStorageService.updateStats();
        console.log('✅ تم حفظ المستخدم في التخزين المحلي');
    } catch (error) {
        console.error('❌ خطأ في حفظ المستخدم محلياً:', error);
    }
};

const saveMessageToLocal = async (message) => {
    try {
        const data = localStorageService.loadData();
        data.messages.push({
            _id: message._id.toString(),
            conversationId: message.conversationId.toString(),
            senderId: message.senderId.toString(),
            content: message.content.substring(0, 100),
            messageType: message.messageType,
            createdAt: message.createdAt,
            readCount: message.readBy.length
        });

        localStorageService.saveData(data);
        localStorageService.updateStats();
        console.log('✅ تم حفظ الرسالة في التخزين المحلي');
    } catch (error) {
        console.error('❌ خطأ في حفظ الرسالة محلياً:', error);
    }
};

const saveStoryToLocal = async (story) => {
    try {
        const data = localStorageService.loadData();
        data.stories.push({
            _id: story._id.toString(),
            userId: story.userId.toString(),
            mediaType: story.mediaType,
            caption: story.caption || 'بدون وصف',
            createdAt: story.createdAt,
            expiresAt: story.expiresAt,
            views: story.views.length,
            reactions: story.reactions.length
        });

        localStorageService.saveData(data);
        localStorageService.updateStats();
        console.log('✅ تم حفظ الستوري في التخزين المحلي');
    } catch (error) {
        console.error('❌ خطأ في حفظ الستوري محلياً:', error);
    }
};

const saveChannelToLocal = async (channel) => {
    try {
        const data = localStorageService.loadData();
        data.channels.push({
            _id: channel._id.toString(),
            name: channel.name,
            type: channel.type,
            creatorId: channel.creatorId.toString(),
            members: channel.members.length,
            isPublic: channel.isPublic,
            createdAt: channel.createdAt
        });

        localStorageService.saveData(data);
        localStorageService.updateStats();
        console.log('✅ تم حفظ القناة في التخزين المحلي');
    } catch (error) {
        console.error('❌ خطأ في حفظ القناة محلياً:', error);
    }
};

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
        const user = await User.findById(decoded.userId).select('-password');
        
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

        if (user.isLocked) {
            return res.status(401).json({ 
                success: false, 
                message: 'الحساب مؤقتاً مغلق due to multiple failed login attempts',
                code: 'ACCOUNT_LOCKED'
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
            console.error('خطأ في المصادقة:', error);
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

const requireModerator = (req, res, next) => {
    if (!['admin', 'moderator'].includes(req.user.role)) {
        return res.status(403).json({ 
            success: false, 
            message: 'صلاحيات مشرف مطلوبة',
            code: 'MODERATOR_REQUIRED'
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
        badges: user.badges,
        stats: user.stats,
        settings: user.settings,
        createdAt: user.createdAt,
        isActive: user.isActive
    };
};

const sendNotification = async (userId, type, title, message, data = null, actionUrl = null) => {
    try {
        const notification = new Notification({
            userId,
            type,
            title,
            message,
            data,
            actionUrl,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        
        await notification.save();
        
        const userSocket = connectedUsers.get(userId.toString());
        if (userSocket) {
            io.to(userSocket).emit('new_notification', {
                notification: {
                    _id: notification._id,
                    type: notification.type,
                    title: notification.title,
                    message: notification.message,
                    isRead: notification.isRead,
                    createdAt: notification.createdAt,
                    actionUrl: notification.actionUrl
                }
            });
        }
        
        return notification;
    } catch (error) {
        console.error('خطأ في إرسال الإشعار:', error);
    }
};

const auditLog = async (action, userId, targetType, targetId, details = {}) => {
    try {
        console.log(`📋 Audit Log: ${action} by ${userId} on ${targetType} ${targetId}`, details);
        
        // حفظ في التخزين المحلي
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
        console.error('خطأ في تسجيل التدقيق:', error);
    }
};

// الاتصال بقاعدة البيانات
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
    createDefaultAdmin();
})
.catch((error) => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error);
    process.exit(1);
});

async function createDefaultAdmin() {
    try {
        const adminExists = await User.findOne({ phone: '500000000' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('77007700', 12);
            const admin = new User({
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
            
            await admin.save();
            await saveUserToLocal(admin);
            
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
            console.log('📱 رقم الهاتف: 500000000');
            console.log('🔑 كلمة المرور: 77007700');
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء حساب المدير:', error);
    }
}

// تخزين المستخدمين المتصلين
const connectedUsers = new Map();
const userSockets = new Map();

// مسارات API

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

        // التحقق من صحة رقم الهاتف
        const phoneRegex = /^[0-9]{10,15}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف غير صالح',
                code: 'INVALID_PHONE'
            });
        }

        // التحقق من عدم وجود مستخدم بنفس رقم الهاتف
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف مسجل مسبقاً',
                code: 'PHONE_EXISTS'
            });
        }

        // التحقق من قوة كلمة المرور
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
                code: 'WEAK_PASSWORD'
            });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);

        // إنشاء المستخدم
        const user = new User({
            fullName: fullName.trim(),
            phone,
            university,
            major,
            batch,
            password: hashedPassword,
            email: email || null,
            studentId: studentId || null
        });

        await user.save();
        await saveUserToLocal(user);
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

        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف وكلمة المرور مطلوبان',
                code: 'MISSING_CREDENTIALS'
            });
        }

        const user = await User.findOne({ phone });
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

        if (user.isLocked) {
            return res.status(401).json({
                success: false,
                message: 'الحساب مؤقتاً مغلق due to multiple failed login attempts',
                code: 'ACCOUNT_LOCKED'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            await user.incrementLoginAttempts();
            return res.status(401).json({
                success: false,
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // إعادة تعيين محاولات تسجيل الدخول
        await user.updateOne({
            $set: { 
                'security.loginAttempts': 0,
                'security.lastPasswordChange': Date.now()
            },
            $unset: { 'security.lockUntil': 1 }
        });

        // تحديث حالة الاتصال
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await auditLog('LOGIN', user._id, 'user', user._id, { phone });

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: formatUserResponse(user),
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'رمز التحديث مطلوب',
                code: 'REFRESH_TOKEN_REQUIRED'
            });
        }

        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: 'رمز تحديث غير صالح',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود أو غير نشط',
                code: 'USER_NOT_FOUND'
            });
        }

        const newToken = generateToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        res.json({
            success: true,
            message: 'تم تحديث الرمز بنجاح',
            data: {
                token: newToken,
                refreshToken: newRefreshToken
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث الرمز:', error);
        res.status(401).json({
            success: false,
            message: 'رمز تحديث غير صالح',
            code: 'INVALID_REFRESH_TOKEN'
        });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        req.user.isOnline = false;
        req.user.lastSeen = new Date();
        await req.user.save();

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

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        await saveUserToLocal(user);
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

app.put('/api/users/me/settings', authenticateToken, async (req, res) => {
    try {
        const { privacy, notificationSettings, appearance } = req.body;
        const updates = {};

        if (privacy) updates['settings.privacy'] = privacy;
        if (notificationSettings) updates['settings.notificationSettings'] = notificationSettings;
        if (appearance) updates['settings.appearance'] = appearance;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true }
        );

        await auditLog('UPDATE_SETTINGS', req.user._id, 'user', req.user._id, { settings: updates });

        res.json({
            success: true,
            message: 'تم تحديث الإعدادات بنجاح',
            data: {
                user: formatUserResponse(user)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث الإعدادات:', error);
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

        const { caption, allowReplies = true, allowSharing = true, location } = req.body;
        const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

        const story = new Story({
            userId: req.user._id,
            mediaUrl: `/uploads/stories/${req.file.filename}`,
            mediaType,
            caption,
            allowReplies,
            allowSharing,
            location: location ? JSON.parse(location) : null,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        await story.save();
        await saveStoryToLocal(story);
        await auditLog('CREATE_STORY', req.user._id, 'story', story._id, { mediaType });

        // إرسال إشعار للمتابعين
        io.emit('new_story', {
            story: {
                ...story.toObject(),
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
        const stories = await Story.find({
            expiresAt: { $gt: new Date() }
        })
        .populate('userId', 'fullName avatar university major')
        .sort({ createdAt: -1 })
        .limit(50);

        res.json({
            success: true,
            data: { stories }
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

// مسارات المحادثات
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.user._id
        })
        .populate('participants', 'fullName avatar university isOnline lastSeen')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

        res.json({
            success: true,
            data: { conversations }
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

app.post('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantIds, isGroup = false, groupName, groupDescription } = req.body;
        
        if (!isGroup && (!participantIds || participantIds.length !== 1)) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد مشارك واحد للمحادثة الفردية',
                code: 'INVALID_PARTICIPANTS'
            });
        }

        if (isGroup && (!groupName || !participantIds || participantIds.length < 2)) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد اسم المجموعة واثنين من المشاركين على الأقل',
                code: 'INVALID_GROUP_DATA'
            });
        }

        const participants = [...new Set([req.user._id.toString(), ...participantIds])];
        
        let conversation;
        if (!isGroup) {
            // البحث عن محادثة فردية موجودة
            conversation = await Conversation.findOne({
                isGroup: false,
                participants: { $all: participants, $size: participants.length }
            });
        }

        if (!conversation) {
            conversation = new Conversation({
                participants,
                isGroup,
                groupName: isGroup ? groupName : null,
                groupDescription: isGroup ? groupDescription : null,
                groupAdmins: isGroup ? [req.user._id] : [],
                metadata: {
                    createdBy: req.user._id
                }
            });

            await conversation.save();
            await auditLog('CREATE_CONVERSATION', req.user._id, 'conversation', conversation._id, { isGroup, participants });
        }

        await conversation.populate('participants', 'fullName avatar university isOnline lastSeen');

        res.status(201).json({
            success: true,
            message: isGroup ? 'تم إنشاء المجموعة بنجاح' : 'تم إنشاء المحادثة بنجاح',
            data: { conversation }
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء المحادثة:', error);
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
        const { type, page = 1, limit = 20, search } = req.query;
        const query = { isActive: true };

        if (type) query.type = type;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const channels = await Channel.find(query)
            .populate('creatorId', 'fullName avatar')
            .populate('members', 'fullName avatar')
            .sort({ 'stats.memberCount': -1, createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Channel.countDocuments(query);

        res.json({
            success: true,
            data: {
                channels,
                pagination: {
                    current: page,
                    pages: Math.ceil(total / limit),
                    total
                }
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

        const channel = new Channel({
            name: name.trim(),
            description,
            type,
            isPublic,
            creatorId: req.user._id,
            members: [req.user._id],
            admins: [req.user._id],
            topics: topics ? JSON.parse(topics) : [],
            rules: rules ? JSON.parse(rules) : []
        });

        if (req.file) {
            channel.avatar = `/uploads/channels/${req.file.filename}`;
        }

        await channel.save();
        await saveChannelToLocal(channel);
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
        const userStats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
                    onlineUsers: { $sum: { $cond: ['$isOnline', 1, 0] } },
                    byRole: {
                        $push: {
                            role: '$role',
                            count: 1
                        }
                    }
                }
            },
            {
                $project: {
                    totalUsers: 1,
                    activeUsers: 1,
                    onlineUsers: 1,
                    byRole: {
                        $arrayToObject: {
                            $map: {
                                input: '$byRole',
                                as: 'item',
                                in: {
                                    k: '$$item.role',
                                    v: '$$item.count'
                                }
                            }
                        }
                    }
                }
            }
        ]);

        const storyStats = await Story.aggregate([
            {
                $match: {
                    expiresAt: { $gt: new Date() }
                }
            },
            {
                $group: {
                    _id: null,
                    totalStories: { $sum: 1 },
                    activeStories: { $sum: 1 },
                    imageStories: { $sum: { $cond: [{ $eq: ['$mediaType', 'image'] }, 1, 0] } },
                    videoStories: { $sum: { $cond: [{ $eq: ['$mediaType', 'video'] }, 1, 0] } },
                    totalViews: { $sum: { $size: '$views' } },
                    totalReactions: { $sum: { $size: '$reactions' } }
                }
            }
        ]);

        const channelStats = await Channel.aggregate([
            {
                $group: {
                    _id: null,
                    totalChannels: { $sum: 1 },
                    activeChannels: { $sum: { $cond: ['$isActive', 1, 0] } },
                    publicChannels: { $sum: { $cond: ['$isPublic', 1, 0] } },
                    totalMembers: { $sum: { $size: '$members' } },
                    byType: {
                        $push: {
                            type: '$type',
                            count: 1
                        }
                    }
                }
            },
            {
                $project: {
                    totalChannels: 1,
                    activeChannels: 1,
                    publicChannels: 1,
                    totalMembers: 1,
                    byType: {
                        $arrayToObject: {
                            $map: {
                                input: '$byType',
                                as: 'item',
                                in: {
                                    k: '$$item.type',
                                    v: '$$item.count'
                                }
                            }
                        }
                    }
                }
            }
        ]);

        const messageStats = await Message.aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: null,
                    messagesLast24h: { $sum: 1 },
                    byType: {
                        $push: {
                            type: '$messageType',
                            count: 1
                        }
                    }
                }
            },
            {
                $project: {
                    messagesLast24h: 1,
                    byType: {
                        $arrayToObject: {
                            $map: {
                                input: '$byType',
                                as: 'item',
                                in: {
                                    k: '$$item.type',
                                    v: '$$item.count'
                                }
                            }
                        }
                    }
                }
            }
        ]);

        const localStats = localStorageService.loadData().stats;

        const stats = {
            users: userStats[0] || { totalUsers: 0, activeUsers: 0, onlineUsers: 0, byRole: {} },
            stories: storyStats[0] || { totalStories: 0, activeStories: 0, imageStories: 0, videoStories: 0, totalViews: 0, totalReactions: 0 },
            channels: channelStats[0] || { totalChannels: 0, activeChannels: 0, publicChannels: 0, totalMembers: 0, byType: {} },
            messages: messageStats[0] || { messagesLast24h: 0, byType: {} },
            local: localStats,
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version,
                mongodbConnected: mongoose.connection.readyState === 1
            }
        };

        res.json({
            success: true,
            data: { stats }
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

// مسارات النسخ الاحتياطي والاستعادة
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

app.post('/api/admin/restore', authenticateToken, requireAdmin, upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'ملف النسخة الاحتياطية مطلوب',
                code: 'BACKUP_FILE_REQUIRED'
            });
        }

        const result = await localStorageService.restoreBackup(req.file.filename);
        
        if (result.success) {
            await auditLog('RESTORE_BACKUP', req.user._id, 'system', 'backup', { filename: req.file.filename });
            res.json({
                success: true,
                message: 'تم استعادة النسخة الاحتياطية بنجاح',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في استعادة النسخة الاحتياطية',
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ خطأ في استعادة النسخة الاحتياطية:', error);
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

app.post('/api/admin/import', authenticateToken, requireAdmin, upload.single('import'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'ملف الاستيراد مطلوب',
                code: 'IMPORT_FILE_REQUIRED'
            });
        }

        const result = await localStorageService.importData(req.file.path);
        
        if (result.success) {
            await auditLog('IMPORT_DATA', req.user._id, 'system', 'import', { filename: req.file.filename });
            res.json({
                success: true,
                message: 'تم استيراد البيانات بنجاح',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في استيراد البيانات',
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ خطأ في استيراد البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات التقرير
app.post('/api/reports', authenticateToken, async (req, res) => {
    try {
        const { targetType, targetId, reason, description } = req.body;

        if (!targetType || !targetId || !reason) {
            return res.status(400).json({
                success: false,
                message: 'نوع الهدف ومعرف الهدف والسبب مطلوبون',
                code: 'MISSING_FIELDS'
            });
        }

        const report = new Report({
            reporterId: req.user._id,
            targetType,
            targetId,
            reason,
            description
        });

        await report.save();
        await auditLog('CREATE_REPORT', req.user._id, 'report', report._id, { targetType, targetId, reason });

        // إرسال إشعار للمشرفين
        const admins = await User.find({ role: { $in: ['admin', 'moderator'] } });
        for (const admin of admins) {
            await sendNotification(
                admin._id,
                'system',
                'تقرير جديد',
                `تم تقديم تقرير جديد عن ${targetType}`,
                { reportId: report._id, targetType, targetId },
                '/admin/reports'
            );
        }

        res.status(201).json({
            success: true,
            message: 'تم تقديم التقرير بنجاح',
            data: { report }
        });

    } catch (error) {
        console.error('❌ خطأ في تقديم التقرير:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات الصحة والتشخيص
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            environment: NODE_ENV,
            version: '1.0.0'
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

app.get('/api/debug/paths', authenticateToken, requireAdmin, (req, res) => {
    const paths = {
        root: __dirname,
        uploads: UPLOAD_DIR,
        backups: BACKUP_DIR,
        exports: EXPORT_DIR,
        public: path.join(__dirname, 'public'),
        requiredDirs: requiredDirs,
        exists: {
            uploads: fs.existsSync(UPLOAD_DIR),
            backups: fs.existsSync(BACKUP_DIR),
            exports: fs.existsSync(EXPORT_DIR),
            public: fs.existsSync(path.join(__dirname, 'public'))
        }
    };
    
    res.json({
        success: true,
        data: paths
    });
});

// مسار رئيسي للتحقق من عمل الخادم
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية يعمل بنجاح!',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
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

// Socket.IO Events
io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    socket.on('user_online', async (userId) => {
        try {
            connectedUsers.set(userId, socket.id);
            userSockets.set(socket.id, userId);
            
            await User.findByIdAndUpdate(userId, {
                isOnline: true,
                lastSeen: new Date()
            });
            
            socket.broadcast.emit('user_status_changed', {
                userId,
                isOnline: true,
                lastSeen: new Date()
            });
            
            console.log(`🟢 المستخدم ${userId} متصل الآن`);
        } catch (error) {
            console.error('❌ خطأ في تحديث حالة الاتصال:', error);
        }
    });

    socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`💬 المستخدم انضم للمحادثة: ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
        console.log(`💬 المستخدم غادر المحادثة: ${conversationId}`);
    });

    socket.on('join_channel', (channelId) => {
        socket.join(`channel_${channelId}`);
        console.log(`📢 المستخدم انضم للقناة: ${channelId}`);
    });

    socket.on('leave_channel', (channelId) => {
        socket.leave(`channel_${channelId}`);
        console.log(`📢 المستخدم غادر القناة: ${channelId}`);
    });

    socket.on('typing_start', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
            userId: data.userId,
            conversationId: data.conversationId,
            isTyping: true
        });
    });

    socket.on('typing_stop', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
            userId: data.userId,
            conversationId: data.conversationId,
            isTyping: false
        });
    });

    socket.on('send_message', async (data) => {
        try {
            const message = new Message({
                conversationId: data.conversationId,
                senderId: data.senderId,
                content: data.content,
                messageType: data.messageType || 'text',
                fileUrl: data.fileUrl,
                fileSize: data.fileSize,
                replyTo: data.replyTo
            });

            await message.save();
            await saveMessageToLocal(message);

            // تحديث المحادثة الأخيرة
            await Conversation.findByIdAndUpdate(data.conversationId, {
                lastMessage: message._id,
                updatedAt: new Date()
            });

            // زيادة عداد الرسائل للمستخدم
            await User.findByIdAndUpdate(data.senderId, {
                $inc: { 'stats.messagesSent': 1 }
            });

            const populatedMessage = await Message.findById(message._id)
                .populate('senderId', 'fullName avatar university')
                .populate('replyTo');

            // إرسال الرسالة لجميع المشاركين في المحادثة
            io.to(`conversation_${data.conversationId}`).emit('new_message', {
                message: populatedMessage
            });

            // إرسال إشعارات للمستخدمين غير المتصلين
            const conversation = await Conversation.findById(data.conversationId);
            for (const participantId of conversation.participants) {
                if (participantId.toString() !== data.senderId) {
                    const isOnline = connectedUsers.has(participantId.toString());
                    if (!isOnline) {
                        await sendNotification(
                            participantId,
                            'message',
                            'رسالة جديدة',
                            `${populatedMessage.senderId.fullName}: ${data.content.substring(0, 50)}...`,
                            { 
                                conversationId: data.conversationId,
                                messageId: message._id 
                            },
                            `/conversations/${data.conversationId}`
                        );
                    }
                }
            }

            await auditLog('SEND_MESSAGE', data.senderId, 'message', message._id, { 
                conversationId: data.conversationId,
                messageType: data.messageType 
            });

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            socket.emit('message_error', {
                error: 'فشل في إرسال الرسالة',
                code: 'MESSAGE_SEND_FAILED'
            });
        }
    });

    socket.on('message_read', async (data) => {
        try {
            await Message.findByIdAndUpdate(data.messageId, {
                $addToSet: {
                    readBy: {
                        userId: data.userId,
                        readAt: new Date()
                    }
                }
            });

            socket.to(`conversation_${data.conversationId}`).emit('message_read_update', {
                messageId: data.messageId,
                userId: data.userId,
                readAt: new Date()
            });

        } catch (error) {
            console.error('❌ خطأ في تحديث حالة القراءة:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const userId = userSockets.get(socket.id);
            
            if (userId) {
                connectedUsers.delete(userId);
                userSockets.delete(socket.id);
                
                await User.findByIdAndUpdate(userId, {
                    isOnline: false,
                    lastSeen: new Date()
                });
                
                socket.broadcast.emit('user_status_changed', {
                    userId,
                    isOnline: false,
                    lastSeen: new Date()
                });
                
                console.log(`🔴 المستخدم ${userId} انقطع`);
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة قطع الاتصال:', error);
        }
        
        console.log('🔌 مستخدم منقطع:', socket.id);
    });
});

// بدء الخادم
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 خادم المنصة التعليمية يعمل بنجاح!
📍 العنوان: http://localhost:${PORT}
📊 البيئة: ${NODE_ENV}
⏰ الوقت: ${new Date().toLocaleString('ar-SA')}
🗄️  قاعدة البيانات: ${mongoose.connection.readyState === 1 ? 'متصل' : 'غير متصل'}
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
        await User.updateMany(
            { isOnline: true },
            { 
                isOnline: false,
                lastSeen: new Date()
            }
        );
        
        // إنشاء نسخة احتياطية نهائية
        await localStorageService.createBackup();
        
        // إغلاق اتصالات قاعدة البيانات
        await mongoose.connection.close();
        
        console.log('✅ تم الإغلاق النظيف للخادم');
        process.exit(0);
    } catch (error) {
        console.error('❌ خطأ في الإغلاق النظيف:', error);
        process.exit(1);
    }
});

export default app;
