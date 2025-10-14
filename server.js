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
import { fileURLToPath } from 'url';

// تحميل متغيرات البيئة
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// الإعدادات
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

console.log('🔧 جاري التشغيل مع الإعدادات:');
console.log('   - PORT:', PORT);
console.log('   - MONGODB_URI:', MONGODB_URI ? '✅ معرّف' : '❌ غير معرّف');

// إنشاء مجلدات الرفع
const UPLOADS_DIR = path.join(__dirname, 'uploads');
[UPLOADS_DIR, path.join(UPLOADS_DIR, 'stories'), path.join(UPLOADS_DIR, 'attachments')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware الأساسي
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static('public'));

// إعدادات Multer
const upload = multer({ 
  dest: UPLOADS_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// نماذج MongoDB المبسطة
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'student' },
  avatar: { type: String, default: '' },
  isOnline: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const StorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  expiresAt: { type: Date, required: true },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Story = mongoose.model('Story', StorySchema);

// Middleware المصادقة
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'رمز الوصول مطلوب' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(401).json({ message: 'مستخدم غير موجود' });

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'رمز وصول غير صالح' });
  }
};

// المسارات الأساسية
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, phone, password } = req.body;
    
    if (!username || !phone || !password) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ message: 'المستخدم موجود مسبقاً' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ username, phone, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      token,
      user: { _id: user._id, username: user.username, phone: user.phone, role: user.role }
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
      return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
    }

    user.isOnline = true;
    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: { _id: user._id, username: user.username, phone: user.phone, role: user.role, isOnline: true }
    });
  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// مسارات الرسائل
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.user._id, receiverId: req.params.userId },
        { senderId: req.params.userId, receiverId: req.user._id }
      ]
    }).populate('senderId', 'username').sort({ timestamp: 1 });

    res.json(messages);
  } catch (error) {
    console.error('خطأ في جلب الرسائل:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.post('/api/messages/send', authenticateToken, async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    
    const message = new Message({
      senderId: req.user._id,
      receiverId,
      content
    });

    await message.save();
    await message.populate('senderId', 'username');

    // إرسال عبر السوكيت
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
    }).populate('userId', 'username').sort({ timestamp: -1 });

    res.json(stories);
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
    const mediaUrl = `/uploads/${req.file.filename}`;

    const story = new Story({
      userId: req.user._id,
      mediaUrl,
      mediaType,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await story.save();
    await story.populate('userId', 'username');

    io.emit('new_story', story);

    res.status(201).json(story);
  } catch (error) {
    console.error('خطأ في رفع الـ Story:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// إحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalMessages = await Message.countDocuments();
    const activeStories = await Story.countDocuments({ expiresAt: { $gt: new Date() } });
    const onlineUsers = await User.countDocuments({ isOnline: true });

    res.json({ totalUsers, totalMessages, activeStories, onlineUsers });
  } catch (error) {
    res.json({ totalUsers: 0, totalMessages: 0, activeStories: 0, onlineUsers: 0 });
  }
});

// السوكيت
io.on('connection', (socket) => {
  console.log('👤 مستخدم متصل:', socket.id);

  socket.on('authenticate', async (userData) => {
    const user = await User.findById(userData._id);
    if (user) {
      socket.userId = user._id.toString();
      socket.join(socket.userId);
      user.isOnline = true;
      await user.save();
      io.emit('user_online', { userId: user._id });
    }
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      const user = await User.findById(socket.userId);
      if (user) {
        user.isOnline = false;
        await user.save();
        io.emit('user_offline', { userId: user._id });
      }
    }
  });
});

// المسار الرئيسي
app.get('/', (req, res) => {
  res.json({
    message: '🚀 منصة التعليمية تعمل بنجاح!',
    version: '1.0.0',
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login', 
      'GET /api/messages/:userId',
      'POST /api/messages/send',
      'GET /api/stories',
      'POST /api/stories/upload',
      'GET /api/stats'
    ]
  });
});

// بدء الخادم
async function startServer() {
  try {
    console.log('🔄 جاري الاتصال بقاعدة البيانات...');
    
    // إعدادات اتصال MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح!');
    
    server.listen(PORT, () => {
      console.log(`🎉 الخادم يعمل على: https://your-app-name.onrender.com`);
      console.log(`📊 استخدم /api/stats للتحقق من الإحصائيات`);
    });
    
  } catch (error) {
    console.error('❌ فشل في الاتصال بقاعدة البيانات:', error.message);
    console.log('💡 تأكد من:');
    console.log('   1. صحة سلسلة اتصال MongoDB Atlas');
    console.log('   2. أن كلمة المرور صحيحة');
    console.log('   3. أن عنوان IP مضاف في قائمة الوصول في MongoDB Atlas');
    
    // تشغيل بدون قاعدة بيانات (للطوارئ)
    server.listen(PORT, () => {
      console.log(`⚠️  الخادم يعمل بدون قاعدة البيانات على PORT: ${PORT}`);
    });
  }
}

startServer();
