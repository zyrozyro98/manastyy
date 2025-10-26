// server.js - الخادم الكامل للمنصة التعليمية (محدث ومحسن بالكامل)
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
const JWT_SECRET = process.env.JWT_SECRET || 'educational-platform-super-secret-key-2024-change-in-production';
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
    path.join(__dirname, 'public'),
    path.join(__dirname, 'logs')
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
    },
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});
app.use(limiter);

// وسائط middleware الأساسية
app.use(cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
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

// نظام التخزين المحلي المحسن مع ذاكرة التخزين المؤقت
class EnhancedLocalStorageService {
    constructor() {
        this.dataFile = path.join(__dirname, 'local_data.json');
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 دقائق
        this.init();
    }

    init() {
        if (!fs.existsSync(this.dataFile)) {
            const defaultData = this.getDefaultData();
            this.saveData(defaultData);
            console.log('✅ تم إنشاء ملف البيانات المحلي');
        } else {
            console.log('✅ تم تحميل ملف البيانات المحلي');
        }
    }

    loadData() {
        try {
            if (this.cache.has('allData')) {
                const cached = this.cache.get('allData');
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    return cached.data;
                }
            }
            
            const data = fs.readFileSync(this.dataFile, 'utf8');
            const parsedData = JSON.parse(data);
            
            this.cache.set('allData', {
                data: parsedData,
                timestamp: Date.now()
            });
            
            return parsedData;
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات المحلية:', error);
            return this.getDefaultData();
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            
            this.cache.set('allData', {
                data: data,
                timestamp: Date.now()
            });
            
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
                totalConversations: 0,
                activeUsers: 0,
                totalStorage: 0
            }
        };
    }

    // ============ دوال المستخدمين ============
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
            avatar: userData.avatar || null,
            bio: userData.bio || '',
            phone: userData.phone || '',
            stats: {
                messagesSent: 0,
                storiesPosted: 0,
                channelsJoined: 0,
                groupsJoined: 0,
                totalLikes: 0,
                totalViews: 0
            },
            settings: {
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
        
        // مسح ذاكرة التخزين المؤقت
        this.cache.delete('users_all');
        
        return user;
    }

    async findUserByEmail(email) {
        const cacheKey = `user_email_${email}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const user = data.users.find(user => 
            user.email === email && user.isActive
        );
        
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
        const user = data.users.find(user => 
            user._id === userId && user.isActive
        );
        
        if (user) {
            this.cache.set(cacheKey, user);
        }
        
        return user;
    }

    async searchUsers(query, limit = 20) {
        const cacheKey = `users_search_${query}_${limit}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const searchTerm = query.toLowerCase();
        
        const results = data.users
            .filter(user => 
                user.isActive && 
                (user.fullName.toLowerCase().includes(searchTerm) || 
                 user.email.toLowerCase().includes(searchTerm) ||
                 (user.bio && user.bio.toLowerCase().includes(searchTerm)))
            )
            .slice(0, limit)
            .map(user => this.formatUserResponse(user));

        this.cache.set(cacheKey, results);
        return results;
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
            
            // مسح ذاكرة التخزين المؤقت
            this.cache.delete(`user_id_${userId}`);
            this.cache.delete(`user_email_${data.users[userIndex].email}`);
            this.cache.delete('users_all');
            
            return data.users[userIndex];
        }
        return null;
    }

    async getAllUsers() {
        const cacheKey = 'users_all';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const users = data.users.filter(user => user.isActive);
        
        this.cache.set(cacheKey, users);
        return users;
    }

    async getOnlineUsers() {
        const data = this.loadData();
        return data.users.filter(user => user.isOnline && user.isActive);
    }

    // ============ دوال المحادثات ============
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
            isGroup: isGroup,
            avatar: null
        };
        
        // تهيئة unreadCount لجميع المشاركين
        participants.forEach(participantId => {
            conversation.unreadCount[participantId] = 0;
        });
        
        data.conversations.push(conversation);
        this.updateStats(data);
        this.saveData(data);
        
        // مسح ذاكرة التخزين المؤقت
        participants.forEach(participantId => {
            this.cache.delete(`conversations_user_${participantId}`);
        });
        
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

    async updateConversation(conversationId, updates) {
        const data = this.loadData();
        const convIndex = data.conversations.findIndex(conv => conv._id === conversationId);
        
        if (convIndex !== -1) {
            data.conversations[convIndex] = {
                ...data.conversations[convIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            
            this.saveData(data);
            
            // مسح ذاكرة التخزين المؤقت
            data.conversations[convIndex].participants.forEach(participantId => {
                this.cache.delete(`conversations_user_${participantId}`);
            });
            
            return data.conversations[convIndex];
        }
        return null;
    }

    // ============ دوال الرسائل ============
    async createMessage(messageData) {
        const data = this.loadData();
        const messageId = uuidv4();
        const message = {
            _id: messageId,
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [messageData.senderId],
            reactions: [],
            edited: { isEdited: false, editedAt: null },
            deleted: { isDeleted: false, deletedAt: null },
            metadata: messageData.metadata || {}
        };
        
        data.messages.push(message);
        
        // تحديث المحادثة
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
        
        // مسح ذاكرة التخزين المؤقت
        if (convIndex !== -1) {
            data.conversations[convIndex].participants.forEach(participantId => {
                this.cache.delete(`conversations_user_${participantId}`);
                this.cache.delete(`messages_conv_${messageData.conversationId}_*`);
            });
        }
        
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
            messages = messages.filter(msg => new Date(msg.createdAt) < new Date(before));
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
            
            // مسح ذاكرة التخزين المؤقت
            this.cache.delete(`conversations_user_${userId}`);
        }
        
        return true;
    }

    async addReactionToMessage(messageId, userId, reaction) {
        const data = this.loadData();
        const messageIndex = data.messages.findIndex(msg => msg._id === messageId);
        
        if (messageIndex !== -1) {
            const existingReactionIndex = data.messages[messageIndex].reactions.findIndex(
                r => r.userId === userId && r.reaction === reaction
            );
            
            if (existingReactionIndex !== -1) {
                // إزالة التفاعل إذا كان موجوداً
                data.messages[messageIndex].reactions.splice(existingReactionIndex, 1);
            } else {
                // إضافة تفاعل جديد
                data.messages[messageIndex].reactions.push({
                    userId,
                    reaction,
                    createdAt: new Date().toISOString()
                });
            }
            
            this.saveData(data);
            return data.messages[messageIndex];
        }
        return null;
    }

    // ============ دوال القنوات ============
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
            avatar: channelData.avatar || null,
            banner: channelData.banner || null,
            channelSettings: {
                isPublic: channelData.isPublic !== false,
                allowComments: true,
                adminOnlyPosts: false,
                allowFileSharing: true,
                maxFileSize: 50 * 1024 * 1024 // 50MB
            },
            stats: {
                memberCount: channelData.members?.length || 1,
                messageCount: 0,
                dailyActiveUsers: 0,
                totalViews: 0
            },
            tags: channelData.tags || []
        };
        
        data.channels.push(channel);
        this.updateStats(data);
        this.saveData(data);
        
        // مسح ذاكرة التخزين المؤقت
        this.cache.delete('channels_all');
        this.cache.delete('channels_public');
        
        return channel;
    }

    async getAllChannels() {
        const cacheKey = 'channels_all';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const channels = data.channels.filter(channel => channel.isActive);
        
        this.cache.set(cacheKey, channels);
        return channels;
    }

    async getPublicChannels() {
        const cacheKey = 'channels_public';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const channels = data.channels.filter(channel => 
            channel.isActive && channel.channelSettings.isPublic
        );
        
        this.cache.set(cacheKey, channels);
        return channels;
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
            edited: { isEdited: false, editedAt: null },
            deleted: { isDeleted: false, deletedAt: null },
            metadata: messageData.metadata || {}
        };
        
        data.channelMessages.push(message);
        
        const channelIndex = data.channels.findIndex(channel => channel._id === messageData.channelId);
        if (channelIndex !== -1) {
            data.channels[channelIndex].stats.messageCount += 1;
            data.channels[channelIndex].updatedAt = new Date().toISOString();
        }
        
        this.updateStats(data);
        this.saveData(data);
        
        // مسح ذاكرة التخزين المؤقت
        this.cache.delete(`channel_messages_${messageData.channelId}_*`);
        
        return message;
    }

    async getChannelMessages(channelId, limit = 50) {
        const cacheKey = `channel_messages_${channelId}_${limit}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const messages = data.channelMessages
            .filter(msg => msg.channelId === channelId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit)
            .reverse();

        this.cache.set(cacheKey, messages);
        return messages;
    }

    async addMemberToChannel(channelId, userId) {
        const data = this.loadData();
        const channelIndex = data.channels.findIndex(channel => channel._id === channelId);
        
        if (channelIndex !== -1 && !data.channels[channelIndex].members.includes(userId)) {
            data.channels[channelIndex].members.push(userId);
            data.channels[channelIndex].stats.memberCount += 1;
            data.channels[channelIndex].updatedAt = new Date().toISOString();
            this.saveData(data);
            
            // مسح ذاكرة التخزين المؤقت
            this.cache.delete(`channels_user_${userId}`);
            this.cache.delete('channels_all');
            this.cache.delete('channels_public');
            
            return true;
        }
        return false;
    }

    // ============ دوال المجموعات ============
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
            avatar: groupData.avatar || null,
            banner: groupData.banner || null,
            groupSettings: {
                isPublic: groupData.isPublic !== false,
                allowInvites: true,
                adminOnlyPosts: false,
                allowFileSharing: true,
                maxMembers: 100
            },
            stats: {
                memberCount: groupData.members?.length || 1,
                messageCount: 0,
                dailyActiveUsers: 0
            },
            tags: groupData.tags || []
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
        
        // مسح ذاكرة التخزين المؤقت
        this.cache.delete('groups_all');
        this.cache.delete('groups_public');
        
        return group;
    }

    async getAllGroups() {
        const cacheKey = 'groups_all';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const groups = data.groups.filter(group => group.isActive);
        
        this.cache.set(cacheKey, groups);
        return groups;
    }

    async getPublicGroups() {
        const cacheKey = 'groups_public';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const groups = data.groups.filter(group => 
            group.isActive && group.groupSettings.isPublic
        );
        
        this.cache.set(cacheKey, groups);
        return groups;
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
            edited: { isEdited: false, editedAt: null },
            deleted: { isDeleted: false, deletedAt: null },
            metadata: messageData.metadata || {}
        };
        
        data.groupMessages.push(message);
        
        const groupIndex = data.groups.findIndex(group => group._id === messageData.groupId);
        if (groupIndex !== -1) {
            data.groups[groupIndex].stats.messageCount += 1;
            data.groups[groupIndex].updatedAt = new Date().toISOString();
        }
        
        this.updateStats(data);
        this.saveData(data);
        
        // مسح ذاكرة التخزين المؤقت
        this.cache.delete(`group_messages_${messageData.groupId}_*`);
        
        return message;
    }

    async getGroupMessages(groupId, limit = 50) {
        const cacheKey = `group_messages_${groupId}_${limit}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const messages = data.groupMessages
            .filter(msg => msg.groupId === groupId && !msg.deleted.isDeleted)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit)
            .reverse();

        this.cache.set(cacheKey, messages);
        return messages;
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
                conversation.unreadCount[userId] = 0;
            }
            
            // مسح ذاكرة التخزين المؤقت
            this.cache.delete(`groups_user_${userId}`);
            this.cache.delete('groups_all');
            this.cache.delete('groups_public');
            
            return true;
        }
        return false;
    }

    // ============ دوال الستوريات ============
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
            isActive: true,
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
        
        // مسح ذاكرة التخزين المؤقت
        this.cache.delete('stories_active');
        this.cache.delete(`stories_user_${storyData.userId}`);
        
        return story;
    }

    async getActiveStories() {
        const cacheKey = 'stories_active';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const now = new Date().toISOString();
        const stories = data.stories.filter(story => 
            story.expiresAt > now && story.isActive
        );
        
        this.cache.set(cacheKey, stories);
        return stories;
    }

    async getUserStories(userId) {
        const cacheKey = `stories_user_${userId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const now = new Date().toISOString();
        const stories = data.stories.filter(story => 
            story.userId === userId && story.expiresAt > now && story.isActive
        );
        
        this.cache.set(cacheKey, stories);
        return stories;
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
            
            // مسح ذاكرة التخزين المؤقت
            this.cache.delete('stories_active');
            this.cache.delete(`stories_user_${data.stories[storyIndex].userId}`);
            
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
            
            // مسح ذاكرة التخزين المؤقت
            this.cache.delete('stories_active');
            this.cache.delete(`stories_user_${data.stories[storyIndex].userId}`);
            
            return true;
        }
        return false;
    }

    async addStoryReaction(storyId, userId, reaction) {
        const data = this.loadData();
        const storyIndex = data.stories.findIndex(story => story._id === storyId);
        
        if (storyIndex !== -1) {
            const existingReactionIndex = data.stories[storyIndex].reactions.findIndex(
                r => r.userId === userId
            );
            
            if (existingReactionIndex !== -1) {
                data.stories[storyIndex].reactions[existingReactionIndex].reaction = reaction;
            } else {
                data.stories[storyIndex].reactions.push({
                    userId,
                    reaction,
                    createdAt: new Date().toISOString()
                });
                data.stories[storyIndex].metrics.reactionCount += 1;
            }
            
            this.saveData(data);
            
            // مسح ذاكرة التخزين المؤقت
            this.cache.delete('stories_active');
            this.cache.delete(`stories_user_${data.stories[storyIndex].userId}`);
            
            return data.stories[storyIndex];
        }
        return null;
    }

    // ============ دوال الإشعارات ============
    async createNotification(notificationData) {
        const data = this.loadData();
        const notificationId = uuidv4();
        const notification = {
            _id: notificationId,
            ...notificationData,
            isRead: false,
            createdAt: new Date().toISOString()
        };
        
        if (!data.notifications) {
            data.notifications = [];
        }
        
        data.notifications.push(notification);
        this.saveData(data);
        
        return notification;
    }

    async getUserNotifications(userId, limit = 20) {
        const data = this.loadData();
        if (!data.notifications) {
            return [];
        }
        
        return data.notifications
            .filter(notification => notification.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }

    async markNotificationAsRead(notificationId) {
        const data = this.loadData();
        const notificationIndex = data.notifications?.findIndex(n => n._id === notificationId);
        
        if (notificationIndex !== -1) {
            data.notifications[notificationIndex].isRead = true;
            this.saveData(data);
            return true;
        }
        return false;
    }

    // ============ النسخ الاحتياطي والإحصائيات ============
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
            
            const backupData = {
                timestamp: new Date().toISOString(),
                data: this.loadData(),
                version: '2.0.0',
                stats: this.getStats()
            };

            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
            
            const data = this.loadData();
            if (!data.backups) {
                data.backups = [];
            }
            
            data.backups.push({
                filename: `backup-${timestamp}.json`,
                timestamp: new Date().toISOString(),
                size: JSON.stringify(backupData).length,
                stats: backupData.stats
            });
            
            // الاحتفاظ بآخر 10 نسخ احتياطية فقط
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
        const activeUsers = data.users.filter(user => user.isOnline && user.isActive).length;
        const totalStorage = this.calculateTotalStorage();
        
        data.stats = {
            totalUsers: data.users.length,
            totalMessages: data.messages.length + data.channelMessages.length + data.groupMessages.length,
            totalStories: data.stories.length,
            totalChannels: data.channels.length,
            totalGroups: data.groups.length,
            totalConversations: data.conversations.length,
            activeUsers: activeUsers,
            totalStorage: totalStorage,
            lastUpdate: new Date().toISOString(),
            cacheSize: this.cache.size,
            systemUptime: process.uptime()
        };
        return data.stats;
    }

    calculateTotalStorage() {
        let totalSize = 0;
        
        // حساب حجم ملف البيانات
        try {
            const stats = fs.statSync(this.dataFile);
            totalSize += stats.size;
        } catch (error) {
            console.error('❌ خطأ في حساب حجم ملف البيانات:', error);
        }
        
        // حساب حجم الملفات المرفوعة
        const calculateDirSize = (dirPath) => {
            let size = 0;
            try {
                const files = fs.readdirSync(dirPath);
                files.forEach(file => {
                    const filePath = path.join(dirPath, file);
                    const stats = fs.statSync(filePath);
                    if (stats.isFile()) {
                        size += stats.size;
                    } else if (stats.isDirectory()) {
                        size += calculateDirSize(filePath);
                    }
                });
            } catch (error) {
                console.error(`❌ خطأ في حساب حجم المجلد ${dirPath}:`, error);
            }
            return size;
        };
        
        totalSize += calculateDirSize(UPLOAD_DIR);
        totalSize += calculateDirSize(BACKUP_DIR);
        totalSize += calculateDirSize(EXPORT_DIR);
        
        return totalSize;
    }

    getStats() {
        const data = this.loadData();
        return this.updateStats(data);
    }

    getSystemInfo() {
        return {
            nodeVersion: process.version,
            platform: process.platform,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            environment: NODE_ENV,
            timestamp: new Date().toISOString()
        };
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
            let cleanedCount = 0;
            
            // تنظيف الستوريات المنتهية
            const initialStoryCount = data.stories.length;
            data.stories = data.stories.filter(story => 
                new Date(story.expiresAt) > now
            );
            cleanedCount += initialStoryCount - data.stories.length;
            
            // تنظيف الإشعارات القديمة (أكثر من 30 يوم)
            if (data.notifications) {
                const initialNotificationCount = data.notifications.length;
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                data.notifications = data.notifications.filter(notification => 
                    new Date(notification.createdAt) > thirtyDaysAgo
                );
                cleanedCount += initialNotificationCount - data.notifications.length;
            }
            
            // تنظيف النسخ الاحتياطية القديمة (يتم في createBackup)
            
            this.saveData(data);
            this.clearCache();
            
            console.log(`🧹 تم تنظيف ${cleanedCount} عنصر من البيانات القديمة`);
            return { success: true, cleanedCount };
        } catch (error) {
            console.error('❌ خطأ في تنظيف البيانات:', error);
            return { success: false, error: error.message };
        }
    }

    // تصدير البيانات
    async exportData(format = 'json') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportFile = path.join(EXPORT_DIR, `export-${timestamp}.${format}`);
            
            const data = this.loadData();
            const exportData = {
                timestamp: new Date().toISOString(),
                version: '2.0.0',
                stats: this.getStats(),
                data: {
                    users: data.users.map(user => this.formatUserResponse(user)),
                    conversations: data.conversations,
                    channels: data.channels,
                    groups: data.groups,
                    stories: data.stories
                }
            };

            fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2));
            
            if (!data.exports) {
                data.exports = [];
            }
            
            data.exports.push({
                filename: `export-${timestamp}.${format}`,
                timestamp: new Date().toISOString(),
                format: format,
                size: JSON.stringify(exportData).length
            });
            
            this.saveData(data);
            
            return { success: true, filename: `export-${timestamp}.${format}` };
        } catch (error) {
            console.error('❌ خطأ في تصدير البيانات:', error);
            return { success: false, error: error.message };
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
        const logEntry = {
            action,
            userId,
            targetType,
            targetId,
            details,
            timestamp: new Date().toISOString(),
            ip: details.ip || 'unknown'
        };
        
        console.log(`📋 Audit Log: ${action} by ${userId} on ${targetType} ${targetId}`, details);
        
        // حفظ في سجل التدقيق
        const logData = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(path.join(__dirname, 'logs', 'audit.log'), logData);
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل التدقيق:', error);
    }
};

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
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
                role: 'admin',
                bio: 'مدير المنصة التعليمية'
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
                role: 'teacher',
                bio: 'معلم رياضيات متخصص'
            },
            {
                fullName: 'فاطمة علي',
                email: 'fatima@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'student',
                bio: 'طالبة في الصف العاشر'
            },
            {
                fullName: 'خالد إبراهيم',
                email: 'khaled@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'student',
                bio: 'مهتم بالبرمجة والتكنولوجيا'
            },
            {
                fullName: 'سارة عبدالله',
                email: 'sara@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'teacher',
                bio: 'معلمة لغة عربية وأدب'
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
        const teacherUsers = allUsers.filter(u => u.role === 'teacher');

        if (adminUser && teacherUsers.length > 0) {
            // إنشاء قنوات
            const channels = [
                {
                    name: 'قناة الرياضيات',
                    description: 'قناة مخصصة لدروس الرياضيات والتمارين والحلول',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true,
                    tags: ['رياضيات', 'تعليم', 'دروس']
                },
                {
                    name: 'قناة العلوم',
                    description: 'مناقشات وأخبار علمية وتجارب ممتعة',
                    creatorId: teacherUsers[0]._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true,
                    tags: ['علوم', 'فيزياء', 'كيمياء', 'أحياء']
                },
                {
                    name: 'قناة البرمجة',
                    description: 'تعلم البرمجة وتطوير التطبيقات',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true,
                    tags: ['برمجة', 'تطوير', 'تقنية']
                }
            ];

            for (const channelData of channels) {
                const existingChannels = await localStorageService.getAllChannels();
                if (!existingChannels.find(c => c.name === channelData.name)) {
                    await localStorageService.createChannel(channelData);
                    console.log(`✅ تم إنشاء القناة: ${channelData.name}`);
                }
            }

            // إنشاء مجموعات
            const groups = [
                {
                    name: 'مجموعة الرياضيات المتقدمة',
                    description: 'مجموعة للمناقشات المتقدمة في الرياضيات وحل المسائل الصعبة',
                    creatorId: teacherUsers[0]._id,
                    members: allUsers.map(u => u._id),
                    isPublic: false,
                    tags: ['رياضيات', 'متقدم', 'مسائل']
                },
                {
                    name: 'مجموعة مشاريع التخرج',
                    description: 'لمناقشة مشاريع التخرج والتعاون بين الطلاب',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true,
                    tags: ['مشاريع', 'تخرج', 'تعاون']
                }
            ];

            for (const groupData of groups) {
                const existingGroups = await localStorageService.getAllGroups();
                if (!existingGroups.find(g => g.name === groupData.name)) {
                    await localStorageService.createGroup(groupData);
                    console.log(`✅ تم إنشاء المجموعة: ${groupData.name}`);
                }
            }

            // إنشاء محادثات فردية
            if (allUsers.length >= 2) {
                await localStorageService.createConversation(
                    [allUsers[0]._id, allUsers[1]._id],
                    null,
                    false
                );
                console.log('✅ تم إنشاء محادثة فردية');
            }

            // إنشاء بعض الرسائل
            const channelsList = await localStorageService.getAllChannels();
            if (channelsList.length > 0) {
                await localStorageService.createChannelMessage({
                    channelId: channelsList[0]._id,
                    senderId: adminUser._id,
                    content: 'مرحباً بالجميع في قناة الرياضيات! 🎉',
                    type: 'text'
                });
                console.log('✅ تم إنشاء رسالة ترحيب في القناة');
            }
        }

        console.log('✅ تم إنشاء البيانات التجريبية بنجاح');
    } catch (error) {
        console.error('❌ خطأ في إنشاء البيانات التجريبية:', error);
    }
}

// تخزين المستخدمين المتصلين
const connectedUsers = new Map();
const userSockets = new Map();

// ==================== مسارات API ====================

// مسار رئيسي
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية المتكامل يعمل بنجاح!',
        version: '2.0.0',
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
            search: true,
            voice_messages: true,
            reactions: true
        },
        endpoints: {
            auth: '/api/auth/*',
            users: '/api/users/*',
            chat: '/api/chat/*',
            channels: '/api/channels/*',
            groups: '/api/groups/*',
            stories: '/api/stories/*',
            admin: '/api/admin/*',
            upload: '/api/upload'
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
                message: 'جميع الحقول مطلوبة',
                code: 'MISSING_FIELDS'
            });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني غير صالح',
                code: 'INVALID_EMAIL'
            });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
                code: 'WEAK_PASSWORD'
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
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: role
        });

        await auditLog('REGISTER', user._id, 'USER', user._id, { 
            email, 
            role,
            ip: req.ip 
        });

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

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'الحساب موقوف',
                code: 'ACCOUNT_SUSPENDED'
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

        const updatedUser = await localStorageService.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await auditLog('LOGIN', user._id, 'USER', user._id, { 
            email,
            ip: req.ip 
        });

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: localStorageService.formatUserResponse(updatedUser || user),
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

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
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
            message: 'تم تجديد الرمز بنجاح',
            data: {
                token: newToken,
                refreshToken: newRefreshToken
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تجديد الرمز:', error);
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

        await auditLog('LOGOUT', req.user._id, 'USER', req.user._id, {
            ip: req.ip
        });

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

app.put('/api/users/me', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { fullName, bio, phone } = req.body;
        const updates = {};

        if (fullName) updates.fullName = fullName.trim();
        if (bio !== undefined) updates.bio = bio;
        if (phone) updates.phone = phone;

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

        await auditLog('UPDATE_PROFILE', req.user._id, 'USER', req.user._id);

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

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await localStorageService.getAllUsers();
        res.json({
            success: true,
            data: {
                users: users.map(user => localStorageService.formatUserResponse(user)),
                total: users.length
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

// البحث عن المستخدمين
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
            data: {
                users,
                query: q,
                total: users.length
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

// مسارات الدردشة والمحادثات
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await localStorageService.getConversationsByUserId(req.user._id);
        
        const conversationsWithDetails = await Promise.all(
            conversations.map(async (conv) => {
                const messages = await localStorageService.getMessagesByConversation(conv._id, 1);
                const lastMessage = messages[0] || null;
                
                // جلب معلومات المشاركين
                const participantsDetails = await Promise.all(
                    conv.participants
                        .filter(participantId => participantId !== req.user._id)
                        .map(async (participantId) => {
                            const user = await localStorageService.findUserById(participantId);
                            return user ? localStorageService.formatUserResponse(user) : null;
                        })
                );

                return {
                    ...conv,
                    lastMessage,
                    participantsDetails: participantsDetails.filter(p => p !== null)
                };
            })
        );

        // ترتيب المحادثات حسب آخر رسالة
        conversationsWithDetails.sort((a, b) => {
            const dateA = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(a.updatedAt);
            const dateB = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(b.updatedAt);
            return dateB - dateA;
        });

        res.json({
            success: true,
            data: {
                conversations: conversationsWithDetails
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

app.post('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantId } = req.body;
        
        if (!participantId) {
            return res.status(400).json({
                success: false,
                message: 'معرف المشارك مطلوب',
                code: 'MISSING_PARTICIPANT'
            });
        }

        const participant = await localStorageService.findUserById(participantId);
        if (!participant) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }

        const conversation = await localStorageService.getOrCreateConversation(
            req.user._id,
            participantId
        );

        await auditLog('CREATE_CONVERSATION', req.user._id, 'CONVERSATION', conversation._id, {
            participantId
        });

        res.json({
            success: true,
            data: {
                conversation
            }
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

app.get('/api/chat/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50, before = null } = req.query;
        
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

        const messages = await localStorageService.getMessagesByConversation(
            conversationId, 
            parseInt(limit),
            before
        );

        await localStorageService.markMessagesAsRead(conversationId, req.user._id);

        res.json({
            success: true,
            data: {
                messages,
                conversation,
                pagination: {
                    hasMore: messages.length === parseInt(limit),
                    limit: parseInt(limit),
                    nextCursor: messages.length > 0 ? messages[messages.length - 1].createdAt : null
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

app.post('/api/chat/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, type = 'text', metadata = {} } = req.body;

        if (!content && type === 'text') {
            return res.status(400).json({
                success: false,
                message: 'محتوى الرسالة مطلوب',
                code: 'MESSAGE_CONTENT_REQUIRED'
            });
        }

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
                message: 'غير مصرح لك بإرسال رسائل في هذه المحادثة',
                code: 'ACCESS_DENIED'
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
            type,
            length: content?.length || 0
        });

        // إرسال الرسالة عبر WebSocket لجميع المشاركين
        conversation.participants.forEach(participantId => {
            if (connectedUsers.has(participantId)) {
                io.to(connectedUsers.get(participantId)).emit('new_message', {
                    message,
                    conversation
                });
            }
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة بنجاح',
            data: {
                message
            }
        });

    } catch (error) {
        console.error('❌ خطأ في إرسال الرسالة:', error);
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
        const channels = await localStorageService.getPublicChannels();
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

app.post('/api/channels', authenticateToken, upload.single('channelAvatar'), async (req, res) => {
    try {
        const { name, description, isPublic = true, tags = [] } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم القناة مطلوب',
                code: 'MISSING_NAME'
            });
        }

        const channelData = {
            name: name.trim(),
            description: description?.trim() || '',
            isPublic: isPublic === 'true' || isPublic === true,
            creatorId: req.user._id,
            tags: Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())
        };

        if (req.file) {
            channelData.avatar = `/uploads/channels/${req.file.filename}`;
        }

        const channel = await localStorageService.createChannel(channelData);

        await auditLog('CREATE_CHANNEL', req.user._id, 'CHANNEL', channel._id, { 
            name: channel.name,
            isPublic: channel.channelSettings.isPublic
        });

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
                message: 'لست عضواً في هذه القناة',
                code: 'NOT_MEMBER'
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

        if (!channel.channelSettings.isPublic) {
            return res.status(403).json({
                success: false,
                message: 'هذه القناة خاصة وتتطلب دعوة',
                code: 'CHANNEL_PRIVATE'
            });
        }

        const success = await localStorageService.addMemberToChannel(channelId, req.user._id);
        
        if (success) {
            await auditLog('JOIN_CHANNEL', req.user._id, 'CHANNEL', channelId, {
                channelName: channel.name
            });

            res.json({
                success: true,
                message: 'تم الانضمام إلى القناة بنجاح',
                data: {
                    channel
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
        console.error('❌ خطأ في الانضمام إلى القناة:', error);
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
        const groups = await localStorageService.getPublicGroups();
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

app.post('/api/groups', authenticateToken, upload.single('groupAvatar'), async (req, res) => {
    try {
        const { name, description, isPublic = true, tags = [] } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم المجموعة مطلوب',
                code: 'MISSING_NAME'
            });
        }

        const groupData = {
            name: name.trim(),
            description: description?.trim() || '',
            isPublic: isPublic === 'true' || isPublic === true,
            creatorId: req.user._id,
            tags: Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())
        };

        if (req.file) {
            groupData.avatar = `/uploads/groups/${req.file.filename}`;
        }

        const group = await localStorageService.createGroup(groupData);

        await auditLog('CREATE_GROUP', req.user._id, 'GROUP', group._id, { 
            name: group.name,
            isPublic: group.groupSettings.isPublic
        });

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
                message: 'لست عضواً في هذه المجموعة',
                code: 'NOT_MEMBER'
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

        if (!group.groupSettings.isPublic) {
            return res.status(403).json({
                success: false,
                message: 'هذه المجموعة خاصة وتتطلب دعوة',
                code: 'GROUP_PRIVATE'
            });
        }

        const success = await localStorageService.addMemberToGroup(groupId, req.user._id);
        
        if (success) {
            await auditLog('JOIN_GROUP', req.user._id, 'GROUP', groupId, {
                groupName: group.name
            });

            res.json({
                success: true,
                message: 'تم الانضمام إلى المجموعة بنجاح',
                data: {
                    group
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
        console.error('❌ خطأ في الانضمام إلى المجموعة:', error);
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
        
        // جلب معلومات المستخدمين للستوريات
        const storiesWithUserDetails = await Promise.all(
            stories.map(async (story) => {
                const user = await localStorageService.findUserById(story.userId);
                const hasViewed = story.views.includes(req.user._id);
                
                return {
                    ...story,
                    user: user ? localStorageService.formatUserResponse(user) : null,
                    hasViewed,
                    canView: true // يمكن للمستخدم رؤية الستوري
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

app.get('/api/stories/my', authenticateToken, async (req, res) => {
    try {
        const stories = await localStorageService.getUserStories(req.user._id);
        res.json({
            success: true,
            data: {
                stories
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب ستوريات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/stories', authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const { caption, type = 'image' } = req.body;
        
        if (!req.file && type !== 'text') {
            return res.status(400).json({
                success: false,
                message: 'الوسائط مطلوبة للستوري',
                code: 'MISSING_MEDIA'
            });
        }

        const storyData = {
            userId: req.user._id,
            caption: caption?.trim() || '',
            type
        };

        if (req.file) {
            storyData.mediaUrl = `/uploads/stories/${req.file.filename}`;
            storyData.mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }

        const story = await localStorageService.createStory(storyData);

        await auditLog('CREATE_STORY', req.user._id, 'STORY', story._id, { 
            type: story.mediaType || 'text',
            hasMedia: !!req.file
        });

        res.status(201).json({
            success: true,
            message: 'تم نشر القصة بنجاح',
            data: {
                story
            }
        });
    } catch (error) {
        console.error('❌ خطأ في نشر القصة:', error);
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
                message: 'تم مشاهدة الستوري مسبقاً',
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

app.post('/api/stories/:storyId/reaction', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const { reaction } = req.body;

        if (!reaction) {
            return res.status(400).json({
                success: false,
                message: 'التفاعل مطلوب',
                code: 'MISSING_REACTION'
            });
        }

        const updatedStory = await localStorageService.addStoryReaction(
            storyId, 
            req.user._id, 
            reaction
        );

        if (updatedStory) {
            res.json({
                success: true,
                message: 'تم إضافة التفاعل بنجاح',
                data: {
                    story: updatedStory
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'الستوري غير موجود',
                code: 'STORY_NOT_FOUND'
            });
        }
    } catch (error) {
        console.error('❌ خطأ في إضافة التفاعل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسار الحالة الصحية
app.get('/api/health', (req, res) => {
    const stats = localStorageService.getStats();
    const systemInfo = localStorageService.getSystemInfo();
    
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            connectedUsers: connectedUsers.size,
            stats: stats,
            system: systemInfo
        }
    });
});

// مسار تحميل الملفات
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

        await auditLog('UPLOAD_FILE', req.user._id, 'FILE', req.file.filename, {
            size: req.file.size,
            type: req.file.mimetype,
            originalName: req.file.originalname
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

// مسارات الإدارة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = localStorageService.getStats();
        const systemInfo = localStorageService.getSystemInfo();
        const onlineUsers = await localStorageService.getOnlineUsers();
        
        res.json({
            success: true,
            data: {
                stats,
                system: systemInfo,
                onlineUsers: onlineUsers.map(user => localStorageService.formatUserResponse(user)),
                connectedSockets: connectedUsers.size
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات النظام:', error);
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
            await auditLog('CREATE_BACKUP', req.user._id, 'SYSTEM', 'backup', {
                filename: result.filename
            });
            
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

app.post('/api/admin/cleanup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await localStorageService.cleanupOldData();
        
        if (result.success) {
            await auditLog('CLEANUP_DATA', req.user._id, 'SYSTEM', 'cleanup', {
                cleanedCount: result.cleanedCount
            });
            
            res.json({
                success: true,
                message: 'تم تنظيف البيانات القديمة بنجاح',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في تنظيف البيانات',
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ خطأ في تنظيف البيانات:', error);
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
            await auditLog('EXPORT_DATA', req.user._id, 'SYSTEM', 'export', {
                format,
                filename: result.filename
            });
            
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

// ==================== نظام WebSocket المحسن ====================

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

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

            socket.userId = user._id;
            connectedUsers.set(user._id, socket.id);
            userSockets.set(socket.id, user._id);

            await localStorageService.updateUser(user._id, {
                isOnline: true,
                lastSeen: new Date().toISOString()
            });

            socket.join(`user:${user._id}`);
            
            // الانضمام للقنوات والمجموعات الخاصة بالمستخدم
            const userChannels = await localStorageService.getUserChannels(user._id);
            userChannels.forEach(channel => {
                socket.join(`channel:${channel._id}`);
            });

            const userGroups = await localStorageService.getUserGroups(user._id);
            userGroups.forEach(group => {
                socket.join(`group:${group._id}`);
            });

            // إعلام الآخرين بتحديث حالة المستخدم
            io.emit('user_status_changed', {
                userId: user._id,
                isOnline: true,
                lastSeen: new Date().toISOString(),
                user: localStorageService.formatUserResponse(user)
            });

            socket.emit('authenticated', { 
                user: localStorageService.formatUserResponse(user),
                message: 'تم المصادقة بنجاح'
            });

            console.log(`✅ تم مصادقة المستخدم: ${user.fullName} (${socket.id})`);

        } catch (error) {
            console.error('❌ خطأ في مصادقة السوكت:', error);
            socket.emit('authentication_failed', { message: 'فشل المصادقة' });
        }
    });

    socket.on('join_conversation', (conversationId) => {
        if (socket.userId) {
            socket.join(`conversation:${conversationId}`);
            console.log(`💬 المستخدم ${socket.userId} انضم للمحادثة ${conversationId}`);
        }
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation:${conversationId}`);
        console.log(`💬 المستخدم ${socket.userId} غادر المحادثة ${conversationId}`);
    });

    socket.on('join_channel', (channelId) => {
        if (socket.userId) {
            socket.join(`channel:${channelId}`);
            console.log(`📺 المستخدم ${socket.userId} انضم للقناة ${channelId}`);
        }
    });

    socket.on('leave_channel', (channelId) => {
        socket.leave(`channel:${channelId}`);
        console.log(`📺 المستخدم ${socket.userId} غادر القناة ${channelId}`);
    });

    socket.on('join_group', (groupId) => {
        if (socket.userId) {
            socket.join(`group:${groupId}`);
            console.log(`👥 المستخدم ${socket.userId} انضم للمجموعة ${groupId}`);
        }
    });

    socket.on('leave_group', (groupId) => {
        socket.leave(`group:${groupId}`);
        console.log(`👥 المستخدم ${socket.userId} غادر المجموعة ${groupId}`);
    });

    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { conversationId, content, type = 'text', metadata = {} } = data;
            
            if (!conversationId || (!content && type === 'text')) {
                socket.emit('error', { message: 'معرف المحادثة والمحتوى مطلوبان' });
                return;
            }

            const conversation = await localStorageService.getConversationById(conversationId);
            if (!conversation) {
                socket.emit('error', { message: 'المحادثة غير موجودة' });
                return;
            }

            if (!conversation.participants.includes(socket.userId)) {
                socket.emit('error', { message: 'غير مصرح لك بإرسال رسائل في هذه المحادثة' });
                return;
            }

            const message = await localStorageService.createMessage({
                conversationId,
                senderId: socket.userId,
                content,
                type,
                metadata
            });

            const sender = await localStorageService.findUserById(socket.userId);

            // إرسال الرسالة لجميع المشاركين في المحادثة
            conversation.participants.forEach(participantId => {
                io.to(`user:${participantId}`).emit('new_message', {
                    conversationId,
                    message: {
                        ...message,
                        sender: localStorageService.formatUserResponse(sender)
                    }
                });
            });

            console.log(`💬 رسالة جديدة في المحادثة ${conversationId} من ${sender.fullName}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'فشل إرسال الرسالة' });
        }
    });

    socket.on('send_channel_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { channelId, content, type = 'text', metadata = {} } = data;
            
            if (!channelId || (!content && type === 'text')) {
                socket.emit('error', { message: 'معرف القناة والمحتوى مطلوبان' });
                return;
            }

            const channel = await localStorageService.getChannelById(channelId);
            if (!channel) {
                socket.emit('error', { message: 'القناة غير موجودة' });
                return;
            }

            if (!channel.members.includes(socket.userId) && !channel.admins.includes(socket.userId)) {
                socket.emit('error', { message: 'لست عضواً في هذه القناة' });
                return;
            }

            const message = await localStorageService.createChannelMessage({
                channelId,
                senderId: socket.userId,
                content,
                type,
                metadata
            });

            const sender = await localStorageService.findUserById(socket.userId);

            io.to(`channel:${channelId}`).emit('new_channel_message', {
                channelId,
                message: {
                    ...message,
                    sender: localStorageService.formatUserResponse(sender)
                }
            });

            console.log(`📢 رسالة جديدة في القناة ${channelId} من ${sender.fullName}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال رسالة القناة:', error);
            socket.emit('error', { message: 'فشل إرسال رسالة القناة' });
        }
    });

    socket.on('send_group_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { groupId, content, type = 'text', metadata = {} } = data;
            
            if (!groupId || (!content && type === 'text')) {
                socket.emit('error', { message: 'معرف المجموعة والمحتوى مطلوبان' });
                return;
            }

            const group = await localStorageService.getGroupById(groupId);
            if (!group) {
                socket.emit('error', { message: 'المجموعة غير موجودة' });
                return;
            }

            if (!group.members.includes(socket.userId)) {
                socket.emit('error', { message: 'لست عضواً في هذه المجموعة' });
                return;
            }

            const message = await localStorageService.createGroupMessage({
                groupId,
                senderId: socket.userId,
                content,
                type,
                metadata
            });

            const sender = await localStorageService.findUserById(socket.userId);

            io.to(`group:${groupId}`).emit('new_group_message', {
                groupId,
                message: {
                    ...message,
                    sender: localStorageService.formatUserResponse(sender)
                }
            });

            console.log(`👥 رسالة جديدة في المجموعة ${groupId} من ${sender.fullName}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال رسالة المجموعة:', error);
            socket.emit('error', { message: 'فشل إرسال رسالة المجموعة' });
        }
    });

    socket.on('typing_start', (data) => {
        const { conversationId } = data;
        if (conversationId && socket.userId) {
            socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: true
            });
        }
    });

    socket.on('typing_stop', (data) => {
        const { conversationId } = data;
        if (conversationId && socket.userId) {
            socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: false
            });
        }
    });

    socket.on('mark_messages_read', async (data) => {
        try {
            const { conversationId } = data;
            if (conversationId && socket.userId) {
                await localStorageService.markMessagesAsRead(conversationId, socket.userId);
                socket.emit('messages_marked_read', { conversationId });
            }
        } catch (error) {
            console.error('❌ خطأ في تحديد الرسائل كمقروءة:', error);
        }
    });

    socket.on('message_reaction', async (data) => {
        try {
            const { messageId, reaction } = data;
            if (messageId && reaction && socket.userId) {
                const updatedMessage = await localStorageService.addReactionToMessage(
                    messageId, 
                    socket.userId, 
                    reaction
                );
                
                if (updatedMessage) {
                    // إرسال تحديث التفاعل لجميع المشاركين
                    const conversation = await localStorageService.getConversationById(updatedMessage.conversationId);
                    if (conversation) {
                        conversation.participants.forEach(participantId => {
                            io.to(`user:${participantId}`).emit('message_reaction_updated', {
                                messageId,
                                reactions: updatedMessage.reactions
                            });
                        });
                    }
                }
            }
        } catch (error) {
            console.error('❌ خطأ في إضافة تفاعل الرسالة:', error);
        }
    });

    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منفصل:', socket.id);
        
        const userId = userSockets.get(socket.id);
        if (userId) {
            await localStorageService.updateUser(userId, {
                isOnline: false,
                lastSeen: new Date().toISOString()
            });

            // إعلام الآخرين بتحديث حالة المستخدم
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

// وظائف الخلفية المجدولة
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
        if (NODE_ENV === 'production') {
            await localStorageService.createBackup();
            console.log('💾 تم إنشاء نسخة احتياطية تلقائية');
        }
    } catch (error) {
        console.error('❌ خطأ في النسخ الاحتياطي التلقائي:', error);
    }
}, 24 * 60 * 60 * 1000); // كل 24 ساعة

// معالجة الأخطاء غير المعالجة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير معالج:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ وعد مرفوض غير معالج:', reason);
});

// بدء الخادم
async function startServer() {
    try {
        // إنشاء حساب المدير الافتراضي
        await createDefaultAdmin();
        
        // إنشاء بيانات تجريبية في وضع التطوير
        if (NODE_ENV === 'development') {
            await createSampleData();
        }
        
        // تنظيف البيانات القديمة عند البدء
        await localStorageService.cleanupOldData();
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(70));
            console.log('🚀 خادم المنصة التعليمية المتكامل يعمل بنجاح!');
            console.log('='.repeat(70));
            console.log(`📍 العنوان: http://localhost:${PORT}`);
            console.log(`🌍 البيئة: ${NODE_ENV}`);
            console.log(`⏰ الوقت: ${new Date().toLocaleString('ar-SA')}`);
            console.log(`👥 المستخدمون المتصلون: ${connectedUsers.size}`);
            console.log(`💾 قاعدة البيانات: ${localStorageService.dataFile}`);
            console.log('='.repeat(70));
            console.log('\n📋 نقاط النهاية المتاحة:');
            console.log(`   🔐 المصادقة: POST http://localhost:${PORT}/api/auth/login`);
            console.log(`   👤 المستخدمون: GET http://localhost:${PORT}/api/users/me`);
            console.log(`   💬 المحادثات: GET http://localhost:${PORT}/api/chat/conversations`);
            console.log(`   📺 القنوات: GET http://localhost:${PORT}/api/channels`);
            console.log(`   👥 المجموعات: GET http://localhost:${PORT}/api/groups`);
            console.log(`   📸 الستوريات: GET http://localhost:${PORT}/api/stories`);
            console.log(`   🛠️ الإدارة: GET http://localhost:${PORT}/api/admin/stats`);
            console.log(`   ❤️ الصحة: GET http://localhost:${PORT}/api/health`);
            console.log(`   📁 التحميل: POST http://localhost:${PORT}/api/upload`);
            console.log('='.repeat(70));
            console.log('\n🔐 حساب المدير الافتراضي:');
            console.log('   📧 البريد الإلكتروني: admin@platform.edu');
            console.log('   🔑 كلمة المرور: 77007700');
            console.log('='.repeat(70));
        });
    } catch (error) {
        console.error('❌ فشل في بدء الخادم:', error);
        process.exit(1);
    }
}

startServer();

export { app, io, localStorageService };
