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
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || "*",
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// تهيئة الملفات والمجلدات
function initializeApp() {
    const files = ['local-users.json', 'local-messages.json', 'local-stories.json', 'local-channels.json', 'local-backups.json', 'local-settings.json'];
    const folders = ['uploads', 'stories', 'channels', 'avatars', 'backups', 'chat-backgrounds'];
    
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

    // إنشاء الإعدادات الافتراضية
    const settings = readLocalFile('local-settings.json');
    if (settings.length === 0) {
        const defaultSettings = {
            appName: "المنصة التعليمية",
            theme: "light",
            maxFileSize: 25,
            storyDuration: 24,
            backupInterval: 24,
            createdAt: new Date().toISOString()
        };
        writeLocalFile('local-settings.json', [defaultSettings]);
    }
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
        console.error(`Error reading ${filename}:`, error);
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

// نظام النسخ الاحتياطي
function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupData = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            users: readLocalFile('local-users.json'),
            messages: readLocalFile('local-messages.json'),
            stories: readLocalFile('local-stories.json'),
            channels: readLocalFile('local-channels.json'),
            settings: readLocalFile('local-settings.json')
        };

        const backups = readLocalFile('local-backups.json');
        backups.push(backupData);
        
        if (backups.length > 10) {
            backups.splice(0, backups.length - 10);
        }
        
        writeLocalFile('local-backups.json', backups);
        
        const backupFilename = `backups/backup-${timestamp}.json`;
        fs.writeFileSync(backupFilename, JSON.stringify(backupData, null, 2));
        
        console.log(`✅ تم إنشاء نسخة احتياطية: ${backupFilename}`);
        return backupData;
    } catch (error) {
        console.error('خطأ في النسخ الاحتياطي:', error);
        return null;
    }
}

// جدولة النسخ الاحتياطي التلقائي
setInterval(() => {
    createBackup();
}, 24 * 60 * 60 * 1000);

// تخزين متقدم للصور والملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads/';
        if (file.fieldname === 'story') folder = 'stories/';
        if (file.fieldname === 'avatar') folder = 'avatars/';
        if (file.fieldname === 'channel') folder = 'channels/';
        if (file.fieldname === 'background') folder = 'chat-backgrounds/';
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
        fileSize: 25 * 1024 * 1024,
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
const typingUsers = new Map();

io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('authenticate', (userData) => {
        connectedUsers.set(socket.id, userData);
        userSockets.set(userData._id, socket.id);
        
        updateUserOnlineStatus(userData._id, true);
        
        console.log(`✅ المستخدم ${userData.fullName} تم توثيقه`);
    });

    // إرسال رسالة فورية
    socket.on('send_message', async (data) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) {
                socket.emit('message_error', { error: 'المستخدم غير معتمد' });
                return;
            }

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
                reactions: [],
                attachments: data.attachments || []
            };

            messages.push(newMessage);
            writeLocalFile('local-messages.json', messages);

            const receiverSocketId = userSockets.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', newMessage);
            }

            socket.emit('message_sent', newMessage);
            
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('message_notification', {
                    from: user.fullName,
                    message: data.text?.substring(0, 50) + '...' || 'مرفق',
                    timestamp: new Date().toISOString()
                });
            }

            socket.to(receiverSocketId).emit('user_stop_typing', {
                userId: user._id
            });
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
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const receiverSocketId = userSockets.get(data.receiverId);
        if (receiverSocketId) {
            typingUsers.set(user._id, {
                receiverId: data.receiverId,
                timestamp: Date.now()
            });
            
            io.to(receiverSocketId).emit('user_typing', {
                userId: user._id,
                userName: user.fullName
            });
        }
    });

    socket.on('typing_stop', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const receiverSocketId = userSockets.get(data.receiverId);
        if (receiverSocketId) {
            typingUsers.delete(user._id);
            io.to(receiverSocketId).emit('user_stop_typing', {
                userId: user._id
            });
        }
    });

    // إدارة الخصوصية
    socket.on('update_privacy', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === user._id);
        
        if (userIndex !== -1) {
            users[userIndex].privacy = {
                ...users[userIndex].privacy,
                ...data
            };
            writeLocalFile('local-users.json', users);
            
            socket.emit('privacy_updated', users[userIndex].privacy);
        }
    });

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            connectedUsers.delete(socket.id);
            userSockets.delete(user._id);
            typingUsers.delete(user._id);
            
            updateUserOnlineStatus(user._id, false);
            
            socket.broadcast.emit('user_offline', {
                userId: user._id
            });
        }
        console.log('👤 مستخدم غير متصل:', socket.id);
    });
});

function updateUserOnlineStatus(userId, isOnline) {
    const users = readLocalFile('local-users.json');
    const userIndex = users.findIndex(u => u._id === userId);
    
    if (userIndex !== -1) {
        users[userIndex].isOnline = isOnline;
        if (isOnline) {
            users[userIndex].lastSeen = new Date().toISOString();
        }
        writeLocalFile('local-users.json', users);
    }
}

// نظام الـ Stories المتقدم
app.post('/api/stories', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي ملف' });
        }

        const stories = readLocalFile('local-stories.json');
        
        const now = new Date();
        const activeStories = stories.filter(story => {
            const storyTime = new Date(story.createdAt);
            return (now - storyTime) < (24 * 60 * 60 * 1000);
        });

        const newStory = {
            _id: uuidv4(),
            userId: req.user._id,
            userName: req.user.fullName,
            userAvatar: req.user.avatar || null,
            mediaUrl: `/stories/${req.file.filename}`,
            mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
            duration: req.file.mimetype.startsWith('video/') ? 30 : 7,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            views: [],
            reactions: [],
            savedBy: [],
            allowScreenshots: true
        };

        activeStories.push(newStory);
        writeLocalFile('local-stories.json', activeStories);

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
        
        const activeStories = stories.filter(story => new Date(story.expiresAt) > now);
        
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
            const user = req.user;
            const users = readLocalFile('local-users.json');
            const storyOwner = users.find(u => u._id === stories[storyIndex].userId);
            
            if (storyOwner?.privacy?.hideStoryViews !== true) {
                if (!stories[storyIndex].views.some(view => view.userId === user._id)) {
                    stories[storyIndex].views.push({
                        userId: user._id,
                        userName: user.fullName,
                        viewedAt: new Date().toISOString()
                    });
                    
                    writeLocalFile('local-stories.json', stories);
                    
                    const storyOwnerSocket = userSockets.get(stories[storyIndex].userId);
                    if (storyOwnerSocket) {
                        io.to(storyOwnerSocket).emit('story_viewed', {
                            storyId,
                            viewer: {
                                userId: user._id,
                                userName: user.fullName
                            }
                        });
                    }
                }
            }
        }

        res.json({ message: 'تم تسجيل المشاهدة' });
    } catch (error) {
        console.error('خطأ تسجيل مشاهدة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/stories/:storyId/save', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const stories = readLocalFile('local-stories.json');
        
        const storyIndex = stories.findIndex(s => s._id === storyId);
        if (storyIndex !== -1) {
            if (!stories[storyIndex].savedBy.includes(req.user._id)) {
                stories[storyIndex].savedBy.push(req.user._id);
                writeLocalFile('local-stories.json', stories);
            }
        }

        res.json({ message: 'تم حفظ الـ Story' });
    } catch (error) {
        console.error('خطأ حفظ Story:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة القنوات والمجموعات المتقدمة
app.post('/api/channels', authenticateToken, requireAdmin, upload.single('channel'), async (req, res) => {
    try {
        const { name, description, isPublic, type } = req.body;

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
            type: type || 'channel',
            members: [req.user._id],
            admins: [req.user._id],
            settings: {
                allowMessages: true,
                allowMedia: true,
                allowReactions: true
            }
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

app.put('/api/channels/:channelId', authenticateToken, requireAdmin, upload.single('channel'), async (req, res) => {
    try {
        const { channelId } = req.params;
        const { name, description, isPublic, settings } = req.body;

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ message: 'القناة غير موجودة' });
        }

        channels[channelIndex].name = name || channels[channelIndex].name;
        channels[channelIndex].description = description || channels[channelIndex].description;
        channels[channelIndex].isPublic = isPublic !== undefined ? isPublic : channels[channelIndex].isPublic;
        
        if (req.file) {
            channels[channelIndex].avatar = `/channels/${req.file.filename}`;
        }
        
        if (settings) {
            channels[channelIndex].settings = { ...channels[channelIndex].settings, ...settings };
        }

        writeLocalFile('local-channels.json', channels);
        io.emit('channel_updated', channels[channelIndex]);

        res.json({
            message: 'تم تحديث القناة بنجاح',
            channel: channels[channelIndex]
        });
    } catch (error) {
        console.error('خطأ تحديث قناة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/channels/:channelId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { channelId } = req.params;

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ message: 'القناة غير موجودة' });
        }

        const deletedChannel = channels.splice(channelIndex, 1)[0];
        writeLocalFile('local-channels.json', channels);

        const messages = readLocalFile('local-messages.json');
        const filteredMessages = messages.filter(m => m.channelId !== channelId);
        writeLocalFile('local-messages.json', filteredMessages);

        io.emit('channel_deleted', { channelId });

        res.json({
            message: 'تم حذف القناة بنجاح',
            channel: deletedChannel
        });
    } catch (error) {
        console.error('خطأ حذف قناة:', error);
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
            if (msg.channelId) return;
            
            const otherUserId = msg.senderId === req.user._id ? msg.receiverId : msg.senderId;
            
            if (otherUserId && otherUserId !== req.user._id) {
                if (!userConversations[otherUserId]) {
                    const user = users.find(u => u._id === otherUserId);
                    if (user && user.role !== 'admin') {
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

// البحث عن مستخدمين للدردشة
app.get('/api/chat/search-users', authenticateToken, async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const users = readLocalFile('local-users.json');
        const filteredUsers = users
            .filter(user => 
                user._id !== req.user._id && 
                user.role !== 'admin' &&
                user.fullName.toLowerCase().includes(query.toLowerCase())
            )
            .map(user => ({
                _id: user._id,
                fullName: user.fullName,
                avatar: user.avatar,
                isOnline: userSockets.has(user._id),
                lastSeen: user.lastSeen
            }));

        res.json(filteredUsers);
    } catch (error) {
        console.error('خطأ البحث:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على رسائل محادثة محددة
app.get('/api/chat/conversation/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const messages = readLocalFile('local-messages.json');
        
        const conversationMessages = messages.filter(msg => 
            !msg.channelId &&
            ((msg.senderId === req.user._id && msg.receiverId === userId) ||
             (msg.senderId === userId && msg.receiverId === req.user._id))
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        res.json(conversationMessages);
    } catch (error) {
        console.error('خطأ جلب رسائل المحادثة:', error);
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
            lastSeen: null,
            isOnline: false,
            avatar: null,
            privacy: {
                hideOnlineStatus: false,
                hideLastSeen: false,
                hideStoryViews: false,
                profileVisibility: 'public'
            },
            chatSettings: {
                theme: 'default',
                background: null,
                fontSize: 'medium'
            }
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

        user.lastLogin = new Date().toISOString();
        user.lastSeen = new Date().toISOString();
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
                avatar: user.avatar,
                privacy: user.privacy,
                chatSettings: user.chatSettings
            }
        });
    } catch (error) {
        console.error('خطأ الدخول:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة المستخدمين المتقدمة للمدير
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
                lastSeen: user.lastSeen,
                isOnline: user.isOnline,
                avatar: user.avatar,
                privacy: user.privacy
            }));
        
        res.json(users);
    } catch (error) {
        console.error('خطأ جلب المستخدمين:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        const allowedUpdates = ['fullName', 'university', 'major', 'batch', 'isActive'];
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                users[userIndex][field] = updates[field];
            }
        });

        writeLocalFile('local-users.json', users);

        res.json({
            message: 'تم تحديث بيانات المستخدم بنجاح',
            user: users[userIndex]
        });
    } catch (error) {
        console.error('خطأ تحديث المستخدم:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        const deletedUser = users.splice(userIndex, 1)[0];
        writeLocalFile('local-users.json', users);

        const messages = readLocalFile('local-messages.json');
        const filteredMessages = messages.filter(m => 
            m.senderId !== userId && m.receiverId !== userId
        );
        writeLocalFile('local-messages.json', filteredMessages);

        const stories = readLocalFile('local-stories.json');
        const filteredStories = stories.filter(s => s.userId !== userId);
        writeLocalFile('local-stories.json', filteredStories);

        res.json({
            message: 'تم حذف المستخدم بنجاح',
            user: deletedUser
        });
    } catch (error) {
        console.error('خطأ حذف المستخدم:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة الرسائل والـ Stories للمدير
app.delete('/api/admin/messages/:messageId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { messageId } = req.params;

        const messages = readLocalFile('local-messages.json');
        const messageIndex = messages.findIndex(m => m._id === messageId);
        
        if (messageIndex === -1) {
            return res.status(404).json({ message: 'الرسالة غير موجودة' });
        }

        const deletedMessage = messages.splice(messageIndex, 1)[0];
        writeLocalFile('local-messages.json', messages);

        io.emit('message_deleted', { messageId });

        res.json({
            message: 'تم حذف الرسالة بنجاح',
            message: deletedMessage
        });
    } catch (error) {
        console.error('خطأ حذف الرسالة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/admin/stories/:storyId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { storyId } = req.params;

        const stories = readLocalFile('local-stories.json');
        const storyIndex = stories.findIndex(s => s._id === storyId);
        
        if (storyIndex === -1) {
            return res.status(404).json({ message: 'الـ Story غير موجود' });
        }

        const deletedStory = stories.splice(storyIndex, 1)[0];
        writeLocalFile('local-stories.json', stories);

        io.emit('story_deleted', { storyId });

        res.json({
            message: 'تم حذف الـ Story بنجاح',
            story: deletedStory
        });
    } catch (error) {
        console.error('خطأ حذف Story:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إحصائيات النظام المتقدمة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = readLocalFile('local-users.json');
        const messages = readLocalFile('local-messages.json');
        const stories = readLocalFile('local-stories.json');
        const channels = readLocalFile('local-channels.json');

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isActive !== false && u.role === 'student').length,
            onlineUsers: connectedUsers.size,
            totalMessages: messages.length,
            messagesToday: messages.filter(m => new Date(m.timestamp) >= today).length,
            unreadMessages: messages.filter(m => !m.read).length,
            activeStories: stories.filter(s => new Date(s.expiresAt) > now).length,
            totalChannels: channels.length,
            newUsersToday: users.filter(u => new Date(u.createdAt) >= today && u.role === 'student').length
        };

        res.json(stats);
    } catch (error) {
        console.error('خطأ جلب الإحصائيات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام النسخ الاحتياطي والاستعادة
app.post('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const backup = createBackup();
        
        if (backup) {
            res.json({
                message: 'تم إنشاء النسخة الاحتياطية بنجاح',
                backup: backup
            });
        } else {
            res.status(500).json({ message: 'فشل إنشاء النسخة الاحتياطية' });
        }
    } catch (error) {
        console.error('خطأ إنشاء نسخة احتياطية:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/admin/backups', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const backups = readLocalFile('local-backups.json');
        res.json(backups.reverse());
    } catch (error) {
        console.error('خطأ جلب النسخ الاحتياطية:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/admin/restore', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { backupId } = req.body;

        const backups = readLocalFile('local-backups.json');
        const backup = backups.find(b => b.id === backupId);
        
        if (!backup) {
            return res.status(404).json({ message: 'النسخة الاحتياطية غير موجودة' });
        }

        writeLocalFile('local-users.json', backup.users || []);
        writeLocalFile('local-messages.json', backup.messages || []);
        writeLocalFile('local-stories.json', backup.stories || []);
        writeLocalFile('local-channels.json', backup.channels || []);
        writeLocalFile('local-settings.json', backup.settings || []);

        connectedUsers.clear();
        userSockets.clear();
        typingUsers.clear();

        io.emit('system_restored', { timestamp: new Date().toISOString() });

        res.json({
            message: 'تم استعادة البيانات بنجاح',
            backup: backup
        });
    } catch (error) {
        console.error('خطأ استعادة البيانات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة الخصوصية والإعدادات
app.put('/api/user/privacy', authenticateToken, async (req, res) => {
    try {
        const { privacy } = req.body;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === req.user._id);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        users[userIndex].privacy = {
            ...users[userIndex].privacy,
            ...privacy
        };

        writeLocalFile('local-users.json', users);

        res.json({
            message: 'تم تحديث إعدادات الخصوصية',
            privacy: users[userIndex].privacy
        });
    } catch (error) {
        console.error('خطأ تحديث الخصوصية:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/user/chat-settings', authenticateToken, upload.single('background'), async (req, res) => {
    try {
        const { theme, fontSize } = req.body;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === req.user._id);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        users[userIndex].chatSettings = {
            theme: theme || users[userIndex].chatSettings?.theme || 'default',
            fontSize: fontSize || users[userIndex].chatSettings?.fontSize || 'medium',
            background: req.file ? `/chat-backgrounds/${req.file.filename}` : users[userIndex].chatSettings?.background
        };

        writeLocalFile('local-users.json', users);

        res.json({
            message: 'تم تحديث إعدادات الدردشة',
            chatSettings: users[userIndex].chatSettings
        });
    } catch (error) {
        console.error('خطأ تحديث إعدادات الدردشة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// خدمة الملفات الثابتة
app.use('/uploads', express.static('uploads'));
app.use('/stories', express.static('stories'));
app.use('/avatars', express.static('avatars'));
app.use('/channels', express.static('channels'));
app.use('/chat-backgrounds', express.static('chat-backgrounds'));

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
                lastSeen: null,
                isOnline: false,
                avatar: null,
                privacy: {
                    hideOnlineStatus: true,
                    hideLastSeen: true,
                    hideStoryViews: true,
                    profileVisibility: 'private'
                },
                chatSettings: {
                    theme: 'default',
                    background: null,
                    fontSize: 'medium'
                }
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

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: '✅ النظام يعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        version: '4.0.0',
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
    console.log(`⚡ النسخة: 4.0.0 - نظام الإدارة المتكامل`);
    console.log(`🔒 نظام أمان متقدم مفعل`);
    console.log(`💬 نظام الدردشة في الوقت الحقيقي مفعل`);
    console.log(`📱 نظام الـ Stories المتقدم مفعل`);
    console.log(`🎯 نظام القنوات والمجموعات المتقدم مفعل`);
    console.log(`💾 نظام النسخ الاحتياطي التلقائي مفعل`);
    
    setTimeout(createAdminUser, 2000);
    setTimeout(createBackup, 5000);
});
