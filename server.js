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
const archiver = require('archiver');
const unzipper = require('unzipper');
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

// معدلات الأمان
app.disable('x-powered-by');

// قاعدة البيانات المحسنة
class Database {
    constructor() {
        this.tables = ['users', 'messages', 'stories', 'groups', 'channels', 'settings', 'backups'];
        this.init();
    }

    init() {
        this.tables.forEach(table => {
            if (!fs.existsSync(`${table}.json`)) {
                this.saveTable(table, this.getDefaultData(table));
            }
        });
    }

    getDefaultData(table) {
        const defaults = {
            users: [
                {
                    _id: 'admin-' + crypto.randomBytes(8).toString('hex'),
                    username: 'admin',
                    phone: '500000000',
                    password: '$2a$12$LQv3c1yqBWVHxkd0g8f7QuOMrS8UB.aRcZ6YJgSqDEDdQYz6X1WzK', // admin123
                    role: 'admin',
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    lastLogin: null,
                    settings: {
                        hideOnlineStatus: false,
                        hideLastSeen: false,
                        hideStoryViews: false,
                        chatBackground: 'default',
                        theme: 'light'
                    }
                }
            ],
            messages: [],
            stories: [],
            groups: [],
            channels: [],
            settings: {
                appName: 'المنصة التعليمية',
                version: '4.0.0',
                maintenance: false
            },
            backups: []
        };
        return defaults[table] || [];
    }

    getTable(table) {
        try {
            const data = fs.readFileSync(`${table}.json`, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error reading ${table}:`, error);
            return this.getDefaultData(table);
        }
    }

    saveTable(table, data) {
        try {
            fs.writeFileSync(`${table}.json`, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error(`Error saving ${table}:`, error);
            return false;
        }
    }

    // نسخ احتياطي
    async createBackup() {
        const backupId = uuidv4();
        const timestamp = new Date().toISOString();
        const backupPath = `backups/backup-${backupId}.zip`;
        
        if (!fs.existsSync('backups')) {
            fs.mkdirSync('backups', { recursive: true });
        }

        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                const backups = this.getTable('backups');
                backups.push({
                    id: backupId,
                    timestamp: timestamp,
                    size: archive.pointer(),
                    path: backupPath
                });
                this.saveTable('backups', backups);
                resolve(backupId);
            });

            archive.on('error', reject);
            archive.pipe(output);

            this.tables.forEach(table => {
                archive.file(`${table}.json`, { name: `${table}.json` });
            });

            archive.finalize();
        });
    }

    async restoreBackup(backupId) {
        const backups = this.getTable('backups');
        const backup = backups.find(b => b.id === backupId);
        
        if (!backup) {
            throw new Error('Backup not found');
        }

        await fs.createReadStream(backup.path)
            .pipe(unzipper.Extract({ path: '.' }))
            .promise();

        return true;
    }
}

const db = new Database();

// تهيئة الملفات والمجلدات
function initializeApp() {
    const folders = ['uploads', 'stories', 'avatars', 'groups', 'channels', 'backups', 'temp'];
    
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

// تخزين متقدم للوسائط
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads/';
        if (file.fieldname === 'story') folder = 'stories/';
        if (file.fieldname === 'avatar') folder = 'avatars/';
        if (file.fieldname === 'group') folder = 'groups/';
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
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('application/')) {
            cb(null, true);
        } else {
            cb(new Error('يسمح برفع الصور والفيديوهات والملفات فقط'), false);
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

// نظام WebSocket المحسن
const connectedUsers = new Map();
const userSockets = new Map();
const typingUsers = new Map();

io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('authenticate', (userData) => {
        connectedUsers.set(socket.id, userData);
        userSockets.set(userData._id, socket.id);
        
        // تحديث حالة الاتصال للمستخدمين الآخرين
        socket.broadcast.emit('user_online', {
            userId: userData._id,
            username: userData.username
        });
        
        console.log(`✅ المستخدم ${userData.username} تم توثيقه`);
    });

    // إرسال رسالة فورية
    socket.on('send_message', async (data) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) {
                socket.emit('message_error', { error: 'المستخدم غير معتمد' });
                return;
            }

            const messages = db.getTable('messages');
            const newMessage = {
                _id: uuidv4(),
                senderId: user._id,
                senderUsername: user.username,
                receiverId: data.receiverId,
                receiverType: data.receiverType || 'user', // user, group, channel
                text: data.text,
                attachments: data.attachments || [],
                timestamp: new Date().toISOString(),
                read: false,
                type: data.type || 'text',
                replyTo: data.replyTo,
                reactions: []
            };

            messages.push(newMessage);
            db.saveTable('messages', messages);

            // إرسال للمستلم إذا كان متصل
            if (data.receiverType === 'user') {
                const receiverSocketId = userSockets.get(data.receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('new_message', newMessage);
                }
            } else if (data.receiverType === 'group') {
                // إرسال لأعضاء المجموعة
                socket.broadcast.emit('group_message', newMessage);
            } else if (data.receiverType === 'channel') {
                // إرسال لمشتركي القناة
                socket.broadcast.emit('channel_message', newMessage);
            }

            socket.emit('message_sent', newMessage);
            
        } catch (error) {
            console.error('خطأ إرسال الرسالة:', error);
            socket.emit('message_error', { error: 'فشل إرسال الرسالة' });
        }
    });

    // كتابة رسالة
    socket.on('typing_start', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        typingUsers.set(user._id, {
            userId: user._id,
            username: user.username,
            conversationId: data.conversationId,
            timestamp: new Date()
        });

        if (data.receiverType === 'user') {
            const receiverSocketId = userSockets.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('user_typing', {
                    userId: user._id,
                    username: user.username,
                    conversationId: data.conversationId
                });
            }
        }
    });

    socket.on('typing_stop', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        typingUsers.delete(user._id);

        if (data.receiverType === 'user') {
            const receiverSocketId = userSockets.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('user_stop_typing', {
                    userId: user._id,
                    conversationId: data.conversationId
                });
            }
        }
    });

    // تفاعل مع الرسالة
    socket.on('react_to_message', async (data) => {
        try {
            const messages = db.getTable('messages');
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
                        username: data.username,
                        emoji: data.emoji,
                        timestamp: new Date().toISOString()
                    });
                }
                
                db.saveTable('messages', messages);
                
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

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            connectedUsers.delete(socket.id);
            userSockets.delete(user._id);
            typingUsers.delete(user._id);
            
            // إعلام الآخرين بغياب المستخدم
            socket.broadcast.emit('user_offline', {
                userId: user._id
            });
        }
        console.log('👤 مستخدم غير متصل:', socket.id);
    });
});

// نظام الـ Stories المحسن
app.post('/api/stories', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي ملف' });
        }

        const stories = db.getTable('stories');
        
        // حذف الـ Stories المنتهية
        const now = new Date();
        const activeStories = stories.filter(story => {
            const storyTime = new Date(story.createdAt);
            return (now - storyTime) < (24 * 60 * 60 * 1000); // 24 ساعة
        });

        const newStory = {
            _id: uuidv4(),
            userId: req.user._id,
            username: req.user.username,
            mediaUrl: `/stories/${req.file.filename}`,
            mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
            duration: req.file.mimetype.startsWith('video/') ? 15000 : 7000, // 15 ثانية للفيديو، 7 للصورة
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            views: [],
            savedBy: [],
            allowSaving: true,
            allowSkipping: true
        };

        activeStories.push(newStory);
        db.saveTable('stories', activeStories);

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
        const stories = db.getTable('stories');
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
                        username: story.username
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
        const stories = db.getTable('stories');
        
        const storyIndex = stories.findIndex(s => s._id === storyId);
        if (storyIndex !== -1) {
            const userSettings = db.getTable('users').find(u => u._id === req.user._id)?.settings || {};
            
            if (!userSettings.hideStoryViews) {
                if (!stories[storyIndex].views.some(view => view.userId === req.user._id)) {
                    stories[storyIndex].views.push({
                        userId: req.user._id,
                        username: req.user.username,
                        viewedAt: new Date().toISOString()
                    });
                    
                    db.saveTable('stories', stories);
                    
                    // إعلام صاحب الـ Story بالمشاهدة
                    const storyOwnerSocket = userSockets.get(stories[storyIndex].userId);
                    if (storyOwnerSocket) {
                        io.to(storyOwnerSocket).emit('story_viewed', {
                            storyId,
                            viewer: {
                                userId: req.user._id,
                                username: req.user.username
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
        const stories = db.getTable('stories');
        
        const storyIndex = stories.findIndex(s => s._id === storyId);
        if (storyIndex !== -1 && stories[storyIndex].allowSaving) {
            if (!stories[storyIndex].savedBy.some(user => user.userId === req.user._id)) {
                stories[storyIndex].savedBy.push({
                    userId: req.user._id,
                    username: req.user.username,
                    savedAt: new Date().toISOString()
                });
                
                db.saveTable('stories', stories);
            }
        }

        res.json({ message: 'تم حفظ الـ Story' });
    } catch (error) {
        console.error('خطأ حفظ Story:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام المجموعات والقنوات
app.post('/api/groups', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description, isPublic } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'اسم المجموعة مطلوب' });
        }

        const groups = db.getTable('groups');
        
        const newGroup = {
            _id: uuidv4(),
            name,
            description: description || '',
            avatar: req.file ? `/groups/${req.file.filename}` : null,
            createdBy: req.user._id,
            createdAt: new Date().toISOString(),
            isPublic: isPublic !== 'false',
            members: [{
                userId: req.user._id,
                username: req.user.username,
                role: 'admin',
                joinedAt: new Date().toISOString()
            }],
            settings: {
                allowInvites: true,
                allowMessages: true,
                adminOnlyPosts: false
            }
        };

        groups.push(newGroup);
        db.saveTable('groups', groups);

        io.emit('new_group', newGroup);

        res.json({
            message: 'تم إنشاء المجموعة بنجاح',
            group: newGroup
        });
    } catch (error) {
        console.error('خطأ إنشاء مجموعة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/channels', authenticateToken, requireAdmin, upload.single('avatar'), async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'اسم القناة مطلوب' });
        }

        const channels = db.getTable('channels');
        
        const newChannel = {
            _id: uuidv4(),
            name,
            description: description || '',
            avatar: req.file ? `/channels/${req.file.filename}` : null,
            createdBy: req.user._id,
            createdAt: new Date().toISOString(),
            subscribers: [],
            isActive: true
        };

        channels.push(newChannel);
        db.saveTable('channels', channels);

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

// نظام إدارة المحادثات للمدير
app.delete('/api/admin/messages/:messageId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { messageId } = req.params;
        const messages = db.getTable('messages');
        
        const filteredMessages = messages.filter(m => m._id !== messageId);
        db.saveTable('messages', filteredMessages);

        io.emit('message_deleted', { messageId });

        res.json({ message: 'تم حذف الرسالة بنجاح' });
    } catch (error) {
        console.error('خطأ حذف رسالة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/admin/stories/:storyId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { storyId } = req.params;
        const stories = db.getTable('stories');
        
        const story = stories.find(s => s._id === storyId);
        if (story && fs.existsSync(`.${story.mediaUrl}`)) {
            fs.unlinkSync(`.${story.mediaUrl}`);
        }

        const filteredStories = stories.filter(s => s._id !== storyId);
        db.saveTable('stories', filteredStories);

        io.emit('story_deleted', { storyId });

        res.json({ message: 'تم حذف الـ Story بنجاح' });
    } catch (error) {
        console.error('خطأ حذف Story:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة المستخدمين للمدير
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = db.getTable('users')
            .filter(user => user.role !== 'admin') // إخفاء المديرين الآخرين
            .map(user => ({
                _id: user._id,
                username: user.username,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                settings: user.settings
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

        const users = db.getTable('users');
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // تحديث البيانات المسموح بها فقط
        const allowedUpdates = ['username', 'phone', 'role', 'isActive', 'settings'];
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                users[userIndex][field] = updates[field];
            }
        });

        db.saveTable('users', users);

        res.json({ 
            message: 'تم تحديث بيانات المستخدم بنجاح',
            user: users[userIndex]
        });
    } catch (error) {
        console.error('خطأ تحديث مستخدم:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        const users = db.getTable('users');
        const filteredUsers = users.filter(u => u._id !== userId);
        db.saveTable('users', filteredUsers);

        // حذف رسائل المستخدم
        const messages = db.getTable('messages');
        const filteredMessages = messages.filter(m => m.senderId !== userId && m.receiverId !== userId);
        db.saveTable('messages', filteredMessages);

        // حذف Stories المستخدم
        const stories = db.getTable('stories');
        const userStories = stories.filter(s => s.userId === userId);
        userStories.forEach(story => {
            if (fs.existsSync(`.${story.mediaUrl}`)) {
                fs.unlinkSync(`.${story.mediaUrl}`);
            }
        });
        const filteredStories = stories.filter(s => s.userId !== userId);
        db.saveTable('stories', filteredStories);

        io.emit('user_deleted', { userId });

        res.json({ message: 'تم حذف المستخدم وجميع بياناته بنجاح' });
    } catch (error) {
        console.error('خطأ حذف مستخدم:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// البحث عن مستخدمين للدردشة
app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const users = db.getTable('users');
        const currentUser = users.find(u => u._id === req.user._id);
        
        const filteredUsers = users
            .filter(user => 
                user._id !== req.user._id && // استبعاد المستخدم الحالي
                user.isActive !== false && // المستخدمين النشطين فقط
                (user.username.toLowerCase().includes(query.toLowerCase()) ||
                 user.phone.includes(query))
            )
            .map(user => ({
                _id: user._id,
                username: user.username,
                phone: user.phone,
                isOnline: userSockets.has(user._id),
                lastSeen: user.lastLogin,
                settings: {
                    hideOnlineStatus: user.settings?.hideOnlineStatus || false,
                    hideLastSeen: user.settings?.hideLastSeen || false
                }
            }));

        // وضع المدير في الأعلى إذا كان مطابقاً للبحث
        const adminUsers = filteredUsers.filter(u => u.role === 'admin');
        const normalUsers = filteredUsers.filter(u => u.role !== 'admin');
        const sortedUsers = [...adminUsers, ...normalUsers];

        res.json(sortedUsers);
    } catch (error) {
        console.error('خطأ البحث:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام النسخ الاحتياطي
app.post('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const backupId = await db.createBackup();
        res.json({ 
            message: 'تم إنشاء النسخ الاحتياطي بنجاح',
            backupId: backupId
        });
    } catch (error) {
        console.error('خطأ إنشاء نسخ احتياطي:', error);
        res.status(500).json({ message: 'خطأ في إنشاء النسخ الاحتياطي' });
    }
});

app.post('/api/admin/restore', authenticateToken, requireAdmin, upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع ملف النسخ الاحتياطي' });
        }

        // استعادة من ملف ZIP
        const tempPath = `temp/restore-${Date.now()}.zip`;
        fs.renameSync(req.file.path, tempPath);

        await db.restoreBackupFromFile(tempPath);
        
        // تحديث البيانات في الذاكرة
        io.emit('system_restored');

        res.json({ message: 'تم استعادة البيانات بنجاح' });
    } catch (error) {
        console.error('خطأ استعادة بيانات:', error);
        res.status(500).json({ message: 'خطأ في استعادة البيانات' });
    }
});

// إعدادات المستخدم
app.put('/api/user/settings', authenticateToken, async (req, res) => {
    try {
        const { settings } = req.body;
        
        const users = db.getTable('users');
        const userIndex = users.findIndex(u => u._id === req.user._id);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        users[userIndex].settings = {
            ...users[userIndex].settings,
            ...settings
        };

        db.saveTable('users', users);

        res.json({ 
            message: 'تم تحديث الإعدادات بنجاح',
            settings: users[userIndex].settings
        });
    } catch (error) {
        console.error('خطأ تحديث إعدادات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// المسارات الأساسية (التسجيل، الدخول، إلخ)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, phone, password } = req.body;

        if (!username || !phone || !password) {
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

        const users = db.getTable('users');
        if (users.find(u => u.phone === phone)) {
            return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });
        }

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ message: 'اسم المستخدم مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
            _id: uuidv4(),
            username: username.trim(),
            phone,
            password: hashedPassword,
            role: 'student',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            settings: {
                hideOnlineStatus: false,
                hideLastSeen: false,
                hideStoryViews: false,
                chatBackground: 'default',
                theme: 'light'
            }
        };

        users.push(newUser);
        db.saveTable('users', users);

        res.status(201).json({ 
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                _id: newUser._id,
                username: newUser.username,
                phone: newUser.phone
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

        const users = db.getTable('users');
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
        db.saveTable('users', users);

        const token = jwt.sign(
            { 
                _id: user._id,
                username: user.username,
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
                username: user.username,
                phone: user.phone,
                role: user.role,
                lastLogin: user.lastLogin,
                settings: user.settings
            }
        });
    } catch (error) {
        console.error('خطأ الدخول:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إحصائيات النظام للمدير
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = db.getTable('users');
        const messages = db.getTable('messages');
        const stories = db.getTable('stories');
        const groups = db.getTable('groups');
        const channels = db.getTable('channels');

        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isActive !== false && u.role === 'student').length,
            onlineUsers: connectedUsers.size,
            totalMessages: messages.length,
            unreadMessages: messages.filter(m => !m.read).length,
            totalStories: stories.length,
            activeStories: stories.filter(s => new Date(s.expiresAt) > new Date()).length,
            totalGroups: groups.length,
            totalChannels: channels.length,
            storageUsed: await calculateStorageUsage()
        };

        res.json(stats);
    } catch (error) {
        console.error('خطأ جلب الإحصائيات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

async function calculateStorageUsage() {
    const folders = ['uploads', 'stories', 'avatars', 'groups', 'channels'];
    let totalSize = 0;

    for (const folder of folders) {
        if (fs.existsSync(folder)) {
            const files = fs.readdirSync(folder);
            for (const file of files) {
                const stats = fs.statSync(path.join(folder, file));
                totalSize += stats.size;
            }
        }
    }

    return totalSize;
}

// خدمة الملفات الثابتة
app.use('/uploads', express.static('uploads'));
app.use('/stories', express.static('stories'));
app.use('/avatars', express.static('avatars'));
app.use('/groups', express.static('groups'));
app.use('/channels', express.static('channels'));

// Route الأساسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// صفحة الإدارة
app.get('/admin', authenticateToken, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار الصحة
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
    console.log(`⚡ النسخة: 4.0.0 - نظام متكامل مع إدارة كاملة`);
    console.log(`🔒 نظام أمان متقدم مفعل`);
    console.log(`💬 نظام الدردشة المتطور مفعل`);
    console.log(`📱 نظام الـ Stories المحسن مفعل`);
    console.log(`👥 نظام المجموعات والقنوات مفعل`);
    console.log(`🛡️ لوحة الإدارة الكاملة مفعلة`);
});
