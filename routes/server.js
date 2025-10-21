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
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-2024';
const NODE_ENV = process.env.NODE_ENV || 'development';
const BACKUP_DIR = path.join(__dirname, 'backups');
const EXPORT_DIR = path.join(__dirname, 'exports');

// إنشاء المجلدات اللازمة
const requiredDirs = ['uploads', 'uploads/profiles', 'uploads/stories', 'uploads/channels', 'uploads/files', BACKUP_DIR, EXPORT_DIR];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
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
app.use('/uploads', express.static('uploads'));
app.use('/exports', express.static('exports'));

// إعداد multer للتحميلات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'uploads/';
        if (file.fieldname === 'avatar') uploadPath += 'profiles/';
        else if (file.fieldname === 'story') uploadPath += 'stories/';
        else if (file.fieldname === 'channelAvatar') uploadPath += 'channels/';
        else if (file.fieldname === 'file') uploadPath += 'files/';
        else if (file.fieldname === 'backup') uploadPath += 'backups/';
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
            } else if (format === 'csv') {
                // تحويل البيانات إلى CSV (مبسط)
                filename = `export-${timestamp}.zip`;
                fileContent = this.convertToCSV(exportData);
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

    convertToCSV(data) {
        // تحويل مبكر للبيانات إلى CSV
        // يمكن تطوير هذا الجزء ليكون أكثر تعقيداً
        let csvContent = '';

        // تصدير المستخدمين
        if (data.collections.users) {
            csvContent += 'المستخدمين\n';
            csvContent += 'الاسم,الهاتف,الجامعة,التخصص,الدور\n';
            data.collections.users.forEach(user => {
                csvContent += `${user.fullName},${user.phone},${user.university},${user.major},${user.role}\n`;
            });
            csvContent += '\n';
        }

        return csvContent;
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
            
            console.log('✅ تم إنشاء حساب المدير الافتراضي بنجاح');
            console.log('📱 رقم الهاتف: 500000000');
            console.log('🔐 كلمة المرور: 77007700');
        } else {
            console.log('✅ حساب المدير موجود بالفعل');
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء حساب المدير:', error);
    }
}

// تخزين المستخدمين المتصلين
const connectedUsers = new Map();
const userSockets = new Map();

// مسارات API
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'مرحباً بك في منصتنا التعليمية! 🎓',
        version: '2.0.0',
        environment: NODE_ENV,
        features: [
            'التخزين المحلي المحسن',
            'نظام النسخ الاحتياطي',
            'استيراد/تصدير البيانات',
            'إدارة متقدمة للمستخدمين',
            'نظام الإشعارات',
            'التدوين والقصص',
            'المحادثات الفورية',
            'القنوات والمجموعات'
        ],
        endpoints: {
            auth: '/api/auth/*',
            users: '/api/users/*',
            stories: '/api/stories/*',
            messages: '/api/messages/*',
            channels: '/api/channels/*',
            admin: '/api/admin/*',
            backup: '/api/backup/*'
        }
    });
});

// مسارات المصادقة
app.post('/api/auth/register', upload.single('avatar'), async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password, bio, email, studentId } = req.body;

        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول الإلزامية مطلوبة',
                code: 'MISSING_FIELDS'
            });
        }

        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف مسجل بالفعل',
                code: 'PHONE_EXISTS'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const avatar = req.file ? `/uploads/profiles/${req.file.filename}` : null;

        const user = new User({
            fullName,
            phone,
            university,
            major,
            batch,
            password: hashedPassword,
            avatar,
            bio,
            email,
            studentId
        });

        await user.save();
        await saveUserToLocal(user);

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await auditLog('REGISTER', user._id, 'user', user._id, {
            university,
            major,
            batch
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            user: formatUserResponse(user),
            token,
            refreshToken
        });

    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء التسجيل',
            code: 'REGISTRATION_ERROR'
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
                'security.lockUntil': null,
                isOnline: true,
                lastSeen: new Date()
            }
        });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await auditLog('LOGIN', user._id, 'user', user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: formatUserResponse(user),
            token,
            refreshToken
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تسجيل الدخول',
            code: 'LOGIN_ERROR'
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
                message: 'المستخدم غير موجود أو الحساب موقوف',
                code: 'USER_NOT_FOUND'
            });
        }

        const newToken = generateToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        res.json({
            success: true,
            token: newToken,
            refreshToken: newRefreshToken
        });

    } catch (error) {
        console.error('خطأ في تحديث الرمز:', error);
        res.status(401).json({
            success: false,
            message: 'رمز تحديث غير صالح',
            code: 'INVALID_REFRESH_TOKEN'
        });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            $set: {
                isOnline: false,
                lastSeen: new Date()
            }
        });

        await auditLog('LOGOUT', req.user._id, 'user', req.user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });

    } catch (error) {
        console.error('خطأ في تسجيل الخروج:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تسجيل الخروج',
            code: 'LOGOUT_ERROR'
        });
    }
});

// مسارات النسخ الاحتياطي والاستيراد/التصدير
app.get('/api/backup/create', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await localStorageService.createBackup();
        
        if (result.success) {
            await auditLog('BACKUP_CREATED', req.user._id, 'system', 'backup', {
                filename: result.filename
            });
            
            res.json({
                success: true,
                message: 'تم إنشاء النسخة الاحتياطية بنجاح',
                filename: result.filename
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في إنشاء النسخة الاحتياطية',
                error: result.error
            });
        }
    } catch (error) {
        console.error('خطأ في إنشاء النسخة الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء النسخة الاحتياطية',
            error: error.message
        });
    }
});

app.get('/api/backup/list', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const data = localStorageService.loadData();
        res.json({
            success: true,
            backups: data.backups || []
        });
    } catch (error) {
        console.error('خطأ في جلب قائمة النسخ الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب قائمة النسخ الاحتياطية',
            error: error.message
        });
    }
});

app.post('/api/backup/restore/:filename', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { filename } = req.params;
        const result = await localStorageService.restoreBackup(filename);
        
        if (result.success) {
            await auditLog('BACKUP_RESTORED', req.user._id, 'system', 'backup', {
                filename: filename
            });
            
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'فشل في استعادة النسخة الاحتياطية',
                error: result.error
            });
        }
    } catch (error) {
        console.error('خطأ في استعادة النسخة الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء استعادة النسخة الاحتياطية',
            error: error.message
        });
    }
});

app.delete('/api/backup/delete/:filename', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { filename } = req.params;
        const backupPath = path.join(BACKUP_DIR, filename);
        
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({
                success: false,
                message: 'النسخة الاحتياطية غير موجودة'
            });
        }

        fs.unlinkSync(backupPath);
        
        // تحديث قائمة النسخ الاحتياطية
        const data = localStorageService.loadData();
        data.backups = data.backups.filter(backup => backup.filename !== filename);
        localStorageService.saveData(data);
        
        await auditLog('BACKUP_DELETED', req.user._id, 'system', 'backup', {
            filename: filename
        });
        
        res.json({
            success: true,
            message: 'تم حذف النسخة الاحتياطية بنجاح'
        });
    } catch (error) {
        console.error('خطأ في حذف النسخة الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء حذف النسخة الاحتياطية',
            error: error.message
        });
    }
});

app.get('/api/export/:format?', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const format = req.params.format || 'json';
        const result = await localStorageService.exportData(format);
        
        if (result.success) {
            await auditLog('DATA_EXPORTED', req.user._id, 'system', 'export', {
                format: format,
                filename: result.filename
            });
            
            res.json({
                success: true,
                message: 'تم تصدير البيانات بنجاح',
                filename: result.filename,
                downloadUrl: `/exports/${result.filename}`
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في تصدير البيانات',
                error: result.error
            });
        }
    } catch (error) {
        console.error('خطأ في تصدير البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تصدير البيانات',
            error: error.message
        });
    }
});

app.post('/api/import', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'الملف مطلوب للاستيراد'
            });
        }

        const result = await localStorageService.importData(req.file.path);
        
        if (result.success) {
            await auditLog('DATA_IMPORTED', req.user._id, 'system', 'import', {
                filename: req.file.filename
            });
            
            // حذف الملف المؤقت
            fs.unlinkSync(req.file.path);
            
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'فشل في استيراد البيانات',
                error: result.error
            });
        }
    } catch (error) {
        console.error('خطأ في استيراد البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء استيراد البيانات',
            error: error.message
        });
    }
});

app.get('/api/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const storyCount = await Story.countDocuments();
        const messageCount = await Message.countDocuments();
        const channelCount = await Channel.countDocuments();
        
        const localStats = localStorageService.updateStats();
        const backupStats = localStorageService.loadData().backups || [];
        
        const onlineUsers = Array.from(connectedUsers.keys()).length;
        
        res.json({
            success: true,
            stats: {
                database: {
                    users: userCount,
                    stories: storyCount,
                    messages: messageCount,
                    channels: channelCount
                },
                local: localStats,
                system: {
                    onlineUsers,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    backups: backupStats.length,
                    lastBackup: localStorageService.loadData().lastBackup
                }
            }
        });
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب الإحصائيات',
            error: error.message
        });
    }
});

// مسارات المستخدمين
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({
            success: true,
            user: formatUserResponse(user)
        });
    } catch (error) {
        console.error('خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب بيانات المستخدم',
            code: 'USER_FETCH_ERROR'
        });
    }
});

app.put('/api/users/me', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { fullName, bio, email, studentId } = req.body;
        const updateData = { fullName, bio, email, studentId };
        
        if (req.file) {
            updateData.avatar = `/uploads/profiles/${req.file.filename}`;
        }
        
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateData },
            { new: true, runValidators: true }
        );
        
        await saveUserToLocal(user);
        await auditLog('PROFILE_UPDATE', req.user._id, 'user', req.user._id, updateData);
        
        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            user: formatUserResponse(user)
        });
    } catch (error) {
        console.error('خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تحديث الملف الشخصي',
            code: 'PROFILE_UPDATE_ERROR'
        });
    }
});

app.put('/api/users/settings', authenticateToken, async (req, res) => {
    try {
        const { privacy, notificationSettings, appearance } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { 
                $set: { 
                    'settings.privacy': privacy,
                    'settings.notificationSettings': notificationSettings,
                    'settings.appearance': appearance
                } 
            },
            { new: true }
        );
        
        await auditLog('SETTINGS_UPDATE', req.user._id, 'user', req.user._id, {
            privacy: Object.keys(privacy || {}),
            notifications: Object.keys(notificationSettings || {}),
            appearance: Object.keys(appearance || {})
        });
        
        res.json({
            success: true,
            message: 'تم تحديث الإعدادات بنجاح',
            settings: user.settings
        });
    } catch (error) {
        console.error('خطأ في تحديث الإعدادات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تحديث الإعدادات',
            code: 'SETTINGS_UPDATE_ERROR'
        });
    }
});

// مسارات الإدارة
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search, role, isActive } = req.query;
        const query = {};
        
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { university: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (role) query.role = role;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await User.countDocuments(query);
        
        res.json({
            success: true,
            users: users.map(user => formatUserResponse(user)),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب المستخدمين',
            code: 'USERS_FETCH_ERROR'
        });
    }
});

app.put('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { role, isActive } = req.body;
        
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { role, isActive } },
            { new: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }
        
        await saveUserToLocal(user);
        await auditLog('USER_UPDATED', req.user._id, 'user', userId, { role, isActive });
        
        res.json({
            success: true,
            message: 'تم تحديث المستخدم بنجاح',
            user: formatUserResponse(user)
        });
    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تحديث المستخدم',
            code: 'USER_UPDATE_ERROR'
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
        const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
        
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
        
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.storiesPosted': 1 }
        });

        await auditLog('STORY_CREATED', req.user._id, 'story', story._id, {
            mediaType,
            hasCaption: !!caption
        });

        // إرسال إشعار للمتابعين
        io.emit('new_story', {
            story: {
                ...story.toObject(),
                userId: {
                    _id: req.user._id,
                    fullName: req.user.fullName,
                    avatar: req.user.avatar
                }
            }
        });

        res.status(201).json({
            success: true,
            message: 'تم نشر الستوري بنجاح',
            story
        });

    } catch (error) {
        console.error('خطأ في نشر الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء نشر الستوري',
            code: 'STORY_CREATE_ERROR'
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
            stories
        });
    } catch (error) {
        console.error('خطأ في جلب الستوريات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب الستوريات',
            code: 'STORIES_FETCH_ERROR'
        });
    }
});

app.post('/api/stories/:storyId/view', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        
        const story = await Story.findById(storyId);
        if (!story) {
            return res.status(404).json({
                success: false,
                message: 'الستوري غير موجود'
            });
        }

        // التحقق إذا كان المستخدم قد شاهد الستوري مسبقاً
        const alreadyViewed = story.views.some(view => 
            view.userId.toString() === req.user._id.toString()
        );

        if (!alreadyViewed) {
            story.views.push({
                userId: req.user._id,
                viewedAt: new Date()
            });
            
            story.metrics.viewCount += 1;
            await story.save();
            
            // إرسال تحديث للمستخدمين
            io.emit('story_viewed', {
                storyId: story._id,
                views: story.views
            });
        }

        res.json({
            success: true,
            message: 'تم تسجيل المشاهدة'
        });

    } catch (error) {
        console.error('خطأ في تسجيل مشاهدة الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تسجيل المشاهدة',
            code: 'STORY_VIEW_ERROR'
        });
    }
});

// مسارات القنوات
app.post('/api/channels', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description, type, isPublic = true, topics, rules } = req.body;
        
        const channel = new Channel({
            name,
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

        await channel.save();
        await saveChannelToLocal(channel);
        
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.channelsJoined': 1 }
        });

        await auditLog('CHANNEL_CREATED', req.user._id, 'channel', channel._id, {
            type,
            isPublic
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء القناة بنجاح',
            channel
        });

    } catch (error) {
        console.error('خطأ في إنشاء القناة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء القناة',
            code: 'CHANNEL_CREATE_ERROR'
        });
    }
});

app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, type, search } = req.query;
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
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Channel.countDocuments(query);
        
        res.json({
            success: true,
            channels,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('خطأ في جلب القنوات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب القنوات',
            code: 'CHANNELS_FETCH_ERROR'
        });
    }
});

// مسارات المحادثات
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.user._id
        })
        .populate('participants', 'fullName avatar isOnline')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

        res.json({
            success: true,
            conversations
        });
    } catch (error) {
        console.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب المحادثات',
            code: 'CONVERSATIONS_FETCH_ERROR'
        });
    }
});

// مسارات الرسائل
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId, content, messageType = 'text', replyTo } = req.body;
        
        let conversation;
        if (conversationId) {
            conversation = await Conversation.findById(conversationId);
        } else {
            // إنشاء محادثة جديدة
            const { participants, isGroup, groupName } = req.body;
            conversation = new Conversation({
                participants: participants || [req.user._id],
                isGroup: isGroup || false,
                groupName,
                groupAdmins: isGroup ? [req.user._id] : []
            });
            await conversation.save();
        }
        
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة',
                code: 'CONVERSATION_NOT_FOUND'
            });
        }
        
        const message = new Message({
            conversationId: conversation._id,
            senderId: req.user._id,
            content,
            messageType,
            replyTo
        });
        
        await message.save();
        await saveMessageToLocal(message);
        
        conversation.lastMessage = message._id;
        await conversation.save();
        
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.messagesSent': 1 }
        });

        await auditLog('MESSAGE_SENT', req.user._id, 'message', message._id, {
            conversationId: conversation._id,
            messageType
        });

        // إرسال الرسالة عبر WebSocket
        io.to(conversation._id.toString()).emit('new_message', {
            message: {
                ...message.toObject(),
                senderId: {
                    _id: req.user._id,
                    fullName: req.user.fullName,
                    avatar: req.user.avatar
                }
            }
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة بنجاح',
            message: {
                ...message.toObject(),
                senderId: {
                    _id: req.user._id,
                    fullName: req.user.fullName,
                    avatar: req.user.avatar
                }
            },
            conversationId: conversation._id
        });

    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إرسال الرسالة',
            code: 'MESSAGE_SEND_ERROR'
        });
    }
});

app.get('/api/messages/:conversationId', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        
        const messages = await Message.find({ conversationId })
            .populate('senderId', 'fullName avatar')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Message.countDocuments({ conversationId });
        
        res.json({
            success: true,
            messages: messages.reverse(),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب الرسائل',
            code: 'MESSAGES_FETCH_ERROR'
        });
    }
});

// WebSocket Handling
io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('user_connected', async (data) => {
        try {
            const { userId } = data;
            connectedUsers.set(userId.toString(), socket.id);
            userSockets.set(socket.id, userId.toString());
            
            await User.findByIdAndUpdate(userId, {
                $set: { isOnline: true }
            });
            
            socket.broadcast.emit('user_online', { userId });
            console.log(`✅ المستخدم ${userId} متصل الآن`);
        } catch (error) {
            console.error('خطأ في اتصال المستخدم:', error);
        }
    });

    socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`💬 المستخدم انضم للمحادثة: ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(conversationId);
        console.log(`🚪 المستخدم غادر المحادثة: ${conversationId}`);
    });

    socket.on('join_channel', (channelId) => {
        socket.join(channelId);
        console.log(`📢 المستخدم انضم للقناة: ${channelId}`);
    });

    socket.on('typing_start', (data) => {
        socket.to(data.conversationId).emit('user_typing', {
            userId: data.userId,
            userName: data.userName,
            isTyping: true
        });
    });

    socket.on('typing_stop', (data) => {
        socket.to(data.conversationId).emit('user_typing', {
            userId: data.userId,
            userName: data.userName,
            isTyping: false
        });
    });

    socket.on('send_message', async (data) => {
        try {
            const { conversationId, content, messageType } = data;
            
            const message = new Message({
                conversationId,
                senderId: data.userId,
                content,
                messageType
            });
            
            await message.save();
            await saveMessageToLocal(message);
            
            const conversation = await Conversation.findByIdAndUpdate(
                conversationId,
                { lastMessage: message._id },
                { new: true }
            );
            
            // إرسال الرسالة لجميع المشاركين في المحادثة
            io.to(conversationId).emit('new_message', {
                message: {
                    ...message.toObject(),
                    senderId: {
                        _id: data.userId,
                        fullName: data.userName
                    }
                }
            });
            
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
        }
    });

    socket.on('view_story', async (data) => {
        try {
            const { storyId } = data;
            const userId = userSockets.get(socket.id);
            
            if (!userId) return;
            
            const story = await Story.findById(storyId);
            if (story && !story.views.some(view => view.userId.toString() === userId)) {
                story.views.push({
                    userId,
                    viewedAt: new Date()
                });
                
                story.metrics.viewCount += 1;
                await story.save();
                
                io.emit('story_viewed', {
                    storyId: story._id,
                    views: story.views
                });
            }
        } catch (error) {
            console.error('خطأ في تسجيل مشاهدة الستوري:', error);
        }
    });

    socket.on('message_read', async (data) => {
        try {
            const { messageId, conversationId, userId } = data;
            
            await Message.findByIdAndUpdate(messageId, {
                $addToSet: { readBy: { userId, readAt: new Date() } }
            });
            
            socket.to(conversationId).emit('message_read_receipt', {
                messageId,
                userId,
                readAt: new Date()
            });
        } catch (error) {
            console.error('خطأ في تسجيل قراءة الرسالة:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const userId = userSockets.get(socket.id);
            if (userId) {
                connectedUsers.delete(userId);
                userSockets.delete(socket.id);
                
                await User.findByIdAndUpdate(userId, {
                    $set: { isOnline: false, lastSeen: new Date() }
                });
                
                socket.broadcast.emit('user_offline', { userId });
                console.log(`❌ المستخدم ${userId} انقطع عن الاتصال`);
            }
        } catch (error) {
            console.error('خطأ في فصل المستخدم:', error);
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

// بدء الخادم
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 البيئة: ${NODE_ENV}`);
    console.log(`📊 قاعدة البيانات: ${MONGODB_URI}`);
    console.log(`💾 التخزين المحلي: ${__dirname}`);
    console.log(`🔐 بيانات المدير: 500000000 / 77007700`);
    console.log('='.repeat(50));
});

// إغلاق نظيف للخادم
process.on('SIGINT', async () => {
    console.log('\n🛑 إيقاف الخادم...');
    
    try {
        // تحديث حالة جميع المستخدمين المتصلين إلى غير متصل
        await User.updateMany(
            { isOnline: true },
            { $set: { isOnline: false, lastSeen: new Date() } }
        );
        
        // إنشاء نسخة احتياطية نهائية
        await localStorageService.createBackup();
        
        console.log('✅ تم إنشاء النسخة الاحتياطية النهائية');
        console.log('✅ تم تحديث حالة المستخدمين');
        console.log('👋 تم إيقاف الخادم بنجاح');
        process.exit(0);
    } catch (error) {
        console.error('❌ خطأ في الإيقاف النظيف:', error);
        process.exit(1);
    }
});
// خدمة ملفات الـ Static (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// توجيه جميع الطلبات إلى index.html لـ Single Page Application
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
export default app;
