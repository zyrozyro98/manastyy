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
import googleSheetsService from './google-sheets.js';

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
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1fW18ZxsUqntEfRxIv0-srLnzg7izBgmQpqZpfqyq3UA';

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
    max: NODE_ENV === 'production' ? 100 : 1000, // حد الطلبات
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

// إنشاء مجلدات التحميلات
const uploadDirs = ['uploads', 'uploads/profiles', 'uploads/stories', 'uploads/channels', 'uploads/files'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// إعداد multer المتقدم للتحميلات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'uploads/';
        if (file.fieldname === 'avatar') uploadPath += 'profiles/';
        else if (file.fieldname === 'story') uploadPath += 'stories/';
        else if (file.fieldname === 'channelAvatar') uploadPath += 'channels/';
        else if (file.fieldname === 'file') uploadPath += 'files/';
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
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
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

// نماذج MongoDB المتقدمة
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
        updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 }; // 2 ساعة
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
        coordinates: { type: [Number] } // [longitude, latitude]
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
    duration: { type: Number }, // للملفات الصوتية
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
        slowModeDelay: { type: Number, default: 0 } // بالثواني
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

// النماذج الإضافية
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['message', 'story', 'channel', 'system', 'friend_request'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed }, // بيانات إضافية
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

// دوال التخزين في Google Sheets
const saveUserToSheets = async (user) => {
    try {
        const values = [
            [
                user._id.toString(),
                user.fullName,
                user.phone,
                user.university,
                user.major,
                user.batch,
                user.role,
                user.isOnline ? 'نعم' : 'لا',
                user.isActive ? 'نشط' : 'موقوف',
                new Date(user.createdAt).toLocaleDateString('ar-EG'),
                new Date().toLocaleString('ar-EG')
            ]
        ];

        await googleSheetsService.appendData(SPREADSHEET_ID, 'المستخدمين!A:K', values);
        console.log('✅ تم حفظ المستخدم في Google Sheets');
    } catch (error) {
        console.error('❌ خطأ في حفظ المستخدم في Sheets:', error);
    }
};

const saveMessageToSheets = async (message) => {
    try {
        const values = [
            [
                message._id.toString(),
                message.conversationId.toString(),
                message.senderId.toString(),
                message.content.substring(0, 100), // أول 100 حرف فقط
                message.messageType,
                new Date(message.createdAt).toLocaleString('ar-EG'),
                message.readBy.length,
                'نشط'
            ]
        ];

        await googleSheetsService.appendData(SPREADSHEET_ID, 'الرسائل!A:H', values);
        console.log('✅ تم حفظ الرسالة في Google Sheets');
    } catch (error) {
        console.error('❌ خطأ في حفظ الرسالة في Sheets:', error);
    }
};

const saveStoryToSheets = async (story) => {
    try {
        const values = [
            [
                story._id.toString(),
                story.userId.toString(),
                story.mediaType,
                story.caption || 'بدون وصف',
                new Date(story.createdAt).toLocaleString('ar-EG'),
                new Date(story.expiresAt).toLocaleString('ar-EG'),
                story.views.length,
                story.reactions.length,
                'نشط'
            ]
        ];

        await googleSheetsService.appendData(SPREADSHEET_ID, 'الستوريات!A:I', values);
        console.log('✅ تم حفظ الستوري في Google Sheets');
    } catch (error) {
        console.error('❌ خطأ في حفظ الستوري في Sheets:', error);
    }
};

const saveChannelToSheets = async (channel) => {
    try {
        const values = [
            [
                channel._id.toString(),
                channel.name,
                channel.type,
                channel.creatorId.toString(),
                channel.members.length,
                channel.isPublic ? 'عام' : 'خاص',
                new Date(channel.createdAt).toLocaleString('ar-EG'),
                'نشط'
            ]
        ];

        await googleSheetsService.appendData(SPREADSHEET_ID, 'القنوات!A:H', values);
        console.log('✅ تم حفظ القناة في Google Sheets');
    } catch (error) {
        console.error('❌ خطأ في حفظ القناة في Sheets:', error);
    }
};

// middleware المصادقة المتقدم
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

// middleware للتحقق من صلاحيات المدير
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

// middleware للتحقق من صلاحيات المشرف
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

// دوال مساعدة متقدمة
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
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 يوم
        });
        
        await notification.save();
        
        // إرسال إشعار في الوقت الحقيقي
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
    
    // إنشاء مدير افتراضي إذا لم يكن موجوداً
    createDefaultAdmin();
})
.catch((error) => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error);
    process.exit(1);
});

async function createDefaultAdmin() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 12);
            const admin = new User({
                fullName: 'مدير النظام',
                phone: '0512345678',
                university: 'المنصة التعليمية',
                major: 'إدارة النظام',
                batch: '2024',
                password: hashedPassword,
                role: 'admin',
                email: 'admin@eduplatform.com'
            });
            await admin.save();
            
            // حفظ المدير في Google Sheets
            await saveUserToSheets(admin);
            
            console.log('👑 تم إنشاء حساب المدير الافتراضي');
        }
    } catch (error) {
        console.error('خطأ في إنشاء المدير الافتراضي:', error);
    }
}

// تخزين للمستخدمين المتصلين وإدارة الغرف
const connectedUsers = new Map();
const userSessions = new Map();

// إعداد Socket.IO المتقدم
io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('user_connected', async (data) => {
        try {
            const { userId, userAgent, platform } = data;
            const user = await User.findById(userId);
            
            if (user) {
                // تحديث حالة الاتصال
                connectedUsers.set(userId, socket.id);
                userSessions.set(socket.id, {
                    userId,
                    connectedAt: new Date(),
                    userAgent,
                    platform
                });
                
                socket.userId = userId;
                
                // تحديث حالة المستخدم
                await User.findByIdAndUpdate(userId, { 
                    isOnline: true,
                    lastSeen: new Date() 
                });
                
                // إعلام المستخدمين الآخرين
                socket.broadcast.emit('user_online', {
                    userId,
                    user: formatUserResponse(user)
                });
                
                // إرسال الإشعارات غير المقروءة
                const unreadNotifications = await Notification.find({
                    userId,
                    isRead: false
                }).sort({ createdAt: -1 }).limit(10);
                
                socket.emit('notifications_sync', {
                    notifications: unreadNotifications
                });
                
                console.log(`✅ المستخدم ${user.fullName} متصل الآن`);
                
                // تسجيل التدقيق
                await auditLog('USER_CONNECTED', userId, 'user', userId, {
                    socketId: socket.id,
                    userAgent,
                    platform
                });
            }
        } catch (error) {
            console.error('خطأ في اتصال المستخدم:', error);
        }
    });

    // انضمام للغرف
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

    // إرسال الرسائل
    socket.on('send_message', async (data) => {
        try {
            const { conversationId, content, messageType = 'text', fileUrl = null, replyTo = null } = data;

            // التحقق من أن المستخدم مشارك في المحادثة
            const conversation = await Conversation.findOne({
                _id: conversationId,
                participants: socket.userId
            });

            if (!conversation) {
                socket.emit('error', { 
                    message: 'غير مصرح لك بإرسال رسالة في هذه المحادثة',
                    code: 'UNAUTHORIZED_CONVERSATION'
                });
                return;
            }

            // إنشاء الرسالة
            const message = new Message({
                conversationId,
                senderId: socket.userId,
                content,
                messageType,
                fileUrl,
                replyTo
            });

            await message.save();

            // حفظ في Google Sheets
            await saveMessageToSheets(message);

            // تحديث المحادثة
            conversation.lastMessage = message._id;
            conversation.updatedAt = new Date();
            
            // تحديث عدد الرسائل غير المقروءة للمشاركين الآخرين
            conversation.participants.forEach(participantId => {
                if (participantId.toString() !== socket.userId) {
                    const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
                    conversation.unreadCount.set(participantId.toString(), currentCount + 1);
                }
            });

            await conversation.save();

            // تحديث إحصائيات المستخدم
            await User.findByIdAndUpdate(socket.userId, {
                $inc: { 'stats.messagesSent': 1 }
            });

            // إرسال الرسالة للمشاركين
            const populatedMessage = await message.populate('senderId', 'fullName avatar');
            const messageData = {
                message: populatedMessage.toObject(),
                conversationId
            };
            
            io.to(`conversation_${conversationId}`).emit('new_message', messageData);

            // إرسال إشعارات للمستخدمين غير المتصلين
            for (const participantId of conversation.participants) {
                if (participantId.toString() !== socket.userId) {
                    const isOnline = connectedUsers.has(participantId.toString());
                    if (!isOnline) {
                        await sendNotification(
                            participantId,
                            'message',
                            'رسالة جديدة',
                            `${populatedMessage.senderId.fullName}: ${content.substring(0, 100)}...`,
                            { conversationId, messageId: message._id },
                            `/chat/${conversationId}`
                        );
                    }
                }
            }

            // تسجيل التدقيق
            await auditLog('MESSAGE_SENT', socket.userId, 'message', message._id, {
                conversationId,
                messageType,
                length: content.length
            });

        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            socket.emit('error', { 
                message: 'حدث خطأ في إرسال الرسالة',
                code: 'MESSAGE_SEND_ERROR'
            });
        }
    });

    // تفاعلات الرسائل
    socket.on('message_reaction', async (data) => {
        try {
            const { messageId, emoji } = data;
            
            const message = await Message.findById(messageId);
            if (!message) {
                socket.emit('error', { message: 'الرسالة غير موجودة' });
                return;
            }

            // إزالة التفاعل السابق إذا وجد
            message.reactions = message.reactions.filter(
                reaction => reaction.userId.toString() !== socket.userId
            );

            // إضافة التفاعل الجديد
            message.reactions.push({
                userId: socket.userId,
                emoji,
                reactedAt: new Date()
            });

            await message.save();

            // بث تحديث التفاعل
            const conversation = await Conversation.findById(message.conversationId);
            if (conversation) {
                io.to(`conversation_${message.conversationId}`).emit('message_reaction_updated', {
                    messageId,
                    reactions: message.reactions
                });
            }

        } catch (error) {
            console.error('خطأ في تفاعل الرسالة:', error);
        }
    });

    // تحديث حالة القراءة
    socket.on('message_read', async (data) => {
        try {
            const { conversationId, messageId } = data;

            const conversation = await Conversation.findOne({
                _id: conversationId,
                participants: socket.userId
            });

            if (conversation) {
                // تحديث الرسالة
                await Message.findByIdAndUpdate(messageId, {
                    $addToSet: { 
                        readBy: { 
                            userId: socket.userId,
                            readAt: new Date()
                        }
                    }
                });

                // تحديث عدد الرسائل غير المقروءة
                conversation.unreadCount.set(socket.userId.toString(), 0);
                await conversation.save();

                // إعلام المشاركين الآخرين
                socket.to(`conversation_${conversationId}`).emit('message_read_update', {
                    messageId,
                    readBy: socket.userId
                });
            }

        } catch (error) {
            console.error('خطأ في تحديث حالة القراءة:', error);
        }
    });

    // مؤشر الكتابة
    socket.on('typing_start', (data) => {
        const { conversationId } = data;
        socket.to(`conversation_${conversationId}`).emit('user_typing', {
            userId: socket.userId,
            conversationId,
            user: userSessions.get(socket.id)?.user
        });
    });

    socket.on('typing_stop', (data) => {
        const { conversationId } = data;
        socket.to(`conversation_${conversationId}`).emit('user_stop_typing', {
            userId: socket.userId,
            conversationId
        });
    });

    // إدارة الاتصال
    socket.on('disconnect', async () => {
        try {
            const session = userSessions.get(socket.id);
            if (session && session.userId) {
                const userId = session.userId;
                
                // تحديث حالة المستخدم
                await User.findByIdAndUpdate(userId, { 
                    isOnline: false,
                    lastSeen: new Date() 
                });
                
                connectedUsers.delete(userId);
                userSessions.delete(socket.id);
                
                // إعلام المستخدمين الآخرين
                socket.broadcast.emit('user_offline', userId);
                
                console.log(`❌ المستخدم ${userId} انقطع عن الاتصال`);
                
                // تسجيل التدقيق
                await auditLog('USER_DISCONNECTED', userId, 'user', userId, {
                    socketId: socket.id,
                    sessionDuration: Date.now() - session.connectedAt
                });
            }
        } catch (error) {
            console.error('خطأ في فصل الاتصال:', error);
        }
    });

    // معالجة الأخطاء
    socket.on('error', (error) => {
        console.error('خطأ في السوكيت:', error);
    });
});

// المسارات الأساسية
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: 'مرحباً بك في المنصة التعليمية المتطورة',
        version: '4.2.0',
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        features: [
            'دردشة فورية',
            'قصص تفاعلية',
            'قنوات متخصصة',
            'إدارة متقدمة',
            'نظام إشعارات',
            'تحليلات متقدمة',
            'تخزين في Google Sheets'
        ]
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'running',
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        connectedUsers: connectedUsers.size,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
    });
});

// مسارات المصادقة المتقدمة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password, email, studentId } = req.body;

        // التحقق من البيانات
        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'جميع الحقول المطلوبة',
                code: 'MISSING_FIELDS'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'كلمة المرور يجب أن تكون على الأقل 6 أحرف',
                code: 'WEAK_PASSWORD'
            });
        }

        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ 
            $or: [
                { phone },
                ...(email ? [{ email }] : []),
                ...(studentId ? [{ studentId }] : [])
            ]
        });

        if (existingUser) {
            const field = existingUser.phone === phone ? 'رقم الهاتف' : 
                         existingUser.email === email ? 'البريد الإلكتروني' : 'رقم الطالب';
            return res.status(400).json({ 
                success: false, 
                message: `${field} مسجل مسبقاً`,
                code: 'DUPLICATE_ENTRY'
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
            email,
            studentId
        });

        await user.save();

        // حفظ في Google Sheets
        await saveUserToSheets(user);

        // إنشاء tokens
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // تسجيل التدقيق
        await auditLog('USER_REGISTERED', user._id, 'user', user._id, {
            university,
            major,
            batch
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            token,
            refreshToken,
            user: formatUserResponse(user)
        });

    } catch (error) {
        console.error('خطأ في إنشاء الحساب:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'REGISTRATION_ERROR'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password, rememberMe = false } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'رقم الهاتف وكلمة المرور مطلوبان',
                code: 'MISSING_CREDENTIALS'
            });
        }

        // البحث عن المستخدم
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // التحقق من حالة الحساب
        if (!user.isActive) {
            return res.status(400).json({ 
                success: false, 
                message: 'الحساب موقوف. يرجى التواصل مع الإدارة',
                code: 'ACCOUNT_SUSPENDED'
            });
        }

        if (user.isLocked) {
            return res.status(400).json({ 
                success: false, 
                message: 'الحساب مؤقتاً مغلق due to multiple failed login attempts',
                code: 'ACCOUNT_LOCKED'
            });
        }

        // التحقق من كلمة المرور
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            // زيادة عدد محاولات الدخول الفاشلة
            await user.incrementLoginAttempts();
            
            return res.status(400).json({ 
                success: false, 
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // إعادة تعيين محاولات الدخول الفاشلة
        await User.findByIdAndUpdate(user._id, {
            $set: { 
                'security.loginAttempts': 0,
                'security.lockUntil': null
            }
        });

        // تحديث آخر ظهور
        user.lastSeen = new Date();
        await user.save();

        // إنشاء tokens
        const tokenExpiry = rememberMe ? '90d' : '30d';
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: tokenExpiry });
        const refreshToken = generateRefreshToken(user._id);

        // تسجيل التدقيق
        await auditLog('USER_LOGGED_IN', user._id, 'user', user._id, {
            rememberMe,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            token,
            refreshToken,
            user: formatUserResponse(user)
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
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
                message: 'Refresh token مطلوب',
                code: 'REFRESH_TOKEN_REQUIRED'
            });
        }

        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ 
                success: false, 
                message: 'نوع token غير صالح',
                code: 'INVALID_TOKEN_TYPE'
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
            token: newToken,
            refreshToken: newRefreshToken
        });

    } catch (error) {
        console.error('خطأ في تجديد الرمز:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Refresh token غير صالح',
            code: 'INVALID_REFRESH_TOKEN'
        });
    }
});

// مسارات Google Sheets
app.get('/api/sheets/stats', authenticateToken, async (req, res) => {
    try {
        const [usersData, messagesData, storiesData] = await Promise.all([
            googleSheetsService.readData(SPREADSHEET_ID, 'المستخدمين!A:K'),
            googleSheetsService.readData(SPREADSHEET_ID, 'الرسائل!A:H'),
            googleSheetsService.readData(SPREADSHEET_ID, 'الستوريات!A:I')
        ]);

        // إزالة العناوين
        const usersCount = Math.max(0, (usersData?.length || 1) - 1);
        const messagesCount = Math.max(0, (messagesData?.length || 1) - 1);
        const storiesCount = Math.max(0, (storiesData?.length || 1) - 1);

        res.json({
            success: true,
            stats: {
                totalUsers: usersCount,
                totalMessages: messagesCount,
                totalStories: storiesCount,
                lastUpdate: new Date().toLocaleString('ar-EG')
            }
        });

    } catch (error) {
        console.error('خطأ في جلب إحصائيات الـ Sheets:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب الإحصائيات'
        });
    }
});

app.post('/api/export/all-data', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password -security');
        const messages = await Message.find().limit(1000).populate('senderId', 'fullName');
        const stories = await Story.find().limit(1000).populate('userId', 'fullName');
        const channels = await Channel.find().limit(500).populate('creatorId', 'fullName');

        // تصدير المستخدمين
        const userValues = users.map(user => [
            user._id.toString(),
            user.fullName,
            user.phone,
            user.university,
            user.major,
            user.batch,
            user.role,
            user.isOnline ? 'نعم' : 'لا',
            user.isActive ? 'نشط' : 'موقوف',
            new Date(user.createdAt).toLocaleDateString('ar-EG')
        ]);

        // إضافة عناوين الأعمدة
        userValues.unshift([
            'ID', 'الاسم', 'الهاتف', 'الجامعة', 'التخصص', 'الدفعة', 
            'الدور', 'متصل', 'الحالة', 'تاريخ التسجيل'
        ]);

        await googleSheetsService.updateData(SPREADSHEET_ID, 'تصدير_المستخدمين!A:J', userValues);

        res.json({
            success: true,
            message: 'تم تصدير جميع البيانات بنجاح',
            sheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
        });

    } catch (error) {
        console.error('خطأ في تصدير البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء التصدير'
        });
    }
});

// مسارات المستخدم المتقدمة
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const userWithStats = await User.findById(req.user._id)
            .select('-password -security');
            
        res.json({
            success: true,
            user: formatUserResponse(userWithStats)
        });
    } catch (error) {
        console.error('خطأ في جلب الملف الشخصي:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'PROFILE_FETCH_ERROR'
        });
    }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { fullName, university, major, batch, bio, email, studentId } = req.body;

        const updateData = {};
        if (fullName) updateData.fullName = fullName.trim();
        if (university) updateData.university = university;
        if (major) updateData.major = major;
        if (batch) updateData.batch = batch;
        if (bio !== undefined) updateData.bio = bio;
        if (email) updateData.email = email;
        if (studentId) updateData.studentId = studentId;

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -security');

        // تسجيل التدقيق
        await auditLog('PROFILE_UPDATED', req.user._id, 'user', req.user._id, {
            updatedFields: Object.keys(updateData)
        });

        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('خطأ في تحديث الملف الشخصي:', error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            const fieldName = field === 'email' ? 'البريد الإلكتروني' : 'رقم الطالب';
            return res.status(400).json({ 
                success: false, 
                message: `${fieldName} مسجل مسبقاً`,
                code: 'DUPLICATE_ENTRY'
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'PROFILE_UPDATE_ERROR'
        });
    }
});

app.put('/api/user/settings', authenticateToken, async (req, res) => {
    try {
        const { privacy, notificationSettings, appearance } = req.body;

        const updateData = {};
        if (privacy) updateData['settings.privacy'] = privacy;
        if (notificationSettings) updateData['settings.notificationSettings'] = notificationSettings;
        if (appearance) updateData['settings.appearance'] = appearance;

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateData },
            { new: true }
        ).select('-password -security');

        res.json({
            success: true,
            message: 'تم تحديث الإعدادات بنجاح',
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('خطأ في تحديث الإعدادات:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'SETTINGS_UPDATE_ERROR'
        });
    }
});

app.get('/api/user/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;

        // إحصائيات متقدمة
        const storiesCount = await Story.countDocuments({ userId });
        const activeStoriesCount = await Story.countDocuments({ 
            userId, 
            expiresAt: { $gt: new Date() } 
        });
        const messagesCount = await Message.countDocuments({ senderId: userId });
        const joinedChannels = await Channel.countDocuments({ members: userId });
        
        // تفاعلات القصص
        const storyInteractions = await Story.aggregate([
            { $match: { userId: mongoose.Types.ObjectId(userId) } },
            {
                $project: {
                    totalViews: { $size: '$views' },
                    totalReactions: { $size: '$reactions' },
                    totalReplies: { $size: '$replies' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalViews: { $sum: '$totalViews' },
                    totalReactions: { $sum: '$totalReactions' },
                    totalReplies: { $sum: '$totalReplies' }
                }
            }
        ]);

        const interactions = storyInteractions[0] || { totalViews: 0, totalReactions: 0, totalReplies: 0 };

        // حساب رتبة المستخدم
        const activityScore = (storiesCount * 2) + (messagesCount * 1) + (joinedChannels * 3) + 
                            (interactions.totalViews * 0.1) + (interactions.totalReactions * 0.5) + 
                            (interactions.totalReplies * 1);

        let rank = 'مبتدئ';
        let level = 1;
        if (activityScore > 100) { rank = 'نشط'; level = 2; }
        if (activityScore > 300) { rank = 'متميز'; level = 3; }
        if (activityScore > 500) { rank = 'خبير'; level = 4; }
        if (activityScore > 1000) { rank = 'أسطورة'; level = 5; }

        res.json({
            success: true,
            stats: {
                overview: {
                    rank,
                    level,
                    score: Math.round(activityScore),
                    nextLevelScore: level * 200,
                    progress: Math.min(100, (activityScore / (level * 200)) * 100)
                },
                messages: { 
                    total: messagesCount,
                    today: await Message.countDocuments({
                        senderId: userId,
                        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
                    })
                },
                stories: { 
                    total: storiesCount, 
                    active: activeStoriesCount 
                },
                channels: { joined: joinedChannels },
                interactions: {
                    views: interactions.totalViews,
                    reactions: interactions.totalReactions,
                    replies: interactions.totalReplies
                },
                badges: req.user.badges || []
            }
        });

    } catch (error) {
        console.error('خطأ في جلب إحصائيات المستخدم:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'STATS_FETCH_ERROR'
        });
    }
});

// تحميل الصورة الرمزية
app.post('/api/user/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'لم يتم تحميل أي ملف',
                code: 'NO_FILE_UPLOADED'
            });
        }

        const avatarUrl = `/uploads/profiles/${req.file.filename}`;
        
        // حذف الصورة القديمة إذا وجدت
        const oldUser = await User.findById(req.user._id);
        if (oldUser.avatar && oldUser.avatar.startsWith('/uploads/profiles/')) {
            const oldPath = path.join(__dirname, oldUser.avatar);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { avatar: avatarUrl },
            { new: true }
        ).select('-password -security');

        // تسجيل التدقيق
        await auditLog('AVATAR_UPDATED', req.user._id, 'user', req.user._id, {
            newAvatar: avatarUrl
        });

        res.json({
            success: true,
            message: 'تم تحديث الصورة الرمزية بنجاح',
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('خطأ في تحميل الصورة الرمزية:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'AVATAR_UPLOAD_ERROR'
        });
    }
});

// مسارات المستخدمين النشطين
app.get('/api/users/active', authenticateToken, async (req, res) => {
    try {
        const { limit = 20, search = '' } = req.query;

        const query = {
            isActive: true,
            _id: { $ne: req.user._id }
        };

        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { university: { $regex: search, $options: 'i' } },
                { major: { $regex: search, $options: 'i' } }
            ];
        }

        const activeUsers = await User.find(query)
            .select('fullName avatar role lastSeen university major isOnline')
            .limit(parseInt(limit))
            .sort({ isOnline: -1, lastSeen: -1 });

        const usersWithStatus = activeUsers.map(user => ({
            ...formatUserResponse(user),
            isOnline: connectedUsers.has(user._id.toString())
        }));

        res.json({
            success: true,
            users: usersWithStatus,
            total: activeUsers.length
        });

    } catch (error) {
        console.error('خطأ في جلب المستخدمين النشطين:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'ACTIVE_USERS_FETCH_ERROR'
        });
    }
});

// مسارات الـ Stories المتقدمة
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const { limit = 50, type = 'all' } = req.query;

        let query = { expiresAt: { $gt: new Date() } };
        
        if (type === 'following') {
            // يمكن إضافة منطق المتابعة هنا
        } else if (type === 'popular') {
            query['metrics.viewCount'] = { $gte: 10 };
        }

        const stories = await Story.find(query)
            .populate('userId', 'fullName avatar university')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        // تجميع القصص حسب المستخدم
        const storiesByUser = {};
        stories.forEach(story => {
            const userId = story.userId._id.toString();
            if (!storiesByUser[userId]) {
                storiesByUser[userId] = {
                    user: story.userId,
                    stories: []
                };
            }
            storiesByUser[userId].stories.push(story);
        });

        const result = Object.values(storiesByUser);

        res.json({
            success: true,
            stories: result,
            total: stories.length
        });

    } catch (error) {
        console.error('خطأ في جلب القصص:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'STORIES_FETCH_ERROR'
        });
    }
});

app.post('/api/stories', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'لم يتم تحميل أي ملف',
                code: 'NO_FILE_UPLOADED'
            });
        }

        const { caption, allowReplies = true, allowSharing = true, tags = [] } = req.body;

        // تحديد نوع الوسائط
        const isVideo = req.file.mimetype.startsWith('video/');
        const mediaType = isVideo ? 'video' : 'image';

        // حساب وقت الانتهاء (24 ساعة)
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const story = new Story({
            userId: req.user._id,
            mediaUrl: `/uploads/stories/${req.file.filename}`,
            mediaType,
            caption,
            allowReplies: allowReplies === 'true',
            allowSharing: allowSharing === 'true',
            tags: Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim()),
            expiresAt
        });

        await story.save();

        // حفظ في Google Sheets
        await saveStoryToSheets(story);

        // تحديث إحصائيات المستخدم
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.storiesPosted': 1 }
        });

        // إشعار المستخدمين المتصلين
        const populatedStory = await story.populate('userId', 'fullName avatar');
        io.emit('new_story', {
            story: populatedStory
        });

        // تسجيل التدقيق
        await auditLog('STORY_CREATED', req.user._id, 'story', story._id, {
            mediaType,
            hasCaption: !!caption,
            tagsCount: story.tags.length
        });

        res.json({
            success: true,
            message: 'تم نشر القصة بنجاح',
            story: populatedStory
        });

    } catch (error) {
        console.error('خطأ في نشر القصة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'STORY_CREATION_ERROR'
        });
    }
});

// مسارات القنوات
app.post('/api/channels', authenticateToken, upload.single('channelAvatar'), async (req, res) => {
    try {
        const { name, description, type, isPublic = true, topics = [] } = req.body;

        if (!name || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'الاسم والنوع مطلوبان',
                code: 'MISSING_FIELDS'
            });
        }

        const channel = new Channel({
            name,
            description,
            type,
            isPublic: isPublic === 'true',
            creatorId: req.user._id,
            members: [req.user._id],
            admins: [req.user._id],
            topics: Array.isArray(topics) ? topics : topics.split(',').map(topic => topic.trim())
        });

        if (req.file) {
            channel.avatar = `/uploads/channels/${req.file.filename}`;
        }

        await channel.save();

        // حفظ في Google Sheets
        await saveChannelToSheets(channel);

        // تسجيل التدقيق
        await auditLog('CHANNEL_CREATED', req.user._id, 'channel', channel._id, {
            type,
            isPublic: channel.isPublic
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
            message: 'حدث خطأ في الخادم',
            code: 'CHANNEL_CREATION_ERROR'
        });
    }
});

app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const { limit = 20, type, search = '' } = req.query;

        const query = { isActive: true };
        
        if (type) {
            query.type = type;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const channels = await Channel.find(query)
            .populate('creatorId', 'fullName avatar')
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            channels,
            total: channels.length
        });

    } catch (error) {
        console.error('خطأ في جلب القنوات:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'CHANNELS_FETCH_ERROR'
        });
    }
});

// مسارات الإدارة المتقدمة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isOnline: true });
        const todayMessages = await Message.countDocuments({
            createdAt: { 
                $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
            }
        });
        const activeStories = await Story.countDocuments({ 
            expiresAt: { $gt: new Date() } 
        });
        const totalChannels = await Channel.countDocuments();
        
        // إحصائيات النمو
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const newUsersThisWeek = await User.countDocuments({
            createdAt: { $gte: weekAgo }
        });
        const newChannelsThisWeek = await Channel.countDocuments({
            createdAt: { $gte: weekAgo }
        });

        res.json({
            success: true,
            stats: {
                users: { 
                    total: totalUsers, 
                    active: activeUsers,
                    newThisWeek: newUsersThisWeek
                },
                messages: { 
                    today: todayMessages, 
                    total: await Message.countDocuments() 
                },
                stories: { 
                    active: activeStories, 
                    total: await Story.countDocuments() 
                },
                channels: { 
                    total: totalChannels,
                    newThisWeek: newChannelsThisWeek
                },
                system: {
                    connectedUsers: connectedUsers.size,
                    memoryUsage: process.memoryUsage(),
                    uptime: process.uptime()
                }
            }
        });

    } catch (error) {
        console.error('خطأ في جلب إحصائيات الإدارة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            code: 'ADMIN_STATS_ERROR'
        });
    }
});

// معالجة أخطاء multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                message: 'حجم الملف كبير جداً',
                code: 'FILE_TOO_LARGE'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ 
                success: false, 
                message: 'حقل ملف غير متوقع',
                code: 'UNEXPECTED_FIELD'
            });
        }
    }
    
    if (error.message.includes('نوع الملف غير مدعوم')) {
        return res.status(400).json({ 
            success: false, 
            message: error.message,
            code: 'UNSUPPORTED_FILE_TYPE'
        });
    }
    
    next(error);
});

// معالجة الأخطاء العامة
app.use((error, req, res, next) => {
    console.error('خطأ غير متوقع:', error);
    
    if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
            success: false, 
            message: 'بيانات غير صالحة',
            errors,
            code: 'VALIDATION_ERROR'
        });
    }
    
    if (error.name === 'CastError') {
        return res.status(400).json({ 
            success: false, 
            message: 'معرف غير صالح',
            code: 'INVALID_ID'
        });
    }
    
    res.status(500).json({ 
        success: false, 
        message: NODE_ENV === 'production' ? 'حدث خطأ في الخادم' : error.message,
        code: 'INTERNAL_SERVER_ERROR',
        ...(NODE_ENV === 'development' && { stack: error.stack })
    });
});

// مسارات غير موجودة
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'المسار غير موجود',
        code: 'ROUTE_NOT_FOUND',
        path: req.originalUrl
    });
});

// تشغيل السيرفر
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`📧 بيئة: ${NODE_ENV}`);
    console.log(`🔗 الرابط: http://localhost:${PORT}`);
    console.log(`👥 مستخدمين متصلين: ${connectedUsers.size}`);
    console.log(`📊 Google Sheets ID: ${SPREADSHEET_ID}`);
});

// تنظيف القصص المنتهية كل ساعة
setInterval(async () => {
    try {
        const result = await Story.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        
        if (result.deletedCount > 0) {
            console.log(`🧹 تم تنظيف ${result.deletedCount} قصة منتهية`);
        }
    } catch (error) {
        console.error('خطأ في تنظيف القصص المنتهية:', error);
    }
}, 60 * 60 * 1000);

// تنظيف الإشعارات القديمة يومياً
setInterval(async () => {
    try {
        const result = await Notification.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        
        if (result.deletedCount > 0) {
            console.log(`🧹 تم تنظيف ${result.deletedCount} إشعار منتهي`);
        }
    } catch (error) {
        console.error('خطأ في تنظيف الإشعارات:', error);
    }
}, 24 * 60 * 60 * 1000);

// تصدير للتستينغ
export { app, server, io, connectedUsers };
