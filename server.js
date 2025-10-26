// server.js - الخادم الكامل للمنصة التعليمية (محدث ومدمج)
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
const PUBLIC_DIR = path.join(__dirname, 'public');

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
    PUBLIC_DIR
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

// ============ نظام التخزين المحلي المحسن ============
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
            
            data.conversations[convIndex].participants.forEach(participantId => {
                if (participantId !== messageData.senderId) {
                    data.conversations[convIndex].unreadCount[participantId] = 
                        (data.conversations[convIndex].unreadCount[participantId] || 0) + 1;
                }
            });
        }
        
        this.updateStats(data);
        this.saveData(data);
        
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
                    isPublic: true
                },
                {
                    name: 'مجموعة مشاريع التخرج',
                    description: 'لمناقشة مشاريع التخرج والتعاون',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true
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

// تهيئة البيانات
createDefaultAdmin();
setTimeout(createSampleData, 1000);

// تخزين المستخدمين المتصلين
const connectedUsers = new Map();
const userSockets = new Map();

// ==================== مسارات API ====================

// مسار رئيسي
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية المحسن يعمل بنجاح!',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        features: {
            realtime_chat: true,
            channels: true,
            groups: true,
            stories: true,
            file_upload: true,
            emoji_support: true,
            notifications: true,
            caching: true,
            search: true
        }
    });
});

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, role, password } = req.body;

        if (!fullName || !email || !role || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة',
                code: 'MISSING_FIELDS'
            });
        }

        const existingUser = await localStorageService.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مسجل مسبقاً',
                code: 'EMAIL_EXISTS'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await localStorageService.createUser({
            fullName: fullName.trim(),
            email,
            password: hashedPassword,
            role: role
        });

        await auditLog('REGISTER', user._id, 'user', user._id, { email, role });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

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
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR',
            error: error.message
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

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'الحساب موقوف',
                code: 'ACCOUNT_SUSPENDED'
            });
        }

        await localStorageService.updateUser(user._id, {
            lastSeen: new Date().toISOString(),
            isOnline: true
        });

        await auditLog('LOGIN', user._id, 'user', user._id, { email });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

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
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR',
            error: error.message
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
            message: 'رمز تحديث غير صالح',
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
                user: localStorageService.formatUserResponse(req.user)
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

app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { fullName, bio, avatar } = req.body;
        const updates = {};

        if (fullName) updates.fullName = fullName;
        if (bio !== undefined) updates.bio = bio;
        if (avatar) updates.avatar = avatar;

        const updatedUser = await localStorageService.updateUser(req.user._id, updates);
        
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            data: {
                user: localStorageService.formatUserResponse(updatedUser)
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

app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال مصطلح بحث مكون من حرفين على الأقل',
                code: 'INVALID_SEARCH_QUERY'
            });
        }

        const users = await localStorageService.searchUsers(q, 20);
        
        res.json({
            success: true,
            data: {
                users,
                total: users.length
            }
        });

    } catch (error) {
        console.error('❌ خطأ في البحث:', error);
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
        const conversations = await localStorageService.getConversationsByUserId(req.user._id);
        
        const conversationsWithDetails = await Promise.all(
            conversations.map(async (conv) => {
                const lastMessage = conv.lastMessage;
                const otherParticipants = conv.participants.filter(p => p !== req.user._id);
                
                let conversationName = conv.name;
                let conversationAvatar = null;
                
                if (!conv.isGroup && otherParticipants.length === 1) {
                    const otherUser = await localStorageService.findUserById(otherParticipants[0]);
                    if (otherUser) {
                        conversationName = otherUser.fullName;
                        conversationAvatar = otherUser.avatar;
                    }
                }
                
                return {
                    ...conv,
                    name: conversationName,
                    avatar: conversationAvatar,
                    unreadCount: conv.unreadCount[req.user._id] || 0
                };
            })
        );

        res.json({
            success: true,
            data: {
                conversations: conversationsWithDetails.sort((a, b) => 
                    new Date(b.updatedAt) - new Date(a.updatedAt)
                )
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

app.get('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50 } = req.query;

        const conversation = await localStorageService.getConversationById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة',
                code: 'CONVERSATION_NOT_FOUND'
            });
        }

        if (!conversation.participants.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول لهذه المحادثة',
                code: 'ACCESS_DENIED'
            });
        }

        const messages = await localStorageService.getMessagesByConversation(conversationId, parseInt(limit));
        
        await localStorageService.markMessagesAsRead(conversationId, req.user._id);

        res.json({
            success: true,
            data: {
                messages,
                conversation: {
                    ...conversation,
                    unreadCount: conversation.unreadCount[req.user._id] || 0
                }
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
                channels: channels.filter(channel => 
                    channel.isPublic || 
                    channel.members.includes(req.user._id) ||
                    channel.admins.includes(req.user._id)
                )
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

app.get('/api/channels/my', authenticateToken, async (req, res) => {
    try {
        const channels = await localStorageService.getUserChannels(req.user._id);
        
        res.json({
            success: true,
            data: {
                channels
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب قنوات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/channels', authenticateToken, async (req, res) => {
    try {
        const { name, description, isPublic = true } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم القناة مطلوب',
                code: 'CHANNEL_NAME_REQUIRED'
            });
        }

        const channel = await localStorageService.createChannel({
            name: name.trim(),
            description: description?.trim(),
            creatorId: req.user._id,
            isPublic: isPublic !== false
        });

        await auditLog('CREATE_CHANNEL', req.user._id, 'channel', channel._id, { name, isPublic });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء القناة بنجاح',
            data: {
                channel
            }
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

        if (!channel.isPublic && !channel.admins.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'هذه القناة خاصة وتحتاج إلى دعوة',
                code: 'CHANNEL_PRIVATE'
            });
        }

        const success = await localStorageService.addMemberToChannel(channelId, req.user._id);
        
        if (success) {
            await auditLog('JOIN_CHANNEL', req.user._id, 'channel', channelId);
            
            res.json({
                success: true,
                message: 'تم الانضمام للقناة بنجاح',
                data: {
                    channel: {
                        ...channel,
                        members: [...channel.members, req.user._id]
                    }
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'أنت بالفعل عضو في هذه القناة',
                code: 'ALREADY_MEMBER'
            });
        }

    } catch (error) {
        console.error('❌ خطأ في الانضمام للقناة:', error);
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
        const { limit = 50 } = req.query;

        const channel = await localStorageService.getChannelById(channelId);
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: 'القناة غير موجودة',
                code: 'CHANNEL_NOT_FOUND'
            });
        }

        if (!channel.members.includes(req.user._id) && !channel.admins.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول لهذه القناة',
                code: 'ACCESS_DENIED'
            });
        }

        const messages = await localStorageService.getChannelMessages(channelId, parseInt(limit));

        res.json({
            success: true,
            data: {
                messages,
                channel
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
                groups: groups.filter(group => 
                    group.isPublic || 
                    group.members.includes(req.user._id)
                )
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

app.get('/api/groups/my', authenticateToken, async (req, res) => {
    try {
        const groups = await localStorageService.getUserGroups(req.user._id);
        
        res.json({
            success: true,
            data: {
                groups
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب مجموعات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/groups', authenticateToken, async (req, res) => {
    try {
        const { name, description, isPublic = true } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم المجموعة مطلوب',
                code: 'GROUP_NAME_REQUIRED'
            });
        }

        const group = await localStorageService.createGroup({
            name: name.trim(),
            description: description?.trim(),
            creatorId: req.user._id,
            isPublic: isPublic !== false
        });

        await auditLog('CREATE_GROUP', req.user._id, 'group', group._id, { name, isPublic });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المجموعة بنجاح',
            data: {
                group
            }
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء المجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
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
                message: 'المجموعة غير موجودة',
                code: 'GROUP_NOT_FOUND'
            });
        }

        if (!group.isPublic && !group.admins.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'هذه المجموعة خاصة وتحتاج إلى دعوة',
                code: 'GROUP_PRIVATE'
            });
        }

        const success = await localStorageService.addMemberToGroup(groupId, req.user._id);
        
        if (success) {
            await auditLog('JOIN_GROUP', req.user._id, 'group', groupId);
            
            res.json({
                success: true,
                message: 'تم الانضمام للمجموعة بنجاح',
                data: {
                    group: {
                        ...group,
                        members: [...group.members, req.user._id]
                    }
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'أنت بالفعل عضو في هذه المجموعة',
                code: 'ALREADY_MEMBER'
            });
        }

    } catch (error) {
        console.error('❌ خطأ في الانضمام للمجموعة:', error);
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
        const { limit = 50 } = req.query;

        const group = await localStorageService.getGroupById(groupId);
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'المجموعة غير موجودة',
                code: 'GROUP_NOT_FOUND'
            });
        }

        if (!group.members.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول لهذه المجموعة',
                code: 'ACCESS_DENIED'
            });
        }

        const messages = await localStorageService.getGroupMessages(groupId, parseInt(limit));

        res.json({
            success: true,
            data: {
                messages,
                group
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

// مسارات الستوريات
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await localStorageService.getActiveStories();
        
        const storiesWithUserDetails = await Promise.all(
            stories.map(async (story) => {
                const user = await localStorageService.findUserById(story.userId);
                return {
                    ...story,
                    user: user ? localStorageService.formatUserResponse(user) : null,
                    hasViewed: story.views.includes(req.user._id)
                };
            })
        );

        res.json({
            success: true,
            data: {
                stories: storiesWithUserDetails
            }
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

app.post('/api/stories', authenticateToken, async (req, res) => {
    try {
        const { content, type = 'text', mediaUrl, caption } = req.body;

        if (!content && !mediaUrl) {
            return res.status(400).json({
                success: false,
                message: 'المحتوى أو الوسائط مطلوبة',
                code: 'CONTENT_REQUIRED'
            });
        }

        const story = await localStorageService.createStory({
            userId: req.user._id,
            content,
            type,
            mediaUrl,
            caption,
            metrics: {
                viewCount: 0,
                replyCount: 0,
                reactionCount: 0,
                shareCount: 0
            }
        });

        await auditLog('CREATE_STORY', req.user._id, 'story', story._id, { type });

        res.status(201).json({
            success: true,
            message: 'تم نشر الستوري بنجاح',
            data: {
                story
            }
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء الستوري:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/stories/:storyId/view', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;

        const success = await localStorageService.addStoryView(storyId, req.user._id);
        
        if (success) {
            res.json({
                success: true,
                message: 'تم تسجيل المشاهدة'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'تمت مشاهدة الستوري مسبقاً',
                code: 'ALREADY_VIEWED'
            });
        }

    } catch (error) {
        console.error('❌ خطأ في تسجيل المشاهدة:', error);
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
        
        res.json({
            success: true,
            data: {
                stats
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات المدير:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
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
                message: 'فشل في إنشاء النسخة الاحتياطية',
                code: 'BACKUP_FAILED'
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

app.get('/api/admin/backups', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const data = localStorageService.loadData();
        
        res.json({
            success: true,
            data: {
                backups: data.backups || []
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب النسخ الاحتياطية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسار تحميل الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(UPLOAD_DIR, file.fieldname);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = {
            'images': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            'videos': ['video/mp4', 'video/mpeg', 'video/quicktime'],
            'files': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        };

        let isValid = false;
        for (const [field, types] of Object.entries(allowedTypes)) {
            if (types.includes(file.mimetype)) {
                isValid = true;
                break;
            }
        }

        if (isValid) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم'), false);
        }
    }
});

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم تحميل أي ملف',
                code: 'NO_FILE_UPLOADED'
            });
        }

        const fileUrl = `/uploads/${req.file.fieldname}/${req.file.filename}`;

        res.json({
            success: true,
            message: 'تم تحميل الملف بنجاح',
            data: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
                url: fileUrl
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تحميل الملف:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تحميل الملف',
            code: 'UPLOAD_ERROR'
        });
    }
});

// مسار الصحة
app.get('/api/health', (req, res) => {
    const stats = localStorageService.getStats();
    
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            stats: stats,
            connectedUsers: connectedUsers.size
        }
    });
});

// ==================== WebSocket Events ====================

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('رمز المصادقة مطلوب'));
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await localStorageService.findUserById(decoded.userId);
        
        if (!user) {
            return next(new Error('المستخدم غير موجود'));
        }

        if (!user.isActive) {
            return next(new Error('الحساب موقوف'));
        }

        socket.userId = user._id;
        socket.user = user;
        next();
    } catch (error) {
        console.error('❌ خطأ في مصادقة WebSocket:', error);
        next(new Error('مصادقة غير صالحة'));
    }
});

io.on('connection', async (socket) => {
    console.log(`🔗 مستخدم متصل: ${socket.user.fullName} (${socket.userId})`);
    
    // تخزين بيانات المستخدم المتصل
    connectedUsers.set(socket.userId, {
        socketId: socket.id,
        user: socket.user,
        connectedAt: new Date().toISOString()
    });
    
    userSockets.set(socket.userId, socket.id);

    // تحديث حالة المستخدم إلى متصل
    await localStorageService.updateUser(socket.userId, {
        isOnline: true,
        lastSeen: new Date().toISOString()
    });

    // الانضمام إلى غرف المستخدم
    socket.join(socket.userId);
    
    // الانضمام إلى القنوات والمجموعات التي ينتمي إليها المستخدم
    const userChannels = await localStorageService.getUserChannels(socket.userId);
    userChannels.forEach(channel => {
        socket.join(`channel_${channel._id}`);
    });

    const userGroups = await localStorageService.getUserGroups(socket.userId);
    userGroups.forEach(group => {
        socket.join(`group_${group._id}`);
    });

    // إرسال حدث اتصال للمستخدمين الآخرين
    socket.broadcast.emit('user_online', {
        userId: socket.userId,
        user: localStorageService.formatUserResponse(socket.user)
    });

    // ============ أحداث المحادثات الفردية ============
    socket.on('send_message', async (data) => {
        try {
            const { conversationId, content, type = 'text', mediaUrl } = data;

            if (!conversationId || (!content && !mediaUrl)) {
                socket.emit('error', { message: 'معرّف المحادثة والمحتوى مطلوبان' });
                return;
            }

            const conversation = await localStorageService.getConversationById(conversationId);
            if (!conversation) {
                socket.emit('error', { message: 'المحادثة غير موجودة' });
                return;
            }

            if (!conversation.participants.includes(socket.userId)) {
                socket.emit('error', { message: 'غير مصرح لك بإرسال رسالة في هذه المحادثة' });
                return;
            }

            const message = await localStorageService.createMessage({
                conversationId,
                senderId: socket.userId,
                content,
                type,
                mediaUrl
            });

            // إرسال الرسالة لجميع المشاركين في المحادثة
            conversation.participants.forEach(participantId => {
                if (connectedUsers.has(participantId)) {
                    io.to(participantId).emit('new_message', {
                        message,
                        conversationId
                    });
                }
            });

            console.log(`💬 رسالة جديدة في المحادثة ${conversationId} من ${socket.user.fullName}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'فشل في إرسال الرسالة' });
        }
    });

    socket.on('start_conversation', async (data) => {
        try {
            const { participantIds, name } = data;

            if (!participantIds || participantIds.length === 0) {
                socket.emit('error', { message: 'يجب تحديد مشاركين على الأقل' });
                return;
            }

            const allParticipants = [...new Set([socket.userId, ...participantIds])];
            const isGroup = allParticipants.length > 2;

            const conversation = await localStorageService.createConversation(
                allParticipants, 
                name, 
                isGroup
            );

            // إرسال المحادثة الجديدة لجميع المشاركين
            allParticipants.forEach(participantId => {
                if (connectedUsers.has(participantId)) {
                    io.to(participantId).emit('conversation_created', {
                        conversation
                    });
                }
            });

            socket.emit('conversation_started', { conversation });

        } catch (error) {
            console.error('❌ خطأ في بدء المحادثة:', error);
            socket.emit('error', { message: 'فشل في بدء المحادثة' });
        }
    });

    socket.on('typing_start', async (data) => {
        try {
            const { conversationId } = data;
            const conversation = await localStorageService.getConversationById(conversationId);
            
            if (conversation) {
                conversation.participants.forEach(participantId => {
                    if (participantId !== socket.userId && connectedUsers.has(participantId)) {
                        io.to(participantId).emit('user_typing', {
                            conversationId,
                            userId: socket.userId,
                            userName: socket.user.fullName
                        });
                    }
                });
            }
        } catch (error) {
            console.error('❌ خطأ في إرسال حدث الكتابة:', error);
        }
    });

    socket.on('typing_stop', async (data) => {
        try {
            const { conversationId } = data;
            const conversation = await localStorageService.getConversationById(conversationId);
            
            if (conversation) {
                conversation.participants.forEach(participantId => {
                    if (participantId !== socket.userId && connectedUsers.has(participantId)) {
                        io.to(participantId).emit('user_stop_typing', {
                            conversationId,
                            userId: socket.userId
                        });
                    }
                });
            }
        } catch (error) {
            console.error('❌ خطأ في إرسال حدث توقف الكتابة:', error);
        }
    });

    socket.on('mark_messages_read', async (data) => {
        try {
            const { conversationId } = data;
            await localStorageService.markMessagesAsRead(conversationId, socket.userId);
            
            const conversation = await localStorageService.getConversationById(conversationId);
            if (conversation) {
                conversation.participants.forEach(participantId => {
                    if (participantId !== socket.userId && connectedUsers.has(participantId)) {
                        io.to(participantId).emit('messages_read', {
                            conversationId,
                            userId: socket.userId
                        });
                    }
                });
            }
        } catch (error) {
            console.error('❌ خطأ في تعليم الرسائل كمقروءة:', error);
        }
    });

    // ============ أحداث القنوات ============
    socket.on('send_channel_message', async (data) => {
        try {
            const { channelId, content, type = 'text', mediaUrl } = data;

            if (!channelId || (!content && !mediaUrl)) {
                socket.emit('error', { message: 'معرّف القناة والمحتوى مطلوبان' });
                return;
            }

            const channel = await localStorageService.getChannelById(channelId);
            if (!channel) {
                socket.emit('error', { message: 'القناة غير موجودة' });
                return;
            }

            if (!channel.members.includes(socket.userId) && !channel.admins.includes(socket.userId)) {
                socket.emit('error', { message: 'غير مصرح لك بإرسال رسالة في هذه القناة' });
                return;
            }

            const message = await localStorageService.createChannelMessage({
                channelId,
                senderId: socket.userId,
                content,
                type,
                mediaUrl
            });

            // إرسال الرسالة لجميع أعضاء القناة
            io.to(`channel_${channelId}`).emit('new_channel_message', {
                message,
                channelId
            });

            console.log(`📢 رسالة جديدة في القناة ${channel.name} من ${socket.user.fullName}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال رسالة القناة:', error);
            socket.emit('error', { message: 'فشل في إرسال الرسالة' });
        }
    });

    socket.on('join_channel', async (data) => {
        try {
            const { channelId } = data;
            const channel = await localStorageService.getChannelById(channelId);
            
            if (channel && (channel.isPublic || channel.members.includes(socket.userId))) {
                socket.join(`channel_${channelId}`);
                socket.emit('channel_joined', { channelId });
                
                // إعلام الأعضاء الآخرين
                socket.to(`channel_${channelId}`).emit('user_joined_channel', {
                    channelId,
                    user: localStorageService.formatUserResponse(socket.user)
                });
            }
        } catch (error) {
            console.error('❌ خطأ في الانضمام للقناة:', error);
            socket.emit('error', { message: 'فشل في الانضمام للقناة' });
        }
    });

    // ============ أحداث المجموعات ============
    socket.on('send_group_message', async (data) => {
        try {
            const { groupId, content, type = 'text', mediaUrl } = data;

            if (!groupId || (!content && !mediaUrl)) {
                socket.emit('error', { message: 'معرّف المجموعة والمحتوى مطلوبان' });
                return;
            }

            const group = await localStorageService.getGroupById(groupId);
            if (!group) {
                socket.emit('error', { message: 'المجموعة غير موجودة' });
                return;
            }

            if (!group.members.includes(socket.userId)) {
                socket.emit('error', { message: 'غير مصرح لك بإرسال رسالة في هذه المجموعة' });
                return;
            }

            const message = await localStorageService.createGroupMessage({
                groupId,
                senderId: socket.userId,
                content,
                type,
                mediaUrl
            });

            // إرسال الرسالة لجميع أعضاء المجموعة
            io.to(`group_${groupId}`).emit('new_group_message', {
                message,
                groupId
            });

            console.log(`👥 رسالة جديدة في المجموعة ${group.name} من ${socket.user.fullName}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال رسالة المجموعة:', error);
            socket.emit('error', { message: 'فشل في إرسال الرسالة' });
        }
    });

    socket.on('join_group', async (data) => {
        try {
            const { groupId } = data;
            const group = await localStorageService.getGroupById(groupId);
            
            if (group && (group.isPublic || group.members.includes(socket.userId))) {
                socket.join(`group_${groupId}`);
                socket.emit('group_joined', { groupId });
                
                // إعلام الأعضاء الآخرين
                socket.to(`group_${groupId}`).emit('user_joined_group', {
                    groupId,
                    user: localStorageService.formatUserResponse(socket.user)
                });
            }
        } catch (error) {
            console.error('❌ خطأ في الانضمام للمجموعة:', error);
            socket.emit('error', { message: 'فشل في الانضمام للمجموعة' });
        }
    });

    // ============ أحداث الستوريات ============
    socket.on('create_story', async (data) => {
        try {
            const { content, type = 'text', mediaUrl, caption } = data;

            if (!content && !mediaUrl) {
                socket.emit('error', { message: 'المحتوى أو الوسائط مطلوبة' });
                return;
            }

            const story = await localStorageService.createStory({
                userId: socket.userId,
                content,
                type,
                mediaUrl,
                caption
            });

            // إرسال الستوري الجديد لجميع الأصدقاء/المتابعين
            socket.broadcast.emit('new_story', {
                story: {
                    ...story,
                    user: localStorageService.formatUserResponse(socket.user)
                }
            });

            socket.emit('story_created', { story });

            console.log(`📸 ستوري جديد من ${socket.user.fullName}`);

        } catch (error) {
            console.error('❌ خطأ في إنشاء الستوري:', error);
            socket.emit('error', { message: 'فشل في إنشاء الستوري' });
        }
    });

    socket.on('view_story', async (data) => {
        try {
            const { storyId } = data;
            const success = await localStorageService.addStoryView(storyId, socket.userId);
            
            if (success) {
                const story = await localStorageService.updateStory(storyId, {});
                if (story) {
                    // إعلام صاحب الستوري بالمشاهدة
                    if (story.userId !== socket.userId && connectedUsers.has(story.userId)) {
                        io.to(story.userId).emit('story_viewed', {
                            storyId,
                            viewerId: socket.userId,
                            viewerName: socket.user.fullName
                        });
                    }
                }
            }
        } catch (error) {
            console.error('❌ خطأ في تسجيل مشاهدة الستوري:', error);
        }
    });

    // ============ أحداث عامة ============
    socket.on('disconnect', async () => {
        console.log(`🔌 مستخدم منفصل: ${socket.user.fullName} (${socket.userId})`);
        
        connectedUsers.delete(socket.userId);
        userSockets.delete(socket.userId);

        await localStorageService.updateUser(socket.userId, {
            isOnline: false,
            lastSeen: new Date().toISOString()
        });

        // إرسال حدث انفصال للمستخدمين الآخرين
        socket.broadcast.emit('user_offline', {
            userId: socket.userId,
            lastSeen: new Date().toISOString()
        });
    });

    socket.on('error', (error) => {
        console.error('❌ خطأ في WebSocket:', error);
    });
});

// ==================== وظائف الخلفية ====================

// تنظيف البيانات القديمة كل ساعة
setInterval(async () => {
    try {
        await localStorageService.cleanupOldData();
    } catch (error) {
        console.error('❌ خطأ في تنظيف البيانات:', error);
    }
}, 60 * 60 * 1000);

// النسخ الاحتياطي التلقائي كل 24 ساعة
setInterval(async () => {
    try {
        const result = await localStorageService.createBackup();
        if (result.success) {
            console.log('✅ تم إنشاء النسخة الاحتياطية التلقائية');
        } else {
            console.error('❌ فشل في النسخ الاحتياطي التلقائي:', result.error);
        }
    } catch (error) {
        console.error('❌ خطأ في النسخ الاحتياطي التلقائي:', error);
    }
}, 24 * 60 * 60 * 1000);

// ==================== تشغيل الخادم ====================

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 خادم المنصة التعليمية المحسن يعمل بنجاح!');
    console.log('='.repeat(60));
    console.log(`📍 العنوان: http://localhost:${PORT}`);
    console.log(`🌐 البيئة: ${NODE_ENV}`);
    console.log(`👥 المستخدمون المتصلون: ${connectedUsers.size}`);
    console.log(`💾 قاعدة البيانات: ${__dirname}/local_data.json`);
    console.log(`📁 الملفات المحملة: ${UPLOAD_DIR}`);
    console.log('='.repeat(60));
    console.log('🔐 حساب المدير الافتراضي:');
    console.log('📧 البريد الإلكتروني: admin@platform.edu');
    console.log('🔑 كلمة المرور: 77007700');
    console.log('='.repeat(60));
    
    // عرض الإحصائيات الأولية
    setTimeout(() => {
        const stats = localStorageService.getStats();
        console.log('📊 إحصائيات النظام:');
        console.log(`   👤 المستخدمون: ${stats.totalUsers}`);
        console.log(`   💬 الرسائل: ${stats.totalMessages}`);
        console.log(`   📸 الستوريات: ${stats.totalStories}`);
        console.log(`   📢 القنوات: ${stats.totalChannels}`);
        console.log(`   👥 المجموعات: ${stats.totalGroups}`);
        console.log(`   💭 المحادثات: ${stats.totalConversations}`);
        console.log('='.repeat(60));
    }, 2000);
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ وعد مرفوض غير معالج:', reason);
});

export default app;
