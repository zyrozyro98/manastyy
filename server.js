const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// نظام التخزين المحسن
class AdvancedStorage {
    constructor() {
        this.init();
    }

    init() {
        const files = ['users.json', 'conversations.json', 'messages.json', 'files.json'];
        const folders = ['uploads', 'avatars', 'backups'];
        
        files.forEach(file => {
            if (!fs.existsSync(file)) {
                fs.writeFileSync(file, '[]');
            }
        });
        
        folders.forEach(folder => {
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
        });
    }

    readFile(filename) {
        try {
            if (fs.existsSync(filename)) {
                return JSON.parse(fs.readFileSync(filename, 'utf8'));
            }
            return [];
        } catch (error) {
            return [];
        }
    }

    writeFile(filename, data) {
        try {
            fs.writeFileSync(filename, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            return false;
        }
    }
}

const storageSystem = new AdvancedStorage();
const JWT_SECRET = process.env.JWT_SECRET || 'edutech-super-secure-key-2024';

// تخزين متقدم للملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = file.fieldname === 'avatar' ? 'avatars' : 'uploads';
        cb(null, folder + '/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 15 * 1024 * 1024,
        files: 10
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || 
            file.mimetype.startsWith('video/') ||
            file.mimetype.startsWith('audio/') ||
            file.mimetype === 'application/pdf' ||
            file.mimetype.includes('document') ||
            file.mimetype.includes('spreadsheet')) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم'), false);
        }
    }
});

// Middleware المصادقة
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'غير مصرح' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'رمز غير صالح' });
        req.user = user;
        next();
    });
};

const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'صلاحيات غير كافية' });
    next();
};

// نظام إدارة الاتصالات المباشرة
const connectedUsers = new Map();
const typingUsers = new Map();

// Socket.IO للدردشة في الوقت الحقيقي
io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('authenticate', (userData) => {
        connectedUsers.set(socket.id, userData);
        socket.userData = userData;
        
        // إعلام الجميع بتحديث حالة الاتصال
        io.emit('userStatusUpdate', {
            userId: userData._id,
            status: 'online',
            lastSeen: new Date().toISOString()
        });
    });

    // إرسال رسالة
    socket.on('sendMessage', async (data) => {
        try {
            const { conversationId, text, attachments = [], replyTo = null } = data;
            const sender = socket.userData;

            if (!sender) return;

            const messages = storageSystem.readFile('messages.json');
            const conversations = storageSystem.readFile('conversations.json');
            
            const conversation = conversations.find(c => c._id === conversationId);
            if (!conversation) return;

            const newMessage = {
                _id: crypto.randomBytes(16).toString('hex'),
                conversationId,
                senderId: sender._id,
                senderName: sender.fullName,
                senderAvatar: sender.avatar,
                text: text?.trim(),
                attachments,
                replyTo,
                timestamp: new Date().toISOString(),
                readBy: [sender._id],
                reactions: [],
                isEdited: false,
                type: attachments.length > 0 ? 'file' : 'text'
            };

            messages.push(newMessage);
            storageSystem.writeFile('messages.json', messages);

            // تحديث آخر رسالة في المحادثة
            conversation.lastMessage = {
                text: text || '📎 مرفق',
                timestamp: newMessage.timestamp,
                senderId: sender._id
            };
            conversation.updatedAt = newMessage.timestamp;
            storageSystem.writeFile('conversations.json', conversations);

            // إرسال الرسالة لجميع المشاركين في المحادثة
            io.to(conversationId).emit('newMessage', newMessage);
            io.emit('conversationUpdated', conversation);

        } catch (error) {
            socket.emit('error', { message: 'فشل في إرسال الرسالة' });
        }
    });

    // الكتابة
    socket.on('typingStart', (data) => {
        const { conversationId } = data;
        typingUsers.set(socket.id, { conversationId, userId: socket.userData?._id });
        socket.to(conversationId).emit('userTyping', { 
            userId: socket.userData?._id, 
            userName: socket.userData?.fullName 
        });
    });

    socket.on('typingStop', (data) => {
        const { conversationId } = data;
        typingUsers.delete(socket.id);
        socket.to(conversationId).emit('userStopTyping', { 
            userId: socket.userData?._id 
        });
    });

    // قراءة الرسائل
    socket.on('markAsRead', async (data) => {
        const { messageIds, conversationId } = data;
        const userId = socket.userData?._id;

        const messages = storageSystem.readFile('messages.json');
        let updated = false;

        messages.forEach(msg => {
            if (messageIds.includes(msg._id) && !msg.readBy.includes(userId)) {
                msg.readBy.push(userId);
                updated = true;
            }
        });

        if (updated) {
            storageSystem.writeFile('messages.json', messages);
            socket.to(conversationId).emit('messagesRead', { 
                messageIds, 
                userId,
                conversationId 
            });
        }
    });

    // التفاعل مع الرسائل
    socket.on('reactToMessage', async (data) => {
        const { messageId, reaction, conversationId } = data;
        const userId = socket.userData?._id;

        const messages = storageSystem.readFile('messages.json');
        const message = messages.find(m => m._id === messageId);
        
        if (message) {
            // إزالة التفاعل السابق للمستخدم
            message.reactions = message.reactions.filter(r => r.userId !== userId);
            
            // إضافة التفاعل الجديد
            if (reaction) {
                message.reactions.push({ userId, reaction, timestamp: new Date().toISOString() });
            }
            
            storageSystem.writeFile('messages.json', messages);
            io.to(conversationId).emit('messageReaction', {
                messageId,
                reactions: message.reactions,
                userId
            });
        }
    });

    // الانضمام للمحادثة
    socket.on('joinConversation', (conversationId) => {
        socket.join(conversationId);
    });

    // مغادرة المحادثة
    socket.on('leaveConversation', (conversationId) => {
        socket.leave(conversationId);
    });

    socket.on('disconnect', () => {
        const userData = connectedUsers.get(socket.id);
        if (userData) {
            // إعلام الجميع بتحديث حالة الاتصال
            io.emit('userStatusUpdate', {
                userId: userData._id,
                status: 'offline',
                lastSeen: new Date().toISOString()
            });
        }
        connectedUsers.delete(socket.id);
        typingUsers.delete(socket.id);
        console.log('👤 مستخدم انقطع:', socket.id);
    });
});

// المسارات الأساسية
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'connected', 
        message: '✅ النظام يعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        connectedUsers: connectedUsers.size
    });
});

// التسجيل
app.post('/api/auth/register', upload.single('avatar'), async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password } = req.body;

        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        if (!/^5\d{8}$/.test(phone)) {
            return res.status(400).json({ message: 'رقم الهاتف غير صحيح' });
        }

        const users = storageSystem.readFile('users.json');
        if (users.find(u => u.phone === phone)) {
            return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
            _id: crypto.randomBytes(16).toString('hex'),
            fullName, 
            phone, 
            university, 
            major, 
            batch,
            password: hashedPassword,
            avatar: req.file ? `/avatars/${req.file.filename}` : null,
            role: 'student',
            isActive: true,
            isOnline: false,
            lastSeen: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            settings: {
                notifications: true,
                sound: true,
                theme: 'light'
            }
        };

        users.push(newUser);
        storageSystem.writeFile('users.json', users);

        // إنشاء محادثة مع المدير تلقائياً
        const conversations = storageSystem.readFile('conversations.json');
        const adminUser = users.find(u => u.role === 'admin');
        
        if (adminUser) {
            const newConversation = {
                _id: crypto.randomBytes(16).toString('hex'),
                type: 'direct',
                participants: [
                    { userId: newUser._id, role: 'student', joinedAt: new Date().toISOString() },
                    { userId: adminUser._id, role: 'admin', joinedAt: new Date().toISOString() }
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastMessage: null
            };
            conversations.push(newConversation);
            storageSystem.writeFile('conversations.json', conversations);
        }

        res.status(201).json({ 
            message: 'تم إنشاء الحساب بنجاح',
            user: { 
                _id: newUser._id, 
                fullName, 
                phone, 
                university,
                avatar: newUser.avatar
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ message: 'رقم الهاتف وكلمة المرور مطلوبان' });
        }

        const users = storageSystem.readFile('users.json');
        const user = users.find(u => u.phone === phone && u.isActive !== false);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        }

        // تحديث حالة المستخدم
        user.lastSeen = new Date().toISOString();
        user.isOnline = true;
        storageSystem.writeFile('users.json', users);

        const token = jwt.sign(
            { 
                _id: user._id, 
                fullName: user.fullName, 
                phone: user.phone, 
                role: user.role,
                avatar: user.avatar
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                _id: user._id,
                fullName: user.fullName,
                phone: user.phone,
                university: user.university,
                major: user.major,
                batch: user.batch,
                role: user.role,
                avatar: user.avatar,
                settings: user.settings,
                isOnline: true,
                lastSeen: user.lastSeen
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// جلب المحادثات
app.get('/api/chat/conversations', auth, async (req, res) => {
    try {
        const conversations = storageSystem.readFile('conversations.json');
        const users = storageSystem.readFile('users.json');
        const messages = storageSystem.readFile('messages.json');

        const userConversations = conversations.filter(conv => 
            conv.participants.some(p => p.userId === req.user._id)
        ).map(conv => {
            const otherParticipant = conv.participants.find(p => p.userId !== req.user._id);
            const user = users.find(u => u._id === otherParticipant?.userId);
            
            // حساب الرسائل غير المقروءة
            const unreadCount = messages.filter(msg => 
                msg.conversationId === conv._id && 
                !msg.readBy.includes(req.user._id)
            ).length;

            return {
                ...conv,
                otherUser: user ? {
                    _id: user._id,
                    fullName: user.fullName,
                    avatar: user.avatar,
                    role: user.role,
                    isOnline: user.isOnline,
                    lastSeen: user.lastSeen
                } : null,
                unreadCount,
                isActive: user?.isActive
            };
        }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json(userConversations);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// جلب رسائل المحادثة
app.get('/api/chat/conversations/:conversationId/messages', auth, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const messages = storageSystem.readFile('messages.json');
        const conversationMessages = messages
            .filter(msg => msg.conversationId === conversationId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // ترقيم الصفحات
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedMessages = conversationMessages.slice(startIndex, endIndex);

        res.json({
            messages: paginatedMessages.reverse(), // الأقدم أولاً
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(conversationMessages.length / limit),
                totalMessages: conversationMessages.length,
                hasMore: endIndex < conversationMessages.length
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إنشاء محادثة جديدة (للمدير)
app.post('/api/chat/conversations', auth, adminOnly, async (req, res) => {
    try {
        const { userId } = req.body;
        
        const users = storageSystem.readFile('users.json');
        const conversations = storageSystem.readFile('conversations.json');
        
        const user = users.find(u => u._id === userId && u.role === 'student');
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // التحقق من وجود محادثة سابقة
        const existingConversation = conversations.find(conv => 
            conv.participants.some(p => p.userId === userId) &&
            conv.participants.some(p => p.userId === req.user._id)
        );

        if (existingConversation) {
            return res.json(existingConversation);
        }

        const newConversation = {
            _id: crypto.randomBytes(16).toString('hex'),
            type: 'direct',
            participants: [
                { userId: user._id, role: 'student', joinedAt: new Date().toISOString() },
                { userId: req.user._id, role: 'admin', joinedAt: new Date().toISOString() }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: null
        };

        conversations.push(newConversation);
        storageSystem.writeFile('conversations.json', conversations);

        res.status(201).json(newConversation);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// رفع الملفات
app.post('/api/chat/upload', auth, upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'لم يتم رفع أي ملفات' });
        }

        const files = req.files.map(file => ({
            _id: crypto.randomBytes(16).toString('hex'),
            originalName: file.originalname,
            filename: file.filename,
            path: `/${file.destination}/${file.filename}`,
            size: file.size,
            mimetype: file.mimetype,
            uploadedBy: req.user._id,
            uploadedAt: new Date().toISOString()
        }));

        // حفظ معلومات الملفات
        const allFiles = storageSystem.readFile('files.json');
        allFiles.push(...files);
        storageSystem.writeFile('files.json', allFiles);

        res.json({ files });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في رفع الملفات' });
    }
});

// الإرسال الجماعي (للمدير)
app.post('/api/admin/broadcast', auth, adminOnly, async (req, res) => {
    try {
        const { text, attachments = [] } = req.body;
        if (!text?.trim() && attachments.length === 0) {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        const users = storageSystem.readFile('users.json');
        const conversations = storageSystem.readFile('conversations.json');
        const messages = storageSystem.readFile('messages.json');

        const students = users.filter(u => u.role === 'student' && u.isActive !== false);
        let successCount = 0;

        for (const student of students) {
            // البحث عن محادثة موجودة أو إنشاء جديدة
            let conversation = conversations.find(conv => 
                conv.participants.some(p => p.userId === student._id) &&
                conv.participants.some(p => p.userId === req.user._id)
            );

            if (!conversation) {
                conversation = {
                    _id: crypto.randomBytes(16).toString('hex'),
                    type: 'direct',
                    participants: [
                        { userId: student._id, role: 'student', joinedAt: new Date().toISOString() },
                        { userId: req.user._id, role: 'admin', joinedAt: new Date().toISOString() }
                    ],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastMessage: null
                };
                conversations.push(conversation);
            }

            const broadcastMessage = {
                _id: crypto.randomBytes(16).toString('hex'),
                conversationId: conversation._id,
                senderId: req.user._id,
                senderName: 'مدير النظام',
                senderAvatar: null,
                text: text?.trim(),
                attachments,
                timestamp: new Date().toISOString(),
                readBy: [req.user._id],
                reactions: [],
                isEdited: false,
                type: attachments.length > 0 ? 'file' : 'text',
                isBroadcast: true
            };

            messages.push(broadcastMessage);

            // تحديث المحادثة
            conversation.lastMessage = {
                text: text || '📎 مرفق',
                timestamp: broadcastMessage.timestamp,
                senderId: req.user._id
            };
            conversation.updatedAt = broadcastMessage.timestamp;

            successCount++;

            // إرسال عبر WebSocket
            io.to(conversation._id).emit('newMessage', broadcastMessage);
            io.emit('conversationUpdated', conversation);
        }

        storageSystem.writeFile('conversations.json', conversations);
        storageSystem.writeFile('messages.json', messages);

        res.json({ 
            message: `تم الإرسال الجماعي إلى ${successCount} مستخدم`,
            successCount 
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الإرسال الجماعي' });
    }
});

// جلب الإحصائيات (للمدير)
app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
    try {
        const users = storageSystem.readFile('users.json');
        const conversations = storageSystem.readFile('conversations.json');
        const messages = storageSystem.readFile('messages.json');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isOnline).length,
            totalConversations: conversations.length,
            totalMessages: messages.length,
            todayMessages: messages.filter(msg => new Date(msg.timestamp) >= today).length,
            unreadMessages: messages.filter(msg => !msg.readBy.includes(req.user._id)).length,
            storageUsed: messages.reduce((total, msg) => total + (msg.attachments?.reduce((sum, att) => sum + (att.size || 0), 0) || 0), 0),
            onlineAdmins: Array.from(connectedUsers.values()).filter(u => u.role === 'admin').length
        };

        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في جلب الإحصائيات' });
    }
});

// تحديث إعدادات المستخدم
app.put('/api/user/settings', auth, async (req, res) => {
    try {
        const { settings } = req.body;
        const users = storageSystem.readFile('users.json');
        const userIndex = users.findIndex(u => u._id === req.user._id);

        if (userIndex !== -1) {
            users[userIndex].settings = { ...users[userIndex].settings, ...settings };
            storageSystem.writeFile('users.json', users);
            res.json({ message: 'تم تحديث الإعدادات', settings: users[userIndex].settings });
        } else {
            res.status(404).json({ message: 'المستخدم غير موجود' });
        }
    } catch (error) {
        res.status(500).json({ message: 'خطأ في تحديث الإعدادات' });
    }
});

// البحث في المحادثات والرسائل
app.get('/api/chat/search', auth, async (req, res) => {
    try {
        const { q, type = 'all' } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({ message: 'أدخل مصطلح بحث مكون من حرفين على الأقل' });
        }

        const users = storageSystem.readFile('users.json');
        const conversations = storageSystem.readFile('conversations.json');
        const messages = storageSystem.readFile('messages.json');

        const searchResults = {
            conversations: [],
            messages: [],
            users: []
        };

        if (type === 'all' || type === 'conversations') {
            searchResults.conversations = conversations.filter(conv => 
                conv.participants.some(p => p.userId !== req.user._id) &&
                conv.participants.some(p => {
                    const user = users.find(u => u._id === p.userId);
                    return user?.fullName?.includes(q);
                })
            ).slice(0, 10);
        }

        if (type === 'all' || type === 'messages') {
            searchResults.messages = messages
                .filter(msg => 
                    msg.text?.includes(q) &&
                    msg.conversationId && 
                    conversations.find(c => c._id === msg.conversationId && 
                    c.participants.some(p => p.userId === req.user._id))
                )
                .slice(0, 20);
        }

        if (type === 'all' || type === 'users') {
            searchResults.users = users
                .filter(user => 
                    user.role === 'student' && 
                    user.fullName?.includes(q) &&
                    user._id !== req.user._id
                )
                .slice(0, 10);
        }

        res.json(searchResults);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في البحث' });
    }
});

// خدمة الملفات
app.use('/uploads', express.static('uploads'));
app.use('/avatars', express.static('avatars'));

// إنشاء مدير افتراضي
const createAdmin = async () => {
    const users = storageSystem.readFile('users.json');
    const adminExists = users.find(u => u.role === 'admin');
    
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 12);
        users.push({
            _id: 'admin-' + crypto.randomBytes(8).toString('hex'),
            fullName: 'مدير النظام',
            phone: '500000000',
            university: 'الإدارة العامة',
            major: 'نظم المعلومات',
            batch: '2024',
            password: hashedPassword,
            avatar: null,
            role: 'admin',
            isActive: true,
            isOnline: false,
            lastSeen: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            settings: {
                notifications: true,
                sound: true,
                theme: 'light'
            }
        });
        storageSystem.writeFile('users.json', users);
        console.log('✅ تم إنشاء حساب المدير: 500000000 / admin123');
    }
};

// بدء السيرفر
const PORT = process.env.PORT || 3000;
http.listen(PORT, async () => {
    await createAdmin();
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`💬 نظام الدردشة جاهز للاستخدام`);
});
