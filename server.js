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

// تحميل متغيرات البيئة
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// الثوابت والإعدادات
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const UPLOADS_DIR = './uploads';

// التأكد من وجود مجلد الرفع
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// إعدادات Multer للرفع
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = file.fieldname === 'storyMedia' ? 'stories' : 'attachments';
    const dir = path.join(UPLOADS_DIR, type);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
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
      'image/jpeg': true,
      'image/png': true,
      'image/gif': true,
      'video/mp4': true,
      'video/quicktime': true
    };
    
    if (allowedTypes[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'), false);
    }
  }
});

// Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 1000, // حد لكل IP
  message: {
    error: 'تم تجاوز عدد الطلبات المسموح بها، يرجى المحاولة لاحقاً'
  }
});
app.use(limiter);

// خدمة الملفات الثابتة
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static('public'));

// نماذج MongoDB
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  avatar: { type: String, default: '' },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  settings: {
    hideOnlineStatus: { type: Boolean, default: false },
    hideLastSeen: { type: Boolean, default: false },
    hideStoryViews: { type: Boolean, default: false },
    chatTheme: { type: String, default: 'default' }
  },
  createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String
  }],
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
    timestamp: { type: Date, default: Date.now }
  }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const StorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  caption: { type: String, default: '' },
  views: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  saves: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  expiresAt: { type: Date, required: true },
  timestamp: { type: Date, default: Date.now }
});

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  unreadCount: { type: Map, of: Number, default: {} },
  updatedAt: { type: Date, default: Date.now }
});

const models = {
  User: mongoose.model('User', UserSchema),
  Message: mongoose.model('Message', MessageSchema),
  Story: mongoose.model('Story', StorySchema),
  Conversation: mongoose.model('Conversation', ConversationSchema)
};
// Middleware المصادقة
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'رمز الوصول مطلوب' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await models.User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'مستخدم غير موجود' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'رمز وصول غير صالح' });
  }
};

// Middleware التحقق من صلاحيات المدير
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'صلاحيات مدير مطلوبة' });
  }
  next();
};

// وظائف مساعدة
const formatUser = (user) => {
  return {
    _id: user._id,
    username: user.username,
    phone: user.phone,
    role: user.role,
    avatar: user.avatar,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
    settings: user.settings
  };
};

const formatMessage = (message) => {
  return {
    _id: message._id,
    senderId: message.senderId,
    receiverId: message.receiverId,
    content: message.content,
    attachments: message.attachments,
    reactions: message.reactions,
    replyTo: message.replyTo,
    isRead: message.isRead,
    timestamp: message.timestamp,
    senderUsername: message.senderId?.username || 'مستخدم'
  };
};

const formatStory = (story) => {
  return {
    _id: story._id,
    userId: story.userId,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    caption: story.caption,
    views: story.views,
    saves: story.saves,
    expiresAt: story.expiresAt,
    timestamp: story.timestamp,
    user: story.userId ? formatUser(story.userId) : null
  };
};

// تنظيف الـ Stories المنتهية
const cleanupExpiredStories = async () => {
  try {
    const result = await models.Story.deleteMany({ 
      expiresAt: { $lt: new Date() } 
    });
    console.log(`تم تنظيف ${result.deletedCount} story منتهي`);
  } catch (error) {
    console.error('خطأ في تنظيف الـ Stories:', error);
  }
};

// جدولة تنظيف الـ Stories كل ساعة
setInterval(cleanupExpiredStories, 60 * 60 * 1000);

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, phone, password } = req.body;

    // التحقق من البيانات
    if (!username || !phone || !password) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    // التحقق من وجود المستخدم
    const existingUser = await models.User.findOne({
      $or: [{ username }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({ message: 'اسم المستخدم أو رقم الهاتف موجود مسبقاً' });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 12);

    // إنشاء المستخدم
    const user = new models.User({
      username,
      phone,
      password: hashedPassword
    });

    await user.save();

    res.status(201).json({ 
      message: 'تم إنشاء الحساب بنجاح',
      user: formatUser(user)
    });
  } catch (error) {
    console.error('خطأ في التسجيل:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: 'رقم الهاتف وكلمة المرور مطلوبان' });
    }

    // البحث عن المستخدم
    const user = await models.User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // التحقق من كلمة المرور
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // تحديث حالة الاتصال
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // إنشاء token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: formatUser(user)
    });
  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// مسارات المستخدم
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    res.json({ user: formatUser(req.user) });
  } catch (error) {
    console.error('خطأ في جلب الملف الشخصي:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.get('/api/user/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;

    const unreadMessages = await models.Message.countDocuments({
      receiverId: userId,
      isRead: false
    });

    // إحصائيات افتراضية للعرض
    const stats = {
      unreadMessages,
      newMaterials: Math.floor(Math.random() * 5),
      pendingTasks: Math.floor(Math.random() * 3),
      upcomingEvents: Math.floor(Math.random() * 2)
    };

    res.json(stats);
  } catch (error) {
    console.error('خطأ في جلب الإحصائيات:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.post('/api/user/settings', authenticateToken, async (req, res) => {
  try {
    const { hideOnlineStatus, hideLastSeen, hideStoryViews, chatTheme } = req.body;

    req.user.settings = {
      hideOnlineStatus: hideOnlineStatus || false,
      hideLastSeen: hideLastSeen || false,
      hideStoryViews: hideStoryViews || false,
      chatTheme: chatTheme || 'default'
    };

    await req.user.save();

    res.json({ 
      message: 'تم حفظ الإعدادات بنجاح',
      settings: req.user.settings 
    });
  } catch (error) {
    console.error('خطأ في حفظ الإعدادات:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.get('/api/user/settings', authenticateToken, async (req, res) => {
  try {
    res.json({ settings: req.user.settings });
  } catch (error) {
    console.error('خطأ في جلب الإعدادات:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});
// مسارات الرسائل
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const messages = await models.Message.find({
      $or: [
        { senderId: currentUserId, receiverId: userId },
        { senderId: userId, receiverId: currentUserId }
      ]
    })
    .populate('senderId', 'username avatar')
    .sort({ timestamp: 1 });

    // تحديث الرسائل كمقروءة
    await models.Message.updateMany(
      {
        senderId: userId,
        receiverId: currentUserId,
        isRead: false
      },
      { isRead: true }
    );

    res.json(messages.map(formatMessage));
  } catch (error) {
    console.error('خطأ في جلب الرسائل:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.post('/api/messages/send', authenticateToken, upload.array('attachments', 10), async (req, res) => {
  try {
    const { receiverId, content, replyTo } = req.body;
    const senderId = req.user._id;

    if (!receiverId) {
      return res.status(400).json({ message: 'المستلم مطلوب' });
    }

    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: `/uploads/attachments/${file.filename}`
        });
      });
    }

    const message = new models.Message({
      senderId,
      receiverId,
      content: content || '',
      attachments,
      replyTo: replyTo || null,
      timestamp: new Date()
    });

    await message.save();
    await message.populate('senderId', 'username avatar');

    // تحديث المحادثة
    await updateConversation(senderId, receiverId, message._id);

    // إرسال الرسالة عبر السوكيت
    io.to(receiverId).emit('new_message', formatMessage(message));

    res.status(201).json(formatMessage(message));
  } catch (error) {
    console.error('خطأ في إرسال الرسالة:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// مسارات الـ Stories
app.get('/api/stories', authenticateToken, async (req, res) => {
  try {
    const stories = await models.Story.find({
      expiresAt: { $gt: new Date() }
    })
    .populate('userId', 'username avatar')
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
      storiesByUser[userId].stories.push(formatStory(story));
    });

    res.json(Object.values(storiesByUser));
  } catch (error) {
    console.error('خطأ في جلب الـ Stories:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.post('/api/stories/upload', authenticateToken, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'الملف مطلوب' });
    }

    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    const mediaUrl = `/uploads/stories/${req.file.filename}`;

    const story = new models.Story({
      userId: req.user._id,
      mediaUrl,
      mediaType,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 ساعة
    });

    await story.save();
    await story.populate('userId', 'username avatar');

    // إرسال الـ Story عبر السوكيت
    io.emit('new_story', formatStory(story));

    res.status(201).json(formatStory(story));
  } catch (error) {
    console.error('خطأ في رفع الـ Story:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.post('/api/stories/:storyId/save', authenticateToken, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user._id;

    const story = await models.Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ message: 'الـ Story غير موجود' });
    }

    const alreadySaved = story.saves.some(save => save.userId.toString() === userId.toString());
    if (!alreadySaved) {
      story.saves.push({ userId, timestamp: new Date() });
      await story.save();
    }

    res.json({ message: 'تم حفظ الـ Story بنجاح' });
  } catch (error) {
    console.error('خطأ في حفظ الـ Story:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// مسارات الإدارة
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await models.User.find().select('-password').sort({ createdAt: -1 });
    res.json(users.map(formatUser));
  } catch (error) {
    console.error('خطأ في جلب المستخدمين:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'لا يمكن حذف حسابك الخاص' });
    }

    await models.User.findByIdAndDelete(userId);
    
    // حذف البيانات المرتبطة
    await models.Message.deleteMany({
      $or: [{ senderId: userId }, { receiverId: userId }]
    });
    
    await models.Story.deleteMany({ userId });

    io.emit('user_deleted', { userId });

    res.json({ message: 'تم حذف المستخدم بنجاح' });
  } catch (error) {
    console.error('خطأ في حذف المستخدم:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// مسارات إضافية
app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await models.User.countDocuments();
    const totalMessages = await models.Message.countDocuments();
    const activeStories = await models.Story.countDocuments({ expiresAt: { $gt: new Date() } });
    
    // مستخدمين متصلين (افتراضي)
    const onlineUsers = await models.User.countDocuments({ isOnline: true });

    res.json({
      totalUsers,
      totalMessages,
      activeStories,
      onlineUsers
    });
  } catch (error) {
    console.error('خطأ في جلب الإحصائيات:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// وظائف مساعدة
async function updateConversation(user1Id, user2Id, messageId) {
  const participants = [user1Id, user2Id].sort();
  
  let conversation = await models.Conversation.findOne({
    participants: { $all: participants }
  });

  if (!conversation) {
    conversation = new models.Conversation({
      participants,
      lastMessage: messageId
    });
  } else {
    conversation.lastMessage = messageId;
    conversation.updatedAt = new Date();
  }

  await conversation.save();
}

// إعدادات السوكيت
io.on('connection', (socket) => {
  console.log('مستخدم متصل:', socket.id);

  socket.on('authenticate', async (userData) => {
    try {
      const user = await models.User.findById(userData._id);
      if (user) {
        socket.userId = user._id.toString();
        socket.join(socket.userId);
        
        user.isOnline = true;
        await user.save();
        
        io.emit('user_online', { userId: user._id });
      }
    } catch (error) {
      console.error('خطأ في مصادقة السوكيت:', error);
    }
  });

  socket.on('user_typing', (data) => {
    socket.to(data.receiverId).emit('user_typing', {
      userId: socket.userId,
      username: data.username
    });
  });

  socket.on('user_stop_typing', (data) => {
    socket.to(data.receiverId).emit('user_stop_typing', {
      userId: socket.userId
    });
  });

  socket.on('disconnect', async () => {
    console.log('مستخدم منقطع:', socket.id);
    
    if (socket.userId) {
      try {
        const user = await models.User.findById(socket.userId);
        if (user) {
          user.isOnline = false;
          user.lastSeen = new Date();
          await user.save();
          
          io.emit('user_offline', { userId: user._id });
        }
      } catch (error) {
        console.error('خطأ في تحديث حالة المستخدم:', error);
      }
    }
  });
});

// مسار افتراضي
app.get('/', (req, res) => {
  res.json({
    message: 'مرحباً بكم في المنصة التعليمية',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      messages: '/api/messages',
      stories: '/api/stories',
      admin: '/api/admin'
    }
  });
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error('خطأ:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'حجم الملف كبير جداً' });
    }
  }
  
  res.status(500).json({ message: 'حدث خطأ في الخادم' });
});

// بدء الخادم
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('تم الاتصال بقاعدة البيانات');

    server.listen(PORT, () => {
      console.log(`الخادم يعمل على المنفذ ${PORT}`);
      console.log(`رابط التطبيق: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('خطأ في بدء الخادم:', error);
    process.exit(1);
  }
}

startServer();
