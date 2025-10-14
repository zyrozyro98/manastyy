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
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(__dirname));

// معدلات الأمان
app.disable('x-powered-by');

// تهيئة الملفات والمجلدات
function initializeApp() {
    const files = [
        'local-users.json', 
        'local-messages.json', 
        'local-stories.json', 
        'local-channels.json', 
        'local-backups.json', 
        'local-settings.json',
        'local-notifications.json'
    ];
    
    const folders = [
        'uploads', 'stories', 'channels', 'avatars', 
        'backups', 'chat-backgrounds', 'temp',
        'group-avatars', 'story-highlights'
    ];
    
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
            _id: uuidv4(),
            appName: "المنصة التعليمية المتطورة",
            theme: "light",
            maxFileSize: 50,
            storyDuration: 24,
            backupInterval: 24,
            maxUsers: 1000,
            allowRegistrations: true,
            maintenanceMode: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
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

// نظام النسخ الاحتياطي المتقدم
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
            settings: readLocalFile('local-settings.json'),
            notifications: readLocalFile('local-notifications.json'),
            size: 0
        };

        // حساب الحجم
        backupData.size = JSON.stringify(backupData).length;

        const backups = readLocalFile('local-backups.json');
        backups.push(backupData);
        
        // حفظ فقط آخر 20 نسخة احتياطية
        if (backups.length > 20) {
            const oldBackups = backups.splice(0, backups.length - 20);
            // حذف الملفات القديمة
            oldBackups.forEach(backup => {
                try {
                    const oldFile = `backups/backup-${backup.timestamp.replace(/[:.]/g, '-')}.json`;
                    if (fs.existsSync(oldFile)) {
                        fs.unlinkSync(oldFile);
                    }
                } catch (error) {
                    console.error('خطأ في حذف النسخة القديمة:', error);
                }
            });
        }
        
        writeLocalFile('local-backups.json', backups);
        
        // حفظ نسخة في ملف منفصل
        const backupFilename = `backups/backup-${timestamp}.json`;
        fs.writeFileSync(backupFilename, JSON.stringify(backupData, null, 2));
        
        console.log(`✅ تم إنشاء نسخة احتياطية: ${backupFilename}`);
        
        // إرسال إشعار للمدير
        const adminUsers = readLocalFile('local-users.json').filter(u => u.role === 'admin');
        adminUsers.forEach(admin => {
            const adminSocket = userSockets.get(admin._id);
            if (adminSocket) {
                io.to(adminSocket).emit('backup_created', {
                    backupId: backupData.id,
                    timestamp: backupData.timestamp,
                    size: backupData.size
                });
            }
        });
        
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

// نظام التخزين المتقدم مع تحسين الأداء
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads/';
        if (file.fieldname === 'story') folder = 'stories/';
        if (file.fieldname === 'avatar') folder = 'avatars/';
        if (file.fieldname === 'channel') folder = 'channels/';
        if (file.fieldname === 'background') folder = 'chat-backgrounds/';
        if (file.fieldname === 'group_avatar') folder = 'group-avatars/';
        if (file.fieldname === 'highlight') folder = 'story-highlights/';
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, extension);
        const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9-\u0600-\u06FF]/g, '-');
        cb(null, `${uniqueSuffix}-${cleanName}${extension}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 10,
        fields: 50
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم. يسمح بالصور والفيديوهات فقط.'), false);
        }
    }
});

// Middleware الأمان المتقدم
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false,
            message: 'الوصول غير مصرح. يلزم توفر رمز الدخول.' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false,
                message: 'رمز الدخول غير صالح أو منتهي الصلاحية.' 
            });
        }
        
        // التحقق من أن المستخدم لا يزال نشطاً
        const users = readLocalFile('local-users.json');
        const currentUser = users.find(u => u._id === user._id && u.isActive !== false);
        
        if (!currentUser) {
            return res.status(403).json({ 
                success: false,
                message: 'الحساب غير نشط أو غير موجود.' 
            });
        }
        
        req.user = { ...user, ...currentUser };
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false,
            message: 'صلاحيات غير كافية. هذه الوظيفة للمديرين فقط.' 
        });
    }
    next();
};

const requireModerator = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ 
            success: false,
            message: 'صلاحيات غير كافية.' 
        });
    }
    next();
};

// نظام WebSocket المتقدم للدردشة في الوقت الحقيقي
const connectedUsers = new Map();
const userSockets = new Map();
const typingUsers = new Map();
const userPresence = new Map();
const activeCalls = new Map();

io.on('connection', (socket) => {
    console.log('👤 مستخدم متصل:', socket.id);

    socket.on('authenticate', (userData) => {
        if (!userData || !userData._id) {
            socket.emit('authentication_failed', { message: 'بيانات المستخدم غير صالحة' });
            return;
        }

        connectedUsers.set(socket.id, userData);
        userSockets.set(userData._id, socket.id);
        userPresence.set(userData._id, {
            status: 'online',
            lastSeen: new Date().toISOString(),
            device: userData.device || 'web'
        });
        
        updateUserOnlineStatus(userData._id, true);
        
        // إعلام الآخرين بتواجد المستخدم
        socket.broadcast.emit('user_online', {
            userId: userData._id,
            fullName: userData.fullName,
            status: 'online'
        });
        
        console.log(`✅ المستخدم ${userData.fullName} تم توثيقه`);
        
        // إرسال الإشعارات غير المقروءة
        sendUnreadNotifications(userData._id, socket);
    });

    // إرسال رسالة فورية
    socket.on('send_message', async (data) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) {
                socket.emit('message_error', { 
                    success: false,
                    error: 'المستخدم غير معتمد' 
                });
                return;
            }

            // التحقق من البيانات
            if (!data.receiverId && !data.channelId) {
                socket.emit('message_error', { 
                    success: false,
                    error: 'يجب تحديد مستلم أو قناة' 
                });
                return;
            }

            const messages = readLocalFile('local-messages.json');
            const newMessage = {
                _id: uuidv4(),
                senderId: user._id,
                senderName: user.fullName,
                senderAvatar: user.avatar,
                receiverId: data.receiverId,
                channelId: data.channelId,
                text: data.text || '',
                timestamp: new Date().toISOString(),
                read: false,
                type: data.type || 'text',
                reactions: [],
                attachments: data.attachments || [],
                replyTo: data.replyTo,
                edited: false,
                deleted: false,
                forwarded: data.forwarded || false,
                messageType: data.messageType || 'normal' // normal, system, announcement
            };

            messages.push(newMessage);
            writeLocalFile('local-messages.json', messages);

            // إرسال للمستلم إذا كان متصل
            if (data.channelId) {
                // رسالة قناة
                io.emit('channel_message', newMessage);
                
                // تسجيل إشعار لأعضاء القناة
                const channel = readLocalFile('local-channels.json')
                    .find(c => c._id === data.channelId);
                
                if (channel) {
                    channel.members.forEach(memberId => {
                        if (memberId !== user._id) {
                            createNotification({
                                userId: memberId,
                                type: 'channel_message',
                                title: `رسالة جديدة في ${channel.name}`,
                                message: data.text?.substring(0, 100) || 'مرفق',
                                data: { channelId: data.channelId, messageId: newMessage._id },
                                senderId: user._id
                            });
                        }
                    });
                }
            } else {
                // رسالة مباشرة
                const receiverSocketId = userSockets.get(data.receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('new_message', newMessage);
                }

                // إنشاء إشعار للمستلم
                createNotification({
                    userId: data.receiverId,
                    type: 'direct_message',
                    title: `رسالة جديدة من ${user.fullName}`,
                    message: data.text?.substring(0, 100) || 'مرفق',
                    data: { senderId: user._id, messageId: newMessage._id },
                    senderId: user._id
                });
            }

            socket.emit('message_sent', { 
                success: true,
                message: newMessage 
            });
            
            // إيقاف مؤشر الكتابة
            socket.to(userSockets.get(data.receiverId)).emit('user_stop_typing', {
                userId: user._id
            });
        } catch (error) {
            console.error('خطأ إرسال الرسالة:', error);
            socket.emit('message_error', { 
                success: false,
                error: 'فشل إرسال الرسالة' 
            });
        }
    });

    // تفاعل مع الرسالة
    socket.on('react_to_message', async (data) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) return;

            const messages = readLocalFile('local-messages.json');
            const messageIndex = messages.findIndex(m => m._id === data.messageId);
            
            if (messageIndex !== -1) {
                if (!messages[messageIndex].reactions) {
                    messages[messageIndex].reactions = [];
                }
                
                // إزالة التفاعل السابق لنفس المستخدم
                messages[messageIndex].reactions = messages[messageIndex].reactions
                    .filter(r => r.userId !== user._id);
                
                // إضافة التفاعل الجديد
                if (data.emoji) {
                    messages[messageIndex].reactions.push({
                        userId: user._id,
                        userName: user.fullName,
                        emoji: data.emoji,
                        timestamp: new Date().toISOString()
                    });
                }
                
                writeLocalFile('local-messages.json', messages);
                
                // بث التفاعل للمستخدمين المعنيين
                const message = messages[messageIndex];
                if (message.channelId) {
                    io.emit('message_reacted', {
                        messageId: data.messageId,
                        reactions: message.reactions
                    });
                } else {
                    const participants = [message.senderId, message.receiverId];
                    participants.forEach(participantId => {
                        const participantSocket = userSockets.get(participantId);
                        if (participantSocket) {
                            io.to(participantSocket).emit('message_reacted', {
                                messageId: data.messageId,
                                reactions: message.reactions
                            });
                        }
                    });
                }
            }
        } catch (error) {
            console.error('خطأ في التفاعل:', error);
        }
    });

    // كتابة رسالة
    socket.on('typing_start', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        typingUsers.set(user._id, {
            receiverId: data.receiverId,
            channelId: data.channelId,
            timestamp: Date.now()
        });
        
        if (data.channelId) {
            // إرسال لمشتركي القناة
            socket.to(data.channelId).emit('user_typing', {
                userId: user._id,
                userName: user.fullName,
                channelId: data.channelId
            });
        } else {
            // إرسال للمستلم
            const receiverSocketId = userSockets.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('user_typing', {
                    userId: user._id,
                    userName: user.fullName
                });
            }
        }
    });

    socket.on('typing_stop', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        typingUsers.delete(user._id);
        
        if (data.channelId) {
            socket.to(data.channelId).emit('user_stop_typing', {
                userId: user._id,
                channelId: data.channelId
            });
        } else {
            const receiverSocketId = userSockets.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('user_stop_typing', {
                    userId: user._id
                });
            }
        }
    });

    // إدارة الخصوصية
    socket.on('update_privacy', async (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        try {
            const users = readLocalFile('local-users.json');
            const userIndex = users.findIndex(u => u._id === user._id);
            
            if (userIndex !== -1) {
                users[userIndex].privacy = {
                    ...users[userIndex].privacy,
                    ...data,
                    updatedAt: new Date().toISOString()
                };
                writeLocalFile('local-users.json', users);
                
                socket.emit('privacy_updated', { 
                    success: true,
                    privacy: users[userIndex].privacy 
                });

                // تحديث بيانات المستخدم المتصل
                connectedUsers.set(socket.id, {
                    ...connectedUsers.get(socket.id),
                    privacy: users[userIndex].privacy
                });
            }
        } catch (error) {
            console.error('خطأ في تحديث الخصوصية:', error);
            socket.emit('privacy_updated', { 
                success: false,
                error: 'فشل تحديث الإعدادات' 
            });
        }
    });

    // تحديث حالة المستخدم
    socket.on('update_presence', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        userPresence.set(user._id, {
            ...userPresence.get(user._id),
            status: data.status || 'online',
            customStatus: data.customStatus,
            updatedAt: new Date().toISOString()
        });

        // إعلام الاتصالات الأخرى للمستخدم نفسه
        socket.broadcast.emit('user_presence_updated', {
            userId: user._id,
            presence: userPresence.get(user._id)
        });
    });

    // إشعارات القراءة
    socket.on('mark_messages_read', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        markMessagesAsRead(user._id, data.conversationId, data.channelId);
    });

    // إدارة المكالمات
    socket.on('call_user', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const receiverSocketId = userSockets.get(data.receiverId);
        if (receiverSocketId) {
            const callId = uuidv4();
            activeCalls.set(callId, {
                callId,
                callerId: user._id,
                callerName: user.fullName,
                receiverId: data.receiverId,
                type: data.type || 'audio',
                status: 'ringing',
                createdAt: new Date().toISOString()
            });

            io.to(receiverSocketId).emit('incoming_call', {
                callId,
                callerId: user._id,
                callerName: user.fullName,
                callerAvatar: user.avatar,
                type: data.type || 'audio'
            });

            socket.emit('call_initiated', { callId });
        }
    });

    socket.on('answer_call', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const call = activeCalls.get(data.callId);
        if (call && call.receiverId === user._id) {
            call.status = 'answered';
            call.answeredAt = new Date().toISOString();
            
            const callerSocketId = userSockets.get(call.callerId);
            if (callerSocketId) {
                io.to(callerSocketId).emit('call_answered', {
                    callId: data.callId,
                    answererId: user._id
                });
            }
        }
    });

    socket.on('end_call', (data) => {
        const call = activeCalls.get(data.callId);
        if (call) {
            const participants = [call.callerId, call.receiverId];
            participants.forEach(participantId => {
                const participantSocket = userSockets.get(participantId);
                if (participantSocket) {
                    io.to(participantSocket).emit('call_ended', {
                        callId: data.callId,
                        duration: data.duration,
                        endedBy: data.endedBy
                    });
                }
            });
            activeCalls.delete(data.callId);
        }
    });

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            connectedUsers.delete(socket.id);
            userSockets.delete(user._id);
            typingUsers.delete(user._id);
            
            // تحديث حالة الاتصال
            updateUserOnlineStatus(user._id, false);
            
            // تحديث الحضور
            userPresence.set(user._id, {
                ...userPresence.get(user._id),
                status: 'offline',
                lastSeen: new Date().toISOString()
            });
            
            // إعلام الآخرين بغياب المستخدم
            socket.broadcast.emit('user_offline', {
                userId: user._id,
                fullName: user.fullName,
                lastSeen: new Date().toISOString()
            });

            // إنهاء المكالمات النشطة
            activeCalls.forEach((call, callId) => {
                if (call.callerId === user._id || call.receiverId === user._id) {
                    activeCalls.delete(callId);
                    const otherUserId = call.callerId === user._id ? call.receiverId : call.callerId;
                    const otherUserSocket = userSockets.get(otherUserId);
                    if (otherUserSocket) {
                        io.to(otherUserSocket).emit('call_ended', {
                            callId,
                            reason: 'user_disconnected'
                        });
                    }
                }
            });
        }
        console.log('👤 مستخدم غير متصل:', socket.id);
    });
});

// دوال مساعدة للنظام
function updateUserOnlineStatus(userId, isOnline) {
    const users = readLocalFile('local-users.json');
    const userIndex = users.findIndex(u => u._id === userId);
    
    if (userIndex !== -1) {
        users[userIndex].isOnline = isOnline;
        users[userIndex].lastSeen = new Date().toISOString();
        writeLocalFile('local-users.json', users);
    }
}

function createNotification(notificationData) {
    const notifications = readLocalFile('local-notifications.json');
    const newNotification = {
        _id: uuidv4(),
        ...notificationData,
        read: false,
        createdAt: new Date().toISOString()
    };

    notifications.push(newNotification);
    writeLocalFile('local-notifications.json', notifications);

    // إرسال الإشعار للمستخدم إذا كان متصلاً
    const userSocketId = userSockets.get(notificationData.userId);
    if (userSocketId) {
        io.to(userSocketId).emit('new_notification', newNotification);
    }

    return newNotification;
}

function sendUnreadNotifications(userId, socket) {
    const notifications = readLocalFile('local-notifications.json');
    const unreadNotifications = notifications.filter(n => 
        n.userId === userId && !n.read
    ).slice(-10); // آخر 10 إشعارات غير مقروءة

    unreadNotifications.forEach(notification => {
        socket.emit('new_notification', notification);
    });
}

function markMessagesAsRead(userId, conversationId, channelId) {
    const messages = readLocalFile('local-messages.json');
    let updated = false;

    messages.forEach(message => {
        if (!message.read && message.receiverId === userId) {
            if (conversationId && message.senderId === conversationId) {
                message.read = true;
                message.readAt = new Date().toISOString();
                updated = true;
            } else if (channelId && message.channelId === channelId) {
                message.read = true;
                message.readAt = new Date().toISOString();
                updated = true;
            }
        }
    });

    if (updated) {
        writeLocalFile('local-messages.json', messages);
        
        // إعلام المرسل بتحديث حالة القراءة
        if (conversationId) {
            const senderSocketId = userSockets.get(conversationId);
            if (senderSocketId) {
                io.to(senderSocketId).emit('messages_read', {
                    readerId: userId,
                    conversationId: conversationId
                });
            }
        }
    }
}

// نظام الـ Stories المتقدم
app.post('/api/stories', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                message: 'لم يتم رفع أي ملف' 
            });
        }

        const { caption, duration, allowReplies = true, allowSharing = true } = req.body;

        const stories = readLocalFile('local-stories.json');
        
        // حذف الـ Stories المنتهية
        const now = new Date();
        const activeStories = stories.filter(story => {
            const storyTime = new Date(story.createdAt);
            return (now - storyTime) < (24 * 60 * 60 * 1000);
        });

        // تحديد المدة بناءً على نوع الملف
        let storyDuration = duration || (req.file.mimetype.startsWith('video/') ? 30 : 7);

        const newStory = {
            _id: uuidv4(),
            userId: req.user._id,
            userName: req.user.fullName,
            userAvatar: req.user.avatar || null,
            mediaUrl: `/stories/${req.file.filename}`,
            mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
            duration: storyDuration,
            caption: caption || '',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            views: [],
            reactions: [],
            replies: [],
            savedBy: [],
            allowReplies: allowReplies !== 'false',
            allowSharing: allowSharing !== 'false',
            settings: {
                allowScreenshots: true,
                showViewCount: true
            },
            metadata: {
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                dimensions: null
            }
        };

        // معالجة الصور للحصول على الأبعاد
        if (req.file.mimetype.startsWith('image/')) {
            try {
                const metadata = await sharp(req.file.path).metadata();
                newStory.metadata.dimensions = {
                    width: metadata.width,
                    height: metadata.height
                };
            } catch (error) {
                console.error('خطأ في معالجة الصورة:', error);
            }
        }

        activeStories.push(newStory);
        writeLocalFile('local-stories.json', activeStories);

        // بث الـ Story الجديد للمتابعين
        io.emit('new_story', newStory);

        res.json({
            success: true,
            message: 'تم نشر الـ Story بنجاح',
            story: newStory
        });
    } catch (error) {
        console.error('خطأ نشر Story:', error);
        
        // حذف الملف إذا فشلت العملية
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم أثناء نشر الـ Story' 
        });
    }
});

app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = readLocalFile('local-stories.json');
        const now = new Date();
        
        // تصفية الـ Stories النشطة فقط
        const activeStories = stories.filter(story => new Date(story.expiresAt) > now);
        
        // تجميع الـ Stories بالمستخدم مع مراعاة الإعدادات
        const storiesByUser = {};
        activeStories.forEach(story => {
            const user = readLocalFile('local-users.json').find(u => u._id === story.userId);
            if (!user) return;

            // التحقق من إعدادات الخصوصية
            if (user.privacy?.hideStories && user._id !== req.user._id) {
                return;
            }

            if (!storiesByUser[story.userId]) {
                storiesByUser[story.userId] = {
                    user: {
                        _id: user._id,
                        fullName: user.fullName,
                        avatar: user.avatar,
                        isOnline: userSockets.has(user._id),
                        privacy: user.privacy
                    },
                    stories: []
                };
            }
            
            // إضافة معلومات المشاهدة للمستخدم الحالي
            const userView = story.views.find(view => view.userId === req.user._id);
            storiesByUser[story.userId].stories.push({
                ...story,
                viewed: !!userView,
                viewCount: story.views.length,
                canReply: story.allowReplies,
                canShare: story.allowSharing
            });
        });

        res.json({
            success: true,
            stories: Object.values(storiesByUser)
        });
    } catch (error) {
        console.error('خطأ جلب Stories:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
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
            
            // التحقق من إعدادات الخصوصية
            if (storyOwner?.privacy?.hideStoryViews !== true) {
                if (!stories[storyIndex].views.some(view => view.userId === user._id)) {
                    stories[storyIndex].views.push({
                        userId: user._id,
                        userName: user.fullName,
                        viewedAt: new Date().toISOString()
                    });
                    
                    writeLocalFile('local-stories.json', stories);
                    
                    // إعلام صاحب الـ Story بالمشاهدة
                    const storyOwnerSocket = userSockets.get(stories[storyIndex].userId);
                    if (storyOwnerSocket) {
                        io.to(storyOwnerSocket).emit('story_viewed', {
                            storyId,
                            viewer: {
                                userId: user._id,
                                userName: user.fullName
                            },
                            viewCount: stories[storyIndex].views.length
                        });
                    }
                }
            }
        }

        res.json({ 
            success: true,
            message: 'تم تسجيل المشاهدة' 
        });
    } catch (error) {
        console.error('خطأ تسجيل مشاهدة:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.post('/api/stories/:storyId/reply', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const { text } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'الرد لا يمكن أن يكون فارغاً' 
            });
        }

        const stories = readLocalFile('local-stories.json');
        const storyIndex = stories.findIndex(s => s._id === storyId);
        
        if (storyIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'الـ Story غير موجود' 
            });
        }

        if (!stories[storyIndex].allowReplies) {
            return res.status(403).json({ 
                success: false,
                message: 'الردود غير مسموحة على هذا الـ Story' 
            });
        }

        const reply = {
            _id: uuidv4(),
            userId: req.user._id,
            userName: req.user.fullName,
            userAvatar: req.user.avatar,
            text: text.trim(),
            timestamp: new Date().toISOString()
        };

        if (!stories[storyIndex].replies) {
            stories[storyIndex].replies = [];
        }

        stories[storyIndex].replies.push(reply);
        writeLocalFile('local-stories.json', stories);

        // إعلام صاحب الـ Story بالرد
        const storyOwnerSocket = userSockets.get(stories[storyIndex].userId);
        if (storyOwnerSocket) {
            io.to(storyOwnerSocket).emit('story_replied', {
                storyId,
                reply: reply
            });
        }

        res.json({
            success: true,
            message: 'تم إرسال الرد بنجاح',
            reply: reply
        });
    } catch (error) {
        console.error('خطأ إرسال الرد:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.post('/api/stories/:storyId/save', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const stories = readLocalFile('local-stories.json');
        
        const storyIndex = stories.findIndex(s => s._id === storyId);
        if (storyIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'الـ Story غير موجود' 
            });
        }

        if (!stories[storyIndex].savedBy.includes(req.user._id)) {
            stories[storyIndex].savedBy.push(req.user._id);
            writeLocalFile('local-stories.json', stories);
        }

        res.json({ 
            success: true,
            message: 'تم حفظ الـ Story' 
        });
    } catch (error) {
        console.error('خطأ حفظ Story:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.delete('/api/stories/:storyId', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const stories = readLocalFile('local-stories.json');
        
        const storyIndex = stories.findIndex(s => s._id === storyId);
        if (storyIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'الـ Story غير موجود' 
            });
        }

        const story = stories[storyIndex];
        
        // التحقق من الصلاحيات
        if (story.userId !== req.user._id && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'غير مصرح لك بحذف هذا الـ Story' 
            });
        }

        // حذف الملف من الخادم
        try {
            if (fs.existsSync(path.join(__dirname, story.mediaUrl))) {
                fs.unlinkSync(path.join(__dirname, story.mediaUrl));
            }
        } catch (fileError) {
            console.error('خطأ في حذف ملف الـ Story:', fileError);
        }

        stories.splice(storyIndex, 1);
        writeLocalFile('local-stories.json', stories);

        io.emit('story_deleted', { storyId });

        res.json({
            success: true,
            message: 'تم حذف الـ Story بنجاح'
        });
    } catch (error) {
        console.error('خطأ حذف Story:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// نظام الـ Story Highlights
app.post('/api/stories/highlights', authenticateToken, upload.single('cover'), async (req, res) => {
    try {
        const { title, storyIds } = req.body;
        
        if (!title || !storyIds) {
            return res.status(400).json({ 
                success: false,
                message: 'العنوان وروابط الـ Stories مطلوبة' 
            });
        }

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === req.user._id);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'المستخدم غير موجود' 
            });
        }

        if (!users[userIndex].highlights) {
            users[userIndex].highlights = [];
        }

        const highlight = {
            _id: uuidv4(),
            title: title.trim(),
            cover: req.file ? `/story-highlights/${req.file.filename}` : null,
            storyIds: JSON.parse(storyIds),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        users[userIndex].highlights.push(highlight);
        writeLocalFile('local-users.json', users);

        res.json({
            success: true,
            message: 'تم إنشاء الـ Highlight بنجاح',
            highlight: highlight
        });
    } catch (error) {
        console.error('خطأ إنشاء Highlight:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});
// نظام القنوات والمجموعات المتقدم
app.post('/api/channels', authenticateToken, requireAdmin, upload.single('channel'), async (req, res) => {
    try {
        const { name, description, isPublic, type, settings } = req.body;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({ 
                success: false,
                message: 'اسم القناة مطلوب ويجب أن يكون على الأقل حرفين' 
            });
        }

        const channels = readLocalFile('local-channels.json');
        
        // التحقق من عدم وجود قناة بنفس الاسم
        const existingChannel = channels.find(c => 
            c.name.toLowerCase() === name.toLowerCase().trim()
        );
        
        if (existingChannel) {
            return res.status(400).json({ 
                success: false,
                message: 'هناك قناة/مجموعة بنفس الاسم already exists' 
            });
        }

        const channelSettings = settings ? JSON.parse(settings) : {
            allowMessages: true,
            allowMedia: true,
            allowReactions: true,
            allowPolls: true,
            allowEvents: true,
            membersCanInvite: type === 'group',
            approvalRequired: false,
            maxMembers: type === 'group' ? 1000 : 10000
        };

        const newChannel = {
            _id: uuidv4(),
            name: name.trim(),
            description: description?.trim() || '',
            avatar: req.file ? `/channels/${req.file.filename}` : null,
            cover: null,
            createdBy: req.user._id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isPublic: isPublic !== 'false',
            type: type || 'channel', // channel, group, broadcast
            members: [req.user._id],
            admins: [req.user._id],
            moderators: [],
            bannedUsers: [],
            settings: channelSettings,
            stats: {
                messageCount: 0,
                memberCount: 1,
                onlineCount: 0
            },
            metadata: {
                lastActivity: new Date().toISOString(),
                isActive: true,
                tags: []
            }
        };

        channels.push(newChannel);
        writeLocalFile('local-channels.json', channels);

        // إنشاء رسالة ترحيب في القناة
        const messages = readLocalFile('local-messages.json');
        const welcomeMessage = {
            _id: uuidv4(),
            senderId: req.user._id,
            senderName: req.user.fullName,
            senderAvatar: req.user.avatar,
            channelId: newChannel._id,
            text: `🎉 تم إنشاء ${type === 'group' ? 'المجموعة' : 'القناة'} "${name}" بنجاح!`,
            timestamp: new Date().toISOString(),
            read: true,
            type: 'system',
            reactions: [],
            messageType: 'announcement'
        };

        messages.push(welcomeMessage);
        writeLocalFile('local-messages.json', messages);

        // بث الحدث للمستخدمين
        io.emit('new_channel', newChannel);
        io.emit('channel_message', welcomeMessage);

        res.json({
            success: true,
            message: `تم إنشاء ${type === 'group' ? 'المجموعة' : 'القناة'} بنجاح`,
            channel: newChannel
        });
    } catch (error) {
        console.error('خطأ إنشاء قناة:', error);
        
        // حذف الملف إذا فشلت العملية
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم أثناء إنشاء القناة' 
        });
    }
});

app.put('/api/channels/:channelId', authenticateToken, upload.single('channel'), async (req, res) => {
    try {
        const { channelId } = req.params;
        const { name, description, isPublic, settings } = req.body;

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'القناة غير موجودة' 
            });
        }

        const channel = channels[channelIndex];
        
        // التحقق من الصلاحيات
        const isAdmin = channel.admins.includes(req.user._id);
        const isModerator = channel.moderators.includes(req.user._id);
        const canEdit = isAdmin || (isModerator && req.user.role !== 'student');
        
        if (!canEdit && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'غير مصرح لك بتعديل هذه القناة' 
            });
        }

        // تحديث البيانات
        if (name && name.trim().length >= 2) {
            channels[channelIndex].name = name.trim();
        }
        
        if (description !== undefined) {
            channels[channelIndex].description = description.trim();
        }
        
        if (isPublic !== undefined) {
            channels[channelIndex].isPublic = isPublic !== 'false';
        }
        
        if (req.file) {
            channels[channelIndex].avatar = `/channels/${req.file.filename}`;
        }
        
        if (settings) {
            channels[channelIndex].settings = { 
                ...channels[channelIndex].settings, 
                ...JSON.parse(settings) 
            };
        }
        
        channels[channelIndex].updatedAt = new Date().toISOString();

        writeLocalFile('local-channels.json', channels);
        
        // بث التحديث للمستخدمين
        io.emit('channel_updated', channels[channelIndex]);

        res.json({
            success: true,
            message: 'تم تحديث القناة بنجاح',
            channel: channels[channelIndex]
        });
    } catch (error) {
        console.error('خطأ تحديث قناة:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.delete('/api/channels/:channelId', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'القناة غير موجودة' 
            });
        }

        const channel = channels[channelIndex];
        
        // التحقق من الصلاحيات
        const isOwner = channel.createdBy === req.user._id;
        if (!isOwner && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'غير مصرح لك بحذف هذه القناة' 
            });
        }

        const deletedChannel = channels.splice(channelIndex, 1)[0];
        writeLocalFile('local-channels.json', channels);

        // حذف الرسائل المرتبطة بالقناة
        const messages = readLocalFile('local-messages.json');
        const filteredMessages = messages.filter(m => m.channelId !== channelId);
        writeLocalFile('local-messages.json', filteredMessages);

        // حذف الصورة إذا وجدت
        if (deletedChannel.avatar && fs.existsSync(path.join(__dirname, deletedChannel.avatar))) {
            try {
                fs.unlinkSync(path.join(__dirname, deletedChannel.avatar));
            } catch (fileError) {
                console.error('خطأ في حذف صورة القناة:', fileError);
            }
        }

        io.emit('channel_deleted', { channelId });

        res.json({
            success: true,
            message: 'تم حذف القناة بنجاح',
            channel: deletedChannel
        });
    } catch (error) {
        console.error('خطأ حذف قناة:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.post('/api/channels/:channelId/join', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'القناة غير موجودة' 
            });
        }

        const channel = channels[channelIndex];
        
        // التحقق من إذا كان المستخدم محظور
        if (channel.bannedUsers.includes(req.user._id)) {
            return res.status(403).json({ 
                success: false,
                message: 'أنت محظور من هذه القناة' 
            });
        }

        // التحقق من إذا كان المستخدم عضو بالفعل
        if (channel.members.includes(req.user._id)) {
            return res.status(400).json({ 
                success: false,
                message: 'أنت عضو بالفعل في هذه القناة' 
            });
        }

        // إضافة المستخدم للقناة
        channel.members.push(req.user._id);
        channel.stats.memberCount = channel.members.length;
        channel.updatedAt = new Date().toISOString();
        
        writeLocalFile('local-channels.json', channels);

        // إنشاء رسالة ترحيب
        const messages = readLocalFile('local-messages.json');
        const joinMessage = {
            _id: uuidv4(),
            senderId: req.user._id,
            senderName: req.user.fullName,
            senderAvatar: req.user.avatar,
            channelId: channelId,
            text: `🎊 انضم ${req.user.fullName} إلى ${channel.type === 'group' ? 'المجموعة' : 'القناة'}`,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'system',
            messageType: 'notification'
        };

        messages.push(joinMessage);
        writeLocalFile('local-messages.json', messages);

        // بث الحدث
        io.emit('user_joined_channel', {
            channelId,
            user: {
                _id: req.user._id,
                fullName: req.user.fullName,
                avatar: req.user.avatar
            }
        });

        io.emit('channel_message', joinMessage);

        res.json({
            success: true,
            message: `تم الانضمام إلى ${channel.type === 'group' ? 'المجموعة' : 'القناة'} بنجاح`,
            channel: channel
        });
    } catch (error) {
        console.error('خطأ الانضمام للقناة:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.post('/api/channels/:channelId/leave', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'القناة غير موجودة' 
            });
        }

        const channel = channels[channelIndex];
        
        // التحقق من إذا كان المستخدم عضو
        if (!channel.members.includes(req.user._id)) {
            return res.status(400).json({ 
                success: false,
                message: 'أنت لست عضو في هذه القناة' 
            });
        }

        // إزالة المستخدم من القناة
        channel.members = channel.members.filter(memberId => memberId !== req.user._id);
        channel.admins = channel.admins.filter(adminId => adminId !== req.user._id);
        channel.moderators = channel.moderators.filter(modId => modId !== req.user._id);
        
        channel.stats.memberCount = channel.members.length;
        channel.updatedAt = new Date().toISOString();
        
        writeLocalFile('local-channels.json', channels);

        // إنشاء رسالة مغادرة
        const messages = readLocalFile('local-messages.json');
        const leaveMessage = {
            _id: uuidv4(),
            senderId: req.user._id,
            senderName: req.user.fullName,
            senderAvatar: req.user.avatar,
            channelId: channelId,
            text: `👋 غادر ${req.user.fullName} ${channel.type === 'group' ? 'المجموعة' : 'القناة'}`,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'system',
            messageType: 'notification'
        };

        messages.push(leaveMessage);
        writeLocalFile('local-messages.json', messages);

        // بث الحدث
        io.emit('user_left_channel', {
            channelId,
            userId: req.user._id
        });

        io.emit('channel_message', leaveMessage);

        res.json({
            success: true,
            message: `تم مغادرة ${channel.type === 'group' ? 'المجموعة' : 'القناة'} بنجاح`
        });
    } catch (error) {
        console.error('خطأ مغادرة القناة:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// إدارة أعضاء القنوات
app.post('/api/channels/:channelId/members/:userId/promote', authenticateToken, async (req, res) => {
    try {
        const { channelId, userId } = req.params;
        const { role } = req.body; // admin, moderator

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'القناة غير موجودة' 
            });
        }

        const channel = channels[channelIndex];
        
        // التحقق من صلاحيات المستخدم الحالي
        const isAdmin = channel.admins.includes(req.user._id);
        if (!isAdmin && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'غير مصرح لك بهذا الإجراء' 
            });
        }

        // التحقق من أن المستخدم المراد ترقيته عضو في القناة
        if (!channel.members.includes(userId)) {
            return res.status(400).json({ 
                success: false,
                message: 'المستخدم ليس عضو في القناة' 
            });
        }

        if (role === 'admin') {
            if (!channel.admins.includes(userId)) {
                channel.admins.push(userId);
            }
            // إزالة من المشرفين إذا كان
            channel.moderators = channel.moderators.filter(modId => modId !== userId);
        } else if (role === 'moderator') {
            if (!channel.moderators.includes(userId)) {
                channel.moderators.push(userId);
            }
            // إزالة من المديرين إذا كان
            channel.admins = channel.admins.filter(adminId => adminId !== userId);
        } else {
            // إزالة من المناصب
            channel.admins = channel.admins.filter(adminId => adminId !== userId);
            channel.moderators = channel.moderators.filter(modId => modId !== userId);
        }

        channel.updatedAt = new Date().toISOString();
        writeLocalFile('local-channels.json', channels);

        // إرسال إشعار للمستخدم
        createNotification({
            userId: userId,
            type: 'channel_promotion',
            title: `تم ترقيتك في ${channel.name}`,
            message: `تم تعيينك كـ${role === 'admin' ? 'مدير' : 'مشرف'} في ${channel.type === 'group' ? 'المجموعة' : 'القنا'}`,
            data: { channelId, role },
            senderId: req.user._id
        });

        res.json({
            success: true,
            message: `تم ترقية المستخدم بنجاح إلى ${role === 'admin' ? 'مدير' : 'مشرف'}`,
            channel: channel
        });
    } catch (error) {
        console.error('خطأ ترقية مستخدم:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.post('/api/channels/:channelId/members/:userId/ban', authenticateToken, async (req, res) => {
    try {
        const { channelId, userId } = req.params;
        const { reason, duration } = req.body;

        const channels = readLocalFile('local-channels.json');
        const channelIndex = channels.findIndex(c => c._id === channelId);
        
        if (channelIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'القناة غير موجودة' 
            });
        }

        const channel = channels[channelIndex];
        
        // التحقق من صلاحيات المستخدم الحالي
        const isAdmin = channel.admins.includes(req.user._id);
        const isModerator = channel.moderators.includes(req.user._id);
        if (!isAdmin && !isModerator && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'غير مصرح لك بهذا الإجراء' 
            });
        }

        // منع المستخدم من حظر نفسه
        if (userId === req.user._id) {
            return res.status(400).json({ 
                success: false,
                message: 'لا يمكنك حظر نفسك' 
            });
        }

        // إضافة المستخدم للمحظورين
        if (!channel.bannedUsers.includes(userId)) {
            channel.bannedUsers.push(userId);
        }

        // إزالة المستخدم من الأعضاء والمناصب
        channel.members = channel.members.filter(memberId => memberId !== userId);
        channel.admins = channel.admins.filter(adminId => adminId !== userId);
        channel.moderators = channel.moderators.filter(modId => modId !== userId);
        
        channel.stats.memberCount = channel.members.length;
        channel.updatedAt = new Date().toISOString();
        
        writeLocalFile('local-channels.json', channels);

        // إنشاء رسالة حظر
        const messages = readLocalFile('local-messages.json');
        const banMessage = {
            _id: uuidv4(),
            senderId: req.user._id,
            senderName: req.user.fullName,
            senderAvatar: req.user.avatar,
            channelId: channelId,
            text: `🚫 تم حظر مستخدم من ${channel.type === 'group' ? 'المجموعة' : 'القناة'}${reason ? ` - السبب: ${reason}` : ''}`,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'system',
            messageType: 'notification'
        };

        messages.push(banMessage);
        writeLocalFile('local-messages.json', messages);

        // إرسال إشعار للمستخدم المحظور
        createNotification({
            userId: userId,
            type: 'channel_ban',
            title: `تم حظرك من ${channel.name}`,
            message: reason || 'تم حظرك من القناة',
            data: { channelId, reason, duration },
            senderId: req.user._id
        });

        // بث الحدث
        io.emit('user_banned_from_channel', {
            channelId,
            userId: userId,
            bannedBy: req.user._id
        });

        io.emit('channel_message', banMessage);

        res.json({
            success: true,
            message: 'تم حظر المستخدم بنجاح'
        });
    } catch (error) {
        console.error('خطأ حظر مستخدم:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// الحصول على القنوات والمجموعات
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const { type, page = 1, limit = 20, search } = req.query;
        
        let channels = readLocalFile('local-channels.json');
        
        // التصفية حسب النوع
        if (type && type !== 'all') {
            channels = channels.filter(channel => channel.type === type);
        }
        
        // البحث
        if (search && search.length >= 2) {
            const searchTerm = search.toLowerCase();
            channels = channels.filter(channel => 
                channel.name.toLowerCase().includes(searchTerm) ||
                channel.description.toLowerCase().includes(searchTerm)
            );
        }
        
        // التصفية حسب الصلاحيات
        channels = channels.filter(channel => 
            channel.isPublic || 
            channel.members.includes(req.user._id) ||
            req.user.role === 'admin'
        );
        
        // الترتيب حسب النشاط
        channels.sort((a, b) => new Date(b.metadata.lastActivity) - new Date(a.metadata.lastActivity));
        
        // التقسيم للصفحات
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedChannels = channels.slice(startIndex, endIndex);
        
        // إضافة معلومات العضوية والحضور
        const channelsWithMembership = paginatedChannels.map(channel => ({
            ...channel,
            isMember: channel.members.includes(req.user._id),
            isAdmin: channel.admins.includes(req.user._id),
            isModerator: channel.moderators.includes(req.user._id),
            onlineCount: channel.members.filter(memberId => 
                userSockets.has(memberId)
            ).length
        }));

        res.json({
            success: true,
            channels: channelsWithMembership,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: channels.length,
                pages: Math.ceil(channels.length / limit)
            }
        });
    } catch (error) {
        console.error('خطأ جلب القنوات:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// إدارة المستخدمين المتقدمة للمدير
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search, role, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        let users = readLocalFile('local-users.json')
            .filter(user => user.role !== 'admin') // استبعاد المديرين من القائمة
            .map(user => ({
                _id: user._id,
                fullName: user.fullName,
                phone: user.phone,
                university: user.university,
                major: user.major,
                batch: user.batch,
                role: user.role,
                isActive: user.isActive,
                isOnline: user.isOnline,
                lastLogin: user.lastLogin,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                avatar: user.avatar,
                privacy: user.privacy,
                chatSettings: user.chatSettings,
                stats: {
                    messageCount: readLocalFile('local-messages.json')
                        .filter(m => m.senderId === user._id && m.type !== 'system').length,
                    storyCount: readLocalFile('local-stories.json')
                        .filter(s => s.userId === user._id).length,
                    joinDate: user.createdAt
                }
            }));

        // التصفية بالبحث
        if (search && search.length >= 2) {
            const searchTerm = search.toLowerCase();
            users = users.filter(user => 
                user.fullName.toLowerCase().includes(searchTerm) ||
                user.phone.includes(searchTerm) ||
                user.university.toLowerCase().includes(searchTerm) ||
                user.major.toLowerCase().includes(searchTerm)
            );
        }

        // التصفية بالدور
        if (role && role !== 'all') {
            users = users.filter(user => user.role === role);
        }

        // التصفية بالحالة
        if (status === 'active') {
            users = users.filter(user => user.isActive);
        } else if (status === 'inactive') {
            users = users.filter(user => !user.isActive);
        } else if (status === 'online') {
            users = users.filter(user => user.isOnline);
        }

        // الترتيب
        users.sort((a, b) => {
            const aValue = a[sortBy];
            const bValue = b[sortBy];
            
            if (sortOrder === 'desc') {
                return new Date(bValue) - new Date(aValue);
            } else {
                return new Date(aValue) - new Date(bValue);
            }
        });

        // التقسيم للصفحات
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedUsers = users.slice(startIndex, endIndex);

        res.json({
            success: true,
            users: paginatedUsers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: users.length,
                pages: Math.ceil(users.length / limit)
            },
            stats: {
                total: users.length,
                active: users.filter(u => u.isActive).length,
                online: users.filter(u => u.isOnline).length,
                students: users.filter(u => u.role === 'student').length,
                moderators: users.filter(u => u.role === 'moderator').length
            }
        });
    } catch (error) {
        console.error('خطأ جلب المستخدمين:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.put('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'المستخدم غير موجود' 
            });
        }

        // منع تعديل بيانات المديرين الآخرين
        if (users[userIndex].role === 'admin' && req.user._id !== userId) {
            return res.status(403).json({ 
                success: false,
                message: 'لا يمكن تعديل بيانات مدير آخر' 
            });
        }

        // البيانات المسموح بتحديثها
        const allowedUpdates = [
            'fullName', 'university', 'major', 'batch', 'isActive', 
            'role', 'avatar', 'privacy', 'chatSettings'
        ];
        
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                users[userIndex][field] = updates[field];
            }
        });

        users[userIndex].updatedAt = new Date().toISOString();
        writeLocalFile('local-users.json', users);

        // إرسال إشعار للمستخدم إذا تم تغيير حالته
        if (updates.isActive !== undefined) {
            createNotification({
                userId: userId,
                type: updates.isActive ? 'account_activated' : 'account_deactivated',
                title: updates.isActive ? 'تم تفعيل حسابك' : 'تم إيقاف حسابك',
                message: updates.isActive ? 
                    'تم تفعيل حسابك بنجاح. يمكنك الآن استخدام المنصة.' :
                    'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع الإدارة.',
                data: { reason: updates.reason },
                senderId: req.user._id
            });

            // إذا تم إيقاف الحساب، فصل المستخدم
            if (!updates.isActive) {
                const userSocketId = userSockets.get(userId);
                if (userSocketId) {
                    io.to(userSocketId).emit('account_suspended', {
                        reason: updates.reason || 'تم إيقاف حسابك مؤقتاً'
                    });
                    // فصل المستخدم بعد إرسال الإشعار
                    setTimeout(() => {
                        const socket = io.sockets.sockets.get(userSocketId);
                        if (socket) {
                            socket.disconnect();
                        }
                    }, 1000);
                }
            }
        }

        res.json({
            success: true,
            message: 'تم تحديث بيانات المستخدم بنجاح',
            user: users[userIndex]
        });
    } catch (error) {
        console.error('خطأ تحديث المستخدم:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'المستخدم غير موجود' 
            });
        }

        const userToDelete = users[userIndex];

        // منع حذف المديرين
        if (userToDelete.role === 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'لا يمكن حذف حساب مدير' 
            });
        }

        // إرسال إشعار قبل الحذف
        createNotification({
            userId: userId,
            type: 'account_deleted',
            title: 'تم حذف حسابك',
            message: reason || 'تم حذف حسابك من المنصة',
            senderId: req.user._id
        });

        const deletedUser = users.splice(userIndex, 1)[0];
        writeLocalFile('local-users.json', users);

        // حذف البيانات المرتبطة بالمستخدم
        await deleteUserData(userId);

        // فصل المستخدم إذا كان متصلاً
        const userSocketId = userSockets.get(userId);
        if (userSocketId) {
            const socket = io.sockets.sockets.get(userSocketId);
            if (socket) {
                socket.disconnect();
            }
        }

        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح',
            user: deletedUser
        });
    } catch (error) {
        console.error('خطأ حذف المستخدم:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// دالة مساعدة لحذف بيانات المستخدم
async function deleteUserData(userId) {
    try {
        // حذف الرسائل
        const messages = readLocalFile('local-messages.json');
        const userMessages = messages.filter(m => 
            m.senderId === userId || m.receiverId === userId
        );
        
        // الاحتفاظ بالرسائل في القنوات ولكن إخفاء اسم المرسل
        const updatedMessages = messages.map(message => {
            if (message.senderId === userId && message.channelId) {
                return {
                    ...message,
                    senderName: 'مستخدم محذوف',
                    senderAvatar: null,
                    deleted: true
                };
            }
            return message;
        }).filter(message => 
            !((message.senderId === userId || message.receiverId === userId) && !message.channelId)
        );
        
        writeLocalFile('local-messages.json', updatedMessages);

        // حذف الـ Stories
        const stories = readLocalFile('local-stories.json');
        const userStories = stories.filter(s => s.userId === userId);
        
        // حذف ملفات الـ Stories
        userStories.forEach(story => {
            try {
                if (story.mediaUrl && fs.existsSync(path.join(__dirname, story.mediaUrl))) {
                    fs.unlinkSync(path.join(__dirname, story.mediaUrl));
                }
            } catch (fileError) {
                console.error('خطأ في حذف ملف الـ Story:', fileError);
            }
        });
        
        const filteredStories = stories.filter(s => s.userId !== userId);
        writeLocalFile('local-stories.json', filteredStories);

        // إزالة المستخدم من القنوات
        const channels = readLocalFile('local-channels.json');
        const updatedChannels = channels.map(channel => ({
            ...channel,
            members: channel.members.filter(memberId => memberId !== userId),
            admins: channel.admins.filter(adminId => adminId !== userId),
            moderators: channel.moderators.filter(modId => modId !== userId),
            bannedUsers: channel.bannedUsers.filter(bannedId => bannedId !== userId)
        }));
        writeLocalFile('local-channels.json', updatedChannels);

        // حذف الإشعارات
        const notifications = readLocalFile('local-notifications.json');
        const filteredNotifications = notifications.filter(n => n.userId !== userId);
        writeLocalFile('local-notifications.json', filteredNotifications);

        console.log(`✅ تم حذف جميع بيانات المستخدم: ${userId}`);
    } catch (error) {
        console.error('خطأ في حذف بيانات المستخدم:', error);
        throw error;
    }
}

// إحصائيات النظام المتقدمة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = readLocalFile('local-users.json');
        const messages = readLocalFile('local-messages.json');
        const stories = readLocalFile('local-stories.json');
        const channels = readLocalFile('local-channels.json');
        const backups = readLocalFile('local-backups.json');

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // إحصائيات المستخدمين
        const userStats = {
            total: users.filter(u => u.role === 'student').length,
            active: users.filter(u => u.isActive !== false && u.role === 'student').length,
            online: connectedUsers.size,
            newToday: users.filter(u => 
                new Date(u.createdAt) >= today && u.role === 'student'
            ).length,
            newThisWeek: users.filter(u => 
                new Date(u.createdAt) >= weekAgo && u.role === 'student'
            ).length,
            newThisMonth: users.filter(u => 
                new Date(u.createdAt) >= monthAgo && u.role === 'student'
            ).length,
            byRole: {
                students: users.filter(u => u.role === 'student').length,
                moderators: users.filter(u => u.role === 'moderator').length,
                admins: users.filter(u => u.role === 'admin').length
            }
        };

        // إحصائيات الرسائل
        const messageStats = {
            total: messages.length,
            today: messages.filter(m => new Date(m.timestamp) >= today).length,
            thisWeek: messages.filter(m => new Date(m.timestamp) >= weekAgo).length,
            thisMonth: messages.filter(m => new Date(m.timestamp) >= monthAgo).length,
            unread: messages.filter(m => !m.read).length,
            byType: {
                text: messages.filter(m => m.type === 'text').length,
                image: messages.filter(m => m.type === 'image').length,
                video: messages.filter(m => m.type === 'video').length,
                system: messages.filter(m => m.type === 'system').length
            }
        };

        // إحصائيات الـ Stories
        const activeStories = stories.filter(s => new Date(s.expiresAt) > now);
        const storyStats = {
            total: stories.length,
            active: activeStories.length,
            expired: stories.length - activeStories.length,
            today: stories.filter(s => new Date(s.createdAt) >= today).length,
            averageViews: activeStories.length > 0 ? 
                Math.round(activeStories.reduce((sum, story) => sum + story.views.length, 0) / activeStories.length) : 0
        };

        // إحصائيات القنوات
        const channelStats = {
            total: channels.length,
            public: channels.filter(c => c.isPublic).length,
            private: channels.filter(c => !c.isPublic).length,
            byType: {
                channels: channels.filter(c => c.type === 'channel').length,
                groups: channels.filter(c => c.type === 'group').length,
                broadcast: channels.filter(c => c.type === 'broadcast').length
            },
            totalMembers: channels.reduce((sum, channel) => sum + channel.members.length, 0),
            averageMembers: channels.length > 0 ? 
                Math.round(channels.reduce((sum, channel) => sum + channel.members.length, 0) / channels.length) : 0
        };

        // إحصائيات النظام
        const systemStats = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            connections: connectedUsers.size,
            backups: backups.length,
            lastBackup: backups.length > 0 ? backups[backups.length - 1].timestamp : null,
            storage: {
                messages: JSON.stringify(messages).length,
                users: JSON.stringify(users).length,
                stories: JSON.stringify(stories).length,
                channels: JSON.stringify(channels).length
            }
        };

        res.json({
            success: true,
            stats: {
                users: userStats,
                messages: messageStats,
                stories: storyStats,
                channels: channelStats,
                system: systemStats,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('خطأ جلب الإحصائيات:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// نظام التقارير والإبلاغ
app.post('/api/reports', authenticateToken, async (req, res) => {
    try {
        const { type, targetId, reason, description, evidence } = req.body;

        if (!type || !targetId || !reason) {
            return res.status(400).json({ 
                success: false,
                message: 'النوع والهدف والسبب مطلوبون' 
            });
        }

        const reports = readLocalFile('local-reports.json') || [];
        
        const newReport = {
            _id: uuidv4(),
            type, // user, message, story, channel
            targetId,
            reporterId: req.user._id,
            reporterName: req.user.fullName,
            reason,
            description: description || '',
            evidence: evidence || [],
            status: 'pending',
            priority: 'medium',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        reports.push(newReport);
        writeLocalFile('local-reports.json', reports);

        // إرسال إشعار للمديرين والمشرفين
        const adminsAndModerators = readLocalFile('local-users.json')
            .filter(u => u.role === 'admin' || u.role === 'moderator');
        
        adminsAndModerators.forEach(user => {
            createNotification({
                userId: user._id,
                type: 'new_report',
                title: 'تبليغ جديد',
                message: `تم الإبلاغ عن ${getReportTypeArabic(type)}`,
                data: { reportId: newReport._id, type, targetId },
                senderId: req.user._id
            });
        });

        res.json({
            success: true,
            message: 'تم إرسال التبليغ بنجاح',
            report: newReport
        });
    } catch (error) {
        console.error('خطأ إرسال التبليغ:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// دالة مساعدة لتحويل نوع التبليغ للعربية
function getReportTypeArabic(type) {
    const types = {
        'user': 'مستخدم',
        'message': 'رسالة',
        'story': 'ستوري',
        'channel': 'قناة/مجموعة'
    };
    return types[type] || type;
}
