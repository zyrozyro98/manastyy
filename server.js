const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const socketIo = require('socket.io');
const sharp = require('sharp');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || true,
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// معدلات الأمان
app.disable('x-powered-by');

// تهيئة الملفات والمجلدات
function initializeApp() {
    const files = ['local-users.json', 'local-messages.json', 'local-images.json', 'local-stories.json', 'local-channels.json'];
    const folders = ['uploads', 'temp', 'stories', 'channels', 'avatars'];
    
    files.forEach(file => {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, '[]');
            console.log(`✅ تم إنشاء ${file}`);
        }
    });
    
    folders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
            console.log(`✅ تم إنشاء مجلد ${folder}`);
        }
    });
}

initializeApp();

// مفتاح JWT آمن
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// دوال مساعدة للتخزين المحلي
function readLocalFile(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

function writeLocalFile(filename, data) {
    try {
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('خطأ في الكتابة:', error);
        return false;
    }
}

// تخزين متقدم للصور والملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads/';
        if (file.fieldname === 'story') folder = 'stories/';
        if (file.fieldname === 'avatar') folder = 'avatars/';
        if (file.fieldname === 'channel') folder = 'channels/';
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(8).toString('hex');
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '-');
        cb(null, `${uniqueSuffix}-${cleanName}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
        files: 10
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('يسمح برفع الصور والفيديوهات فقط'), false);
        }
    }
});

// Middleware الأمان المتقدم
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'الوصول غير مصرح' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'رمز غير صالح' });
        }
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'صلاحيات غير كافية' });
    }
    next();
};

// نظام WebSocket للدردشة في الوقت الحقيقي
const connectedUsers = new Map();
const userSockets = new Map();

io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('authenticate', (userData) => {
        connectedUsers.set(socket.id, userData);
        userSockets.set(userData._id, socket.id);
        
        // إعلام الآخرين بتواجد المستخدم
        socket.broadcast.emit('user_online', {
            userId: userData._id,
            fullName: userData.fullName
        });
    });

    // إرسال رسالة فورية
    socket.on('send_message', async (data) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) return;

            const messages = readLocalFile('local-messages.json');
            const newMessage = {
                _id: uuidv4(),
                senderId: user._id,
                senderName: user.fullName,
                receiverId: data.receiverId,
                text: data.text,
                timestamp: new Date().toISOString(),
                read: false,
                type: 'text',
                reactions: []
            };

            messages.push(newMessage);
            writeLocalFile('local-messages.json', messages);

            // إرسال للمستلم إذا كان متصل
            const receiverSocketId = userSockets.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', newMessage);
            }

            socket.emit('message_sent', newMessage);
        } catch (error) {
            console.error('خطأ إرسال الرسالة:', error);
            socket.emit('message_error', { error: 'فشل إرسال الرسالة' });
        }
    });

    // تفاعل مع الرسالة
    socket.on('react_to_message', async (data) => {
        try {
            const messages = readLocalFile('local-messages.json');
            const messageIndex = messages.findIndex(m => m._id === data.messageId);
            
            if (messageIndex !== -1) {
                if (!messages[messageIndex].reactions) {
                    messages[messageIndex].reactions = [];
                }
                
                const existingReaction = messages[messageIndex].reactions.find(r => r.userId === data.userId);
                if (existingReaction) {
                    existingReaction.emoji = data.emoji;
                } else {
                    messages[messageIndex].reactions.push({
                        userId: data.userId,
                        emoji: data.emoji,
                        timestamp: new Date().toISOString()
                    });
                }
                
                writeLocalFile('local-messages.json', messages);
                
                // بث التفاعل للمستخدمين المعنيين
                io.emit('message_reacted', {
                    messageId: data.messageId,
                    reactions: messages[messageIndex].reactions
                });
            }
        } catch (error) {
            console.error('خطأ في التفاعل:', error);
        }
    });

    // كتابة رسالة
    socket.on('typing_start', (data) => {
        const receiverSocketId = userSockets.get(data.receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', {
                userId: data.senderId,
                userName: data.senderName
            });
        }
    });

    socket.on('typing_stop', (data) => {
        const receiverSocketId = userSockets.get(data.receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_stop_typing', {
                userId: data.senderId
            });
        }
    });

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            connectedUsers.delete(socket.id);
            userSockets.delete(user._id);
            
            // إعلام الآخرين بغياب المستخدم
            socket.broadcast.emit('user_offline', {
                userId: user._id
            });
        }
        console.log('👤 مستخدم غير متصل:', socket.id);
    });
});

// نظام الـ Stories
app.post('/api/stories', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي ملف' });
        }

        const stories = readLocalFile('local-stories.json');
        
        // حذف الـ Stories المنتهية
        const now = new Date();
        const activeStories = stories.filter(story => {
            const storyTime = new Date(story.createdAt);
            return (now - storyTime) < (24 * 60 * 60 * 1000); // 24 ساعة
        });

        const newStory = {
            _id: uuidv4(),
            userId: req.user._id,
            userName: req.user.fullName,
            userAvatar: req.user.avatar || null,
            mediaUrl: `/stories/${req.file.filename}`,
            mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
            duration: req.file.mimetype.startsWith('video/') ? 15 : 7, // ثواني
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            views: [],
            reactions: []
        };

        activeStories.push(newStory);
        writeLocalFile('local-stories.json', activeStories);

        // بث الـ Story الجديد للمتابعين
        io.emit('new_story', newStory);

        res.json({
            message: 'تم نشر الـ Story بنجاح',
            story: newStory
        });
    } catch (error) {
        console.error('خطأ نشر Story:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = readLocalFile('local-stories.json');
        const now = new Date();
        
        // تصفية الـ Stories النشطة فقط
        const activeStories = stories.filter(story => new Date(story.expiresAt) > now);
        
        // تجميع الـ Stories بالمستخدم
        const storiesByUser = {};
        activeStories.forEach(story => {
            if (!storiesByUser[story.userId]) {
                storiesByUser[story.userId] = {
                    user: {
                        _id: story.userId,
                        fullName: story.userName,
                        avatar: story.userAvatar
                    },
                    stories: []
                };
            }
            storiesByUser[story.userId].stories.push(story);
        });

        res.json(Object.values(storiesByUser));
    } catch (error) {
        console.error('خطأ جلب Stories:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/stories/:storyId/view', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const stories = readLocalFile('local-stories.json');
        
        const storyIndex = stories.findIndex(s => s._id === storyId);
        if (storyIndex !== -1) {
            if (!stories[storyIndex].views.some(view => view.userId === req.user._id)) {
                stories[storyIndex].views.push({
                    userId: req.user._id,
                    userName: req.user.fullName,
                    viewedAt: new Date().toISOString()
                });
                
                writeLocalFile('local-stories.json', stories);
                
                // إعلام صاحب الـ Story بالمشاهدة
                const storyOwnerSocket = userSockets.get(stories[storyIndex].userId);
                if (storyOwnerSocket) {
                    io.to(storyOwnerSocket).emit('story_viewed', {
                        storyId,
                        viewer: {
                            userId: req.user._id,
                            userName: req.user.fullName
                        }
                    });
                }
            }
        }

        res.json({ message: 'تم تسجيل المشاهدة' });
    } catch (error) {
        console.error('خطأ تسجيل مشاهدة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام القنوات والمجموعات
app.post('/api/channels', authenticateToken, requireAdmin, upload.single('channel'), async (req, res) => {
    try {
        const { name, description, isPublic } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'اسم القناة مطلوب' });
        }

        const channels = readLocalFile('local-channels.json');
        
        const newChannel = {
            _id: uuidv4(),
            name,
            description: description || '',
            avatar: req.file ? `/channels/${req.file.filename}` : null,
            createdBy: req.user._id,
            createdAt: new Date().toISOString(),
            isPublic: isPublic !== 'false',
            members: [req.user._id],
            admins: [req.user._id]
        };

        channels.push(newChannel);
        writeLocalFile('local-channels.json', channels);

        io.emit('new_channel', newChannel);

        res.json({
            message: 'تم إنشاء القناة بنجاح',
            channel: newChannel
        });
    } catch (error) {
        console.error('خطأ إنشاء قناة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = readLocalFile('local-channels.json');
        const publicChannels = channels.filter(channel => 
            channel.isPublic || channel.members.includes(req.user._id)
        );
        
        res.json(publicChannels);
    } catch (error) {
        console.error('خطأ جلب القنوات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام الرسائل المتطور
app.post('/api/chat/send', authenticateToken, upload.array('attachments', 5), async (req, res) => {
    try {
        const { text, receiverId, channelId, replyTo, type = 'text' } = req.body;

        if (!text && (!req.files || req.files.length === 0)) {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        const messages = readLocalFile('local-messages.json');
        
        const attachments = req.files ? req.files.map(file => ({
            filename: file.filename,
            originalName: file.originalname,
            url: `/uploads/${file.filename}`,
            type: file.mimetype,
            size: file.size
        })) : [];

        const newMessage = {
            _id: uuidv4(),
            senderId: req.user._id,
            senderName: req.user.fullName,
            receiverId: receiverId,
            channelId: channelId,
            text: text || '',
            attachments: attachments,
            timestamp: new Date().toISOString(),
            read: false,
            type: type,
            replyTo: replyTo,
            reactions: [],
            edited: false
        };

        messages.push(newMessage);
        writeLocalFile('local-messages.json', messages);

        // إرسال عبر WebSocket
        if (channelId) {
            io.emit('channel_message', newMessage);
        } else {
            const receiverSocketId = userSockets.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', newMessage);
            }
        }

        res.json({
            message: 'تم إرسال الرسالة',
            message: newMessage
        });
    } catch (error) {
        console.error('خطأ إرسال الرسالة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على المحادثات الحديثة
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const messages = readLocalFile('local-messages.json');
        const users = readLocalFile('local-users.json');
        
        const userConversations = {};
        
        messages.forEach(msg => {
            if (msg.channelId) return; // تجاهل رسائل القنوات
            
            const otherUserId = msg.senderId === req.user._id ? msg.receiverId : msg.senderId;
            
            if (otherUserId && otherUserId !== req.user._id) {
                if (!userConversations[otherUserId]) {
                    const user = users.find(u => u._id === otherUserId);
                    if (user) {
                        const conversationMessages = messages.filter(m => 
                            (m.senderId === req.user._id && m.receiverId === otherUserId) ||
                            (m.senderId === otherUserId && m.receiverId === req.user._id)
                        );
                        
                        const lastMessage = conversationMessages[conversationMessages.length - 1];
                        const unreadCount = conversationMessages.filter(m => 
                            m.receiverId === req.user._id && !m.read
                        ).length;

                        userConversations[otherUserId] = {
                            userId: user._id,
                            userName: user.fullName,
                            userAvatar: user.avatar,
                            userPhone: user.phone,
                            lastMessage: lastMessage?.text || 'لا توجد رسائل',
                            lastMessageTime: lastMessage?.timestamp || new Date().toISOString(),
                            unreadCount: unreadCount,
                            isOnline: userSockets.has(user._id)
                        };
                    }
                }
            }
        });
        
        res.json(Object.values(userConversations));
    } catch (error) {
        console.error('خطأ جلب المحادثات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// المسارات الأساسية (التسجيل، الدخول، إلخ)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password } = req.body;

        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
        }

        const saudiPhoneRegex = /^5\d{8}$/;
        if (!saudiPhoneRegex.test(phone)) {
            return res.status(400).json({ 
                message: 'رقم الهاتف غير صحيح' 
            });
        }

        const users = readLocalFile('local-users.json');
        if (users.find(u => u.phone === phone)) {
            return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
            _id: uuidv4(),
            fullName: fullName.trim(),
            phone,
            university,
            major,
            batch,
            password: hashedPassword,
            role: 'student',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            avatar: null
        };

        users.push(newUser);
        writeLocalFile('local-users.json', users);

        res.status(201).json({ 
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                _id: newUser._id,
                fullName: newUser.fullName,
                phone: newUser.phone,
                university: newUser.university
            }
        });
    } catch (error) {
        console.error('خطأ التسجيل:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ message: 'رقم الهاتف وكلمة المرور مطلوبان' });
        }

        const users = readLocalFile('local-users.json');
        const user = users.find(u => u.phone === phone && u.isActive !== false);

        if (!user) {
            return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        }

        // تحديث آخر دخول
        user.lastLogin = new Date().toISOString();
        writeLocalFile('local-users.json', users);

        const token = jwt.sign(
            { 
                _id: user._id,
                fullName: user.fullName,
                phone: user.phone,
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
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
                lastLogin: user.lastLogin,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('خطأ الدخول:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة الصور
app.post('/api/admin/send-image', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { receiverId, description } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة' });
        }

        if (!receiverId) {
            return res.status(400).json({ message: 'معرف المستلم مطلوب' });
        }

        const users = readLocalFile('local-users.json');
        const receiver = users.find(u => u._id === receiverId);
        
        if (!receiver) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        const images = readLocalFile('local-images.json');
        const newImage = {
            _id: uuidv4(),
            userId: receiverId,
            userName: receiver.fullName,
            userPhone: receiver.phone,
            imageName: req.file.filename,
            originalName: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            description: description || '',
            sentBy: req.user._id,
            sentAt: new Date().toISOString(),
            fileSize: req.file.size,
            mimeType: req.file.mimetype
        };

        images.push(newImage);
        writeLocalFile('local-images.json', images);

        res.json({ 
            message: 'تم إرسال الصورة بنجاح',
            image: {
                id: newImage._id,
                url: newImage.url,
                userName: newImage.userName,
                sentAt: newImage.sentAt
            }
        });
    } catch (error) {
        console.error('خطأ إرسال الصورة:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/images', authenticateToken, async (req, res) => {
    try {
        const images = readLocalFile('local-images.json')
            .filter(img => img.userId === req.user._id)
            .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
        
        res.json(images);
    } catch (error) {
        console.error('خطأ جلب الصور:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة المستخدمين للمدير
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = readLocalFile('local-users.json')
            .filter(user => user.role === 'student')
            .map(user => ({
                _id: user._id,
                fullName: user.fullName,
                phone: user.phone,
                university: user.university,
                major: user.major,
                batch: user.batch,
                isActive: user.isActive,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                avatar: user.avatar
            }));
        
        res.json(users);
    } catch (error) {
        console.error('خطأ جلب المستخدمين:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إحصائيات النظام
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = readLocalFile('local-users.json');
        const messages = readLocalFile('local-messages.json');
        const images = readLocalFile('local-images.json');
        const stories = readLocalFile('local-stories.json');

        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isActive !== false && u.role === 'student').length,
            totalMessages: messages.length,
            unreadMessages: messages.filter(m => m.receiverId === 'admin' && !m.read).length,
            totalImages: images.length,
            activeStories: stories.filter(s => new Date(s.expiresAt) > new Date()).length,
            onlineUsers: connectedUsers.size,
            storageUsed: images.reduce((total, img) => total + (img.fileSize || 0), 0)
        };

        res.json(stats);
    } catch (error) {
        console.error('خطأ جلب الإحصائيات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// خدمة الملفات الثابتة
app.use('/uploads', express.static('uploads'));
app.use('/stories', express.static('stories'));
app.use('/avatars', express.static('avatars'));
app.use('/channels', express.static('channels'));

// إنشاء مدير افتراضي
const createAdminUser = async () => {
    try {
        const users = readLocalFile('local-users.json');
        const adminExists = users.find(u => u.role === 'admin');

        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('Admin123!@#', 12);
            const adminUser = {
                _id: 'admin-' + crypto.randomBytes(8).toString('hex'),
                fullName: 'مدير النظام',
                phone: '500000000',
                university: 'الإدارة العامة',
                major: 'نظم المعلومات',
                batch: '2024',
                password: hashedPassword,
                role: 'admin',
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                avatar: null
            };

            users.push(adminUser);
            writeLocalFile('local-users.json', users);
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
            console.log('📱 رقم الهاتف: 500000000');
            console.log('🔐 كلمة المرور: Admin123!@#');
        }
    } catch (error) {
        console.error('خطأ في إنشاء المدير:', error);
    }
};

// Route الأساسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// صفحة الإدارة
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار الصحة
app.get('/health', (req, res) => {
    res.json({ 
        status: '✅ النظام يعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        environment: process.env.NODE_ENV || 'development',
        onlineUsers: connectedUsers.size
    });
});

// Middleware للأمان
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// معالجة الأخطاء
app.use((error, req, res, next) => {
    console.error('خطأ غير متوقع:', error);
    res.status(500).json({ 
        message: 'حدث خطأ غير متوقع في النظام',
        reference: crypto.randomBytes(4).toString('hex')
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'الصفحة غير موجودة' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 المنصة الإلكترونية تعمل على البورت ${PORT}`);
    console.log(`🌐 الرابط: http://localhost:${PORT}`);
    console.log(`⚡ النسخة: 3.0.0 - نظام الدردشة المتطور`);
    console.log(`🔒 نظام أمان متقدم مفعل`);
    console.log(`💬 نظام الدردشة في الوقت الحقيقي مفعل`);
    console.log(`📱 نظام الـ Stories مفعل`);
    console.log(`🎯 نظام القنوات والمجموعات مفعل`);
    
    setTimeout(createAdminUser, 2000);
});
