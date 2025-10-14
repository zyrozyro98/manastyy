import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

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
const JWT_SECRET = process.env.JWT_SECRET || 'educational-platform-secret-2024';
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// إنشاء المجلدات والملفات اللازمة
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_DIR, 'stories'), { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_DIR, 'attachments'), { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_DIR, 'avatars'), { recursive: true });
}

// نظام التخزين المبسط
class SimpleDB {
  constructor() {
    this.data = this.loadData();
    this.ensureDefaultData();
  }

  loadData() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      }
    } catch (error) {
      console.log('⚠️  إنشاء ملف بيانات جديد');
    }
    return { users: [], messages: [], stories: [] };
  }

  saveData() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('❌ خطأ في حفظ البيانات:', error);
    }
  }

  ensureDefaultData() {
    if (this.data.users.length === 0) {
      // إنشاء مستخدم مسؤول افتراضي
      const adminPassword = bcrypt.hashSync('admin123', 12);
      this.data.users.push({
        _id: '1',
        username: 'admin',
        phone: '0512345678',
        password: adminPassword,
        role: 'admin',
        avatar: '',
        isOnline: false,
        createdAt: new Date().toISOString()
      });
      this.saveData();
      console.log('👤 تم إنشاء المستخدم الافتراضي: admin / admin123');
    }
  }

  // عمليات المستخدمين
  createUser(userData) {
    const user = {
      _id: uuidv4(),
      ...userData,
      createdAt: new Date().toISOString()
    };
    this.data.users.push(user);
    this.saveData();
    return user;
  }

  findUserByPhone(phone) {
    return this.data.users.find(user => user.phone === phone);
  }

  findUserById(id) {
    return this.data.users.find(user => user._id === id);
  }

  updateUser(id, updates) {
    const userIndex = this.data.users.findIndex(user => user._id === id);
    if (userIndex !== -1) {
      this.data.users[userIndex] = { ...this.data.users[userIndex], ...updates };
      this.saveData();
      return this.data.users[userIndex];
    }
    return null;
  }

  // عمليات الرسائل
  createMessage(messageData) {
    const message = {
      _id: uuidv4(),
      ...messageData,
      timestamp: new Date().toISOString(),
      isRead: false
    };
    this.data.messages.push(message);
    this.saveData();
    return message;
  }

  findMessagesBetweenUsers(user1Id, user2Id) {
    return this.data.messages.filter(message =>
      (message.senderId === user1Id && message.receiverId === user2Id) ||
      (message.senderId === user2Id && message.receiverId === user1Id)
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  // عمليات الـ Stories
  createStory(storyData) {
    const story = {
      _id: uuidv4(),
      ...storyData,
      timestamp: new Date().toISOString(),
      views: [],
      saves: []
    };
    this.data.stories.push(story);
    this.saveData();
    return story;
  }

  findActiveStories() {
    const now = new Date();
    return this.data.stories.filter(story => 
      new Date(story.expiresAt) > now
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // الإحصائيات
  getStats() {
    const now = new Date();
    return {
      totalUsers: this.data.users.length,
      totalMessages: this.data.messages.length,
      activeStories: this.data.stories.filter(story => 
        new Date(story.expiresAt) > now
      ).length,
      onlineUsers: this.data.users.filter(user => user.isOnline).length
    };
  }

  // تنظيف البيانات القديمة
  cleanup() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // تنظيف الـ Stories المنتهية
    this.data.stories = this.data.stories.filter(story => 
      new Date(story.expiresAt) > dayAgo
    );
    
    // تنظيف الرسائل القديمة (احتفظ بآخر 1000 رسالة)
    if (this.data.messages.length > 1000) {
      this.data.messages = this.data.messages.slice(-1000);
    }
    
    this.saveData();
  }
}

// إنشاء قاعدة البيانات
const db = new SimpleDB();

// تنظيف البيانات كل ساعة
setInterval(() => db.cleanup(), 60 * 60 * 1000);

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
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static('public'));

// Middleware المصادقة
const authenticateToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'رمز الوصول مطلوب' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.findUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'مستخدم غير موجود' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'رمز وصول غير صالح' });
  }
};

// وظائف مساعدة
const formatUser = (user) => {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

// ========== المسارات ==========

// 📍 المسار الأساسي
app.get('/', (req, res) => {
  res.json({
    message: '🚀 منصة التعليمية تعمل بنجاح!',
    version: '2.0.0',
    storage: 'ملف بيانات محلي',
    endpoints: {
      'POST /api/auth/register': 'تسجيل مستخدم جديد',
      'POST /api/auth/login': 'تسجيل الدخول',
      'GET /api/user/profile': 'الملف الشخصي (يتطلب مصادقة)',
      'GET /api/messages/:userId': 'جلب الرسائل (يتطلب مصادقة)',
      'POST /api/messages/send': 'إرسال رسالة (يتطلب مصادقة)',
      'GET /api/stories': 'جلب الـ Stories (يتطلب مصادقة)',
      'POST /api/stories/upload': 'رفع Story (يتطلب مصادقة)',
      'GET /api/stats': 'إحصائيات المنصة'
    }
  });
});

// 🔐 مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, phone, password } = req.body;

    if (!username || !phone || !password) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const existingUser = db.findUserByPhone(phone);
    if (existingUser) {
      return res.status(400).json({ message: 'رقم الهاتف موجود مسبقاً' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = db.createUser({
      username,
      phone,
      password: hashedPassword,
      role: 'student',
      avatar: '',
      isOnline: false
    });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح 🎉',
      token,
      user: formatUser(user)
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
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: 'رقم الهاتف وكلمة المرور مطلوبان' });
    }

    const user = db.findUserByPhone(phone);
    if (!user) {
      return res.status(400).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // تحديث حالة المستخدم
    db.updateUser(user._id, {
      isOnline: true,
      lastSeen: new Date().toISOString()
    });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: `مرحباً بعودتك ${user.username}! 👋`,
      token,
      user: formatUser(user)
    });

  } catch (error) {
    console.error('❌ خطأ في تسجيل الدخول:', error);
    res.status(500).json({ 
      success: false,
      message: 'خطأ في الخادم' 
    });
  }
});

// 👤 مسارات المستخدم
app.get('/api/user/profile', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: formatUser(req.user)
  });
});

app.get('/api/user/stats', authenticateToken, (req, res) => {
  const userMessages = db.data.messages.filter(
    msg => msg.receiverId === req.user._id && !msg.isRead
  ).length;

  res.json({
    success: true,
    stats: {
      unreadMessages: userMessages,
      newMaterials: Math.floor(Math.random() * 5),
      pendingTasks: Math.floor(Math.random() * 3),
      upcomingEvents: Math.floor(Math.random() * 2)
    }
  });
});

// 💬 مسارات الرسائل
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
  try {
    const messages = db.findMessagesBetweenUsers(req.user._id, req.params.userId);

    // إضافة معلومات المرسل والمستقبل
    const formattedMessages = messages.map(message => {
      const sender = db.findUserById(message.senderId);
      const receiver = db.findUserById(message.receiverId);
      
      return {
        ...message,
        senderUsername: sender?.username || 'مستخدم',
        receiverUsername: receiver?.username || 'مستخدم',
        senderAvatar: sender?.avatar || ''
      };
    });

    res.json({
      success: true,
      messages: formattedMessages
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الرسائل:', error);
    res.status(500).json({ 
      success: false,
      message: 'خطأ في الخادم' 
    });
  }
});

app.post('/api/messages/send', authenticateToken, upload.array('attachments', 5), (req, res) => {
  try {
    const { receiverId, content } = req.body;
    
    if (!receiverId) {
      return res.status(400).json({ message: 'المستلم مطلوب' });
    }

    const receiver = db.findUserById(receiverId);
    if (!receiver) {
      return res.status(400).json({ message: 'المستخدم المستقبل غير موجود' });
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

    const message = db.createMessage({
      senderId: req.user._id,
      receiverId,
      content: content || '',
      attachments,
      messageType: attachments.length > 0 ? 'file' : 'text'
    });

    // إرسال عبر السوكيت
    io.to(receiverId).emit('new_message', {
      ...message,
      senderUsername: req.user.username,
      senderAvatar: req.user.avatar
    });

    res.status(201).json({
      success: true,
      message: 'تم إرسال الرسالة بنجاح 📨',
      data: message
    });

  } catch (error) {
    console.error('❌ خطأ في إرسال الرسالة:', error);
    res.status(500).json({ 
      success: false,
      message: 'خطأ في الخادم' 
    });
  }
});

// 📸 مسارات الـ Stories
app.get('/api/stories', authenticateToken, (req, res) => {
  try {
    const stories = db.findActiveStories();

    // تجميع الـ Stories بالمستخدم
    const storiesByUser = {};
    stories.forEach(story => {
      const user = db.findUserById(story.userId);
      if (user) {
        const userId = user._id;
        if (!storiesByUser[userId]) {
          storiesByUser[userId] = {
            user: formatUser(user),
            stories: []
          };
        }
        
        // إضافة معلومات المشاهدات والحفظ
        const storyWithDetails = {
          ...story,
          viewCount: story.views.length,
          saveCount: story.saves.length,
          hasViewed: story.views.some(view => view.userId === req.user._id),
          hasSaved: story.saves.some(save => save.userId === req.user._id)
        };

        storiesByUser[userId].stories.push(storyWithDetails);
      }
    });

    res.json({
      success: true,
      stories: Object.values(storiesByUser)
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الـ Stories:', error);
    res.status(500).json({ 
      success: false,
      message: 'خطأ في الخادم' 
    });
  }
});

app.post('/api/stories/upload', authenticateToken, upload.single('media'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'الملف مطلوب' });
    }

    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    const mediaUrl = `/uploads/stories/${req.file.filename}`;

    const story = db.createStory({
      userId: req.user._id,
      mediaUrl,
      mediaType,
      caption: req.body.caption || '',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 ساعة
    });

    // إرسال الإشعار عبر السوكيت
    io.emit('new_story', {
      ...story,
      user: formatUser(req.user)
    });

    res.status(201).json({
      success: true,
      message: 'تم نشر الـ Story بنجاح 🎊',
      story: {
        ...story,
        user: formatUser(req.user)
      }
    });

  } catch (error) {
    console.error('❌ خطأ في رفع الـ Story:', error);
    res.status(500).json({ 
      success: false,
      message: 'خطأ في الخادم' 
    });
  }
});

// 📊 مسارات الإحصائيات
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({
      success: true,
      ...stats,
      message: 'إحصائيات المنصة 📈'
    });
  } catch (error) {
    res.json({
      success: true,
      totalUsers: 1,
      totalMessages: 0,
      activeStories: 0,
      onlineUsers: 0,
      message: 'إحصائيات أولية'
    });
  }
});

// 🔌 نظام السوكيت
io.on('connection', (socket) => {
  console.log('🔌 مستخدم متصل:', socket.id);

  socket.on('authenticate', (userData) => {
    const user = db.findUserById(userData._id);
    if (user) {
      socket.userId = user._id;
      socket.join(socket.userId);
      
      db.updateUser(user._id, {
        isOnline: true,
        lastSeen: new Date().toISOString()
      });
      
      io.emit('user_online', { 
        userId: user._id,
        username: user.username 
      });
      
      console.log(`✅ ${user.username} قام بالمصادقة`);
    }
  });

  socket.on('typing_start', (data) => {
    socket.to(data.receiverId).emit('user_typing', {
      userId: socket.userId,
      username: data.username
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(data.receiverId).emit('user_stop_typing', {
      userId: socket.userId
    });
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      const user = db.findUserById(socket.userId);
      if (user) {
        db.updateUser(user._id, {
          isOnline: false,
          lastSeen: new Date().toISOString()
        });
        
        io.emit('user_offline', { 
          userId: user._id,
          username: user.username 
        });
        
        console.log(`❌ ${user.username} انقطع`);
      }
    }
  });
});

// 🚀 بدء الخادم
server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 منصة التعليمية تعمل بنجاح!');
  console.log('='.repeat(50));
  console.log(`📍 الرابط: http://localhost:${PORT}`);
  console.log(`📊 الإحصائيات: http://localhost:${PORT}/api/stats`);
  console.log(`💾 التخزين: ملف data.json محلي`);
  console.log('👤 المستخدم الافتراضي: admin / admin123');
  console.log('='.repeat(50));
});
