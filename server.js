// server.js - الخادم الكامل للمنصة التعليمية (محدث ومصحح)
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
    transports: ['websocket', 'polling']
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
    threshold: 0
}));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, {
    maxAge: '1d',
    etag: true
}));
app.use('/exports', express.static(EXPORT_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
}));

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
        fileSize: 100 * 1024 * 1024
    },
    fileFilter: fileFilter
});

// نظام التخزين المحلي المحسن
class EnhancedLocalStorageService {
    constructor() {
        this.dataFile = path.join(__dirname, 'local_data.json');
        this.cache = new Map();
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
            this.cache.set('allData', data);
            return true;
        } catch (error) {
            console.error('❌ خطأ في حفظ البيانات المحلية:', error);
            return false;
        }
    }

    clearCache() {
        this.cache.clear();
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
        
        return user;
    }

    async findUserByEmail(email) {
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

    // دوال المحادثات
    async createConversation(participants, name = null, isGroup = false) {
        const data = this.loadData();
        const conversationId = uuidv4();
        
        // إنشاء اسم للمحادثة إذا لم يتم توفيره
        let conversationName = name;
        if (!conversationName && !isGroup) {
            const otherParticipants = participants.filter(p => p !== participants[0]);
            if (otherParticipants.length === 1) {
                const user = await this.findUserById(otherParticipants[0]);
                conversationName = user?.fullName || `مستخدم ${otherParticipants[0]}`;
            } else {
                conversationName = `محادثة ${participants.length} أشخاص`;
            }
        }
        
        const conversation = {
            _id: conversationId,
            participants,
            name: conversationName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: null,
            unreadCount: {},
            isGroup: isGroup
        };
        
        // تهيئة unreadCount لجميع المشاركين
        participants.forEach(participantId => {
            conversation.unreadCount[participantId] = 0;
        });
        
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
            conv.participants.length === 2 &&
            !conv.isGroup
        );
        
        if (existingConversation) {
            return existingConversation;
        }
        
        return await this.createConversation([user1, user2], null, false);
    }

    // دوال الرسائل
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
            deleted: { isDeleted: false }
        };
        
        data.messages.push(message);
        
        const convIndex = data.conversations.findIndex(conv => conv._id === messageData.conversationId);
        if (convIndex !== -1) {
            data.conversations[convIndex].lastMessage = message;
            data.conversations[convIndex].updatedAt = new Date().toISOString();
            
            // تحديث unreadCount للمشاركين الآخرين
            data.conversations[convIndex].participants.forEach(participantId => {
                if (participantId !== messageData.senderId) {
                    data.conversations[convIndex].unreadCount[participantId] = 
                        (data.conversations[convIndex].unreadCount[participantId] || 0) + 1;
                }
            });
        }
        
        this.updateStats(data);
        this.saveData(data);
        
        // مسح ذاكرة التخزين المؤقت للمحادثات
        data.conversations[convIndex].participants.forEach(participantId => {
            this.cache.delete(`conversations_user_${participantId}`);
        });
        
        return message;
    }

    async getMessagesByConversation(conversationId, limit = 50) {
        const cacheKey = `messages_conv_${conversationId}_${limit}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const messages = data.messages
            .filter(msg => msg.conversationId === conversationId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(-limit);

        this.cache.set(cacheKey, messages);
        return messages;
    }

    async markMessagesAsRead(conversationId, userId) {
        const data = this.loadData();
        const convIndex = data.conversations.findIndex(conv => conv._id === conversationId);
        
        if (convIndex !== -1) {
            data.conversations[convIndex].unreadCount[userId] = 0;
            this.saveData(data);
            this.cache.delete(`conversations_user_${userId}`);
        }
        
        return true;
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
            members: channelData.members || [channelData.creatorId],
            admins: channelData.admins || [channelData.creatorId],
            channelSettings: {
                isPublic: channelData.isPublic !== false,
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
            .slice(-limit);
    }

    async addMemberToChannel(channelId, userId) {
        const data = this.loadData();
        const channelIndex = data.channels.findIndex(channel => channel._id === channelId);
        
        if (channelIndex !== -1 && !data.channels[channelIndex].members.includes(userId)) {
            data.channels[channelIndex].members.push(userId);
            data.channels[channelIndex].stats.memberCount += 1;
            data.channels[channelIndex].updatedAt = new Date().toISOString();
            this.saveData(data);
            
            this.cache.delete(`channels_user_${userId}`);
            return true;
        }
        return false;
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
            members: groupData.members || [groupData.creatorId],
            admins: groupData.admins || [groupData.creatorId],
            groupSettings: {
                isPublic: groupData.isPublic !== false,
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
        
        // إنشاء محادثة جماعية للمجموعة
        await this.createConversation(
            group.members, 
            group.name, 
            true
        );
        
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
            .slice(-limit);
    }

    async addMemberToGroup(groupId, userId) {
        const data = this.loadData();
        const groupIndex = data.groups.findIndex(group => group._id === groupId);
        
        if (groupIndex !== -1 && !data.groups[groupIndex].members.includes(userId)) {
            data.groups[groupIndex].members.push(userId);
            data.groups[groupIndex].stats.memberCount += 1;
            data.groups[groupIndex].updatedAt = new Date().toISOString();
            this.saveData(data);
            
            // إضافة المستخدم إلى محادثة المجموعة
            const conversation = data.conversations.find(conv => 
                conv.isGroup && conv.name === data.groups[groupIndex].name
            );
            if (conversation && !conversation.participants.includes(userId)) {
                conversation.participants.push(userId);
            }
            
            this.cache.delete(`groups_user_${userId}`);
            return true;
        }
        return false;
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
            
            const data = this.loadData();
            data.backups.push({
                filename: `backup-${timestamp}.json`,
                timestamp: new Date().toISOString(),
                size: JSON.stringify(backupData).length
            });
            
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
                message: 'الحساب موقوف',
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

// إنشاء بيانات تجريبية
async function createSampleData() {
    try {
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
            }
        ];

        for (const userData of users) {
            const existingUser = await localStorageService.findUserByEmail(userData.email);
            if (!existingUser) {
                await localStorageService.createUser(userData);
                console.log(`✅ تم إنشاء المستخدم: ${userData.fullName}`);
            }
        }

        const allUsers = await localStorageService.getAllUsers();
        const adminUser = allUsers.find(u => u.role === 'admin');
        const teacherUser = allUsers.find(u => u.role === 'teacher');

        if (adminUser && teacherUser) {
            const channels = [
                {
                    name: 'قناة الرياضيات',
                    description: 'قناة مخصصة لدروس الرياضيات والتمارين',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true
                },
                {
                    name: 'قناة العلوم',
                    description: 'مناقشات وأخبار علمية',
                    creatorId: teacherUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true
                }
            ];

            for (const channelData of channels) {
                const existingChannel = await localStorageService.getAllChannels();
                if (!existingChannel.find(c => c.name === channelData.name)) {
                    await localStorageService.createChannel(channelData);
                    console.log(`✅ تم إنشاء القناة: ${channelData.name}`);
                }
            }

            const groups = [
                {
                    name: 'مجموعة الرياضيات المتقدمة',
                    description: 'مجموعة للمناقشات المتقدمة في الرياضيات',
                    creatorId: teacherUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: false
                }
            ];

            for (const groupData of groups) {
                const existingGroups = await localStorageService.getAllGroups();
                if (!existingGroups.find(g => g.name === groupData.name)) {
                    await localStorageService.createGroup(groupData);
                    console.log(`✅ تم إنشاء المجموعة: ${groupData.name}`);
                }
            }
        }

        console.log('✅ تم إنشاء البيانات التجريبية بنجاح');
    } catch (error) {
        console.error('❌ خطأ في إنشاء البيانات التجريبية:', error);
    }
}

// المسارات الرئيسية
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية يعمل بنجاح!',
        version: '2.0.0',
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        endpoints: {
            auth: '/api/auth/*',
            users: '/api/users/*',
            conversations: '/api/conversations/*',
            channels: '/api/channels/*',
            groups: '/api/groups/*',
            stories: '/api/stories/*',
            admin: '/api/admin/*'
        }
    });
});

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, role = 'student' } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
            });
        }

        const existingUser = await localStorageService.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مسجل مسبقاً'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await localStorageService.createUser({
            fullName,
            email,
            password: hashedPassword,
            role
        });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await auditLog('REGISTER', user._id, 'USER', user._id, { role });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            user: localStorageService.formatUserResponse(user),
            token,
            refreshToken
        });
    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
            });
        }

        const user = await localStorageService.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        // تحديث حالة المستخدم
        await localStorageService.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await auditLog('LOGIN', user._id, 'USER', user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: localStorageService.formatUserResponse(user),
            token,
            refreshToken
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'رمز التحديث مطلوب'
            });
        }

        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: 'رمز تحديث غير صالح'
            });
        }

        const user = await localStorageService.findUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود'
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
        console.error('❌ خطأ في تحديث الرمز:', error);
        res.status(401).json({
            success: false,
            message: 'رمز تحديث غير صالح'
        });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await localStorageService.updateUser(req.user._id, {
            isOnline: false,
            lastSeen: new Date().toISOString()
        });

        await auditLog('LOGOUT', req.user._id, 'USER', req.user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات المستخدمين
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: localStorageService.formatUserResponse(req.user)
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.put('/api/users/profile', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { fullName, bio, phone } = req.body;
        const updates = {};

        if (fullName) updates.fullName = fullName;
        if (bio !== undefined) updates.bio = bio;
        if (phone) updates.phone = phone;

        if (req.file) {
            updates.avatar = `/uploads/profiles/${req.file.filename}`;
        }

        const updatedUser = await localStorageService.updateUser(req.user._id, updates);
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        await auditLog('UPDATE_PROFILE', req.user._id, 'USER', req.user._id);

        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            user: localStorageService.formatUserResponse(updatedUser)
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال مصطلح بحث مكون من حرفين على الأقل'
            });
        }

        const users = await localStorageService.searchUsers(q.trim(), parseInt(limit));

        res.json({
            success: true,
            users,
            count: users.length
        });
    } catch (error) {
        console.error('❌ خطأ في البحث:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات المحادثات
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await localStorageService.getConversationsByUserId(req.user._id);
        
        // جلب معلومات المستخدمين للمحادثات
        const conversationsWithDetails = await Promise.all(
            conversations.map(async (conv) => {
                let participantsDetails = [];
                
                for (const participantId of conv.participants) {
                    if (participantId !== req.user._id) {
                        const user = await localStorageService.findUserById(participantId);
                        if (user) {
                            participantsDetails.push(localStorageService.formatUserResponse(user));
                        }
                    }
                }
                
                return {
                    ...conv,
                    participantsDetails
                };
            })
        );

        res.json({
            success: true,
            conversations: conversationsWithDetails
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantIds, name, isGroup = false } = req.body;

        if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد مشاركين للمحادثة'
            });
        }

        // إضافة المستخدم الحالي إلى المشاركين
        const allParticipants = [...new Set([req.user._id, ...participantIds])];

        const conversation = await localStorageService.createConversation(
            allParticipants, 
            name, 
            isGroup
        );

        await auditLog('CREATE_CONVERSATION', req.user._id, 'CONVERSATION', conversation._id, {
            isGroup,
            participantCount: allParticipants.length
        });

        res.status(201).json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات الرسائل
app.get('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50 } = req.query;

        const conversation = await localStorageService.getConversationById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        if (!conversation.participants.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول لهذه المحادثة'
            });
        }

        const messages = await localStorageService.getMessagesByConversation(
            conversationId, 
            parseInt(limit)
        );

        // تحديث unreadCount
        await localStorageService.markMessagesAsRead(conversationId, req.user._id);

        res.json({
            success: true,
            messages,
            conversation
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, type = 'text', metadata = {} } = req.body;

        if (!content && type === 'text') {
            return res.status(400).json({
                success: false,
                message: 'محتوى الرسالة مطلوب'
            });
        }

        const conversation = await localStorageService.getConversationById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        if (!conversation.participants.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بإرسال رسائل في هذه المحادثة'
            });
        }

        const message = await localStorageService.createMessage({
            conversationId,
            senderId: req.user._id,
            content,
            type,
            metadata
        });

        await auditLog('SEND_MESSAGE', req.user._id, 'MESSAGE', message._id, {
            conversationId,
            type
        });

        // إرسال الرسالة عبر WebSocket لجميع المشاركين
        conversation.participants.forEach(participantId => {
            io.to(participantId).emit('new_message', {
                message,
                conversation
            });
        });

        res.status(201).json({
            success: true,
            message
        });
    } catch (error) {
        console.error('❌ خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات القنوات
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = await localStorageService.getAllChannels();
        
        res.json({
            success: true,
            channels
        });
    } catch (error) {
        console.error('❌ خطأ في جلب القنوات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.get('/api/channels/my', authenticateToken, async (req, res) => {
    try {
        const channels = await localStorageService.getUserChannels(req.user._id);
        
        res.json({
            success: true,
            channels
        });
    } catch (error) {
        console.error('❌ خطأ في جلب قنوات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/channels', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description, isPublic = true } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم القناة مطلوب'
            });
        }

        const channelData = {
            name,
            description,
            creatorId: req.user._id,
            isPublic: isPublic === 'true'
        };

        if (req.file) {
            channelData.avatar = `/uploads/channels/${req.file.filename}`;
        }

        const channel = await localStorageService.createChannel(channelData);

        await auditLog('CREATE_CHANNEL', req.user._id, 'CHANNEL', channel._id);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء القناة بنجاح',
            channel
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء القناة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
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
                message: 'القناة غير موجودة'
            });
        }

        if (!channel.channelSettings.isPublic) {
            return res.status(403).json({
                success: false,
                message: 'هذه القناة خاصة وتتطلب دعوة'
            });
        }

        const success = await localStorageService.addMemberToChannel(channelId, req.user._id);
        if (!success) {
            return res.status(400).json({
                success: false,
                message: 'أنت بالفعل عضو في هذه القناة'
            });
        }

        await auditLog('JOIN_CHANNEL', req.user._id, 'CHANNEL', channelId);

        res.json({
            success: true,
            message: 'تم الانضمام للقناة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في الانضمام للقناة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات المجموعات
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const groups = await localStorageService.getAllGroups();
        
        res.json({
            success: true,
            groups
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المجموعات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.get('/api/groups/my', authenticateToken, async (req, res) => {
    try {
        const groups = await localStorageService.getUserGroups(req.user._id);
        
        res.json({
            success: true,
            groups
        });
    } catch (error) {
        console.error('❌ خطأ في جلب مجموعات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/groups', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description, isPublic = true } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم المجموعة مطلوب'
            });
        }

        const groupData = {
            name,
            description,
            creatorId: req.user._id,
            isPublic: isPublic === 'true'
        };

        if (req.file) {
            groupData.avatar = `/uploads/groups/${req.file.filename}`;
        }

        const group = await localStorageService.createGroup(groupData);

        await auditLog('CREATE_GROUP', req.user._id, 'GROUP', group._id);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المجموعة بنجاح',
            group
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء المجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/groups/:groupId/join', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;

        const group = await localStorageService.getGroupById(groupId);
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'المجموعة غير موجودة'
            });
        }

        if (!group.groupSettings.isPublic) {
            return res.status(403).json({
                success: false,
                message: 'هذه المجموعة خاصة وتتطلب دعوة'
            });
        }

        const success = await localStorageService.addMemberToGroup(groupId, req.user._id);
        if (!success) {
            return res.status(400).json({
                success: false,
                message: 'أنت بالفعل عضو في هذه المجموعة'
            });
        }

        await auditLog('JOIN_GROUP', req.user._id, 'GROUP', groupId);

        res.json({
            success: true,
            message: 'تم الانضمام للمجموعة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في الانضمام للمجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات الستوريات
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await localStorageService.getActiveStories();
        
        // جلب معلومات المستخدمين للستوريات
        const storiesWithUserDetails = await Promise.all(
            stories.map(async (story) => {
                const user = await localStorageService.findUserById(story.userId);
                return {
                    ...story,
                    user: user ? localStorageService.formatUserResponse(user) : null
                };
            })
        );

        res.json({
            success: true,
            stories: storiesWithUserDetails
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الستوريات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/stories', authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const { caption, type = 'image' } = req.body;

        if (!req.file && type !== 'text') {
            return res.status(400).json({
                success: false,
                message: 'الوسائط مطلوبة للستوري'
            });
        }

        const storyData = {
            userId: req.user._id,
            caption,
            type
        };

        if (req.file) {
            storyData.mediaUrl = `/uploads/stories/${req.file.filename}`;
            storyData.mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }

        const story = await localStorageService.createStory(storyData);

        await auditLog('CREATE_STORY', req.user._id, 'STORY', story._id, { type });

        res.status(201).json({
            success: true,
            message: 'تم نشر الستوري بنجاح',
            story
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
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
                message: 'تم مشاهدة الستوري مسبقاً'
            });
        }

        res.json({
            success: true,
            message: 'تم تسجيل المشاهدة'
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل مشاهدة الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات الإدارة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = localStorageService.getStats();
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات النظام:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await localStorageService.createBackup();
        
        if (result.success) {
            await auditLog('CREATE_BACKUP', req.user._id, 'SYSTEM', 'backup');
            
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
        console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/admin/cleanup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const success = await localStorageService.cleanupOldData();
        
        if (success) {
            await auditLog('CLEANUP_DATA', req.user._id, 'SYSTEM', 'cleanup');
            
            res.json({
                success: true,
                message: 'تم تنظيف البيانات القديمة بنجاح'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في تنظيف البيانات'
            });
        }
    } catch (error) {
        console.error('❌ خطأ في تنظيف البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات الصحة والمراقبة
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: NODE_ENV
    });
});

app.get('/api/status', authenticateToken, async (req, res) => {
    try {
        const stats = localStorageService.getStats();
        const activeUsers = (await localStorageService.getAllUsers()).filter(u => u.isOnline).length;
        
        res.json({
            success: true,
            status: {
                server: 'running',
                database: 'connected',
                websocket: io.engine.clientsCount,
                activeUsers,
                ...stats
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب حالة النظام:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// معالجة الأخطاء
app.use((error, req, res, next) => {
    console.error('❌ خطأ غير معالج:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'حجم الملف كبير جداً'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع في الخادم'
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود'
    });
});

// نظام WebSocket المحسن
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await localStorageService.findUserById(decoded.userId);
            
            if (user) {
                socket.userId = user._id;
                connectedUsers.set(user._id, socket.id);
                
                // تحديث حالة المستخدم
                await localStorageService.updateUser(user._id, {
                    isOnline: true,
                    lastSeen: new Date().toISOString()
                });
                
                socket.join(user._id);
                socket.join('global');
                
                // إعلام الآخرين بتحديث حالة المستخدم
                socket.broadcast.emit('user_status_changed', {
                    userId: user._id,
                    isOnline: true,
                    lastSeen: user.lastSeen
                });
                
                console.log(`✅ تم توثيق المستخدم: ${user.fullName} (${user._id})`);
                
                socket.emit('authenticated', {
                    success: true,
                    user: localStorageService.formatUserResponse(user)
                });
            } else {
                socket.emit('authenticated', {
                    success: false,
                    message: 'المستخدم غير موجود'
                });
            }
        } catch (error) {
            console.error('❌ خطأ في توثيق WebSocket:', error);
            socket.emit('authenticated', {
                success: false,
                message: 'رمز وصول غير صالح'
            });
        }
    });

    socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`💬 المستخدم ${socket.userId} انضم للمحادثة ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
        console.log(`💬 المستخدم ${socket.userId} غادر المحادثة ${conversationId}`);
    });

    socket.on('join_channel', (channelId) => {
        socket.join(`channel_${channelId}`);
        console.log(`📺 المستخدم ${socket.userId} انضم للقناة ${channelId}`);
    });

    socket.on('leave_channel', (channelId) => {
        socket.leave(`channel_${channelId}`);
        console.log(`📺 المستخدم ${socket.userId} غادر القناة ${channelId}`);
    });

    socket.on('join_group', (groupId) => {
        socket.join(`group_${groupId}`);
        console.log(`👥 المستخدم ${socket.userId} انضم للمجموعة ${groupId}`);
    });

    socket.on('leave_group', (groupId) => {
        socket.leave(`group_${groupId}`);
        console.log(`👥 المستخدم ${socket.userId} غادر المجموعة ${groupId}`);
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
            console.error('❌ خطأ في تسجيل قراءة الرسائل:', error);
        }
    });

    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منقطع:', socket.id);
        
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            
            // تحديث حالة المستخدم
            try {
                await localStorageService.updateUser(socket.userId, {
                    isOnline: false,
                    lastSeen: new Date().toISOString()
                });
                
                // إعلام الآخرين بتحديث حالة المستخدم
                socket.broadcast.emit('user_status_changed', {
                    userId: socket.userId,
                    isOnline: false,
                    lastSeen: new Date().toISOString()
                });
            } catch (error) {
                console.error('❌ خطأ في تحديث حالة المستخدم:', error);
            }
        }
    });
});

// وظائف الخادم الدورية
setInterval(async () => {
    try {
        await localStorageService.cleanupOldData();
        console.log('🧹 تم تنظيف البيانات القديمة تلقائياً');
    } catch (error) {
        console.error('❌ خطأ في التنظيف التلقائي:', error);
    }
}, 60 * 60 * 1000); // كل ساعة

setInterval(async () => {
    try {
        await localStorageService.createBackup();
        console.log('💾 تم إنشاء نسخة احتياطية تلقائية');
    } catch (error) {
        console.error('❌ خطأ في النسخ الاحتياطي التلقائي:', error);
    }
}, 24 * 60 * 60 * 1000); // كل 24 ساعة

// بدء الخادم
async function startServer() {
    try {
        // إنشاء حساب المدير الافتراضي
        await createDefaultAdmin();
        
        // إنشاء بيانات تجريبية
        if (NODE_ENV === 'development') {
            await createSampleData();
        }
        
        // تنظيف البيانات القديمة عند البدء
        await localStorageService.cleanupOldData();
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 خادم المنصة التعليمية يعمل بنجاح!');
            console.log('='.repeat(60));
            console.log(`📍 العنوان: http://localhost:${PORT}`);
            console.log(`🌍 البيئة: ${NODE_ENV}`);
            console.log(`⏰ الوقت: ${new Date().toLocaleString()}`);
            console.log(`👥 المستخدمون المتصلون: ${connectedUsers.size}`);
            console.log('='.repeat(60));
            console.log('\n📋 نقاط النهاية المتاحة:');
            console.log(`   🔐 المصادقة: POST http://localhost:${PORT}/api/auth/login`);
            console.log(`   👤 المستخدمون: GET http://localhost:${PORT}/api/users/profile`);
            console.log(`   💬 المحادثات: GET http://localhost:${PORT}/api/conversations`);
            console.log(`   📺 القنوات: GET http://localhost:${PORT}/api/channels`);
            console.log(`   👥 المجموعات: GET http://localhost:${PORT}/api/groups`);
            console.log(`   📸 الستوريات: GET http://localhost:${PORT}/api/stories`);
            console.log(`   🛠️ الإدارة: GET http://localhost:${PORT}/api/admin/stats`);
            console.log(`   ❤️ الصحة: GET http://localhost:${PORT}/health`);
            console.log('='.repeat(60));
        });
    } catch (error) {
        console.error('❌ فشل في بدء الخادم:', error);
        process.exit(1);
    }
}

startServer();

export { app, io, localStorageService };
