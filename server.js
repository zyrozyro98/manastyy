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
import { fileURLToPath } from 'url';

// تحميل متغيرات البيئة
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// إعدادات Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// الثوابت والإعدادات
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';
const JWT_SECRET = process.env.JWT_SECRET || 'educational-platform-secret-2024';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// إنشاء المجلدات اللازمة
const ensureDirectories = () => {
  const directories = [
    UPLOADS_DIR,
    path.join(UPLOADS_DIR, 'stories'),
    path.join(UPLOADS_DIR, 'attachments'),
    path.join(UPLOADS_DIR, 'avatars')
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 تم إنشاء المجلد: ${dir}`);
    }
  });
};

ensureDirectories();

// إعدادات Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = file.fieldname === 'storyMedia' ? 'stories' : 'attachments';
    const dir = path.join(UPLOADS_DIR, type);
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

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || "*",
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'تم تجاوز عدد الطلبات المسموح بها' }
});
app.use(limiter);

// خدمة الملفات الثابتة
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static('public'));

// نماذج MongoDB
const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  phone: { 
    type: String, 
    required: true, 
    unique: true,
    match: [/^05\d{8}$/, 'رقم الهاتف يجب أن يبدأ بـ 05 ويحتوي على 10 أرقام']
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  role: { 
    type: String, 
    enum: ['student', 'teacher', 'admin'], 
    default: 'student' 
  },
  avatar: { 
    type: String, 
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
    chatTheme: { type: String, default: 'default' }
  },
  statistics: {
    totalMessages: { type: Number, default: 0 },
    totalStories: { type: Number, default: 0 },
    loginCount: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

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
    maxlength: 5000
  },
  messageType: { 
    type: String, 
    enum: ['text', 'image', 'video', 'file'], 
    default: 'text' 
  },
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
  isRead: { 
    type: Boolean, 
    default: false 
  },
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  timestamp: { type: Date, default: Date.now }
});

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
  caption: { 
    type: String, 
    maxlength: 500,
    default: '' 
  },
  views: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  saves: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  expiresAt: { 
    type: Date, 
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  timestamp: { type: Date, default: Date.now }
});

// إنشاء النماذج
const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Story = mongoose.model('Story', StorySchema);

// Middleware المصادقة
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'رمز الوصول مطلوب' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'مستخدم غير موجود' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'الحساب معطل' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'رمز وصول غير صالح' });
  }
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
    isVerified: user.isVerified,
    settings: user.settings,
    statistics: user.statistics,
    createdAt: user.createdAt
  };
};

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, phone, password } = req.body;

    if (!username || !phone || !password) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({ message: 'اسم المستخدم أو رقم الهاتف موجود مسبقاً' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      username,
      phone,
      password: hashedPassword
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      token,
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

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    user.isOnline = true;
    user.lastSeen = new Date();
    user.statistics.loginCount += 1;
    await user.save();

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
    const unreadMessages = await Message.countDocuments({
      receiverId: req.user._id,
      isRead: false
    });

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

// مسارات الرسائل
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: userId },
        { senderId: userId, receiverId: currentUserId }
      ]
    })
    .populate('senderId', 'username avatar isOnline')
    .populate('receiverId', 'username avatar isOnline')
    .sort({ timestamp: 1 });

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

    res.json(messages);
  } catch (error) {
    console.error('خطأ في جلب الرسائل:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.post('/api/messages/send', authenticateToken, upload.array('attachments', 10), async (req, res) => {
  try {
    const { receiverId, content } = req.body;
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

    const message = new Message({
      senderId,
      receiverId,
      content: content || '',
      attachments,
      messageType: attachments.length > 0 ? 'file' : 'text'
    });

    await message.save();
    await message.populate('senderId', 'username avatar isOnline');
    await message.populate('receiverId', 'username avatar isOnline');

    // تحديث إحصائيات المستخدم
    await User.findByIdAndUpdate(senderId, {
      $inc: { 'statistics.totalMessages': 1 }
    });

    // إرسال الرسالة عبر السوكيت
    io.to(receiverId).emit('new_message', message);

    res.status(201).json(message);
  } catch (error) {
    console.error('خطأ في إرسال الرسالة:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// مسارات الـ Stories
app.get('/api/stories', authenticateToken, async (req, res) => {
  try {
    const stories = await Story.find({
      expiresAt: { $gt: new Date() }
    })
    .populate('userId', 'username avatar isOnline settings')
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

    const story = new Story({
      userId: req.user._id,
      mediaUrl,
      mediaType,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 ساعة
    });

    await story.save();
    await story.populate('userId', 'username avatar isOnline');

    // تحديث إحصائيات المستخدم
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'statistics.totalStories': 1 }
    });

    // إرسال الـ Story عبر السوكيت
    io.emit('new_story', story);

    res.status(201).json(story);
  } catch (error) {
    console.error('خطأ في رفع الـ Story:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// مسارات الإحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalMessages = await Message.countDocuments();
    const activeStories = await Story.countDocuments({ expiresAt: { $gt: new Date() } });
    const onlineUsers = await User.countDocuments({ isOnline: true });

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

// إعدادات السوكيت
io.on('connection', (socket) => {
  console.log('🔌 مستخدم متصل:', socket.id);

  socket.on('authenticate', async (userData) => {
    try {
      const user = await User.findById(userData._id);
      if (user) {
        socket.userId = user._id.toString();
        socket.join(socket.userId);
        
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();
        
        io.emit('user_online', { userId: user._id });
        console.log(`✅ ${user.username} قام بالمصادقة`);
      }
    } catch (error) {
      console.error('خطأ في مصادقة السوكيت:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('🔌 مستخدم منقطع:', socket.id);
    
    if (socket.userId) {
      try {
        const user = await User.findById(socket.userId);
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

// تنظيف الـ Stories المنتهية
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
}, 60 * 60 * 1000); // كل ساعة

// المسار الأساسي
app.get('/', (req, res) => {
  res.json({
    message: 'مرحباً بكم في المنصة التعليمية',
    status: 'يعمل بنجاح',
    version: '1.0.0',
    database: 'MongoDB Atlas',
    endpoints: {
      auth: '/api/auth',
      messages: '/api/messages',
      stories: '/api/stories',
      user: '/api/user',
      stats: '/api/stats'
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
    });

    console.log('✅ تم الاتصال بقاعدة البيانات MongoDB Atlas');

    // بدء الخادم
    server.listen(PORT, () => {
      console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
      console.log(`🔗 رابط التطبيق: http://localhost:${PORT}`);
      console.log('💾 قاعدة البيانات: MongoDB Atlas');
      console.log('📁 مجلدات الرفع جاهزة');
    });

  } catch (error) {
    console.error('❌ خطأ في بدء الخادم:', error);
    process.exit(1);
  }
}

startServer();
