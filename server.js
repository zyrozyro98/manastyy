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

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || true,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

// معدلات الأمان
app.disable('x-powered-by');

// نظام تخزين محسن
class EnhancedStorage {
    constructor() {
        this.backupInterval = 5 * 60 * 1000; // 5 دقائق
        this.init();
    }

    init() {
        const files = ['local-users.json', 'local-messages.json', 'local-images.json'];
        const folders = ['uploads', 'temp', 'backups'];
        
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

        // بدء النسخ الاحتياطي التلقائي
        this.startAutoBackup();
    }

    readFile(filename) {
        try {
            // محاولة قراءة الملف الرئيسي
            if (fs.existsSync(filename)) {
                const data = fs.readFileSync(filename, 'utf8');
                return JSON.parse(data);
            }
            
            // محاولة استعادة من النسخ الاحتياطي
            const backupFile = `backups/${path.basename(filename)}.backup`;
            if (fs.existsSync(backupFile)) {
                console.log(`🔄 استعادة ${filename} من النسخ الاحتياطي`);
                const data = fs.readFileSync(backupFile, 'utf8');
                this.writeFile(filename, JSON.parse(data));
                return JSON.parse(data);
            }
            
            return [];
        } catch (error) {
            console.error(`خطأ في قراءة ${filename}:`, error);
            return [];
        }
    }

    writeFile(filename, data) {
        try {
            // إنشاء نسخة احتياطية أولاً
            this.createBackup(filename);
            
            // الكتابة للملف الرئيسي
            fs.writeFileSync(filename, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error(`خطأ في الكتابة لـ ${filename}:`, error);
            return false;
        }
    }

    createBackup(filename) {
        try {
            if (fs.existsSync(filename)) {
                const backupDir = 'backups';
                const backupFile = `${backupDir}/${path.basename(filename)}.backup`;
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const datedBackup = `${backupDir}/${path.basename(filename)}.${timestamp}.backup`;
                
                // نسخ الملف
                fs.copyFileSync(filename, backupFile);
                fs.copyFileSync(filename, datedBackup);
                
                // الاحتفاظ بـ 5 نسخ فقط
                this.cleanOldBackups(filename);
            }
        } catch (error) {
            console.error(`خطأ في النسخ الاحتياطي لـ ${filename}:`, error);
        }
    }

    cleanOldBackups(filename) {
        try {
            const backupDir = 'backups';
            const baseName = path.basename(filename);
            const backups = fs.readdirSync(backupDir)
                .filter(file => file.startsWith(baseName) && file.endsWith('.backup'))
                .map(file => ({
                    name: file,
                    time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            // حذف النسخ القديمة (الاحتفاظ بـ 5 فقط)
            if (backups.length > 5) {
                backups.slice(5).forEach(backup => {
                    fs.unlinkSync(path.join(backupDir, backup.name));
                });
            }
        } catch (error) {
            console.error('خطأ في تنظيف النسخ الاحتياطية:', error);
        }
    }

    startAutoBackup() {
        setInterval(() => {
            console.log('🔄 النسخ الاحتياطي التلقائي...');
            ['local-users.json', 'local-messages.json', 'local-images.json'].forEach(file => {
                if (fs.existsSync(file)) {
                    this.createBackup(file);
                }
            });
        }, this.backupInterval);
    }

    // استعادة البيانات
    restoreData() {
        const files = ['local-users.json', 'local-messages.json', 'local-images.json'];
        files.forEach(file => {
            const backupFile = `backups/${file}.backup`;
            if (!fs.existsSync(file) && fs.existsSync(backupFile)) {
                console.log(`🔄 استعادة ${file} من النسخ الاحتياطي`);
                fs.copyFileSync(backupFile, file);
            }
        });
    }
}

// تهيئة نظام التخزين
const storageSystem = new EnhancedStorage();

// مفتاح JWT آمن
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// تخزين متقدم للصور
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
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
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 50
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('يسمح برفع الصور فقط'), false);
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

// معدل للوقاية من هجمات Brute Force
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 دقيقة

const checkLoginAttempts = (req, res, next) => {
    const ip = req.ip;
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: Date.now() };
    
    if (attempts.count >= MAX_LOGIN_ATTEMPTS && Date.now() - attempts.lastAttempt < LOCKOUT_TIME) {
        return res.status(429).json({ 
            message: 'تم تجاوز عدد المحاولات المسموح بها. الرجاء المحاولة لاحقاً' 
        });
    }
    next();
};

function updateLoginAttempts(ip, success) {
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: Date.now() };
    
    if (success) {
        loginAttempts.delete(ip);
    } else {
        attempts.count++;
        attempts.lastAttempt = Date.now();
        loginAttempts.set(ip, attempts);
        
        // تنظيف المحاولات القديمة
        setTimeout(() => {
            loginAttempts.delete(ip);
        }, LOCKOUT_TIME);
    }
}

// نظام الاتصال في الوقت الحقيقي (WebSocket بديل)
const activeConnections = new Map();

app.use((req, res, next) => {
    // إضافة معرف فريد لكل طلب لتتبع الاتصال
    req.connectionId = crypto.randomBytes(8).toString('hex');
    next();
});

// مسارات محسنة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password } = req.body;

        // تحقق مكثف من البيانات
        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
        }

        const saudiPhoneRegex = /^5\d{8}$/;
        if (!saudiPhoneRegex.test(phone)) {
            return res.status(400).json({ 
                message: 'رقم الهاتف غير صحيح. يجب أن يبدأ بـ 5 ويحتوي على 9 أرقام' 
            });
        }

        const users = storageSystem.readFile('local-users.json');
        if (users.find(u => u.phone === phone)) {
            return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
            _id: crypto.randomBytes(16).toString('hex'),
            fullName: fullName.trim(),
            phone,
            university,
            major,
            batch,
            password: hashedPassword,
            role: 'student',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };

        users.push(newUser);
        storageSystem.writeFile('local-users.json', users);

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

app.post('/api/auth/login', checkLoginAttempts, async (req, res) => {
    try {
        const { phone, password } = req.body;
        const ip = req.ip;

        if (!phone || !password) {
            return res.status(400).json({ message: 'رقم الهاتف وكلمة المرور مطلوبان' });
        }

        const users = storageSystem.readFile('local-users.json');
        const user = users.find(u => u.phone === phone && u.isActive !== false);

        if (!user) {
            updateLoginAttempts(ip, false);
            return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            updateLoginAttempts(ip, false);
            return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        }

        // تحديث آخر دخول
        user.lastLogin = new Date().toISOString();
        storageSystem.writeFile('local-users.json', users);

        updateLoginAttempts(ip, true);

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

        // تحديث حالة الاتصال
        activeConnections.set(user._id, {
            lastActive: Date.now(),
            connectionId: req.connectionId
        });

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
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        console.error('خطأ الدخول:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام الدردشة المحسن
app.post('/api/chat/send', authenticateToken, async (req, res) => {
    try {
        const { text, receiverId } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        if (text.length > 1000) {
            return res.status(400).json({ message: 'الرسالة طويلة جداً' });
        }

        const messages = storageSystem.readFile('local-messages.json');
        const users = storageSystem.readFile('local-users.json');
        
        const sender = users.find(u => u._id === req.user._id);
        if (!sender) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // تحديد المستلم بناءً على دور المرسل
        let actualReceiverId;
        let actualReceiverName;
        
        if (req.user.role === 'admin') {
            // المدير يرسل لمستخدم محدد
            if (!receiverId) {
                return res.status(400).json({ message: 'معرف المستلم مطلوب للمدير' });
            }
            actualReceiverId = receiverId;
            const receiver = users.find(u => u._id === receiverId);
            actualReceiverName = receiver ? receiver.fullName : 'مستخدم غير معروف';
        } else {
            // المستخدم العادي يرسل للمدير
            actualReceiverId = 'admin';
            actualReceiverName = 'مدير النظام';
        }

        const newMessage = {
            _id: crypto.randomBytes(16).toString('hex'),
            senderId: req.user._id,
            senderName: sender.fullName,
            receiverId: actualReceiverId,
            receiverName: actualReceiverName,
            text: text.trim(),
            timestamp: new Date().toISOString(),
            read: false,
            delivered: false
        };

        messages.push(newMessage);
        storageSystem.writeFile('local-messages.json', messages);

        // تحديث حالة الاتصال للمستلم
        if (activeConnections.has(actualReceiverId)) {
            newMessage.delivered = true;
            // في تطبيق حقيقي، هنا سنستخدم WebSocket لإرسال الإشعار
        }

        res.json({ 
            message: 'تم إرسال الرسالة',
            messageId: newMessage._id,
            delivered: newMessage.delivered
        });
    } catch (error) {
        console.error('خطأ إرسال الرسالة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إرسال رسالة من المدير
app.post('/api/admin/send-message', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { text, receiverId, isBroadcast } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        const messages = storageSystem.readFile('local-messages.json');
        const users = storageSystem.readFile('local-users.json');

        if (isBroadcast) {
            // إرسال جماعي
            users.forEach(user => {
                if (user.role === 'student' && user.isActive !== false) {
                    const broadcastMessage = {
                        _id: crypto.randomBytes(16).toString('hex'),
                        senderId: 'admin',
                        senderName: 'مدير النظام',
                        receiverId: user._id,
                        receiverName: user.fullName,
                        text: text.trim(),
                        timestamp: new Date().toISOString(),
                        read: false,
                        delivered: false,
                        isBroadcast: true
                    };
                    messages.push(broadcastMessage);
                }
            });
        } else {
            // إرسال فردي
            if (!receiverId) {
                return res.status(400).json({ message: 'معرف المستخدم مطلوب' });
            }

            const receiver = users.find(u => u._id === receiverId);
            if (!receiver) {
                return res.status(404).json({ message: 'المستخدم غير موجود' });
            }

            const directMessage = {
                _id: crypto.randomBytes(16).toString('hex'),
                senderId: 'admin',
                senderName: 'مدير النظام',
                receiverId: receiverId,
                receiverName: receiver.fullName,
                text: text.trim(),
                timestamp: new Date().toISOString(),
                read: false,
                delivered: false,
                isBroadcast: false
            };
            messages.push(directMessage);
        }

        storageSystem.writeFile('local-messages.json', messages);
        res.json({ 
            message: isBroadcast ? 'تم الإرسال الجماعي بنجاح' : 'تم إرسال الرسالة بنجاح'
        });
    } catch (error) {
        console.error('خطأ إرسال الرسالة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على المحادثات للمدير
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'صلاحيات غير كافية' });
        }

        const messages = storageSystem.readFile('local-messages.json');
        const users = storageSystem.readFile('local-users.json');
        
        const userConversations = {};
        
        // جمع جميع المحادثات مع المستخدمين
        messages.forEach(msg => {
            const otherUserId = msg.senderId === 'admin' ? msg.receiverId : msg.senderId;
            
            // تجاهل الرسائل التي ليس لها مستخدم
            if (otherUserId === 'admin') return;
            
            if (!userConversations[otherUserId]) {
                const user = users.find(u => u._id === otherUserId);
                if (user) {
                    // جمع رسائل هذا المستخدم
                    const userMessages = messages.filter(m => 
                        (m.senderId === 'admin' && m.receiverId === otherUserId) ||
                        (m.senderId === otherUserId && m.receiverId === 'admin')
                    );
                    
                    const lastMessage = userMessages[userMessages.length - 1];
                    const unreadCount = userMessages.filter(m => 
                        m.receiverId === 'admin' && 
                        m.senderId === otherUserId && 
                        !m.read
                    ).length;

                    userConversations[otherUserId] = {
                        userId: user._id,
                        userName: user.fullName,
                        userPhone: user.phone,
                        lastMessage: lastMessage?.text || 'لا توجد رسائل',
                        lastMessageTime: lastMessage?.timestamp || new Date().toISOString(),
                        unreadCount: unreadCount,
                        hasUnread: unreadCount > 0
                    };
                }
            }
        });
        
        res.json(Object.values(userConversations));
    } catch (error) {
        console.error('خطأ جلب المحادثات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على رسائل محادثة محددة
app.get('/api/chat/conversation/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const messages = storageSystem.readFile('local-messages.json');
        
        let conversationMessages;
        if (req.user.role === 'admin') {
            conversationMessages = messages.filter(msg => 
                (msg.senderId === 'admin' && msg.receiverId === userId) ||
                (msg.senderId === userId && msg.receiverId === 'admin')
            );
        } else {
            // للمستخدم العادي: التأكد أنه يطلب محادثته فقط
            if (userId !== req.user._id && userId !== 'admin') {
                return res.status(403).json({ message: 'غير مصرح' });
            }
            conversationMessages = messages.filter(msg => 
                (msg.senderId === req.user._id && msg.receiverId === 'admin') ||
                (msg.senderId === 'admin' && msg.receiverId === req.user._id)
            );
        }
        
        // تحديث حالة القراءة
        let updated = false;
        conversationMessages.forEach(msg => {
            if (msg.receiverId === req.user._id && !msg.read) {
                msg.read = true;
                updated = true;
            }
        });
        
        if (updated) {
            storageSystem.writeFile('local-messages.json', messages);
        }
        
        res.json(conversationMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    } catch (error) {
        console.error('خطأ جلب الرسائل:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على جميع الرسائل (للمستخدم العادي)
app.get('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        const messages = storageSystem.readFile('local-messages.json');
        
        const userMessages = messages.filter(msg => 
            (msg.senderId === req.user._id && msg.receiverId === 'admin') ||
            (msg.senderId === 'admin' && msg.receiverId === req.user._id)
        );
        
        // تحديث حالة القراءة
        let updated = false;
        userMessages.forEach(msg => {
            if (msg.receiverId === req.user._id && !msg.read) {
                msg.read = true;
                updated = true;
            }
        });
        
        if (updated) {
            storageSystem.writeFile('local-messages.json', messages);
        }
        
        res.json(userMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    } catch (error) {
        console.error('خطأ جلب الرسائل:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة الصور المتقدمة
app.post('/api/admin/send-image', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { receiverId, description } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة' });
        }

        if (!receiverId) {
            return res.status(400).json({ message: 'معرف المستلم مطلوب' });
        }

        const users = storageSystem.readFile('local-users.json');
        const receiver = users.find(u => u._id === receiverId);
        
        if (!receiver) {
            // حذف الصورة المرفوعة إذا فشل الإرسال
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        const images = storageSystem.readFile('local-images.json');
        const newImage = {
            _id: crypto.randomBytes(16).toString('hex'),
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
            mimeType: req.file.mimetype,
            isBroadcast: false
        };

        images.push(newImage);
        storageSystem.writeFile('local-images.json', images);

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
        // تنظيف الصورة المرفوعة في حالة الخطأ
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إرسال صورة جماعية
app.post('/api/admin/broadcast-image', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { description } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة' });
        }

        const users = storageSystem.readFile('local-users.json');
        const images = storageSystem.readFile('local-images.json');
        let successCount = 0;

        users.forEach(user => {
            if (user.role === 'student' && user.isActive !== false) {
                const newImage = {
                    _id: crypto.randomBytes(16).toString('hex'),
                    userId: user._id,
                    userName: user.fullName,
                    userPhone: user.phone,
                    imageName: req.file.filename,
                    originalName: req.file.originalname,
                    url: `/uploads/${req.file.filename}`,
                    description: description || 'إرسال جماعي',
                    sentBy: req.user._id,
                    sentAt: new Date().toISOString(),
                    fileSize: req.file.size,
                    mimeType: req.file.mimetype,
                    isBroadcast: true
                };
                images.push(newImage);
                successCount++;
            }
        });

        storageSystem.writeFile('local-images.json', images);
        res.json({ 
            message: `تم إرسال الصورة إلى ${successCount} مستخدم`,
            successCount
        });
    } catch (error) {
        console.error('خطأ الإرسال الجماعي:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إرسال مجلد الصور بناءً على أسماء الملفات (أرقام الهواتف)
app.post('/api/admin/send-batch-images', authenticateToken, requireAdmin, upload.array('images', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'لم يتم رفع أي صور' });
        }

        const users = storageSystem.readFile('local-users.json');
        const images = storageSystem.readFile('local-images.json');
        
        const results = {
            success: 0,
            failed: 0,
            details: []
        };

        for (const file of req.files) {
            try {
                // استخراج رقم الهاتف من اسم الملف (إزالة الامتداد)
                const phoneFromFilename = file.originalname.replace(/\.[^/.]+$/, "");
                
                // البحث عن المستخدم برقم الهاتف
                const user = users.find(u => u.phone === phoneFromFilename);
                
                if (user) {
                    const newImage = {
                        _id: crypto.randomBytes(16).toString('hex'),
                        userId: user._id,
                        userName: user.fullName,
                        userPhone: user.phone,
                        imageName: file.filename,
                        originalName: file.originalname,
                        url: `/uploads/${file.filename}`,
                        description: `مرسل تلقائي من المجلد - ${file.originalname}`,
                        sentBy: req.user._id,
                        sentAt: new Date().toISOString(),
                        fileSize: file.size,
                        mimeType: file.mimetype,
                        isBatch: true
                    };

                    images.push(newImage);
                    results.success++;
                    results.details.push({
                        file: file.originalname,
                        status: 'success',
                        message: `تم الإرسال إلى ${user.fullName} (${user.phone})`
                    });
                } else {
                    results.failed++;
                    results.details.push({
                        file: file.originalname,
                        status: 'failed',
                        message: `لا يوجد مستخدم برقم الهاتف ${phoneFromFilename}`
                    });
                    
                    // حذف الصورة إذا لم يكن هناك مستخدم
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                }
            } catch (fileError) {
                console.error(`خطأ في معالجة الملف ${file.originalname}:`, fileError);
                results.failed++;
                results.details.push({
                    file: file.originalname,
                    status: 'failed',
                    message: 'خطأ في معالجة الملف'
                });
            }
        }

        // حفظ التحديثات
        storageSystem.writeFile('local-images.json', images);

        res.json({
            message: `تم معالجة ${req.files.length} صورة`,
            results: results
        });

    } catch (error) {
        console.error('خطأ إرسال مجلد الصور:', error);
        
        // تنظيف جميع الصور المرفوعة في حالة الخطأ
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/images', authenticateToken, async (req, res) => {
    try {
        const images = storageSystem.readFile('local-images.json')
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
        const users = storageSystem.readFile('local-users.json')
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
                lastLogin: user.lastLogin
            }));
        
        res.json(users);
    } catch (error) {
        console.error('خطأ جلب المستخدمين:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على معلومات مستخدم محدد
app.get('/api/admin/user/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const users = storageSystem.readFile('local-users.json');
        const user = users.find(u => u._id === userId);
        
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        res.json({
            _id: user._id,
            fullName: user.fullName,
            phone: user.phone,
            university: user.university,
            major: user.major,
            batch: user.batch
        });
    } catch (error) {
        console.error('خطأ جلب معلومات المستخدم:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إحصائيات النظام
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = storageSystem.readFile('local-users.json');
        const messages = storageSystem.readFile('local-messages.json');
        const images = storageSystem.readFile('local-images.json');

        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isActive !== false && u.role === 'student').length,
            totalMessages: messages.length,
            unreadMessages: messages.filter(m => m.receiverId === 'admin' && !m.read).length,
            totalImages: images.length,
            storageUsed: images.reduce((total, img) => total + (img.fileSize || 0), 0),
            onlineUsers: Array.from(activeConnections.keys()).length,
            systemUptime: process.uptime()
        };

        res.json(stats);
    } catch (error) {
        console.error('خطأ جلب الإحصائيات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// مسار فحص الاتصال المحسن
app.get('/api/health', authenticateToken, (req, res) => {
    const userStatus = activeConnections.has(req.user._id) ? 'متصل' : 'غير متصل';
    
    res.json({
        status: '✅ النظام يعمل بشكل طبيعي',
        userStatus: userStatus,
        timestamp: new Date().toISOString(),
        connectionId: req.connectionId,
        activeConnections: activeConnections.size
    });
});

// مسار الحفاظ على الاتصال
app.post('/api/keep-alive', authenticateToken, (req, res) => {
    activeConnections.set(req.user._id, {
        lastActive: Date.now(),
        connectionId: req.connectionId
    });
    
    res.json({ 
        status: 'active',
        timestamp: new Date().toISOString()
    });
});

// خدمة الملفات الثابتة
app.use('/uploads', express.static('uploads'));

// إنشاء مدير افتراضي
const createAdminUser = async () => {
    try {
        const users = storageSystem.readFile('local-users.json');
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
                lastLogin: null
            };

            users.push(adminUser);
            storageSystem.writeFile('local-users.json', users);
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
            console.log('📱 رقم الهاتف: 500000000');
            console.log('🔐 كلمة المرور: Admin123!@#');
        }
    } catch (error) {
        console.error('خطأ في إنشاء المدير:', error);
    }
};

// تنظيف الاتصالات غير النشطة
setInterval(() => {
    const now = Date.now();
    const timeout = 2 * 60 * 1000; // 2 دقيقة
    
    activeConnections.forEach((connection, userId) => {
        if (now - connection.lastActive > timeout) {
            activeConnections.delete(userId);
        }
    });
}, 60000); // كل دقيقة

// بدء السيرفر
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log('🚀 بدء تشغيل السيرفر المحسن...');
    
    // استعادة البيانات من النسخ الاحتياطي إذا لزم الأمر
    storageSystem.restoreData();
    
    // إنشاء المدير الافتراضي
    await createAdminUser();
    
    console.log(`✅ السيرفر يعمل على المنفذ ${PORT}`);
    console.log('📊 النظام جاهز للاستخدام');
    console.log('🔒 نظام النسخ الاحتياطي التلقائي مفعل');
    console.log('🛡️  إجراءات الأمان المحسنة مفعلة');
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
    // لا نوقف العملية، بل نسجل الخطأ ونستمر
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ رفض وعد غير معالج:', reason);
});
