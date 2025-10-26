// server.js - الخادم الكامل للمنصة التعليمية (محدث ومحسن)
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

// مسارات الملفات
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BACKUP_DIR = path.join(__dirname, 'backups');
const LOGS_DIR = path.join(__dirname, 'logs');

// إنشاء المجلدات اللازمة
const requiredDirs = [
    UPLOAD_DIR,
    path.join(UPLOAD_DIR, 'profiles'),
    path.join(UPLOAD_DIR, 'stories'),
    path.join(UPLOAD_DIR, 'channels'),
    path.join(UPLOAD_DIR, 'groups'),
    path.join(UPLOAD_DIR, 'files'),
    BACKUP_DIR,
    LOGS_DIR,
    path.join(__dirname, 'public')
];

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 تم إنشاء المجلد: ${dir}`);
    }
});

// إعداد trust proxy
app.set('trust proxy', 1);

// ============ وسائط الأمان والتحسين ============
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
}));

app.use(compression({
    level: 6,
    threshold: 0
}));

app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: fs.createWriteStream(path.join(LOGS_DIR, 'access.log'), { flags: 'a' })
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: NODE_ENV === 'production' ? 100 : 1000,
    message: {
        success: false,
        message: 'تم تجاوز عدد الطلبات المسموح بها، يرجى المحاولة لاحقاً'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// CORS مفصل
app.use(cors({
    origin: function (origin, callback) {
        // السماح لجميع المصادر في وضع التطوير
        if (NODE_ENV === 'development') {
            return callback(null, true);
        }
        
        // في الإنتاج، السماح لمصادر محددة
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://yourdomain.com'
        ];
        
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// وسائط middleware الأساسية
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '50mb' 
}));

// خدمة الملفات الثابتة
app.use('/uploads', express.static(UPLOAD_DIR, {
    maxAge: '1d',
    etag: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
}));

// ============ إعداد multer للتحميلات ============
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
        'file': [
            'image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip', 'application/vnd.rar', 'text/csv'
        ],
        'backup': ['application/json']
    };
    
    const fieldTypes = allowedTypes[file.fieldname];
    
    if (fieldTypes && fieldTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`نوع الملف غير مدعوم للمجال: ${file.fieldname}. النوع: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    },
    fileFilter: fileFilter
});

// معالجة أخطاء multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'حجم الملف كبير جداً. الحد الأقصى 100MB'
            });
        }
    }
    next(error);
});

// ============ نظام التخزين المحلي المحسن ============
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
        }
        
        // تنظيف الكاش التلقائي
        setInterval(() => {
            this.cleanExpiredCache();
        }, 60000); // كل دقيقة
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
            const defaultData = this.getDefaultData();
            this.saveData(defaultData);
            return defaultData;
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            
            // تحديث الكاش
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

    cleanExpiredCache() {
        const now = Date.now();
        for (let [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheTTL) {
                this.cache.delete(key);
            }
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
            systemSettings: {
                maintenance: false,
                registrationEnabled: true,
                maxFileSize: 100,
                allowedFileTypes: ['jpg', 'png', 'pdf', 'doc', 'docx', 'mp4'],
                sessionTimeout: 30
            },
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
            isVerified: false,
            emailVerified: false,
            profile: {
                bio: '',
                location: '',
                website: '',
                socialLinks: {}
            },
            preferences: {
                theme: 'auto',
                language: 'ar',
                notifications: {
                    email: true,
                    push: true,
                    sounds: true
                },
                privacy: {
                    profileVisibility: 'public',
                    showOnlineStatus: true,
                    showLastSeen: true
                }
            },
            stats: {
                messagesSent: 0,
                storiesPosted: 0,
                channelsJoined: 0,
                groupsJoined: 0,
                totalLikes: 0,
                loginCount: 0,
                lastLogin: null
            },
            security: {
                loginAttempts: 0,
                lastLoginAttempt: null,
                passwordChangedAt: new Date().toISOString()
            }
        };
        
        data.users.push(user);
        this.updateStats(data);
        this.saveData(data);
        
        // مسح الكاش
        this.cache.delete('users_list');
        
        return user;
    }

    async findUserByEmail(email) {
        const cacheKey = `user_email_${email}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const user = data.users.find(user => 
            user.email.toLowerCase() === email.toLowerCase() && user.isActive
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
        const user = data.users.find(user => user._id === userId && user.isActive);
        
        if (user) {
            this.cache.set(cacheKey, user);
        }
        
        return user;
    }

    async updateUser(userId, updates) {
        const data = this.loadData();
        const userIndex = data.users.findIndex(user => user._id === userId);
        
        if (userIndex !== -1) {
            // منع تحديث بعض الحقول
            const { _id, createdAt, email, ...safeUpdates } = updates;
            
            data.users[userIndex] = {
                ...data.users[userIndex],
                ...safeUpdates,
                updatedAt: new Date().toISOString()
            };
            
            this.saveData(data);
            
            // مسح الكاش
            this.cache.delete(`user_id_${userId}`);
            this.cache.delete(`user_email_${data.users[userIndex].email}`);
            this.cache.delete('users_list');
            
            return data.users[userIndex];
        }
        return null;
    }

    async getAllUsers(options = {}) {
        const cacheKey = `users_list_${JSON.stringify(options)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        let users = data.users.filter(user => user.isActive);

        // التصفية
        if (options.role) {
            users = users.filter(user => user.role === options.role);
        }

        if (options.search) {
            const searchTerm = options.search.toLowerCase();
            users = users.filter(user => 
                user.fullName.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm)
            );
        }

        // الترتيب
        if (options.sortBy) {
            users.sort((a, b) => {
                if (options.sortOrder === 'desc') {
                    return b[options.sortBy]?.localeCompare(a[options.sortBy]) || 0;
                }
                return a[options.sortBy]?.localeCompare(b[options.sortBy]) || 0;
            });
        }

        // التقسيم
        if (options.limit) {
            users = users.slice(0, options.limit);
        }

        this.cache.set(cacheKey, users);
        return users;
    }

    async searchUsers(query, limit = 20, filters = {}) {
        const cacheKey = `search_users_${query}_${limit}_${JSON.stringify(filters)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        const searchTerm = query.toLowerCase();
        
        let results = data.users.filter(user => 
            user.isActive && 
            (user.fullName.toLowerCase().includes(searchTerm) || 
             user.email.toLowerCase().includes(searchTerm) ||
             user.profile?.bio?.toLowerCase().includes(searchTerm))
        );

        // تطبيق الفلاتر
        if (filters.role) {
            results = results.filter(user => user.role === filters.role);
        }

        if (filters.online) {
            results = results.filter(user => user.isOnline);
        }

        results = results.slice(0, limit)
            .map(user => this.formatUserResponse(user));

        this.cache.set(cacheKey, results);
        return results;
    }

    async incrementUserStats(userId, field, value = 1) {
        const data = this.loadData();
        const userIndex = data.users.findIndex(user => user._id === userId);
        
        if (userIndex !== -1) {
            if (!data.users[userIndex].stats) {
                data.users[userIndex].stats = {};
            }
            
            data.users[userIndex].stats[field] = (data.users[userIndex].stats[field] || 0) + value;
            data.users[userIndex].updatedAt = new Date().toISOString();
            
            this.saveData(data);
            
            // مسح الكاش
            this.cache.delete(`user_id_${userId}`);
            this.cache.delete('users_list');
            
            return true;
        }
        return false;
    }

    // ============ دوال المحادثات ============
    async createConversation(participants, name = null, isGroup = false, metadata = {}) {
        const data = this.loadData();
        const conversationId = uuidv4();
        
        // التحقق من المشاركين
        const validParticipants = [];
        for (const participantId of participants) {
            const user = await this.findUserById(participantId);
            if (user) {
                validParticipants.push(participantId);
            }
        }

        if (validParticipants.length < 2) {
            throw new Error('يجب أن تحتوي المحادثة على مشاركين على الأقل');
        }

        // إنشاء اسم للمحادثة إذا لم يتم توفيره
        let conversationName = name;
        if (!conversationName && !isGroup) {
            if (validParticipants.length === 2) {
                const otherUserId = validParticipants.find(id => id !== validParticipants[0]);
                const otherUser = await this.findUserById(otherUserId);
                conversationName = otherUser?.fullName || `مستخدم ${otherUserId}`;
            } else {
                conversationName = `محادثة ${validParticipants.length} أشخاص`;
            }
        }

        const conversation = {
            _id: conversationId,
            participants: validParticipants,
            name: conversationName,
            isGroup: isGroup,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: null,
            unreadCount: {},
            settings: {
                mute: false,
                archive: false,
                pin: false
            },
            metadata: {
                createdBy: validParticipants[0],
                ...metadata
            }
        };
        
        // تهيئة unreadCount لجميع المشاركين
        validParticipants.forEach(participantId => {
            conversation.unreadCount[participantId] = 0;
        });
        
        data.conversations.push(conversation);
        this.updateStats(data);
        this.saveData(data);

        // مسح الكاش
        validParticipants.forEach(participantId => {
            this.cache.delete(`conversations_user_${participantId}`);
        });
        
        return conversation;
    }

    async getConversationsByUserId(userId, options = {}) {
        const cacheKey = `conversations_user_${userId}_${JSON.stringify(options)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        let conversations = data.conversations.filter(conv => 
            conv.participants.includes(userId)
        );

        // التصفية
        if (options.archived !== undefined) {
            conversations = conversations.filter(conv => 
                conv.settings?.archive === options.archived
            );
        }

        if (options.isGroup !== undefined) {
            conversations = conversations.filter(conv => conv.isGroup === options.isGroup);
        }

        // الترتيب
        conversations.sort((a, b) => 
            new Date(b.updatedAt) - new Date(a.updatedAt)
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

    async updateConversationSettings(conversationId, userId, settings) {
        const data = this.loadData();
        const convIndex = data.conversations.findIndex(conv => conv._id === conversationId);
        
        if (convIndex !== -1 && data.conversations[convIndex].participants.includes(userId)) {
            data.conversations[convIndex].settings = {
                ...data.conversations[convIndex].settings,
                ...settings
            };
            data.conversations[convIndex].updatedAt = new Date().toISOString();
            
            this.saveData(data);
            
            // مسح الكاش
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
            updatedAt: new Date().toISOString(),
            readBy: [messageData.senderId],
            reactions: [],
            edited: {
                isEdited: false,
                editedAt: null,
                originalContent: null
            },
            deleted: {
                isDeleted: false,
                deletedAt: null,
                deletedBy: null
            },
            metadata: {
                clientId: messageData.clientId,
                device: messageData.device,
                ...messageData.metadata
            }
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
        
        // تحديث إحصائيات المستخدم
        await this.incrementUserStats(messageData.senderId, 'messagesSent');
        
        return message;
    }

    async getMessagesByConversation(conversationId, options = {}) {
        const { limit = 50, before = null, after = null } = options;
        const cacheKey = `messages_conv_${conversationId}_${limit}_${before}_${after}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        let messages = data.messages
            .filter(msg => 
                msg.conversationId === conversationId && 
                !msg.deleted.isDeleted
            )
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // التصفية حسب التاريخ
        if (before) {
            messages = messages.filter(msg => new Date(msg.createdAt) < new Date(before));
        }

        if (after) {
            messages = messages.filter(msg => new Date(msg.createdAt) > new Date(after));
        }

        // الحد
        messages = messages.slice(0, limit);

        // الترتيب من الأقدم إلى الأحدث للعرض
        messages.reverse();

        this.cache.set(cacheKey, messages);
        return messages;
    }

    async markMessagesAsRead(conversationId, userId) {
        const data = this.loadData();
        const convIndex = data.conversations.findIndex(conv => conv._id === conversationId);
        
        if (convIndex !== -1) {
            data.conversations[convIndex].unreadCount[userId] = 0;
            data.conversations[convIndex].updatedAt = new Date().toISOString();
            
            this.saveData(data);
            
            // مسح الكاش
            this.cache.delete(`conversations_user_${userId}`);
            
            return true;
        }
        return false;
    }

    async editMessage(messageId, userId, newContent) {
        const data = this.loadData();
        const messageIndex = data.messages.findIndex(msg => msg._id === messageId);
        
        if (messageIndex !== -1 && data.messages[messageIndex].senderId === userId) {
            const originalContent = data.messages[messageIndex].content;
            
            data.messages[messageIndex].content = newContent;
            data.messages[messageIndex].edited = {
                isEdited: true,
                editedAt: new Date().toISOString(),
                originalContent: originalContent
            };
            data.messages[messageIndex].updatedAt = new Date().toISOString();
            
            this.saveData(data);
            
            // مسح الكاش
            this.cache.delete(`messages_conv_${data.messages[messageIndex].conversationId}_*`);
            
            return data.messages[messageIndex];
        }
        return null;
    }

    async deleteMessage(messageId, userId) {
        const data = this.loadData();
        const messageIndex = data.messages.findIndex(msg => msg._id === messageId);
        
        if (messageIndex !== -1) {
            const message = data.messages[messageIndex];
            
            // فقط المرسل أو مدير المحادثة يمكنه حذف الرسالة
            if (message.senderId === userId) {
                data.messages[messageIndex].deleted = {
                    isDeleted: true,
                    deletedAt: new Date().toISOString(),
                    deletedBy: userId
                };
                data.messages[messageIndex].updatedAt = new Date().toISOString();
                
                this.saveData(data);
                
                // مسح الكاش
                this.cache.delete(`messages_conv_${message.conversationId}_*`);
                
                return true;
            }
        }
        return false;
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
            moderators: channelData.moderators || [],
            channelSettings: {
                isPublic: channelData.isPublic !== false,
                allowComments: channelData.allowComments !== false,
                adminOnlyPosts: channelData.adminOnlyPosts || false,
                allowFileSharing: channelData.allowFileSharing !== false,
                maxFileSize: channelData.maxFileSize || 50,
                ...channelData.channelSettings
            },
            stats: {
                memberCount: channelData.members?.length || 1,
                messageCount: 0,
                dailyActiveUsers: 0,
                totalViews: 0
            },
            metadata: {
                category: channelData.category || 'general',
                tags: channelData.tags || [],
                ...channelData.metadata
            }
        };
        
        data.channels.push(channel);
        this.updateStats(data);
        this.saveData(data);

        // مسح الكاش
        this.cache.delete('channels_list');
        this.cache.delete(`channels_user_${channelData.creatorId}`);
        
        return channel;
    }

    async getAllChannels(options = {}) {
        const cacheKey = `channels_list_${JSON.stringify(options)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        let channels = data.channels.filter(channel => channel.isActive);

        // التصفية
        if (options.publicOnly) {
            channels = channels.filter(channel => channel.channelSettings.isPublic);
        }

        if (options.category) {
            channels = channels.filter(channel => channel.metadata?.category === options.category);
        }

        if (options.search) {
            const searchTerm = options.search.toLowerCase();
            channels = channels.filter(channel => 
                channel.name.toLowerCase().includes(searchTerm) ||
                channel.description?.toLowerCase().includes(searchTerm)
            );
        }

        // الترتيب
        if (options.sortBy === 'members') {
            channels.sort((a, b) => b.stats.memberCount - a.stats.memberCount);
        } else {
            channels.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        // التقسيم
        if (options.limit) {
            channels = channels.slice(0, options.limit);
        }

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
            (channel.members.includes(userId) || 
             channel.admins.includes(userId) ||
             channel.moderators.includes(userId))
        );
        
        this.cache.set(cacheKey, channels);
        return channels;
    }

    async addMemberToChannel(channelId, userId) {
        const data = this.loadData();
        const channelIndex = data.channels.findIndex(channel => channel._id === channelId);
        
        if (channelIndex !== -1 && !data.channels[channelIndex].members.includes(userId)) {
            data.channels[channelIndex].members.push(userId);
            data.channels[channelIndex].stats.memberCount += 1;
            data.channels[channelIndex].updatedAt = new Date().toISOString();
            
            this.saveData(data);
            
            // مسح الكاش
            this.cache.delete(`channels_user_${userId}`);
            this.cache.delete('channels_list');
            
            return true;
        }
        return false;
    }

    async removeMemberFromChannel(channelId, userId) {
        const data = this.loadData();
        const channelIndex = data.channels.findIndex(channel => channel._id === channelId);
        
        if (channelIndex !== -1) {
            const memberIndex = data.channels[channelIndex].members.indexOf(userId);
            if (memberIndex !== -1) {
                data.channels[channelIndex].members.splice(memberIndex, 1);
                data.channels[channelIndex].stats.memberCount -= 1;
                data.channels[channelIndex].updatedAt = new Date().toISOString();
                
                this.saveData(data);
                
                // مسح الكاش
                this.cache.delete(`channels_user_${userId}`);
                this.cache.delete('channels_list');
                
                return true;
            }
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
            moderators: groupData.moderators || [],
            groupSettings: {
                isPublic: groupData.isPublic !== false,
                allowInvites: groupData.allowInvites !== false,
                adminOnlyPosts: groupData.adminOnlyPosts || false,
                allowFileSharing: groupData.allowFileSharing !== false,
                maxMembers: groupData.maxMembers || 100,
                ...groupData.groupSettings
            },
            stats: {
                memberCount: groupData.members?.length || 1,
                messageCount: 0,
                dailyActiveUsers: 0
            },
            metadata: {
                category: groupData.category || 'general',
                tags: groupData.tags || [],
                ...groupData.metadata
            }
        };
        
        data.groups.push(group);
        this.updateStats(data);
        this.saveData(data);
        
        // إنشاء محادثة جماعية للمجموعة
        await this.createConversation(
            group.members, 
            group.name, 
            true,
            { groupId: groupId }
        );

        // مسح الكاش
        this.cache.delete('groups_list');
        this.cache.delete(`groups_user_${groupData.creatorId}`);
        
        return group;
    }

    async getAllGroups(options = {}) {
        const cacheKey = `groups_list_${JSON.stringify(options)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const data = this.loadData();
        let groups = data.groups.filter(group => group.isActive);

        // التصفية
        if (options.publicOnly) {
            groups = groups.filter(group => group.groupSettings.isPublic);
        }

        if (options.category) {
            groups = groups.filter(group => group.metadata?.category === options.category);
        }

        if (options.search) {
            const searchTerm = options.search.toLowerCase();
            groups = groups.filter(group => 
                group.name.toLowerCase().includes(searchTerm) ||
                group.description?.toLowerCase().includes(searchTerm)
            );
        }

        // الترتيب
        if (options.sortBy === 'members') {
            groups.sort((a, b) => b.stats.memberCount - a.stats.memberCount);
        } else {
            groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        // التقسيم
        if (options.limit) {
            groups = groups.slice(0, options.limit);
        }

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
                conv.isGroup && conv.metadata?.groupId === groupId
            );
            if (conversation && !conversation.participants.includes(userId)) {
                conversation.participants.push(userId);
                conversation.unreadCount[userId] = 0;
            }
            
            // مسح الكاش
            this.cache.delete(`groups_user_${userId}`);
            this.cache.delete('groups_list');
            
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
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 ساعة
            views: [],
            reactions: [],
            replies: [],
            isActive: true,
            metrics: {
                viewCount: 0,
                replyCount: 0,
                reactionCount: 0,
                shareCount: 0,
                engagementRate: 0
            },
            settings: {
                allowReplies: storyData.allowReplies !== false,
                allowSharing: storyData.allowSharing !== false,
                showViewCount: storyData.showViewCount !== false
            },
            metadata: {
                duration: storyData.duration,
                aspectRatio: storyData.aspectRatio,
                ...storyData.metadata
            }
        };
        
        data.stories.push(story);
        this.updateStats(data);
        this.saveData(data);

        // تحديث إحصائيات المستخدم
        await this.incrementUserStats(storyData.userId, 'storiesPosted');
        
        return story;
    }

    async getActiveStories(options = {}) {
        const data = this.loadData();
        const now = new Date().toISOString();
        
        let stories = data.stories.filter(story => 
            story.expiresAt > now && story.isActive
        );

        // التصفية
        if (options.userId) {
            stories = stories.filter(story => story.userId === options.userId);
        }

        if (options.excludeViewedBy) {
            stories = stories.filter(story => !story.views.includes(options.excludeViewedBy));
        }

        // الترتيب
        stories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return stories;
    }

    async addStoryView(storyId, userId) {
        const data = this.loadData();
        const storyIndex = data.stories.findIndex(story => story._id === storyId);
        
        if (storyIndex !== -1 && !data.stories[storyIndex].views.includes(userId)) {
            data.stories[storyIndex].views.push(userId);
            data.stories[storyIndex].metrics.viewCount += 1;
            
            // حساب معدل المشاركة
            const totalViews = data.stories[storyIndex].metrics.viewCount;
            const totalReactions = data.stories[storyIndex].metrics.reactionCount;
            const totalReplies = data.stories[storyIndex].metrics.replyCount;
            
            data.stories[storyIndex].metrics.engagementRate = 
                ((totalReactions + totalReplies) / totalViews) * 100;
            
            this.saveData(data);
            return true;
        }
        return false;
    }

    async addStoryReaction(storyId, userId, reaction) {
        const data = this.loadData();
        const storyIndex = data.stories.findIndex(story => story._id === storyId);
        
        if (storyIndex !== -1) {
            const existingReactionIndex = data.stories[storyIndex].reactions
                .findIndex(r => r.userId === userId);
            
            if (existingReactionIndex !== -1) {
                // تحديث التفاعل الحالي
                data.stories[storyIndex].reactions[existingReactionIndex].reaction = reaction;
                data.stories[storyIndex].reactions[existingReactionIndex].createdAt = new Date().toISOString();
            } else {
                // إضافة تفاعل جديد
                data.stories[storyIndex].reactions.push({
                    userId,
                    reaction,
                    createdAt: new Date().toISOString()
                });
                data.stories[storyIndex].metrics.reactionCount += 1;
            }
            
            this.saveData(data);
            return true;
        }
        return false;
    }

    // ============ دوال النظام ============
    updateStats(data) {
        const now = new Date();
        const activeUsers = data.users.filter(user => 
            user.isOnline || 
            (user.lastSeen && new Date(user.lastSeen) > new Date(now.getTime() - 15 * 60 * 1000))
        ).length;

        // حساب إجمالي التخزين
        let totalStorage = 0;
        // يمكن إضافة منطق لحساب حجم الملفات لاحقاً

        data.stats = {
            totalUsers: data.users.length,
            totalMessages: data.messages.length,
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

    getStats() {
        const data = this.loadData();
        return this.updateStats(data);
    }

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
            
            console.log(`💾 تم إنشاء النسخة الاحتياطية: ${backupFile}`);
            
            return { 
                success: true, 
                filename: `backup-${timestamp}.json`,
                size: backupData.stats
            };
        } catch (error) {
            console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
            return { success: false, error: error.message };
        }
    }

    async cleanupOldData() {
        try {
            const data = this.loadData();
            const now = new Date();
            let cleanedCount = 0;
            
            // تنظيف الستوريات المنتهية
            const expiredStories = data.stories.filter(story => 
                new Date(story.expiresAt) <= now
            );
            data.stories = data.stories.filter(story => 
                new Date(story.expiresAt) > now
            );
            cleanedCount += expiredStories.length;
            
            // تنظيف المستخدمين غير النشطين (أكثر من 30 يوم)
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const inactiveUsers = data.users.filter(user => 
                user.isActive && 
                new Date(user.lastSeen) < thirtyDaysAgo &&
                user.role !== 'admin'
            );
            
            inactiveUsers.forEach(user => {
                user.isActive = false;
                user.deactivatedAt = new Date().toISOString();
            });
            cleanedCount += inactiveUsers.length;
            
            // تنظيف الملفات المؤقتة القديمة
            const tempDir = path.join(UPLOAD_DIR, 'temp');
            if (fs.existsSync(tempDir)) {
                const files = fs.readdirSync(tempDir);
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                
                files.forEach(file => {
                    const filePath = path.join(tempDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < weekAgo) {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                    }
                });
            }
            
            this.saveData(data);
            this.clearCache();
            
            console.log(`🧹 تم تنظيف ${cleanedCount} عنصر من البيانات القديمة`);
            return { success: true, cleanedCount };
        } catch (error) {
            console.error('❌ خطأ في تنظيف البيانات:', error);
            return { success: false, error: error.message };
        }
    }

    formatUserResponse(user) {
        if (!user) return null;
        
        const { password, security, ...userWithoutSensitiveData } = user;
        return userWithoutSensitiveData;
    }

    // ============ دوال التدقيق ============
    async auditLog(action, userId, targetType, targetId, details = {}) {
        try {
            const data = this.loadData();
            if (!data.auditLogs) data.auditLogs = [];
            
            const logEntry = {
                _id: uuidv4(),
                action,
                userId,
                targetType,
                targetId,
                details,
                ip: details.ip || 'unknown',
                userAgent: details.userAgent || 'unknown',
                timestamp: new Date().toISOString()
            };
            
            data.auditLogs.push(logEntry);
            
            // الاحتفاظ بآخر 1000 سجل تدقيق فقط
            if (data.auditLogs.length > 1000) {
                data.auditLogs = data.auditLogs.slice(-1000);
            }
            
            this.saveData(data);
            
            console.log(`📋 Audit: ${action} by ${userId} on ${targetType} ${targetId}`);
            
        } catch (error) {
            console.error('❌ خطأ في تسجيل التدقيق:', error);
        }
    }

    async getAuditLogs(options = {}) {
        const data = this.loadData();
        let logs = data.auditLogs || [];

        // التصفية
        if (options.userId) {
            logs = logs.filter(log => log.userId === options.userId);
        }

        if (options.action) {
            logs = logs.filter(log => log.action === options.action);
        }

        if (options.targetType) {
            logs = logs.filter(log => log.targetType === options.targetType);
        }

        if (options.startDate) {
            logs = logs.filter(log => new Date(log.timestamp) >= new Date(options.startDate));
        }

        if (options.endDate) {
            logs = logs.filter(log => new Date(log.timestamp) <= new Date(options.endDate));
        }

        // الترتيب
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // التقسيم
        if (options.limit) {
            logs = logs.slice(0, options.limit);
        }

        return logs;
    }
}

// إنشاء نسخة من خدمة التخزين
const localStorageService = new EnhancedLocalStorageService();

// ============ middleware المصادقة ============
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

        // التحقق من إعدادات النظام
        const data = localStorageService.loadData();
        if (data.systemSettings.maintenance && user.role !== 'admin') {
            return res.status(503).json({
                success: false,
                message: 'النظام تحت الصيانة',
                code: 'MAINTENANCE_MODE'
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

const requireTeacherOrAdmin = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
        return res.status(403).json({ 
            success: false, 
            message: 'صلاحيات معلم أو مدير مطلوبة',
            code: 'TEACHER_OR_ADMIN_REQUIRED'
        });
    }
    next();
};

// ============ دوال مساعدة ============
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

const generateRefreshToken = (userId) => {
    return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '90d' });
};

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
};

const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
};

// ============ إنشاء البيانات الأولية ============
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

async function createSampleData() {
    try {
        if (NODE_ENV !== 'development') return;

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
            // إنشاء قنوات
            const channels = [
                {
                    name: 'قناة الرياضيات',
                    description: 'قناة مخصصة لدروس الرياضيات والتمارين',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true,
                    category: 'education'
                },
                {
                    name: 'قناة العلوم',
                    description: 'مناقشات وأخبار علمية',
                    creatorId: teacherUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true,
                    category: 'education'
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
                    description: 'مجموعة للمناقشات المتقدمة في الرياضيات',
                    creatorId: teacherUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: false,
                    category: 'education'
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

// ============ مسارات API ============

// مسار رئيسي
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية المحسن يعمل بنجاح!',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        endpoints: {
            auth: '/api/auth/*',
            users: '/api/users/*',
            chat: '/api/chat/*',
            channels: '/api/channels/*',
            groups: '/api/groups/*',
            stories: '/api/stories/*',
            admin: '/api/admin/*',
            system: '/api/system/*'
        },
        stats: localStorageService.getStats()
    });
});

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, role = 'student' } = req.body;

        // التحقق من الإدخال
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

        // التحقق من إعدادات النظام
        const data = localStorageService.loadData();
        if (!data.systemSettings.registrationEnabled) {
            return res.status(403).json({
                success: false,
                message: 'التسجيل مغلق حالياً',
                code: 'REGISTRATION_DISABLED'
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
            fullName: sanitizeInput(fullName),
            email: email.toLowerCase(),
            password: hashedPassword,
            role: role
        });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await localStorageService.auditLog('REGISTER', user._id, 'USER', user._id, {
            email: email,
            role: role,
            ip: req.ip,
            userAgent: req.get('User-Agent')
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

        // التحقق من محاولات تسجيل الدخول
        const now = new Date();
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
        
        if (user.security?.loginAttempts >= 5 && 
            user.security?.lastLoginAttempt > fifteenMinutesAgo.toISOString()) {
            return res.status(429).json({
                success: false,
                message: 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها، يرجى المحاولة لاحقاً',
                code: 'TOO_MANY_ATTEMPTS'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            // تحديث محاولات تسجيل الدخول
            await localStorageService.updateUser(user._id, {
                security: {
                    loginAttempts: (user.security?.loginAttempts || 0) + 1,
                    lastLoginAttempt: new Date().toISOString()
                }
            });

            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // إعادة تعيين محاولات تسجيل الدخول
        const updatedUser = await localStorageService.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            'security.loginAttempts': 0,
            'security.lastLoginAttempt': null,
            'stats.loginCount': (user.stats?.loginCount || 0) + 1
        });

        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        await localStorageService.auditLog('LOGIN', user._id, 'USER', user._id, {
            email: email,
            ip: req.ip,
            userAgent: req.get('User-Agent')
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

        await localStorageService.auditLog('LOGOUT', req.user._id, 'USER', req.user._id, {
            ip: req.ip,
            userAgent: req.get('User-Agent')
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

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور الحالية والجديدة مطلوبتان',
                code: 'MISSING_PASSWORDS'
            });
        }

        if (!validatePassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل',
                code: 'WEAK_PASSWORD'
            });
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, req.user.password);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'كلمة المرور الحالية غير صحيحة',
                code: 'INVALID_CURRENT_PASSWORD'
            });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        await localStorageService.updateUser(req.user._id, {
            password: hashedNewPassword,
            'security.passwordChangedAt': new Date().toISOString()
        });

        await localStorageService.auditLog('CHANGE_PASSWORD', req.user._id, 'USER', req.user._id, {
            ip: req.ip
        });

        res.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في تغيير كلمة المرور:', error);
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
        const { fullName, bio, location, website, preferences } = req.body;
        const updates = {};

        if (fullName) updates.fullName = sanitizeInput(fullName);
        if (bio !== undefined) updates.bio = sanitizeInput(bio);
        if (location !== undefined) updates.location = sanitizeInput(location);
        if (website !== undefined) updates.website = sanitizeInput(website);
        
        if (preferences) {
            updates.preferences = {
                ...req.user.preferences,
                ...preferences
            };
        }

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

        await localStorageService.auditLog('UPDATE_PROFILE', req.user._id, 'USER', req.user._id, {
            fields: Object.keys(updates)
        });

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
        const { search, role, limit = 50, sortBy, sortOrder } = req.query;
        
        const users = await localStorageService.getAllUsers({
            search,
            role,
            limit: parseInt(limit),
            sortBy,
            sortOrder
        });

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

app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 20, role, online } = req.query;

        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال مصطلح بحث مكون من حرفين على الأقل',
                code: 'SEARCH_TERM_TOO_SHORT'
            });
        }

        const users = await localStorageService.searchUsers(q, parseInt(limit), {
            role,
            online: online === 'true'
        });

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

app.get('/api/users/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await localStorageService.findUserById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود',
                code: 'USER_NOT_FOUND'
            });
        }

        // التحقق من إعدادات الخصوصية
        if (user.preferences?.privacy?.profileVisibility === 'private' && 
            user._id !== req.user._id && 
            req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح بالوصول إلى هذا الملف الشخصي',
                code: 'PROFILE_PRIVATE'
            });
        }

        res.json({
            success: true,
            data: {
                user: localStorageService.formatUserResponse(user)
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

// مسارات الدردشة
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const { archived, isGroup } = req.query;
        
        const conversations = await localStorageService.getConversationsByUserId(req.user._id, {
            archived: archived === 'true',
            isGroup: isGroup ? isGroup === 'true' : undefined
        });

        // جلب معلومات إضافية للمحادثات
        const conversationsWithDetails = await Promise.all(
            conversations.map(async (conv) => {
                let participantsDetails = [];
                
                for (const participantId of conv.participants) {
                    if (participantId !== req.user._id || conv.participants.length === 1) {
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
        const { participantIds, name, isGroup = false, metadata = {} } = req.body;
        
        if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد مشاركين للمحادثة',
                code: 'MISSING_PARTICIPANTS'
            });
        }

        // التحقق من وجود المستخدمين
        const validParticipants = [req.user._id];
        for (const participantId of participantIds) {
            if (participantId !== req.user._id) {
                const user = await localStorageService.findUserById(participantId);
                if (user) {
                    validParticipants.push(participantId);
                }
            }
        }

        if (validParticipants.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'يجب أن تحتوي المحادثة على مشاركين على الأقل',
                code: 'INSUFFICIENT_PARTICIPANTS'
            });
        }

        const conversation = await localStorageService.createConversation(
            validParticipants, 
            name, 
            isGroup,
            metadata
        );

        await localStorageService.auditLog('CREATE_CONVERSATION', req.user._id, 'CONVERSATION', conversation._id, {
            isGroup,
            participantCount: validParticipants.length
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المحادثة بنجاح',
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
        const { limit = 50, before, after } = req.query;
        
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

        const messages = await localStorageService.getMessagesByConversation(conversationId, {
            limit: parseInt(limit),
            before,
            after
        });

        // تحديث unreadCount
        await localStorageService.markMessagesAsRead(conversationId, req.user._id);

        res.json({
            success: true,
            data: {
                messages,
                conversation,
                pagination: {
                    hasMore: messages.length === parseInt(limit),
                    limit: parseInt(limit),
                    before,
                    after
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
                code: 'MISSING_CONTENT'
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
            content: sanitizeInput(content),
            type,
            metadata: {
                clientId: metadata.clientId,
                device: req.get('User-Agent'),
                ...metadata
            }
        });

        await localStorageService.auditLog('SEND_MESSAGE', req.user._id, 'MESSAGE', message._id, {
            conversationId,
            type,
            length: content.length
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

app.put('/api/chat/conversations/:conversationId/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { conversationId, messageId } = req.params;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'محتوى الرسالة مطلوب',
                code: 'MISSING_CONTENT'
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
                message: 'غير مصرح لك بالتعديل في هذه المحادثة',
                code: 'ACCESS_DENIED'
            });
        }

        const updatedMessage = await localStorageService.editMessage(messageId, req.user._id, sanitizeInput(content));
        if (!updatedMessage) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة أو لا يمكن تعديلها',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        await localStorageService.auditLog('EDIT_MESSAGE', req.user._id, 'MESSAGE', messageId, {
            conversationId
        });

        // إرسال التحديث عبر WebSocket
        conversation.participants.forEach(participantId => {
            io.to(participantId).emit('message_updated', {
                message: updatedMessage,
                conversationId
            });
        });

        res.json({
            success: true,
            message: 'تم تعديل الرسالة بنجاح',
            data: {
                message: updatedMessage
            }
        });
    } catch (error) {
        console.error('❌ خطأ في تعديل الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.delete('/api/chat/conversations/:conversationId/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { conversationId, messageId } = req.params;

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
                message: 'غير مصرح لك بالحذف في هذه المحادثة',
                code: 'ACCESS_DENIED'
            });
        }

        const success = await localStorageService.deleteMessage(messageId, req.user._id);
        if (!success) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة أو لا يمكن حذفها',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        await localStorageService.auditLog('DELETE_MESSAGE', req.user._id, 'MESSAGE', messageId, {
            conversationId
        });

        // إرسال التحديث عبر WebSocket
        conversation.participants.forEach(participantId => {
            io.to(participantId).emit('message_deleted', {
                messageId,
                conversationId,
                deletedBy: req.user._id
            });
        });

        res.json({
            success: true,
            message: 'تم حذف الرسالة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الرسالة:', error);
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
        const { search, category, publicOnly, limit, sortBy } = req.query;
        
        const channels = await localStorageService.getAllChannels({
            search,
            category,
            publicOnly: publicOnly === 'true',
            limit: limit ? parseInt(limit) : undefined,
            sortBy
        });

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
        const { name, description, isPublic = true, category, tags } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم القناة مطلوب',
                code: 'MISSING_NAME'
            });
        }

        const channelData = {
            name: sanitizeInput(name),
            description: description ? sanitizeInput(description) : '',
            creatorId: req.user._id,
            isPublic: isPublic === 'true' || isPublic === true,
            category: category || 'general',
            tags: tags ? tags.split(',').map(tag => tag.trim()) : []
        };

        if (req.file) {
            channelData.avatar = `/uploads/channels/${req.file.filename}`;
        }

        const channel = await localStorageService.createChannel(channelData);

        await localStorageService.auditLog('CREATE_CHANNEL', req.user._id, 'CHANNEL', channel._id, {
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

app.get('/api/channels/:channelId', authenticateToken, async (req, res) => {
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

        // التحقق من العضوية للقنوات الخاصة
        if (!channel.channelSettings.isPublic && 
            !channel.members.includes(req.user._id) &&
            req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح بالوصول إلى هذه القناة',
                code: 'CHANNEL_PRIVATE'
            });
        }

        res.json({
            success: true,
            data: {
                channel
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات القناة:', error);
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

        if (!channel.channelSettings.isPublic && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'هذه القناة خاصة وتتطلب دعوة',
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

        await localStorageService.auditLog('JOIN_CHANNEL', req.user._id, 'CHANNEL', channelId, {
            channelName: channel.name
        });

        res.json({
            success: true,
            message: 'تم الانضمام للقناة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في الانضمام للقناة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/api/channels/:channelId/leave', authenticateToken, async (req, res) => {
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

        // لا يمكن للمديرين المغادرة إذا كانوا المدير الوحيد
        if (channel.admins.includes(req.user._id) && channel.admins.length === 1) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكنك مغادرة القناة لأنك المدير الوحيد',
                code: 'LAST_ADMIN'
            });
        }

        const success = await localStorageService.removeMemberFromChannel(channelId, req.user._id);
        if (!success) {
            return res.status(400).json({
                success: false,
                message: 'أنت لست عضواً في هذه القناة',
                code: 'NOT_MEMBER'
            });
        }

        await localStorageService.auditLog('LEAVE_CHANNEL', req.user._id, 'CHANNEL', channelId, {
            channelName: channel.name
        });

        res.json({
            success: true,
            message: 'تم مغادرة القناة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في مغادرة القناة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات المجموعات (مشابهة للقنوات)
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const { search, category, publicOnly, limit, sortBy } = req.query;
        
        const groups = await localStorageService.getAllGroups({
            search,
            category,
            publicOnly: publicOnly === 'true',
            limit: limit ? parseInt(limit) : undefined,
            sortBy
        });

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
        const { name, description, isPublic = true, category, tags, maxMembers } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم المجموعة مطلوب',
                code: 'MISSING_NAME'
            });
        }

        const groupData = {
            name: sanitizeInput(name),
            description: description ? sanitizeInput(description) : '',
            creatorId: req.user._id,
            isPublic: isPublic === 'true' || isPublic === true,
            category: category || 'general',
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            maxMembers: maxMembers ? parseInt(maxMembers) : 100
        };

        if (req.file) {
            groupData.avatar = `/uploads/groups/${req.file.filename}`;
        }

        const group = await localStorageService.createGroup(groupData);

        await localStorageService.auditLog('CREATE_GROUP', req.user._id, 'GROUP', group._id, {
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

        if (!group.groupSettings.isPublic && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'هذه المجموعة خاصة وتتطلب دعوة',
                code: 'GROUP_PRIVATE'
            });
        }

        // التحقق من الحد الأقصى للأعضاء
        if (group.stats.memberCount >= group.groupSettings.maxMembers) {
            return res.status(400).json({
                success: false,
                message: 'المجموعة ممتلئة',
                code: 'GROUP_FULL'
            });
        }

        const success = await localStorageService.addMemberToGroup(groupId, req.user._id);
        if (!success) {
            return res.status(400).json({
                success: false,
                message: 'أنت بالفعل عضو في هذه المجموعة',
                code: 'ALREADY_MEMBER'
            });
        }

        await localStorageService.auditLog('JOIN_GROUP', req.user._id, 'GROUP', groupId, {
            groupName: group.name
        });

        res.json({
            success: true,
            message: 'تم الانضمام للمجموعة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في الانضمام للمجموعة:', error);
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
        const { userId, excludeViewed } = req.query;
        
        const stories = await localStorageService.getActiveStories({
            userId,
            excludeViewedBy: excludeViewed === 'true' ? req.user._id : undefined
        });

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

app.post('/api/stories', authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const { caption, type = 'image', allowReplies = true, allowSharing = true } = req.body;
        
        if (!req.file && type !== 'text') {
            return res.status(400).json({
                success: false,
                message: 'الوسائط مطلوبة للستوري',
                code: 'MISSING_MEDIA'
            });
        }

        const storyData = {
            userId: req.user._id,
            caption: caption ? sanitizeInput(caption) : '',
            type,
            allowReplies: allowReplies === 'true',
            allowSharing: allowSharing === 'true'
        };

        if (req.file) {
            storyData.mediaUrl = `/uploads/stories/${req.file.filename}`;
            storyData.mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }

        const story = await localStorageService.createStory(storyData);

        await localStorageService.auditLog('CREATE_STORY', req.user._id, 'STORY', story._id, { 
            type,
            hasMedia: !!req.file
        });

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
        if (!success) {
            return res.status(400).json({
                success: false,
                message: 'تم مشاهدة الستوري مسبقاً',
                code: 'ALREADY_VIEWED'
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

        const success = await localStorageService.addStoryReaction(storyId, req.user._id, reaction);
        if (!success) {
            return res.status(404).json({
                success: false,
                message: 'الستوري غير موجود',
                code: 'STORY_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            message: 'تم إضافة التفاعل بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في إضافة تفاعل الستوري:', error);
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
        const auditLogs = await localStorageService.getAuditLogs({ limit: 10 });
        
        res.json({
            success: true,
            data: {
                stats,
                recentActivity: auditLogs
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

app.get('/api/admin/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId, action, targetType, startDate, endDate, limit = 50 } = req.query;
        
        const logs = await localStorageService.getAuditLogs({
            userId,
            action,
            targetType,
            startDate,
            endDate,
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: {
                logs,
                total: logs.length
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب سجلات التدقيق:', error);
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
            await localStorageService.auditLog('CREATE_BACKUP', req.user._id, 'SYSTEM', 'backup', {
                filename: result.filename
            });
            
            res.json({
                success: true,
                message: 'تم إنشاء النسخة الاحتياطية بنجاح',
                data: {
                    filename: result.filename,
                    stats: result.stats
                }
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
            await localStorageService.auditLog('CLEANUP_DATA', req.user._id, 'SYSTEM', 'cleanup', {
                cleanedCount: result.cleanedCount
            });
            
            res.json({
                success: true,
                message: `تم تنظيف ${result.cleanedCount} عنصر من البيانات القديمة بنجاح`
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

app.put('/api/admin/system-settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { maintenance, registrationEnabled, maxFileSize } = req.body;
        
        const data = localStorageService.loadData();
        
        if (maintenance !== undefined) {
            data.systemSettings.maintenance = maintenance;
        }
        
        if (registrationEnabled !== undefined) {
            data.systemSettings.registrationEnabled = registrationEnabled;
        }
        
        if (maxFileSize !== undefined) {
            data.systemSettings.maxFileSize = maxFileSize;
        }
        
        localStorageService.saveData(data);
        
        await localStorageService.auditLog('UPDATE_SYSTEM_SETTINGS', req.user._id, 'SYSTEM', 'settings', {
            maintenance,
            registrationEnabled,
            maxFileSize
        });

        res.json({
            success: true,
            message: 'تم تحديث إعدادات النظام بنجاح',
            data: {
                settings: data.systemSettings
            }
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث إعدادات النظام:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
});

// مسارات النظام
app.get('/api/system/health', (req, res) => {
    const stats = localStorageService.getStats();
    const memoryUsage = process.memoryUsage();
    
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024)
            },
            nodeVersion: process.version,
            platform: process.platform,
            stats: stats
        }
    });
});

app.get('/api/system/info', authenticateToken, (req, res) => {
    const data = localStorageService.loadData();
    
    res.json({
        success: true,
        data: {
            version: '2.1.0',
            environment: NODE_ENV,
            systemSettings: data.systemSettings,
            features: {
                chat: true,
                channels: true,
                groups: true,
                stories: true,
                fileSharing: true,
                realTime: true,
                notifications: true
            }
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

        await localStorageService.auditLog('UPLOAD_FILE', req.user._id, 'FILE', req.file.filename, {
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

// نظام WebSocket
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
                
                await localStorageService.updateUser(user._id, {
                    isOnline: true,
                    lastSeen: new Date().toISOString()
                });
                
                socket.join(user._id);
                
                socket.emit('authenticated', {
                    success: true,
                    user: localStorageService.formatUserResponse(user)
                });
                
                console.log(`✅ تم توثيق المستخدم: ${user.fullName}`);
            }
        } catch (error) {
            console.error('❌ خطأ في توثيق WebSocket:', error);
            socket.emit('authenticated', {
                success: false,
                message: 'رمز وصول غير صالح'
            });
        }
    });

    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { conversationId, content } = data;
            
            if (!conversationId || !content) {
                socket.emit('error', { message: 'معرف المحادثة والمحتوى مطلوبان' });
                return;
            }

            const message = await localStorageService.createMessage({
                conversationId,
                senderId: socket.userId,
                content,
                type: 'text'
            });

            const conversation = await localStorageService.getConversationById(conversationId);
            if (conversation) {
                conversation.participants.forEach(participantId => {
                    io.to(participantId).emit('new_message', {
                        conversationId,
                        message
                    });
                });
            }

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'فشل إرسال الرسالة' });
        }
    });

    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منقطع:', socket.id);
        
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            
            try {
                await localStorageService.updateUser(socket.userId, {
                    isOnline: false,
                    lastSeen: new Date().toISOString()
                });
            } catch (error) {
                console.error('❌ خطأ في تحديث حالة المستخدم:', error);
            }
        }
    });
});

// بدء الخادم
async function startServer() {
    try {
        // إنشاء حساب المدير الافتراضي
        await createDefaultAdmin();
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(50));
            console.log('🚀 خادم المنصة التعليمية يعمل بنجاح!');
            console.log('='.repeat(50));
            console.log(`📍 العنوان: http://localhost:${PORT}`);
            console.log(`⏰ الوقت: ${new Date().toLocaleString()}`);
            console.log(`👥 المستخدمون المتصلون: ${connectedUsers.size}`);
            console.log('='.repeat(50));
            console.log('\n🔐 حساب المدير الافتراضي:');
            console.log('   📧 البريد: admin@platform.edu');
            console.log('   🔑 كلمة المرور: 77007700');
            console.log('='.repeat(50));
        });
    } catch (error) {
        console.error('❌ فشل في بدء الخادم:', error);
        process.exit(1);
    }
}

startServer();

export default app;
