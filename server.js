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
    pingInterval: 25000,
    transports: ['websocket', 'polling'] // تحسين الاتصال
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
app.use(compression({
    level: 6,
    threshold: 0,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
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
app.use(express.json({ limit: '50mb' })); // زيادة الحد لتحميل الملفات الكبيرة
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, {
    maxAge: '1d', // caching للملفات
    etag: true
}));
app.use('/exports', express.static(EXPORT_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
}));

// إعداد multer للتحميلات مع تحسينات
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
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.sheet',
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

// نظام التخزين المحلي المحسن مع التخزين المؤقت
class EnhancedLocalStorageService {
    constructor() {
        this.dataFile = path.join(__dirname, 'local_data.json');
        this.cache = new Map(); // تخزين مؤقت للبيانات المتكررة
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
            if (this.cache.has('allData')) {
                return this.cache.get('allData');
            }
            
            const data = fs.readFileSync(this.dataFile, 'utf8');
            const parsedData = JSON.parse(data);
            this.cache.set('allData', parsedData);
            return parsedData;
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات المحلية:', error);
            return this.getDefaultData();
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            this.cache.set('allData', data); // تحديث التخزين المؤقت
            return true;
        } catch (error) {
            console.error('❌ خطأ في حفظ البيانات المحلية:', error);
            return false;
        }
    }

    clearCache() {
        this.cache.clear();
    }

    // دوال المستخدمين المحسنة
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
            email: user.email
        });
        
        return user;
    }

    async findUserByEmail(email) {
        // استخدام التخزين المؤقت للاستعلامات المتكررة
        const cacheKey = `user_email_${email}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const user = data.users.find(user => user.email === email && user.isActive);
        
        if (user) {
            this.cache.set(cacheKey, user);
        }
        
        return user;
    }

    async findUserById(userId) {
        const cacheKey = `user_id_${userId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const user = data.users.find(user => user._id === userId && user.isActive);
        
        if (user) {
            this.cache.set(cacheKey, user);
        }
        
        return user;
    }

    async searchUsers(query, limit = 20) {
        const data = this.loadData();
        const searchTerm = query.toLowerCase();
        
        return data.users
            .filter(user => 
                user.isActive && 
                (user.fullName.toLowerCase().includes(searchTerm) || 
                 user.email.toLowerCase().includes(searchTerm))
            )
            .slice(0, limit)
            .map(user => this.formatUserResponse(user));
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
            
            // تحديث التخزين المؤقت
            this.cache.delete(`user_id_${userId}`);
            this.cache.delete(`user_email_${data.users[userIndex].email}`);
            
            return data.users[userIndex];
        }
        return null;
    }

    async getAllUsers() {
        const data = this.loadData();
        return data.users.filter(user => user.isActive);
    }

    // دوال المحادثات المحسنة
    async createConversation(participants, name = null, type = 'direct') {
        const data = this.loadData();
        const conversationId = uuidv4();
        const conversation = {
            _id: conversationId,
            participants,
            name: name || `محادثة ${participants.length} أشخاص`,
            type,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: null,
            unreadCount: {},
            isGroup: participants.length > 2,
            settings: {
                allowInvites: true,
                adminOnlyPosts: false
            }
        };
        
        data.conversations.push(conversation);
        this.updateStats(data);
        this.saveData(data);
        return conversation;
    }

    async getConversationsByUserId(userId) {
        const cacheKey = `conversations_user_${userId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const conversations = data.conversations.filter(conv => 
            conv.participants.includes(userId)
        );
        
        this.cache.set(cacheKey, conversations);
        return conversations;
    }

    async getConversationById(conversationId) {
        const data = this.loadData();
        return data.conversations.find(conv => conv._id === conversationId);
    }

    async getOrCreateConversation(user1, user2) {
        const data = this.loadData();
        const existingConversation = data.conversations.find(conv => 
            conv.participants.includes(user1) && 
            conv.participants.includes(user2) &&
            conv.participants.length === 2
        );
        
        if (existingConversation) {
            return existingConversation;
        }
        
        return await this.createConversation([user1, user2]);
    }

    // دوال الرسائل المحسنة مع التجميع
    async createMessage(messageData) {
        const data = this.loadData();
        const messageId = uuidv4();
        const message = {
            _id: messageId,
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [messageData.senderId],
            reactions: [],
            edited: { isEdited: false },
            deleted: { isDeleted: false },
            metadata: {
                clientId: messageData.clientId || null,
                device: messageData.device || 'web'
            }
        };
        
        data.messages.push(message);
        
        // تحديث المحادثة الأخيرة
        const convIndex = data.conversations.findIndex(conv => conv._id === messageData.conversationId);
        if (convIndex !== -1) {
            data.conversations[convIndex].lastMessage = messageId;
            data.conversations[convIndex].updatedAt = new Date().toISOString();
            
            // زيادة عدد الرسائل غير المقروءة للمشاركين الآخرين
            data.conversations[convIndex].participants.forEach(participantId => {
                if (participantId !== messageData.senderId) {
                    data.conversations[convIndex].unreadCount[participantId] = 
                        (data.conversations[convIndex].unreadCount[participantId] || 0) + 1;
                }
            });
        }
        
        this.updateStats(data);
        this.saveData(data);
        
        // مسح التخزين المؤقت للمحادثات
        data.conversations[convIndex].participants.forEach(participantId => {
            this.cache.delete(`conversations_user_${participantId}`);
        });
        
        return message;
    }

    async getMessagesByConversation(conversationId, limit = 50, before = null) {
        const cacheKey = `messages_conv_${conversationId}_${limit}_${before}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        let messages = data.messages
            .filter(msg => msg.conversationId === conversationId && !msg.deleted.isDeleted);

        if (before) {
            const beforeDate = new Date(before);
            messages = messages.filter(msg => new Date(msg.createdAt) < beforeDate);
        }

        messages = messages
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit)
            .reverse();

        this.cache.set(cacheKey, messages);
        return messages;
    }

    async markMessagesAsRead(conversationId, userId) {
        const data = this.loadData();
        const convIndex = data.conversations.findIndex(conv => conv._id === conversationId);
        
        if (convIndex !== -1) {
            data.conversations[convIndex].unreadCount[userId] = 0;
            this.saveData(data);
            
            // تحديث التخزين المؤقت
            this.cache.delete(`conversations_user_${userId}`);
        }
        
        return true;
    }

    // دوال القنوات المحسنة
    async createChannel(channelData) {
        const data = this.loadData();
        const channelId = uuidv4();
        const channel = {
            _id: channelId,
            ...channelData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            members: channelData.members || [],
            admins: channelData.admins || [channelData.creatorId],
            settings: {
                public: channelData.public !== false,
                allowComments: true,
                adminOnlyPosts: false
            },
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

    async getUserChannels(userId) {
        const cacheKey = `channels_user_${userId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const channels = data.channels.filter(channel => 
            channel.isActive && 
            (channel.members.includes(userId) || channel.admins.includes(userId))
        );
        
        this.cache.set(cacheKey, channels);
        return channels;
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

    async getChannelMessages(channelId, limit = 50) {
        const data = this.loadData();
        return data.channelMessages
            .filter(msg => msg.channelId === channelId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(-limit); // آخر 50 رسالة فقط
    }

    async addMemberToChannel(channelId, userId) {
        const data = this.loadData();
        const channelIndex = data.channels.findIndex(channel => channel._id === channelId);
        
        if (channelIndex !== -1 && !data.channels[channelIndex].members.includes(userId)) {
            data.channels[channelIndex].members.push(userId);
            data.channels[channelIndex].stats.memberCount += 1;
            data.channels[channelIndex].updatedAt = new Date().toISOString();
            this.saveData(data);
            
            // مسح التخزين المؤقت
            this.cache.delete(`channels_user_${userId}`);
            return true;
        }
        return false;
    }

    // دوال المجموعات المحسنة
    async createGroup(groupData) {
        const data = this.loadData();
        const groupId = uuidv4();
        const group = {
            _id: groupId,
            ...groupData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            members: groupData.members || [groupData.creatorId],
            admins: groupData.admins || [groupData.creatorId],
            settings: {
                public: groupData.public !== false,
                allowInvites: true,
                adminOnlyPosts: false
            },
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

    async getUserGroups(userId) {
        const cacheKey = `groups_user_${userId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const groups = data.groups.filter(group => 
            group.isActive && group.members.includes(userId)
        );
        
        this.cache.set(cacheKey, groups);
        return groups;
    }

    async createGroupMessage(messageData) {
        const data = this.loadData();
        const messageId = uuidv4();
        const message = {
            _id: messageId,
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [messageData.senderId],
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

    async getGroupMessages(groupId, limit = 50) {
        const data = this.loadData();
        return data.groupMessages
            .filter(msg => msg.groupId === groupId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(-limit); // آخر 50 رسالة فقط
    }

    async addMemberToGroup(groupId, userId) {
        const data = this.loadData();
        const groupIndex = data.groups.findIndex(group => group._id === groupId);
        
        if (groupIndex !== -1 && !data.groups[groupIndex].members.includes(userId)) {
            data.groups[groupIndex].members.push(userId);
            data.groups[groupIndex].stats.memberCount += 1;
            data.groups[groupIndex].updatedAt = new Date().toISOString();
            this.saveData(data);
            
            // مسح التخزين المؤقت
            this.cache.delete(`groups_user_${userId}`);
            return true;
        }
        return false;
    }

    // دوال الستوريات المحسنة
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

    async getUserStories(userId) {
        const data = this.loadData();
        const now = new Date().toISOString();
        return data.stories.filter(story => 
            story.userId === userId && story.expiresAt > now
        );
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

    async addStoryView(storyId, userId) {
        const data = this.loadData();
        const storyIndex = data.stories.findIndex(story => story._id === storyId);
        
        if (storyIndex !== -1 && !data.stories[storyIndex].views.includes(userId)) {
            data.stories[storyIndex].views.push(userId);
            data.stories[storyIndex].metrics.viewCount += 1;
            this.saveData(data);
            return true;
        }
        return false;
    }

    // النسخ الاحتياطي المحسن
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
            
            const backupData = {
                timestamp: new Date().toISOString(),
                data: this.loadData(),
                version: '2.1.0',
                stats: this.getStats()
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

    updateStats(data) {
        data.stats = {
            totalUsers: data.users.length,
            totalMessages: data.messages.length,
            totalStories: data.stories.length,
            totalChannels: data.channels.length,
            totalGroups: data.groups.length,
            totalConversations: data.conversations.length,
            lastUpdate: new Date().toISOString(),
            cacheSize: this.cache.size
        };
        return data.stats;
    }

    getStats() {
        const data = this.loadData();
        return this.updateStats(data);
    }

    formatUserResponse(user) {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    // تنظيف البيانات القديمة
    async cleanupOldData() {
        try {
            const data = this.loadData();
            const now = new Date();
            const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            
            // تنظيف الستوريات المنتهية
            data.stories = data.stories.filter(story => 
                new Date(story.expiresAt) > now
            );
            
            // تنظيف الرسائل المحذوفة
            data.messages = data.messages.filter(msg => !msg.deleted.isDeleted);
            data.channelMessages = data.channelMessages.filter(msg => !msg.deleted.isDeleted);
            data.groupMessages = data.groupMessages.filter(msg => !msg.deleted.isDeleted);
            
            this.saveData(data);
            this.clearCache();
            
            console.log('🧹 تم تنظيف البيانات القديمة');
            return true;
        } catch (error) {
            console.error('❌ خطأ في تنظيف البيانات:', error);
            return false;
        }
    }
}

const localStorageService = new EnhancedLocalStorageService();

// middleware المصادقة المحسن
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

// دوال مساعدة محسنة
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

const generateRefreshToken = (userId) => {
    return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '90d' });
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
        const adminExists = await localStorageService.findUserByEmail('admin@platform.edu');
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('77007700', 12);
            const admin = await localStorageService.createUser({
                fullName: 'مدير النظام',
                email: 'admin@platform.edu',
                password: hashedPassword,
                role: 'admin'
            });
            
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
            console.log('📧 البريد الإلكتروني: admin@platform.edu');
            console.log('🔑 كلمة المرور: 77007700');
        } else {
            console.log('✅ حساب المدير موجود بالفعل');
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء حساب المدير:', error);
    }
}

// إنشاء بيانات تجريبية محسنة
async function createSampleData() {
    try {
        // إنشاء مستخدمين تجريبيين
        const users = [
            {
                fullName: 'أحمد محمد',
                email: 'ahmed@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'teacher'
            },
            {
                fullName: 'فاطمة علي',
                email: 'fatima@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'student'
            },
            {
                fullName: 'خالد إبراهيم',
                email: 'khaled@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'student'
            },
            {
                fullName: 'سارة عبدالله',
                email: 'sara@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'teacher'
            }
        ];

        for (const userData of users) {
            const existingUser = await localStorageService.findUserByEmail(userData.email);
            if (!existingUser) {
                await localStorageService.createUser(userData);
                console.log(`✅ تم إنشاء المستخدم: ${userData.fullName}`);
            }
        }

        // إنشاء محادثات تجريبية
        const allUsers = await localStorageService.getAllUsers();
        const adminUser = allUsers.find(u => u.role === 'admin');
        const teacherUser = allUsers.find(u => u.role === 'teacher' && u.email === 'ahmed@example.com');
        const studentUser = allUsers.find(u => u.role === 'student' && u.email === 'fatima@example.com');

        if (adminUser && teacherUser && studentUser) {
            // إنشاء محادثة بين المدير والمعلم
            await localStorageService.createConversation(
                [adminUser._id, teacherUser._id],
                'مناقشة عامة'
            );

            // إنشاء محادثة بين المعلم والطالب
            await localStorageService.createConversation(
                [teacherUser._id, studentUser._id],
                'استفسارات دراسية'
            );

            console.log('✅ تم إنشاء المحادثات التجريبية');
        }

        // إنشاء قنوات تجريبية
        if (adminUser && teacherUser) {
            const channels = [
                {
                    name: 'قناة الرياضيات',
                    description: 'قناة مخصصة لدروس الرياضيات والتمارين',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    public: true
                },
                {
                    name: 'قناة العلوم',
                    description: 'مناقشات وأبحاث في مجال العلوم',
                    creatorId: teacherUser._id,
                    members: allUsers.map(u => u._id),
                    public: true
                }
            ];

            for (const channelData of channels) {
                await localStorageService.createChannel(channelData);
                console.log(`✅ تم إنشاء القناة: ${channelData.name}`);
            }
        }

        console.log('✅ تم إنشاء البيانات التجريبية بنجاح');
    } catch (error) {
        console.error('❌ خطأ في إنشاء البيانات التجريبية:', error);
    }
}

// المسارات المحسنة

// مسارات المصادقة المحسنة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, role = 'student' } = req.body;

        // التحقق من البيانات
        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة',
                code: 'MISSING_FIELDS'
            });
        }

        // التحقق من صحة البريد الإلكتروني
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'صيغة البريد الإلكتروني غير صحيحة',
                code: 'INVALID_EMAIL'
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

        // التحقق من عدم وجود مستخدم بنفس البريد الإلكتروني
        const existingUser = await localStorageService.findUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'البريد الإلكتروني مستخدم بالفعل',
                code: 'EMAIL_EXISTS'
            });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);

        // إنشاء المستخدم
        const user = await localStorageService.createUser({
            fullName,
            email,
            password: hashedPassword,
            role
        });

        // إنشاء التوكنات
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // تسجيل التدقيق
        await auditLog('REGISTER', user._id, 'USER', user._id, {
            email: user.email,
            role: user.role
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: {
                user: localStorageService.formatUserResponse(user),
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء الحساب',
            code: 'REGISTRATION_ERROR'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان',
                code: 'MISSING_CREDENTIALS'
            });
        }

        const user = await localStorageService.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // تحديث حالة المستخدم
        await localStorageService.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        // إنشاء التوكنات
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // تسجيل التدقيق
        await auditLog('LOGIN', user._id, 'USER', user._id, {
            email: user.email,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: localStorageService.formatUserResponse(user),
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
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
                message: 'نوع الرمز غير صحيح',
                code: 'INVALID_TOKEN_TYPE'
            });
        }

        const user = await localStorageService.findUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود',
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
            message: 'رمز التحديث غير صالح',
            code: 'INVALID_REFRESH_TOKEN'
        });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await localStorageService.updateUser(req.user._id, {
            isOnline: false,
            lastSeen: new Date().toISOString()
        });

        // تسجيل التدقيق
        await auditLog('LOGOUT', req.user._id, 'USER', req.user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تسجيل الخروج',
            code: 'LOGOUT_ERROR'
        });
    }
});

// مسارات المستخدمين المحسنة
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const user = await localStorageService.findUserById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: localStorageService.formatUserResponse(user)
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب الملف الشخصي',
            code: 'PROFILE_FETCH_ERROR'
        });
    }
});

app.put('/api/users/profile', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { fullName, bio, settings } = req.body;
        const updates = {};

        if (fullName) updates.fullName = fullName;
        if (bio !== undefined) updates.bio = bio;
        if (settings) updates.settings = { ...req.user.settings, ...settings };

        if (req.file) {
            updates.avatar = `/uploads/profiles/${req.file.filename}`;
        }

        const updatedUser = await localStorageService.updateUser(req.user._id, updates);
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }

        // تسجيل التدقيق
        await auditLog('UPDATE_PROFILE', req.user._id, 'USER', req.user._id, {
            fields: Object.keys(updates)
        });

        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            data: localStorageService.formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تحديث الملف الشخصي',
            code: 'PROFILE_UPDATE_ERROR'
        });
    }
});

// البحث عن المستخدمين المحسن
app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال مصطلح بحث مكون من حرفين على الأقل',
                code: 'SEARCH_TERM_TOO_SHORT'
            });
        }

        const users = await localStorageService.searchUsers(q.trim(), parseInt(limit));

        res.json({
            success: true,
            data: users,
            pagination: {
                total: users.length,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في البحث عن المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء البحث',
            code: 'SEARCH_ERROR'
        });
    }
});

// مسارات المحادثات المحسنة
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await localStorageService.getConversationsByUserId(req.user._id);
        
        // جلب آخر رسالة لكل محادثة
        const conversationsWithLastMessage = await Promise.all(
            conversations.map(async (conv) => {
                let lastMessage = null;
                if (conv.lastMessage) {
                    const messages = await localStorageService.getMessagesByConversation(conv._id, 1);
                    lastMessage = messages[0] || null;
                }
                
                return {
                    ...conv,
                    lastMessage
                };
            })
        );

        // ترتيب المحادثات حسب آخر تحديث
        conversationsWithLastMessage.sort((a, b) => 
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );

        res.json({
            success: true,
            data: conversationsWithLastMessage
        });

    } catch (error) {
        console.error('❌ خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب المحادثات',
            code: 'CONVERSATIONS_FETCH_ERROR'
        });
    }
});

app.post('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantIds, name } = req.body;

        if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد مشاركين للمحادثة',
                code: 'MISSING_PARTICIPANTS'
            });
        }

        // إضافة المستخدم الحالي للمشاركين
        const allParticipants = [...new Set([req.user._id, ...participantIds])];

        // التحقق من وجود جميع المستخدمين
        for (const participantId of allParticipants) {
            const user = await localStorageService.findUserById(participantId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: `المستخدم ${participantId} غير موجود`,
                    code: 'USER_NOT_FOUND'
                });
            }
        }

        // إنشاء المحادثة
        const conversation = await localStorageService.createConversation(
            allParticipants, 
            name, 
            allParticipants.length > 2 ? 'group' : 'direct'
        );

        // تسجيل التدقيق
        await auditLog('CREATE_CONVERSATION', req.user._id, 'CONVERSATION', conversation._id, {
            participants: allParticipants,
            type: conversation.type
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المحادثة بنجاح',
            data: conversation
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء المحادثة',
            code: 'CONVERSATION_CREATE_ERROR'
        });
    }
});

app.get('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50, before } = req.query;

        // التحقق من أن المستخدم مشارك في المحادثة
        const conversation = await localStorageService.getConversationById(conversationId);
        if (!conversation || !conversation.participants.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول لهذه المحادثة',
                code: 'ACCESS_DENIED'
            });
        }

        const messages = await localStorageService.getMessagesByConversation(
            conversationId, 
            parseInt(limit), 
            before
        );

        // وضع علامة مقروءة للرسائل
        await localStorageService.markMessagesAsRead(conversationId, req.user._id);

        res.json({
            success: true,
            data: messages,
            pagination: {
                hasMore: messages.length === parseInt(limit),
                nextCursor: messages.length > 0 ? messages[messages.length - 1].createdAt : null
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب الرسائل',
            code: 'MESSAGES_FETCH_ERROR'
        });
    }
});

app.post('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, type = 'text', clientId } = req.body;

        if (!content && type === 'text') {
            return res.status(400).json({
                success: false,
                message: 'محتوى الرسالة مطلوب',
                code: 'MISSING_CONTENT'
            });
        }

        // التحقق من أن المستخدم مشارك في المحادثة
        const conversation = await localStorageService.getConversationById(conversationId);
        if (!conversation || !conversation.participants.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بإرسال رسالة في هذه المحادثة',
                code: 'ACCESS_DENIED'
            });
        }

        const message = await localStorageService.createMessage({
            conversationId,
            senderId: req.user._id,
            content,
            type,
            clientId
        });

        // إرسال الرسالة عبر WebSocket للمشاركين الآخرين
        conversation.participants.forEach(participantId => {
            if (participantId !== req.user._id) {
                io.to(participantId).emit('new_message', {
                    conversationId,
                    message,
                    unreadCount: conversation.unreadCount[participantId] || 0
                });
            }
        });

        // تسجيل التدقيق
        await auditLog('SEND_MESSAGE', req.user._id, 'CONVERSATION', conversationId, {
            messageId: message._id,
            type: message.type
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة بنجاح',
            data: message
        });

    } catch (error) {
        console.error('❌ خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إرسال الرسالة',
            code: 'MESSAGE_SEND_ERROR'
        });
    }
});

// مسارات القنوات المحسنة
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = await localStorageService.getAllChannels();
        
        res.json({
            success: true,
            data: channels
        });

    } catch (error) {
        console.error('❌ خطأ في جلب القنوات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب القنوات',
            code: 'CHANNELS_FETCH_ERROR'
        });
    }
});

app.post('/api/channels', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description, public = true } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم القناة مطلوب',
                code: 'MISSING_NAME'
            });
        }

        const channelData = {
            name,
            description,
            public: public === 'true' || public === true,
            creatorId: req.user._id,
            members: [req.user._id]
        };

        if (req.file) {
            channelData.avatar = `/uploads/channels/${req.file.filename}`;
        }

        const channel = await localStorageService.createChannel(channelData);

        // تسجيل التدقيق
        await auditLog('CREATE_CHANNEL', req.user._id, 'CHANNEL', channel._id, {
            name: channel.name,
            public: channel.public
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء القناة بنجاح',
            data: channel
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء القناة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء القناة',
            code: 'CHANNEL_CREATE_ERROR'
        });
    }
});

app.post('/api/channels/:channelId/join', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;

        const channel = await localStorageService.getChannelById(channelId);
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: 'القناة غير موجودة',
                code: 'CHANNEL_NOT_FOUND'
            });
        }

        if (!channel.settings.public) {
            return res.status(403).json({
                success: false,
                message: 'هذه القناة خاصة وتحتاج إلى دعوة للانضمام',
                code: 'CHANNEL_PRIVATE'
            });
        }

        const success = await localStorageService.addMemberToChannel(channelId, req.user._id);
        if (!success) {
            return res.status(400).json({
                success: false,
                message: 'أنت بالفعل عضو في هذه القناة',
                code: 'ALREADY_MEMBER'
            });
        }

        // تسجيل التدقيق
        await auditLog('JOIN_CHANNEL', req.user._id, 'CHANNEL', channelId);

        res.json({
            success: true,
            message: 'تم الانضمام للقناة بنجاح',
            data: channel
        });

    } catch (error) {
        console.error('❌ خطأ في الانضمام للقناة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء الانضمام للقناة',
            code: 'CHANNEL_JOIN_ERROR'
        });
    }
});

// مسارات المجموعات المحسنة
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const groups = await localStorageService.getAllGroups();
        
        res.json({
            success: true,
            data: groups
        });

    } catch (error) {
        console.error('❌ خطأ في جلب المجموعات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب المجموعات',
            code: 'GROUPS_FETCH_ERROR'
        });
    }
});

app.post('/api/groups', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description, public = true, members = [] } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم المجموعة مطلوب',
                code: 'MISSING_NAME'
            });
        }

        const groupData = {
            name,
            description,
            public: public === 'true' || public === true,
            creatorId: req.user._id,
            members: [...members, req.user._id]
        };

        if (req.file) {
            groupData.avatar = `/uploads/groups/${req.file.filename}`;
        }

        const group = await localStorageService.createGroup(groupData);

        // تسجيل التدقيق
        await auditLog('CREATE_GROUP', req.user._id, 'GROUP', group._id, {
            name: group.name,
            public: group.public,
            memberCount: group.members.length
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المجموعة بنجاح',
            data: group
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء المجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء المجموعة',
            code: 'GROUP_CREATE_ERROR'
        });
    }
});

// مسارات الستوريات المحسنة
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await localStorageService.getActiveStories();
        
        res.json({
            success: true,
            data: stories
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الستوريات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب الستوريات',
            code: 'STORIES_FETCH_ERROR'
        });
    }
});

app.post('/api/stories', authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const { caption, type = 'image' } = req.body;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'الوسائط مطلوبة للستوري',
                code: 'MISSING_MEDIA'
            });
        }

        const storyData = {
            userId: req.user._id,
            mediaUrl: `/uploads/stories/${req.file.filename}`,
            caption,
            type,
            metrics: {
                viewCount: 0,
                replyCount: 0,
                reactionCount: 0,
                shareCount: 0
            }
        };

        const story = await localStorageService.createStory(storyData);

        // تسجيل التدقيق
        await auditLog('CREATE_STORY', req.user._id, 'STORY', story._id, {
            type: story.type
        });

        res.status(201).json({
            success: true,
            message: 'تم نشر الستوري بنجاح',
            data: story
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء الستوري',
            code: 'STORY_CREATE_ERROR'
        });
    }
});

app.post('/api/stories/:storyId/view', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;

        const success = await localStorageService.addStoryView(storyId, req.user._id);
        if (!success) {
            return res.status(400).json({
                success: false,
                message: 'تم مشاهدة الستوري بالفعل',
                code: 'ALREADY_VIEWED'
            });
        }

        res.json({
            success: true,
            message: 'تم تسجيل المشاهدة بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل مشاهدة الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تسجيل المشاهدة',
            code: 'STORY_VIEW_ERROR'
        });
    }
});

// مسارات الإدارة المحسنة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = localStorageService.getStats();
        
        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات النظام:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب إحصائيات النظام',
            code: 'STATS_FETCH_ERROR'
        });
    }
});

app.post('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await localStorageService.createBackup();
        
        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'فشل في إنشاء النسخة الاحتياطية',
                code: 'BACKUP_FAILED'
            });
        }

        // تسجيل التدقيق
        await auditLog('CREATE_BACKUP', req.user._id, 'SYSTEM', 'backup', {
            filename: result.filename
        });

        res.json({
            success: true,
            message: 'تم إنشاء النسخة الاحتياطية بنجاح',
            data: result
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إنشاء النسخة الاحتياطية',
            code: 'BACKUP_ERROR'
        });
    }
});

app.post('/api/admin/cleanup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const success = await localStorageService.cleanupOldData();
        
        if (!success) {
            return res.status(500).json({
                success: false,
                message: 'فشل في تنظيف البيانات',
                code: 'CLEANUP_FAILED'
            });
        }

        // تسجيل التدقيق
        await auditLog('CLEANUP_DATA', req.user._id, 'SYSTEM', 'cleanup');

        res.json({
            success: true,
            message: 'تم تنظيف البيانات القديمة بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في تنظيف البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تنظيف البيانات',
            code: 'CLEANUP_ERROR'
        });
    }
});

// مسار تحميل الملفات المحسن
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم تحميل أي ملف',
                code: 'NO_FILE_UPLOADED'
            });
        }

        const fileInfo = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            url: `/uploads/files/${req.file.filename}`,
            uploadedBy: req.user._id,
            uploadedAt: new Date().toISOString()
        };

        // تسجيل التدقيق
        await auditLog('UPLOAD_FILE', req.user._id, 'FILE', req.file.filename, {
            size: req.file.size,
            type: req.file.mimetype
        });

        res.json({
            success: true,
            message: 'تم تحميل الملف بنجاح',
            data: fileInfo
        });

    } catch (error) {
        console.error('❌ خطأ في تحميل الملف:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تحميل الملف',
            code: 'UPLOAD_ERROR'
        });
    }
});

// مسار الصحة المحسن
app.get('/api/health', async (req, res) => {
    try {
        const stats = localStorageService.getStats();
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        
        res.json({
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: Math.floor(uptime),
                memory: {
                    used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    rss: Math.round(memoryUsage.rss / 1024 / 1024)
                },
                stats: stats,
                cache: {
                    size: localStorageService.cache.size,
                    hits: 0, // يمكن إضافة تتبع للضربات
                    misses: 0 // يمكن إضافة تتبع للإخفاقات
                }
            }
        });
    } catch (error) {
        console.error('❌ خطأ في فحص الصحة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم',
            code: 'HEALTH_CHECK_FAILED'
        });
    }
});

// مسار الافتراضي
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'مرحباً بك في منصة التعليم المحسنة!',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            conversations: '/api/conversations',
            channels: '/api/channels',
            groups: '/api/groups',
            stories: '/api/stories',
            admin: '/api/admin',
            upload: '/api/upload',
            health: '/api/health'
        }
    });
});

// WebSocket المحسن
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await localStorageService.findUserById(decoded.userId);
            
            if (user) {
                socket.userId = user._id;
                connectedUsers.set(user._id, socket);
                
                // تحديث حالة المستخدم
                await localStorageService.updateUser(user._id, {
                    isOnline: true,
                    lastSeen: new Date().toISOString()
                });

                // الانضمام للغرف
                socket.join(user._id);
                
                // الانضمام لغرف القنوات والمجموعات
                const userChannels = await localStorageService.getUserChannels(user._id);
                userChannels.forEach(channel => {
                    socket.join(`channel_${channel._id}`);
                });

                const userGroups = await localStorageService.getUserGroups(user._id);
                userGroups.forEach(group => {
                    socket.join(`group_${group._id}`);
                });

                // إعلام الآخرين بتحديث الحالة
                socket.broadcast.emit('user_status_changed', {
                    userId: user._id,
                    isOnline: true,
                    lastSeen: user.lastSeen
                });

                console.log(`✅ تم توثيق المستخدم: ${user.fullName} (${user._id})`);
            }
        } catch (error) {
            console.error('❌ خطأ في توثيق WebSocket:', error);
            socket.emit('authentication_failed');
        }
    });

    socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`💬 انضم المستخدم ${socket.userId} للمحادثة ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
        console.log(`💬 غادر المستخدم ${socket.userId} المحادثة ${conversationId}`);
    });

    socket.on('join_channel', (channelId) => {
        socket.join(`channel_${channelId}`);
        console.log(`📢 انضم المستخدم ${socket.userId} للقناة ${channelId}`);
    });

    socket.on('join_group', (groupId) => {
        socket.join(`group_${groupId}`);
        console.log(`👥 انضم المستخدم ${socket.userId} للمجموعة ${groupId}`);
    });

    socket.on('typing_start', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
            userId: socket.userId,
            conversationId: data.conversationId,
            isTyping: true
        });
    });

    socket.on('typing_stop', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
            userId: socket.userId,
            conversationId: data.conversationId,
            isTyping: false
        });
    });

    socket.on('message_read', async (data) => {
        try {
            await localStorageService.markMessagesAsRead(data.conversationId, socket.userId);
            
            socket.to(`conversation_${data.conversationId}`).emit('messages_read', {
                userId: socket.userId,
                conversationId: data.conversationId
            });
        } catch (error) {
            console.error('❌ خطأ في وضع علامة مقروءة:', error);
        }
    });

    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منقطع:', socket.id);
        
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            
            // تحديث حالة المستخدم
            await localStorageService.updateUser(socket.userId, {
                isOnline: false,
                lastSeen: new Date().toISOString()
            });

            // إعلام الآخرين بتحديث الحالة
            socket.broadcast.emit('user_status_changed', {
                userId: socket.userId,
                isOnline: false,
                lastSeen: new Date().toISOString()
            });
        }
    });
});

// معالجة الأخطاء المحسنة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير معالج:', error);
    // يمكن إضافة إرسال إشعارات للمطورين هنا
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ وعد مرفوض غير معالج:', reason);
    // يمكن إضافة إرسال إشعارات للمطورين هنا
});

// وظائف الخلفية المحسنة
setInterval(async () => {
    try {
        await localStorageService.cleanupOldData();
    } catch (error) {
        console.error('❌ خطأ في تنظيف البيانات التلقائي:', error);
    }
}, 60 * 60 * 1000); // كل ساعة

setInterval(async () => {
    try {
        const stats = localStorageService.getStats();
        console.log('📊 إحصائيات النظام:', {
            users: stats.totalUsers,
            messages: stats.totalMessages,
            stories: stats.totalStories,
            channels: stats.totalChannels,
            groups: stats.totalGroups,
            cacheSize: stats.cacheSize,
            connectedUsers: connectedUsers.size
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل الإحصائيات:', error);
    }
}, 5 * 60 * 1000); // كل 5 دقائق

// بدء الخادم
async function startServer() {
    try {
        await createDefaultAdmin();
        await createSampleData();
        
        server.listen(PORT, () => {
            console.log('🚀 الخادم المحسن يعمل على المنفذ:', PORT);
            console.log('📧 حساب المدير الافتراضي: admin@platform.edu / 77007700');
            console.log('🔧 الوضع:', NODE_ENV);
            console.log('💾 مسار التحميلات:', UPLOAD_DIR);
            console.log('📂 مسار النسخ الاحتياطية:', BACKUP_DIR);
            console.log('📤 مسار التصدير:', EXPORT_DIR);
        });
    } catch (error) {
        console.error('❌ فشل في بدء الخادم:', error);
        process.exit(1);
    }
}

startServer();

export default app;
