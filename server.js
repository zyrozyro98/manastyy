const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// إعدادات البيئة
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// وسائط middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// إنشاء مجلد التحميلات إذا لم يكن موجوداً
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
    fs.mkdirSync('uploads/profiles');
    fs.mkdirSync('uploads/stories');
    fs.mkdirSync('uploads/channels');
}

// إعداد multer للتحميلات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'uploads/';
        if (file.fieldname === 'avatar') {
            uploadPath += 'profiles/';
        } else if (file.fieldname === 'story') {
            uploadPath += 'stories/';
        } else if (file.fieldname === 'channelAvatar') {
            uploadPath += 'channels/';
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = {
            'avatar': ['image/jpeg', 'image/png', 'image/gif'],
            'story': ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime'],
            'channelAvatar': ['image/jpeg', 'image/png', 'image/gif']
        };
        
        if (allowedTypes[file.fieldname] && allowedTypes[file.fieldname].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`نوع الملف غير مدعوم للمجال: ${file.fieldname}`), false);
        }
    }
});

// نماذج MongoDB
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    university: { type: String, required: true },
    major: { type: String, required: true },
    batch: { type: String, required: true },
    password: { type: String, required: true },
    avatar: { type: String },
    bio: { type: String },
    role: { type: String, enum: ['student', 'moderator', 'admin'], default: 'student' },
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    settings: {
        privacy: {
            hideOnlineStatus: { type: Boolean, default: false },
            hideLastSeen: { type: Boolean, default: false },
            hideStoryViews: { type: Boolean, default: false },
            profileVisibility: { type: String, enum: ['public', 'private'], default: 'public' }
        },
        notificationSettings: {
            messages: { type: Boolean, default: true },
            stories: { type: Boolean, default: true },
            channels: { type: Boolean, default: true },
            system: { type: Boolean, default: true }
        },
        appearance: {
            theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
            fontSize: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
            background: { type: String, default: 'default' }
        }
    }
}, { timestamps: true });

const storySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    caption: { type: String },
    allowReplies: { type: Boolean, default: true },
    allowSharing: { type: Boolean, default: true },
    views: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reactions: [{ 
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, enum: ['like', 'love', 'laugh'] }
    }],
    replies: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    messageType: { type: String, enum: ['text', 'image', 'video', 'file'], default: 'text' },
    fileUrl: { type: String },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reactions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String }
    }]
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    isGroup: { type: Boolean, default: false },
    groupName: { type: String },
    groupAvatar: { type: String },
    groupAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    }
}, { timestamps: true });

const channelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['channel', 'group', 'broadcast'], required: true },
    avatar: { type: String },
    isPublic: { type: Boolean, default: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    settings: {
        allowMessages: { type: Boolean, default: true },
        allowFiles: { type: Boolean, default: true },
        approvalRequired: { type: Boolean, default: false }
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Story = mongoose.model('Story', storySchema);
const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Channel = mongoose.model('Channel', channelSchema);

// middleware المصادقة
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'رمز الوصول مطلوب' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, message: 'المستخدم غير موجود أو غير نشط' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'رمز وصول غير صالح' });
    }
};

// middleware للتحقق من صلاحيات المدير
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'صلاحيات مدير مطلوبة' });
    }
    next();
};

// دوال مساعدة
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
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
        isOnline: false, // سيتم تحديثه من Socket.IO
        lastSeen: user.lastSeen,
        settings: user.settings,
        createdAt: user.createdAt
    };
};

// الاتصال بقاعدة البيانات
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
})
.catch((error) => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error);
    process.exit(1);
});

// تخزين للمستخدمين المتصلين
const connectedUsers = new Map();

// إعداد Socket.IO
io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('user_connected', async (userId) => {
        try {
            const user = await User.findById(userId);
            if (user) {
                connectedUsers.set(userId, socket.id);
                socket.userId = userId;
                
                // تحديث حالة الاتصال
                await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
                
                // إعلام المستخدمين الآخرين
                socket.broadcast.emit('user_online', userId);
                
                console.log(`✅ المستخدم ${user.fullName} متصل الآن`);
            }
        } catch (error) {
            console.error('خطأ في اتصال المستخدم:', error);
        }
    });

    socket.on('disconnect', async () => {
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            
            // إعلام المستخدمين الآخرين
            socket.broadcast.emit('user_offline', socket.userId);
            
            console.log(`❌ المستخدم ${socket.userId} انقطع عن الاتصال`);
        }
    });

    // استمع للأحداث الأخرى هنا...
});

// المسارات الأساسية
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: 'مرحباً بك في المنصة التعليمية',
        version: '4.1.0'
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'running',
        timestamp: new Date().toISOString(),
        connectedUsers: connectedUsers.size
    });
});
// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password } = req.body;

        // التحقق من البيانات
        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'جميع الحقول مطلوبة' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'كلمة المرور يجب أن تكون على الأقل 6 أحرف' 
            });
        }

        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'رقم الهاتف مسجل مسبقاً' 
            });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);

        // إنشاء المستخدم
        const user = new User({
            fullName,
            phone,
            university,
            major,
            batch,
            password: hashedPassword
        });

        await user.save();

        // إنشاء token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            token,
            user: formatUserResponse(user)
        });

    } catch (error) {
        console.error('خطأ في إنشاء الحساب:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        // التحقق من البيانات
        if (!phone || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'رقم الهاتف وكلمة المرور مطلوبان' 
            });
        }

        // البحث عن المستخدم
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة' 
            });
        }

        if (!user.isActive) {
            return res.status(400).json({ 
                success: false, 
                message: 'الحساب موقوف. يرجى التواصل مع الإدارة' 
            });
        }

        // التحقق من كلمة المرور
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ 
                success: false, 
                message: 'رقم الهاتف أو كلمة المرور غير صحيحة' 
            });
        }

        // تحديث آخر ظهور
        user.lastSeen = new Date();
        await user.save();

        // إنشاء token
        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            token,
            user: formatUserResponse(user)
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// مسارات المستخدم
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: formatUserResponse(req.user)
        });
    } catch (error) {
        console.error('خطأ في جلب الملف الشخصي:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { fullName, university, major, batch, bio } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            {
                fullName,
                university,
                major,
                batch,
                bio
            },
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
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
        ).select('-password');

        res.json({
            success: true,
            message: 'تم تحديث الإعدادات بنجاح',
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('خطأ في تحديث الإعدادات:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.get('/api/user/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;

        // إحصائيات المستخدم
        const storiesCount = await Story.countDocuments({ userId });
        const messagesCount = await Message.countDocuments({ senderId: userId });
        const joinedChannels = await Channel.countDocuments({ members: userId });
        
        // حساب رتبة المستخدم بناءً على النشاط
        const activityScore = (storiesCount * 2) + (messagesCount * 1) + (joinedChannels * 3);
        let rank = 'مبتدئ';
        if (activityScore > 100) rank = 'نشط';
        if (activityScore > 300) rank = 'متميز';
        if (activityScore > 500) rank = 'خبير';

        res.json({
            success: true,
            stats: {
                overall: { rank, score: activityScore },
                messages: { total: messagesCount },
                stories: { total: storiesCount, active: await Story.countDocuments({ 
                    userId, 
                    expiresAt: { $gt: new Date() } 
                }) },
                activity: { joinedChannels }
            }
        });

    } catch (error) {
        console.error('خطأ في جلب إحصائيات المستخدم:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// تحميل الصورة الرمزية
app.post('/api/user/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'لم يتم تحميل أي ملف' 
            });
        }

        const avatarUrl = `/uploads/profiles/${req.file.filename}`;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { avatar: avatarUrl },
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            message: 'تم تحديث الصورة الرمزية بنجاح',
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('خطأ في تحميل الصورة الرمزية:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// مسارات المستخدمين النشطين
app.get('/api/users/active', authenticateToken, async (req, res) => {
    try {
        const activeUsers = await User.find({
            isActive: true,
            _id: { $ne: req.user._id } // استبعاد المستخدم الحالي
        })
        .select('fullName avatar role lastSeen')
        .limit(20)
        .sort({ lastSeen: -1 });

        const usersWithStatus = activeUsers.map(user => ({
            ...formatUserResponse(user),
            isOnline: connectedUsers.has(user._id.toString())
        }));

        res.json({
            success: true,
            users: usersWithStatus
        });

    } catch (error) {
        console.error('خطأ في جلب المستخدمين النشطين:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// مسارات الإدارة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const todayMessages = await Message.countDocuments({
            createdAt: { 
                $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
            }
        });
        const activeStories = await Story.countDocuments({ 
            expiresAt: { $gt: new Date() } 
        });
        const totalChannels = await Channel.countDocuments();

        res.json({
            success: true,
            stats: {
                users: { total: totalUsers },
                messages: { today: todayMessages, total: await Message.countDocuments() },
                stories: { active: activeStories, total: await Story.countDocuments() },
                channels: { total: totalChannels }
            }
        });

    } catch (error) {
        console.error('خطأ في جلب إحصائيات الإدارة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', role = 'all', status = 'all' } = req.query;

        const query = {};
        
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { university: { $regex: search, $options: 'i' } }
            ];
        }

        if (role !== 'all') {
            query.role = role;
        }

        if (status !== 'all') {
            if (status === 'active') query.isActive = true;
            else if (status === 'inactive') query.isActive = false;
        }

        const users = await User.find(query)
            .select('-password')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(query);

        const usersWithStatus = users.map(user => ({
            ...formatUserResponse(user),
            isOnline: connectedUsers.has(user._id.toString())
        }));

        res.json({
            success: true,
            users: usersWithStatus,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        });

    } catch (error) {
        console.error('خطأ في جلب مستخدمي الإدارة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.put('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isActive, role, reason } = req.body;

        const updateData = {};
        if (typeof isActive !== 'undefined') updateData.isActive = isActive;
        if (role) updateData.role = role;

        const updatedUser = await User.findByIdAndUpdate(
            req.params.userId,
            updateData,
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ 
                success: false, 
                message: 'المستخدم غير موجود' 
            });
        }

        // تسجيل الإجراء في سجل التدقيق (يمكن إضافته لاحقاً)

        res.json({
            success: true,
            message: `تم ${isActive ? 'تفعيل' : 'إيقاف'} المستخدم بنجاح`,
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;

        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'المستخدم غير موجود' 
            });
        }

        // لا يمكن حذف المديرين
        if (user.role === 'admin') {
            return res.status(400).json({ 
                success: false, 
                message: 'لا يمكن حذف حساب مدير' 
            });
        }

        // حذف المستخدم (أو تعطيله بدلاً من الحذف الفعلي)
        await User.findByIdAndUpdate(req.params.userId, { 
            isActive: false,
            phone: `deleted_${Date.now()}_${user.phone}` // لمنع إعادة الاستخدام
        });

        // تسجيل الإجراء في سجل التدقيق

        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });

    } catch (error) {
        console.error('خطأ في حذف المستخدم:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// معالجة أخطاء multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                message: 'حجم الملف كبير جداً' 
            });
        }
    }
    
    if (error.message.includes('نوع الملف غير مدعوم')) {
        return res.status(400).json({ 
            success: false, 
            message: error.message 
        });
    }
    
    next(error);
});

// معالجة الأخطاء العامة
app.use((error, req, res, next) => {
    console.error('خطأ غير متوقع:', error);
    res.status(500).json({ 
        success: false, 
        message: 'حدث خطأ غير متوقع في الخادم' 
    });
});

// مسارات غير موجودة
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'المسار غير موجود' 
    });
});
// مسارات الـ Stories
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await Story.find({
            expiresAt: { $gt: new Date() }
        })
        .populate('userId', 'fullName avatar')
        .sort({ createdAt: -1 })
        .limit(50);

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
            stories: result
        });

    } catch (error) {
        console.error('خطأ في جلب القصص:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.post('/api/stories', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'لم يتم تحميل أي ملف' 
            });
        }

        const { caption, allowReplies = true, allowSharing = true } = req.body;

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
            expiresAt
        });

        await story.save();

        // إشعار المستخدمين المتصلين
        io.emit('new_story', {
            story: await story.populate('userId', 'fullName avatar')
        });

        res.json({
            success: true,
            message: 'تم نشر القصة بنجاح',
            story
        });

    } catch (error) {
        console.error('خطأ في نشر القصة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.post('/api/stories/:storyId/view', authenticateToken, async (req, res) => {
    try {
        const story = await Story.findById(req.params.storyId);
        
        if (!story) {
            return res.status(404).json({ 
                success: false, 
                message: 'القصة غير موجودة' 
            });
        }

        // التحقق من انتهاء القصة
        if (story.expiresAt < new Date()) {
            return res.status(400).json({ 
                success: false, 
                message: 'انتهت مدة القصة' 
            });
        }

        // إضافة المشاهدة إذا لم تكن موجودة
        if (!story.views.includes(req.user._id)) {
            story.views.push(req.user._id);
            await story.save();
        }

        res.json({
            success: true,
            message: 'تم تسجيل المشاهدة'
        });

    } catch (error) {
        console.error('خطأ في تسجيل مشاهدة القصة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.post('/api/stories/:storyId/reply', authenticateToken, async (req, res) => {
    try {
        const { text } = req.body;
        const story = await Story.findById(req.params.storyId);

        if (!story) {
            return res.status(404).json({ 
                success: false, 
                message: 'القصة غير موجودة' 
            });
        }

        if (!story.allowReplies) {
            return res.status(400).json({ 
                success: false, 
                message: 'الردود غير مسموحة على هذه القصة' 
            });
        }

        if (story.expiresAt < new Date()) {
            return res.status(400).json({ 
                success: false, 
                message: 'انتهت مدة القصة' 
            });
        }

        story.replies.push({
            userId: req.user._id,
            text
        });

        await story.save();

        // إشعار صاحب القصة
        const storyOwnerSocket = connectedUsers.get(story.userId.toString());
        if (storyOwnerSocket) {
            io.to(storyOwnerSocket).emit('story_reply', {
                storyId: story._id,
                reply: {
                    userId: req.user._id,
                    user: req.user.fullName,
                    text,
                    createdAt: new Date()
                }
            });
        }

        res.json({
            success: true,
            message: 'تم إرسال الرد بنجاح'
        });

    } catch (error) {
        console.error('خطأ في إرسال رد القصة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// مسارات المحادثات والدردشات
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.user._id
        })
        .populate('participants', 'fullName avatar lastSeen')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

        const conversationsWithUnread = conversations.map(conv => {
            const unreadCount = conv.unreadCount.get(req.user._id.toString()) || 0;
            return {
                ...conv.toObject(),
                unreadCount
            };
        });

        res.json({
            success: true,
            conversations: conversationsWithUnread
        });

    } catch (error) {
        console.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.get('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;

        // التحقق من أن المستخدم مشارك في المحادثة
        const conversation = await Conversation.findOne({
            _id: req.params.conversationId,
            participants: req.user._id
        });

        if (!conversation) {
            return res.status(404).json({ 
                success: false, 
                message: 'المحادثة غير موجودة' 
            });
        }

        const messages = await Message.find({
            conversationId: req.params.conversationId
        })
        .populate('senderId', 'fullName avatar')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

        // تحديث عدد الرسائل غير المقروءة
        conversation.unreadCount.set(req.user._id.toString(), 0);
        await conversation.save();

        res.json({
            success: true,
            messages: messages.reverse(),
            pagination: {
                current: page,
                pages: Math.ceil(await Message.countDocuments({ 
                    conversationId: req.params.conversationId 
                }) / limit)
            }
        });

    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.post('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantIds, isGroup = false, groupName } = req.body;

        if (!isGroup && (!participantIds || participantIds.length !== 1)) {
            return res.status(400).json({ 
                success: false, 
                message: 'يجب تحديد مستخدم واحد للمحادثة الفردية' 
            });
        }

        if (isGroup && (!groupName || !participantIds || participantIds.length === 0)) {
            return res.status(400).json({ 
                success: false, 
                message: 'يجب تحديد اسم المجموعة وعدد من المشاركين' 
            });
        }

        // للمحادثات الفردية: التحقق من وجود محادثة مسبقة
        if (!isGroup) {
            const existingConversation = await Conversation.findOne({
                isGroup: false,
                participants: { 
                    $all: [req.user._id, participantIds[0]],
                    $size: 2
                }
            });

            if (existingConversation) {
                return res.json({
                    success: true,
                    message: 'المحادثة موجودة مسبقاً',
                    conversation: existingConversation
                });
            }
        }

        const participants = [req.user._id, ...participantIds];

        const conversation = new Conversation({
            participants,
            isGroup,
            groupName: isGroup ? groupName : null,
            groupAdmins: isGroup ? [req.user._id] : []
        });

        await conversation.save();

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المحادثة بنجاح',
            conversation: await conversation.populate('participants', 'fullName avatar')
        });

    } catch (error) {
        console.error('خطأ في إنشاء المحادثة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// مسارات القنوات والمجموعات
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = await Channel.find({
            $or: [
                { isPublic: true },
                { members: req.user._id },
                { creatorId: req.user._id }
            ]
        })
        .populate('creatorId', 'fullName')
        .populate('members', 'fullName avatar')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            channels
        });

    } catch (error) {
        console.error('خطأ في جلب القنوات:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.post('/api/channels', authenticateToken, async (req, res) => {
    try {
        const { name, description, type, isPublic = true } = req.body;

        if (!name || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'الاسم والنوع مطلوبان' 
            });
        }

        const channel = new Channel({
            name,
            description,
            type,
            isPublic,
            creatorId: req.user._id,
            members: [req.user._id],
            admins: [req.user._id]
        });

        await channel.save();

        res.status(201).json({
            success: true,
            message: 'تم إنشاء القناة بنجاح',
            channel: await channel.populate('creatorId', 'fullName')
        });

    } catch (error) {
        console.error('خطأ في إنشاء القناة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

app.post('/api/channels/:channelId/join', authenticateToken, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.channelId);

        if (!channel) {
            return res.status(404).json({ 
                success: false, 
                message: 'القناة غير موجودة' 
            });
        }

        if (!channel.isPublic && channel.settings.approvalRequired) {
            // إرسال طلب انضمام يحتاج موافقة
            return res.json({
                success: true,
                message: 'تم إرسال طلب الانضمام، في انتظار الموافقة',
                requiresApproval: true
            });
        }

        // الانضمام المباشر
        if (!channel.members.includes(req.user._id)) {
            channel.members.push(req.user._id);
            await channel.save();
        }

        res.json({
            success: true,
            message: 'تم الانضمام إلى القناة بنجاح',
            channel: await channel.populate('members', 'fullName avatar')
        });

    } catch (error) {
        console.error('خطأ في الانضمام إلى القناة:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم' 
        });
    }
});

// أحداث Socket.IO للمحادثات
io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('user_connected', async (userId) => {
        try {
            const user = await User.findById(userId);
            if (user) {
                connectedUsers.set(userId, socket.id);
                socket.userId = userId;
                
                await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
                socket.broadcast.emit('user_online', userId);
                
                console.log(`✅ المستخدم ${user.fullName} متصل الآن`);
            }
        } catch (error) {
            console.error('خطأ في اتصال المستخدم:', error);
        }
    });

    socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`💬 المستخدم انضم للمحادثة: ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
        console.log(`💬 المستخدم غادر المحادثة: ${conversationId}`);
    });

    socket.on('send_message', async (data) => {
        try {
            const { conversationId, content, messageType = 'text' } = data;

            // التحقق من أن المستخدم مشارك في المحادثة
            const conversation = await Conversation.findOne({
                _id: conversationId,
                participants: socket.userId
            });

            if (!conversation) {
                socket.emit('error', { message: 'غير مصرح لك بإرسال رسالة في هذه المحادثة' });
                return;
            }

            // إنشاء الرسالة
            const message = new Message({
                conversationId,
                senderId: socket.userId,
                content,
                messageType
            });

            await message.save();

            // تحديث المحادثة
            conversation.lastMessage = message._id;
            
            // تحديث عدد الرسائل غير المقروءة للمشاركين الآخرين
            conversation.participants.forEach(participantId => {
                if (participantId.toString() !== socket.userId) {
                    const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
                    conversation.unreadCount.set(participantId.toString(), currentCount + 1);
                }
            });

            await conversation.save();

            // إرسال الرسالة للمشاركين
            const populatedMessage = await message.populate('senderId', 'fullName avatar');
            
            io.to(`conversation_${conversationId}`).emit('new_message', {
                message: populatedMessage,
                conversationId
            });

            // إشعار للمستخدمين غير المتصلين
            conversation.participants.forEach(participantId => {
                if (participantId.toString() !== socket.userId) {
                    const participantSocket = connectedUsers.get(participantId.toString());
                    if (!participantSocket) {
                        // يمكن إرسال إشعار push هنا
                        console.log(`📱 إشعار للمستخدم: ${participantId}`);
                    }
                }
            });

        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'حدث خطأ في إرسال الرسالة' });
        }
    });

    socket.on('message_read', async (data) => {
        try {
            const { conversationId, messageId } = data;

            const conversation = await Conversation.findOne({
                _id: conversationId,
                participants: socket.userId
            });

            if (conversation) {
                // إضافة المستخدم إلى قائمة المقروءات
                await Message.findByIdAndUpdate(messageId, {
                    $addToSet: { readBy: socket.userId }
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

    socket.on('typing_start', (data) => {
        const { conversationId } = data;
        socket.to(`conversation_${conversationId}`).emit('user_typing', {
            userId: socket.userId,
            conversationId
        });
    });

    socket.on('typing_stop', (data) => {
        const { conversationId } = data;
        socket.to(`conversation_${conversationId}`).emit('user_stop_typing', {
            userId: socket.userId,
            conversationId
        });
    });

    socket.on('disconnect', async () => {
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            socket.broadcast.emit('user_offline', socket.userId);
            console.log(`❌ المستخدم ${socket.userId} انقطع عن الاتصال`);
        }
    });
});

// تشغيل السيرفر
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`📧 بيئة التطوير: http://localhost:${PORT}`);
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
}, 60 * 60 * 1000); // كل ساعة

// تصدير للتستينغ
module.exports = { app, server, io };
