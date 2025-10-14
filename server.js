import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { fileURLToPath } from 'url';

// حل مشكلة __dirname في ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل متغيرات البيئة
dotenv.config();

const app = express();
const server = http.createServer(app);

// إعدادات Socket.io المتقدمة
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// الثوابت والإعدادات المتقدمة
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://zyrozyro98:770088254@cluster0.ighdvba.mongodb.net/';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-key-2024';
const NODE_ENV = process.env.NODE_ENV || 'development';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// إنشاء المجلدات اللازمة
const ensureDirectories = () => {
  const directories = [
    UPLOADS_DIR,
    path.join(UPLOADS_DIR, 'stories'),
    path.join(UPLOADS_DIR, 'attachments'),
    path.join(UPLOADS_DIR, 'avatars'),
    path.join(UPLOADS_DIR, 'backups'),
    path.join(UPLOADS_DIR, 'temp')
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 تم إنشاء المجلد: ${dir}`);
    }
  });
};

ensureDirectories();

// إعدادات Multer المتقدمة للرفع
const createStorage = (subfolder) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOADS_DIR, subfolder);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const fileExt = path.extname(file.originalname);
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExt}`;
      cb(null, fileName);
    }
  });
};

const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'image/jpeg': true,
    'image/jpg': true,
    'image/png': true,
    'image/gif': true,
    'image/webp': true,
    'video/mp4': true,
    'video/quicktime': true,
    'video/x-msvideo': true,
    'video/webm': true,
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`نوع الملف غير مدعوم: ${file.mimetype}`), false);
  }
};

const uploadConfigs = {
  stories: {
    storage: createStorage('stories'),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter
  },
  attachments: {
    storage: createStorage('attachments'),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter
  },
  avatars: {
    storage: createStorage('avatars'),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('يجب أن يكون الملف صورة'), false);
      }
    }
  },
  backup: {
    storage: createStorage('backups'),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new Error('يجب أن يكون الملف بصيغة ZIP'), false);
      }
    }
  }
};

const upload = {
  stories: multer(uploadConfigs.stories),
  attachments: multer(uploadConfigs.attachments),
  avatars: multer(uploadConfigs.avatars),
  backup: multer(uploadConfigs.backup)
};
// نماذج MongoDB المتقدمة
const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'],
    maxlength: [30, 'اسم المستخدم يجب أن لا يتجاوز 30 حرف'],
    match: [/^[a-zA-Z0-9_\u0600-\u06FF]+$/, 'اسم المستخدم يمكن أن يحتوي على أحرف عربية وإنجليزية وأرقام فقط']
  },
  phone: { 
    type: String, 
    required: [true, 'رقم الهاتف مطلوب'],
    unique: true,
    match: [/^05\d{8}$/, 'رقم الهاتف يجب أن يبدأ بـ 05 ويحتوي على 10 أرقام']
  },
  password: { 
    type: String, 
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل']
  },
  email: { 
    type: String, 
    sparse: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'البريد الإلكتروني غير صحيح']
  },
  role: { 
    type: String, 
    enum: ['student', 'teacher', 'admin', 'super_admin'], 
    default: 'student' 
  },
  avatar: { 
    type: String, 
    default: '' 
  },
  coverPhoto: { 
    type: String, 
    default: '' 
  },
  bio: { 
    type: String, 
    maxlength: [500, 'السيرة الذاتية يجب أن لا تتجاوز 500 حرف'],
    default: '' 
  },
  isOnline: { 
    type: Boolean, 
    default: false 
  },
  lastSeen: { 
    type: Date, 
    default: Date.now 
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  settings: {
    hideOnlineStatus: { type: Boolean, default: false },
    hideLastSeen: { type: Boolean, default: false },
    hideStoryViews: { type: Boolean, default: false },
    chatTheme: { type: String, default: 'default' },
    notification: {
      messages: { type: Boolean, default: true },
      stories: { type: Boolean, default: true },
      groups: { type: Boolean, default: true },
      email: { type: Boolean, default: false }
    },
    privacy: {
      profile: { type: String, enum: ['public', 'contacts', 'private'], default: 'public' },
      messages: { type: String, enum: ['everyone', 'contacts', 'none'], default: 'contacts' }
    }
  },
  statistics: {
    totalMessages: { type: Number, default: 0 },
    totalStories: { type: Number, default: 0 },
    totalConnections: { type: Number, default: 0 },
    loginCount: { type: Number, default: 0 }
  },
  lastLogin: { type: Date, default: Date.now },
  loginHistory: [{
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// الفهرس لتحسين الأداء
UserSchema.index({ phone: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ isOnline: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });

const MessageSchema = new mongoose.Schema({
  messageId: { 
    type: String, 
    unique: true,
    default: () => uuidv4()
  },
  senderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  receiverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  content: { 
    type: String, 
    default: '',
    maxlength: [5000, 'الرسالة يجب أن لا تتجاوز 5000 حرف']
  },
  messageType: { 
    type: String, 
    enum: ['text', 'image', 'video', 'file', 'voice', 'location'], 
    default: 'text' 
  },
  attachments: [{
    fileId: { type: String, default: () => uuidv4() },
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String,
    thumbnail: String,
    duration: Number, // للملفات الصوتية/الفيديو
    dimensions: { // للصور
      width: Number,
      height: Number
    }
  }],
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
    timestamp: { type: Date, default: Date.now }
  }],
  replyTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
  forwardedFrom: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
  isEdited: { 
    type: Boolean, 
    default: false 
  },
  editedAt: Date,
  isDeleted: { 
    type: Boolean, 
    default: false 
  },
  deletedAt: Date,
  deletedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  isRead: { 
    type: Boolean, 
    default: false 
  },
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  deliveredTo: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  encryptionKey: String, // للتشفير من طرف إلى طرف
  metadata: {
    ip: String,
    userAgent: String,
    location: {
      country: String,
      city: String
    }
  },
  timestamp: { type: Date, default: Date.now },
  expiresAt: Date // للرسائل المؤقتة
});

MessageSchema.index({ senderId: 1, receiverId: 1 });
MessageSchema.index({ timestamp: -1 });
MessageSchema.index({ messageId: 1 });
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const StorySchema = new mongoose.Schema({
  storyId: { 
    type: String, 
    unique: true,
    default: () => uuidv4()
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  mediaUrl: { 
    type: String, 
    required: true 
  },
  mediaType: { 
    type: String, 
    enum: ['image', 'video'], 
    required: true 
  },
  thumbnail: String,
  duration: Number, // مدة الفيديو بالثواني
  caption: { 
    type: String, 
    maxlength: [500, 'التعليق يجب أن لا يتجاوز 500 حرف'],
    default: '' 
  },
  location: {
    name: String,
    lat: Number,
    lng: Number
  },
  mentions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    position: { x: Number, y: Number } // موقع الإشارة في الصورة/الفيديو
  }],
  hashtags: [String],
  background: {
    color: String,
    gradient: [String],
    font: String
  },
  views: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    duration: Number, // مدة المشاهدة
    reactions: [String] // تفاعلات أثناء المشاهدة
  }],
  saves: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  replies: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    timestamp: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: false }
  }],
  statistics: {
    viewCount: { type: Number, default: 0 },
    saveCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    reach: { type: Number, default: 0 }
  },
  privacy: {
    type: String,
    enum: ['public', 'contacts', 'private', 'custom'],
    default: 'public'
  },
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  expiresAt: { 
    type: Date, 
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  isArchived: { 
    type: Boolean, 
    default: false 
  },
  archiveAt: Date,
  timestamp: { type: Date, default: Date.now }
});

StorySchema.index({ userId: 1, timestamp: -1 });
StorySchema.index({ expiresAt: 1 });
StorySchema.index({ 'hashtags': 1 });
// نماذج إضافية للميزات المتقدمة
const ConversationSchema = new mongoose.Schema({
  conversationId: { 
    type: String, 
    unique: true,
    default: () => uuidv4()
  },
  participants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  }],
  type: { 
    type: String, 
    enum: ['direct', 'group', 'channel'], 
    default: 'direct' 
  },
  name: { 
    type: String, 
    maxlength: [100, 'اسم المحادثة يجب أن لا يتجاوز 100 حرف'] 
  },
  description: { 
    type: String, 
    maxlength: [500, 'الوصف يجب أن لا يتجاوز 500 حرف'] 
  },
  avatar: String,
  coverPhoto: String,
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  admins: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  moderators: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  members: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  bannedUsers: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  settings: {
    isPublic: { type: Boolean, default: false },
    allowInvites: { type: Boolean, default: true },
    allowReactions: { type: Boolean, default: true },
    allowReplies: { type: Boolean, default: true },
    allowForwarding: { type: Boolean, default: true },
    slowMode: { type: Number, default: 0 }, // الثواني بين الرسائل
    maxMembers: { type: Number, default: 1000 }
  },
  lastMessage: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
  unreadCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  pinnedMessages: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  },
  archivedBy: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ updatedAt: -1 });

const GroupSchema = new mongoose.Schema({
  groupId: { 
    type: String, 
    unique: true,
    default: () => uuidv4()
  },
  name: { 
    type: String, 
    required: true,
    maxlength: [100, 'اسم المجموعة يجب أن لا يتجاوز 100 حرف'] 
  },
  description: { 
    type: String, 
    maxlength: [500, 'الوصف يجب أن لا يتجاوز 500 حرف'] 
  },
  avatar: String,
  coverPhoto: String,
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  category: { 
    type: String, 
    enum: ['study', 'social', 'project', 'class', 'other'],
    default: 'study' 
  },
  tags: [String],
  settings: {
    privacy: { type: String, enum: ['public', 'private', 'hidden'], default: 'public' },
    joinMethod: { type: String, enum: ['open', 'approval', 'invite'], default: 'open' },
    postPermissions: { type: String, enum: ['all', 'admins', 'moderators'], default: 'all' },
    fileSharing: { type: Boolean, default: true },
    maxMembers: { type: Number, default: 500 }
  },
  statistics: {
    memberCount: { type: Number, default: 1 },
    postCount: { type: Number, default: 0 },
    fileCount: { type: Number, default: 0 },
    activityScore: { type: Number, default: 0 }
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  notificationId: { 
    type: String, 
    unique: true,
    default: () => uuidv4()
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  type: { 
    type: String, 
    enum: ['message', 'story', 'reaction', 'mention', 'group', 'system', 'friend_request'],
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  data: { 
    type: mongoose.Schema.Types.Mixed,
    default: {} 
  },
  isRead: { 
    type: Boolean, 
    default: false 
  },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium' 
  },
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ isRead: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// إنشاء النماذج
const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Story = mongoose.model('Story', StorySchema);
const Conversation = mongoose.model('Conversation', ConversationSchema);
const Group = mongoose.model('Group', GroupSchema);
const Notification = mongoose.model('Notification', NotificationSchema);

// Middleware للنماذج
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

MessageSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = Date.now();
  }
  next();
});
// Middleware المتقدم
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(compression({
  level: 6,
  threshold: 100 * 1024 // ضغط الملفات أكبر من 100KB
}));

app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'https://yourdomain.com'
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb',
  parameterLimit: 100000
}));

// Rate Limiting المتقدم
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user ? req.user._id : req.ip;
    }
  });
};

// تطبيق معدلات مختلفة لأنواع مختلفة من الطلبات
app.use('/api/auth/', createRateLimit(15 * 60 * 1000, 10, 'محاولات تسجيل دخول كثيرة'));
app.use('/api/messages/', createRateLimit(1 * 60 * 1000, 60, 'رسائل كثيرة جداً'));
app.use('/api/stories/', createRateLimit(5 * 60 * 1000, 20, 'Stories كثيرة جداً'));
app.use('/api/admin/', createRateLimit(1 * 60 * 1000, 30, 'طلبات إدارة كثيرة'));
app.use('/api/', createRateLimit(1 * 60 * 1000, 100, 'طلبات كثيرة جداً'));

// خدمة الملفات الثابتة
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: NODE_ENV === 'production' ? '1y' : '0',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
    }
  }
}));

app.use(express.static('public', {
  maxAge: NODE_ENV === 'production' ? '1h' : '0',
  index: 'index.html'
}));

// Middleware المصادقة المتقدم
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
    const user = await User.findById(decoded.userId)
      .select('-password -loginHistory')
      .lean();

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'مستخدم غير موجود',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: 'الحساب معطل',
        code: 'ACCOUNT_DISABLED'
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
        message: 'رمز غير صالح',
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

// Middleware التحقق من صلاحيات المدير
const requireAdmin = (req, res, next) => {
  if (!req.user.role.includes('admin')) {
    return res.status(403).json({ 
      success: false,
      message: 'صلاحيات مدير مطلوبة',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
};

// Middleware التحقق من صلاحيات السوبر أدمن
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ 
      success: false,
      message: 'صلاحيات سوبر أدمن مطلوبة',
      code: 'SUPER_ADMIN_REQUIRED'
    });
  }
  next();
};

// Middleware التسجيل
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

app.use(requestLogger);

// Middleware معالجة الأخطاء
const errorHandler = (err, req, res, next) => {
  console.error('🔥 خطأ:', err);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'بيانات غير صالحة',
      errors,
      code: 'VALIDATION_ERROR'
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'معرف غير صالح',
      code: 'INVALID_ID'
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} موجود مسبقاً`,
      code: 'DUPLICATE_ENTRY'
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'حجم الملف كبير جداً',
        code: 'FILE_TOO_LARGE'
      });
    }
    return res.status(400).json({
      success: false,
      message: `خطأ في رفع الملف: ${err.message}`,
      code: 'UPLOAD_ERROR'
    });
  }

  res.status(500).json({
    success: false,
    message: 'حدث خطأ في الخادم',
    code: 'INTERNAL_SERVER_ERROR',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
};

app.use(errorHandler);
// وظائف مساعدة متقدمة
const formatUser = (user) => {
  return {
    _id: user._id,
    username: user.username,
    phone: user.phone,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    coverPhoto: user.coverPhoto,
    bio: user.bio,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
    isVerified: user.isVerified,
    settings: user.settings,
    statistics: user.statistics,
    createdAt: user.createdAt
  };
};

const formatMessage = async (message) => {
  const populatedMessage = await message
    .populate('senderId', 'username avatar isOnline')
    .populate('receiverId', 'username avatar isOnline')
    .populate('replyTo', 'content senderId attachments')
    .execPopulate();

  return {
    _id: populatedMessage._id,
    messageId: populatedMessage.messageId,
    sender: formatUser(populatedMessage.senderId),
    receiver: formatUser(populatedMessage.receiverId),
    content: populatedMessage.content,
    messageType: populatedMessage.messageType,
    attachments: populatedMessage.attachments,
    reactions: populatedMessage.reactions,
    replyTo: populatedMessage.replyTo ? {
      _id: populatedMessage.replyTo._id,
      content: populatedMessage.replyTo.content,
      sender: populatedMessage.replyTo.senderId ? {
        _id: populatedMessage.replyTo.senderId._id,
        username: populatedMessage.replyTo.senderId.username
      } : null,
      attachments: populatedMessage.replyTo.attachments
    } : null,
    isEdited: populatedMessage.isEdited,
    editedAt: populatedMessage.editedAt,
    isRead: populatedMessage.isRead,
    readBy: populatedMessage.readBy,
    timestamp: populatedMessage.timestamp,
    expiresAt: populatedMessage.expiresAt
  };
};

const formatStory = async (story) => {
  const populatedStory = await story
    .populate('userId', 'username avatar isOnline')
    .populate('mentions.userId', 'username avatar')
    .populate('views.userId', 'username avatar')
    .populate('saves.userId', 'username avatar')
    .populate('replies.userId', 'username avatar')
    .execPopulate();

  return {
    _id: populatedStory._id,
    storyId: populatedStory.storyId,
    user: formatUser(populatedStory.userId),
    mediaUrl: populatedStory.mediaUrl,
    mediaType: populatedStory.mediaType,
    thumbnail: populatedStory.thumbnail,
    duration: populatedStory.duration,
    caption: populatedStory.caption,
    location: populatedStory.location,
    mentions: populatedStory.mentions,
    hashtags: populatedStory.hashtags,
    background: populatedStory.background,
    views: populatedStory.views,
    saves: populatedStory.saves,
    replies: populatedStory.replies,
    statistics: populatedStory.statistics,
    privacy: populatedStory.privacy,
    expiresAt: populatedStory.expiresAt,
    timestamp: populatedStory.timestamp
  };
};

// خدمة معالجة الصور
const ImageProcessor = {
  async createThumbnail(inputPath, outputPath, size = { width: 300, height: 300 }) {
    try {
      await sharp(inputPath)
        .resize(size.width, size.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
      return true;
    } catch (error) {
      console.error('خطأ في إنشاء الصورة المصغرة:', error);
      return false;
    }
  },

  async compressImage(inputPath, outputPath, quality = 80) {
    try {
      await sharp(inputPath)
        .jpeg({ quality })
        .toFile(outputPath);
      return true;
    } catch (error) {
      console.error('خطأ في ضغط الصورة:', error);
      return false;
    }
  },

  async extractVideoThumbnail(videoPath, outputPath, timeInSeconds = 1) {
    // هذه الوظيفة تتطلب ffmpeg
    // يمكن تنفيذها باستخدام child_process
    return false; // مؤقتاً
  }
};

// خدمة الإشعارات
const NotificationService = {
  async createNotification(userId, type, title, message, data = {}) {
    try {
      const notification = new Notification({
        userId,
        type,
        title,
        message,
        data,
        expiresAt: moment().add(30, 'days').toDate()
      });

      await notification.save();

      // إرسال الإشعار عبر السوكيت
      io.to(userId.toString()).emit('new_notification', {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        createdAt: notification.createdAt
      });

      return notification;
    } catch (error) {
      console.error('خطأ في إنشاء الإشعار:', error);
      return null;
    }
  },

  async markAsRead(notificationId, userId) {
    try {
      await Notification.updateOne(
        { _id: notificationId, userId },
        { isRead: true }
      );
      return true;
    } catch (error) {
      console.error('خطأ في تعليم الإشعار كمقروء:', error);
      return false;
    }
  }
};

// خدمة التحليلات
const AnalyticsService = {
  async trackMessage(userId) {
    try {
      await User.findByIdAndUpdate(userId, {
        $inc: { 'statistics.totalMessages': 1 }
      });
    } catch (error) {
      console.error('خطأ في تتبع الرسالة:', error);
    }
  },

  async trackStory(userId) {
    try {
      await User.findByIdAndUpdate(userId, {
        $inc: { 'statistics.totalStories': 1 }
      });
    } catch (error) {
      console.error('خطأ في تتبع الـ Story:', error);
    }
  },

  async trackLogin(userId, ip, userAgent) {
    try {
      await User.findByIdAndUpdate(userId, {
        $inc: { 'statistics.loginCount': 1 },
        $set: { lastLogin: new Date() },
        $push: {
          loginHistory: {
            ip,
            userAgent,
            timestamp: new Date()
          }
        }
      });
    } catch (error) {
      console.error('خطأ في تتبع تسجيل الدخول:', error);
    }
  }
};

// خدمة النسخ الاحتياطي
const BackupService = {
  async createBackup() {
    try {
      const timestamp = moment().format('YYYY-MM-DD-HH-mm-ss');
      const backupPath = path.join(UPLOADS_DIR, 'backups', `backup-${timestamp}.zip`);
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          console.log(`✅ تم إنشاء النسخ الاحتياطي: ${archive.pointer()} bytes`);
          resolve({
            filename: `backup-${timestamp}.zip`,
            path: backupPath,
            size: archive.pointer()
          });
        });

        archive.on('error', (err) => {
          reject(err);
        });

        archive.pipe(output);

        // نسخ بيانات MongoDB
        const collections = mongoose.connection.collections;
        Object.keys(collections).forEach(collectionName => {
          archive.append(JSON.stringify(collections[collectionName]), { 
            name: `data/${collectionName}.json` 
          });
        });

        // نسخ الملفات المرفوعة
        archive.directory(path.join(UPLOADS_DIR, 'stories'), 'uploads/stories');
        archive.directory(path.join(UPLOADS_DIR, 'avatars'), 'uploads/avatars');
        archive.directory(path.join(UPLOADS_DIR, 'attachments'), 'uploads/attachments');

        archive.finalize();
      });
    } catch (error) {
      console.error('خطأ في إنشاء النسخ الاحتياطي:', error);
      throw error;
    }
  },

  async cleanupOldBackups(maxAgeDays = 30) {
    try {
      const backupsDir = path.join(UPLOADS_DIR, 'backups');
      const files = fs.readdirSync(backupsDir);
      const cutoff = moment().subtract(maxAgeDays, 'days');

      let deletedCount = 0;
      
      files.forEach(file => {
        const filePath = path.join(backupsDir, file);
        const stats = fs.statSync(filePath);
        
        if (moment(stats.mtime).isBefore(cutoff)) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

      console.log(`🗑️ تم حذف ${deletedCount} نسخة احتياطية قديمة`);
      return deletedCount;
    } catch (error) {
      console.error('خطأ في تنظيف النسخ الاحتياطية:', error);
      return 0;
    }
  }
};

// جدولة المهام
const scheduleTasks = () => {
  // تنظيف الـ Stories المنتهية كل ساعة
  setInterval(async () => {
    try {
      const result = await Story.deleteMany({ 
        expiresAt: { $lt: new Date() } 
      });
      if (result.deletedCount > 0) {
        console.log(`🧹 تم تنظيف ${result.deletedCount} story منتهي`);
      }
    } catch (error) {
      console.error('خطأ في تنظيف الـ Stories:', error);
    }
  }, 60 * 60 * 1000);

  // تنظيف النسخ الاحتياطية القديمة يومياً
  setInterval(async () => {
    await BackupService.cleanupOldBackups(30);
  }, 24 * 60 * 60 * 1000);

  // تحديث إحصائيات النشاط أسبوعياً
  setInterval(async () => {
    try {
      // يمكن إضافة تحديث الإحصائيات هنا
      console.log('📊 تم تحديث الإحصائيات الأسبوعية');
    } catch (error) {
      console.error('خطأ في تحديث الإحصائيات:', error);
    }
  }, 7 * 24 * 60 * 60 * 1000);
};
// مسارات المصادقة المتقدمة
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, phone, password, email } = req.body;

    // التحقق من البيانات
    if (!username || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'جميع الحقول المطلوبة',
        code: 'MISSING_FIELDS'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
        code: 'WEAK_PASSWORD'
      });
    }

    // التحقق من وجود المستخدم
    const existingUser = await User.findOne({
      $or: [{ username }, { phone }, ...(email ? [{ email }] : [])]
    });

    if (existingUser) {
      const field = existingUser.username === username ? 'اسم المستخدم' :
                   existingUser.phone === phone ? 'رقم الهاتف' : 'البريد الإلكتروني';
      return res.status(400).json({
        success: false,
        message: `${field} موجود مسبقاً`,
        code: 'USER_EXISTS'
      });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 12);

    // إنشاء المستخدم
    const user = new User({
      username,
      phone,
      email,
      password: hashedPassword
    });

    await user.save();

    // إنشاء token
    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // تتبع تسجيل الدخول
    await AnalyticsService.trackLogin(
      user._id, 
      req.ip, 
      req.get('User-Agent')
    );

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      token,
      user: formatUser(user),
      expiresIn: '30d'
    });

  } catch (error) {
    console.error('خطأ في التسجيل:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم',
      code: 'SERVER_ERROR'
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

    // البحث عن المستخدم
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'الحساب معطل',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // التحقق من كلمة المرور
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهاتف أو كلمة المرور غير صحيحة',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // تحديث حالة الاتصال
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // إنشاء token
    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // تتبع تسجيل الدخول
    await AnalyticsService.trackLogin(
      user._id, 
      req.ip, 
      req.get('User-Agent')
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: formatUser(user),
      expiresIn: '30d'
    });

  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم',
      code: 'SERVER_ERROR'
    });
  }
});

// مسارات المستخدم المتقدمة
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: formatUser(req.user)
    });
  } catch (error) {
    console.error('خطأ في جلب الملف الشخصي:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم',
      code: 'SERVER_ERROR'
    });
  }
});

app.put('/api/user/profile', authenticateToken, upload.avatars.single('avatar'), async (req, res) => {
  try {
    const { username, bio, email } = req.body;
    const updates = {};

    if (username && username !== req.user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'اسم المستخدم موجود مسبقاً',
          code: 'USERNAME_EXISTS'
        });
      }
      updates.username = username;
    }

    if (bio !== undefined) updates.bio = bio;
    if (email !== undefined) updates.email = email;

    if (req.file) {
      updates.avatar = `/uploads/avatars/${req.file.filename}`;
      
      // إنشاء صورة مصغرة
      const thumbnailPath = path.join(UPLOADS_DIR, 'avatars', `thumb-${req.file.filename}`);
      await ImageProcessor.createThumbnail(req.file.path, thumbnailPath);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'تم تحديث الملف الشخصي بنجاح',
      user: formatUser(updatedUser)
    });

  } catch (error) {
    console.error('خطأ في تحديث الملف الشخصي:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم',
      code: 'SERVER_ERROR'
    });
  }
});

// مسارات الرسائل المتقدمة
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    const { page = 1, limit = 50, before } = req.query;

    let query = {
      $or: [
        { senderId: currentUserId, receiverId: userId },
        { senderId: userId, receiverId: currentUserId }
      ],
      isDeleted: false
    };

    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('senderId', 'username avatar isOnline')
      .populate('receiverId', 'username avatar isOnline')
      .populate('replyTo', 'content senderId attachments')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // عكس الترتيب للحصول على الأقدم أولاً
    const sortedMessages = messages.reverse();

    // تحديث الرسائل كمقروءة
    await Message.updateMany(
      {
        senderId: userId,
        receiverId: currentUserId,
        isRead: false
      },
      { 
        isRead: true,
        $push: {
          readBy: {
            userId: currentUserId,
            timestamp: new Date()
          }
        }
      }
    );

    res.json({
      success: true,
      messages: await Promise.all(sortedMessages.map(formatMessage)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('خطأ في جلب الرسائل:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم',
      code: 'SERVER_ERROR'
    });
  }
});

// مسارات الـ Stories المتقدمة
app.get('/api/stories', authenticateToken, async (req, res) => {
  try {
    const stories = await Story.find({
      expiresAt: { $gt: new Date() },
      isArchived: false,
      $or: [
        { privacy: 'public' },
        { 
          privacy: 'contacts',
          userId: { $in: [] } // يمكن إضافة قائمة جهات الاتصال هنا
        },
        {
          privacy: 'custom',
          allowedUsers: req.user._id
        },
        { userId: req.user._id }
      ]
    })
    .populate('userId', 'username avatar isOnline settings')
    .populate('mentions.userId', 'username avatar')
    .sort({ timestamp: -1 });

    // تجميع الـ Stories بالمستخدم
    const storiesByUser = {};
    stories.forEach(story => {
      const userId = story.userId._id.toString();
      if (!storiesByUser[userId]) {
        storiesByUser[userId] = {
          user: formatUser(story.userId),
          stories: []
        };
      }
      storiesByUser[userId].stories.push(story);
    });

    res.json({
      success: true,
      stories: Object.values(storiesByUser)
    });

  } catch (error) {
    console.error('خطأ في جلب الـ Stories:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم',
      code: 'SERVER_ERROR'
    });
  }
});

// المسار الأساسي
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'مرحباً بكم في المنصة التعليمية المتقدمة',
    version: '2.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      user: '/api/user',
      messages: '/api/messages',
      stories: '/api/stories',
      admin: '/api/admin'
    }
  });
});

// معالج السوكيت المتقدم
io.on('connection', (socket) => {
  console.log('🔌 مستخدم متصل:', socket.id);

  socket.on('authenticate', async (userData) => {
    try {
      const user = await User.findById(userData._id);
      if (user) {
        socket.userId = user._id.toString();
        socket.username = user.username;
        socket.join(socket.userId);
        
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();
        
        io.emit('user_online', { 
          userId: user._id,
          username: user.username,
          timestamp: new Date()
        });

        console.log(`✅ ${user.username} قام بالمصادقة`);
      }
    } catch (error) {
      console.error('خطأ في مصادقة السوكيت:', error);
    }
  });

  socket.on('join_conversation', (conversationId) => {
    socket.join(conversationId);
    console.log(`💬 ${socket.username} انضم للمحادثة ${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(conversationId);
    console.log(`🚪 ${socket.username} غادر المحادثة ${conversationId}`);
  });

  socket.on('typing_start', (data) => {
    socket.to(data.conversationId).emit('user_typing', {
      userId: socket.userId,
      username: socket.username,
      conversationId: data.conversationId
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(data.conversationId).emit('user_stop_typing', {
      userId: socket.userId,
      conversationId: data.conversationId
    });
  });

  socket.on('message_delivered', async (data) => {
    try {
      await Message.findByIdAndUpdate(data.messageId, {
        $push: {
          deliveredTo: {
            userId: socket.userId,
            timestamp: new Date()
          }
        }
      });
      
      socket.to(data.senderId).emit('message_delivered', {
        messageId: data.messageId,
        deliveredTo: socket.userId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('خطأ في تحديث حالة التسليم:', error);
    }
  });

  socket.on('disconnect', async (reason) => {
    console.log(`🔌 مستخدم منقطع: ${socket.username} - ${reason}`);
    
    if (socket.userId) {
      try {
        const user = await User.findById(socket.userId);
        if (user) {
          user.isOnline = false;
          user.lastSeen = new Date();
          await user.save();
          
          io.emit('user_offline', { 
            userId: user._id,
            username: user.username,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('خطأ في تحديث حالة المستخدم:', error);
      }
    }
  });
});

// بدء الخادم
async function startServer() {
  try {
    // الاتصال بقاعدة البيانات
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ تم الاتصال بقاعدة البيانات');

    // تشغيل المهام المجدولة
    scheduleTasks();

    // بدء الخادم
    server.listen(PORT, () => {
      console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
      console.log(`🔗 رابط التطبيق: http://localhost:${PORT}`);
      console.log(`🌍 البيئة: ${NODE_ENV}`);
      console.log(`📁 مجلد الرفع: ${UPLOADS_DIR}`);
    });

  } catch (error) {
    console.error('❌ خطأ في بدء الخادم:', error);
    process.exit(1);
  }
}

// معالجة الأخطاء غير المعالجة
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ خطأ غير معالج:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ استثناء غير معالج:', error);
  process.exit(1);
});

// بدء التشغيل
startServer();
