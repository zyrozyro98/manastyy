// server.js - سيرفر Node.js مع Express (محدث ومصلح)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// تكوين middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// تكوين multer لرفع الملفات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// نماذج MongoDB
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
    avatar: String,
    isOnline: { type: Boolean, default: false },
    lastSeen: Date
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
    name: String,
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isGroup: { type: Boolean, default: false },
    groupAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    unreadCount: Map
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: String,
    type: { type: String, enum: ['text', 'image', 'file', 'video'], default: 'text' },
    mediaUrl: String,
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reactions: Map
}, { timestamps: true });

const storySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mediaUrl: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    duration: { type: Number, default: 5 },
    views: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    avatar: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    privacy: { type: String, enum: ['public', 'private'], default: 'public' },
    stats: {
        memberCount: { type: Number, default: 0 },
        messageCount: { type: Number, default: 0 }
    }
}, { timestamps: true });

const channelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    avatar: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subscribers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    category: String,
    privacy: { type: String, enum: ['public', 'private'], default: 'public' },
    stats: {
        subscriberCount: { type: Number, default: 0 },
        postCount: { type: Number, default: 0 }
    }
}, { timestamps: true });

const mediaSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    thumbnailUrl: String,
    type: { type: String, enum: ['image', 'video', 'document', 'audio'], required: true },
    size: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }
}, { timestamps: true });

const activitySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['message', 'group', 'channel', 'media', 'story'], required: true },
    description: { type: String, required: true },
    targetId: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

// إنشاء النماذج
const User = mongoose.model('User', userSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);
const Story = mongoose.model('Story', storySchema);
const Group = mongoose.model('Group', groupSchema);
const Channel = mongoose.model('Channel', channelSchema);
const Media = mongoose.model('Media', mediaSchema);
const Activity = mongoose.model('Activity', activitySchema);

// Middleware للمصادقة
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'رمز الوصول مطلوب' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'المستخدم غير موجود' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'رمز وصول غير صالح' 
        });
    }
};

// Middleware للتحقق من ملكية المحتوى
const checkOwnership = (model) => async (req, res, next) => {
    try {
        const resource = await model.findById(req.params.id);
        
        if (!resource) {
            return res.status(404).json({ 
                success: false, 
                message: 'المورد غير موجود' 
            });
        }

        if (resource.createdBy && resource.createdBy.toString() !== req.user._id.toString() && 
            req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'غير مصرح لك بتنفيذ هذا الإجراء' 
            });
        }

        req.resource = resource;
        next();
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في الخادم' 
        });
    }
};

// ============ Routes ============

// مسارات المستخدمين
app.post('/api/users/register', async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body;

        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مستخدم بالفعل'
            });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);

        // إنشاء المستخدم
        const user = new User({
            fullName,
            email,
            password: hashedPassword,
            role: role || 'student'
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: { user: { ...user._doc, password: undefined } }
        });

    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // البحث عن المستخدم
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        // التحقق من كلمة المرور
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        // تحديث حالة المستخدم
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        // إنشاء التوكن
        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                token,
                user: { ...user._doc, password: undefined }
            }
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.get('/api/users/me', authenticateToken, async (req, res) => {
    res.json({
        success: true,
        data: { user: req.user }
    });
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await User.find({ _id: { $ne: req.user._id } })
            .select('-password')
            .sort({ isOnline: -1, fullName: 1 });

        res.json({
            success: true,
            data: { users }
        });
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات المحادثات
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.user._id
        })
        .populate('participants', 'fullName email avatar isOnline lastSeen')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

        res.json({
            success: true,
            data: { conversations }
        });
    } catch (error) {
        console.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantId } = req.body;

        // التحقق من وجود محادثة مسبقة
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user._id, participantId] },
            isGroup: false
        })
        .populate('participants', 'fullName email avatar isOnline lastSeen');

        if (!conversation) {
            // إنشاء محادثة جديدة
            const otherUser = await User.findById(participantId);
            
            conversation = new Conversation({
                name: otherUser.fullName,
                participants: [req.user._id, participantId],
                isGroup: false
            });

            await conversation.save();
            await conversation.populate('participants', 'fullName email avatar isOnline lastSeen');
        }

        res.status(201).json({
            success: true,
            data: { conversation }
        });
    } catch (error) {
        console.error('خطأ في إنشاء المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.get('/api/chat/conversations/:id/messages', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 50, before } = req.query;

        let query = { conversationId: id };
        if (before) {
            query._id = { $lt: before };
        }

        const messages = await Message.find(query)
            .populate('senderId', 'fullName avatar')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .sort({ createdAt: 1 });

        res.json({
            success: true,
            data: { messages }
        });
    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات القصص
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await Story.find({
            expiresAt: { $gt: new Date() }
        })
        .populate('userId', 'fullName avatar')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: { stories }
        });
    } catch (error) {
        console.error('خطأ في جلب القصص:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/stories', authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const { type, duration = 5 } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'الوسائط مطلوبة'
            });
        }

        const story = new Story({
            userId: req.user._id,
            mediaUrl: `/uploads/${req.file.filename}`,
            type,
            duration: parseInt(duration),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 ساعة
        });

        await story.save();
        await story.populate('userId', 'fullName avatar');

        // بث القصة الجديدة
        io.emit('new_story', { story });

        res.status(201).json({
            success: true,
            data: { story }
        });
    } catch (error) {
        console.error('خطأ في إنشاء القصة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/stories/:id/view', authenticateToken, async (req, res) => {
    try {
        const story = await Story.findById(req.params.id);
        
        if (!story) {
            return res.status(404).json({
                success: false,
                message: 'القصة غير موجودة'
            });
        }

        if (!story.views.includes(req.user._id)) {
            story.views.push(req.user._id);
            await story.save();
        }

        res.json({
            success: true,
            message: 'تم تسجيل المشاهدة'
        });
    } catch (error) {
        console.error('خطأ في تسجيل المشاهدة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات المجموعات
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const groups = await Group.find({
            $or: [
                { privacy: 'public' },
                { members: req.user._id }
            ]
        })
        .populate('createdBy', 'fullName avatar')
        .populate('members', 'fullName avatar')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: { groups }
        });
    } catch (error) {
        console.error('خطأ في جلب المجموعات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/groups', authenticateToken, async (req, res) => {
    try {
        const { name, description, privacy = 'public' } = req.body;

        const group = new Group({
            name,
            description,
            privacy,
            createdBy: req.user._id,
            members: [req.user._id],
            admins: [req.user._id]
        });

        await group.save();
        await group.populate('createdBy', 'fullName avatar');
        await group.populate('members', 'fullName avatar');

        res.status(201).json({
            success: true,
            data: { group }
        });
    } catch (error) {
        console.error('خطأ في إنشاء المجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/groups/:id/members', authenticateToken, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'المجموعة غير موجودة'
            });
        }

        if (group.members.includes(req.user._id)) {
            return res.status(400).json({
                success: false,
                message: 'أنت بالفعل عضو في هذه المجموعة'
            });
        }

        group.members.push(req.user._id);
        await group.save();

        res.json({
            success: true,
            message: 'تم الانضمام للمجموعة'
        });
    } catch (error) {
        console.error('خطأ في الانضمام للمجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.delete('/api/groups/:id/members', authenticateToken, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'المجموعة غير موجودة'
            });
        }

        group.members = group.members.filter(memberId => 
            memberId.toString() !== req.user._id.toString()
        );

        // إذا كان المستخدم مشرفاً، إزالته من المشرفين أيضاً
        group.admins = group.admins.filter(adminId => 
            adminId.toString() !== req.user._id.toString()
        );

        await group.save();

        res.json({
            success: true,
            message: 'تم مغادرة المجموعة'
        });
    } catch (error) {
        console.error('خطأ في مغادرة المجموعة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات القنوات
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = await Channel.find({
            $or: [
                { privacy: 'public' },
                { subscribers: req.user._id }
            ]
        })
        .populate('createdBy', 'fullName avatar')
        .populate('subscribers', 'fullName avatar')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: { channels }
        });
    } catch (error) {
        console.error('خطأ في جلب القنوات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/channels', authenticateToken, async (req, res) => {
    try {
        const { name, description, category, privacy = 'public' } = req.body;

        const channel = new Channel({
            name,
            description,
            category,
            privacy,
            createdBy: req.user._id,
            subscribers: [req.user._id]
        });

        await channel.save();
        await channel.populate('createdBy', 'fullName avatar');
        await channel.populate('subscribers', 'fullName avatar');

        res.status(201).json({
            success: true,
            data: { channel }
        });
    } catch (error) {
        console.error('خطأ في إنشاء القناة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/channels/:id/subscriptions', authenticateToken, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id);
        
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: 'القناة غير موجودة'
            });
        }

        if (channel.subscribers.includes(req.user._id)) {
            return res.status(400).json({
                success: false,
                message: 'أنت مشترك بالفعل في هذه القناة'
            });
        }

        channel.subscribers.push(req.user._id);
        await channel.save();

        res.json({
            success: true,
            message: 'تم الاشتراك في القناة'
        });
    } catch (error) {
        console.error('خطأ في الاشتراك بالقناة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.delete('/api/channels/:id/subscriptions', authenticateToken, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id);
        
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: 'القناة غير موجودة'
            });
        }

        channel.subscribers = channel.subscribers.filter(subscriberId => 
            subscriberId.toString() !== req.user._id.toString()
        );

        await channel.save();

        res.json({
            success: true,
            message: 'تم إلغاء الاشتراك في القناة'
        });
    } catch (error) {
        console.error('خطأ في إلغاء الاشتراك:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات الوسائط
app.get('/api/media', authenticateToken, async (req, res) => {
    try {
        const media = await Media.find({
            $or: [
                { uploadedBy: req.user._id },
                { privacy: 'public' }
            ]
        })
        .populate('uploadedBy', 'fullName avatar')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: { media }
        });
    } catch (error) {
        console.error('خطأ في جلب الوسائط:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

app.post('/api/media', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const { name, type, conversationId, groupId, channelId } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'الملف مطلوب'
            });
        }

        const media = new Media({
            name: name || req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            type,
            size: req.file.size,
            uploadedBy: req.user._id,
            conversationId,
            groupId,
            channelId
        });

        await media.save();
        await media.populate('uploadedBy', 'fullName avatar');

        res.status(201).json({
            success: true,
            data: { media }
        });
    } catch (error) {
        console.error('خطأ في رفع الوسائط:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// مسارات لوحة التحكم
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;

        // إحصائيات
        const totalMessages = await Message.countDocuments();
        const totalGroups = await Group.countDocuments({ members: userId });
        const totalChannels = await Channel.countDocuments({ subscribers: userId });
        const totalMedia = await Media.countDocuments({ uploadedBy: userId });

        // النشاط الأخير
        const recentActivity = await Activity.find({ userId })
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            success: true,
            data: {
                stats: {
                    totalMessages,
                    totalGroups,
                    totalChannels,
                    totalMedia
                },
                recentActivity
            }
        });
    } catch (error) {
        console.error('خطأ في جلب بيانات لوحة التحكم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم'
        });
    }
});

// ============ Socket.IO ============
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('رمز المصادقة مطلوب'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return next(new Error('المستخدم غير موجود'));
        }

        socket.userId = user._id;
        socket.user = user;
        next();
    } catch (error) {
        next(new Error('رمز مصادقة غير صالح'));
    }
});

io.on('connection', (socket) => {
    console.log(`✅ مستخدم متصل: ${socket.user.fullName}`);

    // تحديث حالة المستخدم
    User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastSeen: new Date()
    }).exec();

    // انضمام إلى غرف المستخدم
    socket.join(socket.userId);

    // إعلام المستخدمين الآخرين
    socket.broadcast.emit('user_online', {
        userId: socket.userId,
        user: socket.user
    });

    // إرسال حدث المصادقة الناجحة
    socket.emit('authenticated', {
        message: 'تمت المصادقة بنجاح',
        user: socket.user
    });

    // استقبال الرسائل
    socket.on('send_message', async (data) => {
        try {
            const { conversationId, content, type = 'text', mediaUrl } = data;

            // التحقق من أن المستخدم مشارك في المحادثة
            const conversation = await Conversation.findById(conversationId);
            if (!conversation || !conversation.participants.includes(socket.userId)) {
                socket.emit('error', { message: 'غير مصرح لك بإرسال رسائل في هذه المحادثة' });
                return;
            }

            // إنشاء الرسالة
            const message = new Message({
                conversationId,
                senderId: socket.userId,
                content,
                type,
                mediaUrl,
                readBy: [socket.userId]
            });

            await message.save();
            await message.populate('senderId', 'fullName avatar');

            // تحديث المحادثة
            conversation.lastMessage = message._id;
            conversation.updatedAt = new Date();
            
            // زيادة عدد الرسائل غير المقروءة للمشاركين الآخرين
            conversation.participants.forEach(participantId => {
                if (participantId.toString() !== socket.userId.toString()) {
                    const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
                    conversation.unreadCount.set(participantId.toString(), currentCount + 1);
                }
            });

            await conversation.save();

            // بث الرسالة للمشاركين
            conversation.participants.forEach(participantId => {
                io.to(participantId.toString()).emit('new_message', {
                    conversationId,
                    message
                });
            });

        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'فشل في إرسال الرسالة' });
        }
    });

    // بدء الكتابة
    socket.on('typing_start', (data) => {
        const { conversationId } = data;
        
        socket.to(conversationId).emit('user_typing', {
            conversationId,
            userId: socket.userId,
            userName: socket.user.fullName
        });
    });

    // إيقاف الكتابة
    socket.on('typing_stop', (data) => {
        const { conversationId } = data;
        
        socket.to(conversationId).emit('user_stop_typing', {
            conversationId,
            userId: socket.userId
        });
    });

    // تعليم الرسائل كمقروءة
    socket.on('mark_messages_read', async (data) => {
        try {
            const { conversationId } = data;

            await Message.updateMany(
                {
                    conversationId,
                    senderId: { $ne: socket.userId },
                    readBy: { $ne: socket.userId }
                },
                { $addToSet: { readBy: socket.userId } }
            );

            // تحديث عدد الرسائل غير المقروءة
            const conversation = await Conversation.findById(conversationId);
            if (conversation) {
                conversation.unreadCount.set(socket.userId.toString(), 0);
                await conversation.save();
            }

        } catch (error) {
            console.error('خطأ في تعليم الرسائل كمقروءة:', error);
        }
    });

    // فصل الاتصال
    socket.on('disconnect', async () => {
        console.log(`❌ مستخدم منفصل: ${socket.user.fullName}`);

        // تحديث حالة المستخدم
        await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            lastSeen: new Date()
        });

        // إعلام المستخدمين الآخرين
        socket.broadcast.emit('user_offline', {
            userId: socket.userId
        });
    });
});

// مسار رئيسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
    console.error('خطأ غير متوقع:', err);
    res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع في الخادم'
    });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/educational-platform', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ تم الاتصال بقاعدة البيانات');
    server.listen(PORT, () => {
        console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    });
})
.catch(err => {
    console.error('❌ فشل في الاتصال بقاعدة البيانات:', err);
    process.exit(1);
});

module.exports = app;
