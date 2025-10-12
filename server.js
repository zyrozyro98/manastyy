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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// نظام تخزين محسن مع استعادة البيانات
class EnhancedStorage {
    constructor() {
        this.backupInterval = 5 * 60 * 1000;
        this.init();
    }

    init() {
        const files = ['local-users.json', 'local-messages.json', 'local-images.json'];
        const folders = ['uploads', 'temp', 'backups', 'emojis'];
        
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

        this.startAutoBackup();
        this.restoreData(); // استعادة البيانات عند التشغيل
    }

    readFile(filename) {
        try {
            if (fs.existsSync(filename)) {
                const data = fs.readFileSync(filename, 'utf8');
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
            fs.writeFileSync(filename, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error(`خطأ في الكتابة لـ ${filename}:`, error);
            return false;
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

    createBackup(filename) {
        try {
            if (fs.existsSync(filename)) {
                const backupDir = 'backups';
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupFile = `${backupDir}/${path.basename(filename)}.${timestamp}.backup`;
                
                fs.copyFileSync(filename, backupFile);
                this.cleanOldBackups(filename);
            }
        } catch (error) {
            console.error(`خطأ في النسخ الاحتياطي:`, error);
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

            if (backups.length > 10) {
                backups.slice(10).forEach(backup => {
                    fs.unlinkSync(path.join(backupDir, backup.name));
                });
            }
        } catch (error) {
            console.error('خطأ في تنظيف النسخ الاحتياطية:', error);
        }
    }

    restoreData() {
        console.log('🔄 فحص واستعادة البيانات...');
        const files = ['local-users.json', 'local-messages.json', 'local-images.json'];
        
        files.forEach(file => {
            if (!fs.existsSync(file)) {
                const backupDir = 'backups';
                const backups = fs.readdirSync(backupDir)
                    .filter(backupFile => backupFile.startsWith(path.basename(file)))
                    .sort()
                    .reverse();
                
                if (backups.length > 0) {
                    const latestBackup = backups[0];
                    console.log(`🔄 استعادة ${file} من ${latestBackup}`);
                    fs.copyFileSync(path.join(backupDir, latestBackup), file);
                }
            }
        });
    }
}

// تهيئة نظام التخزين
const storageSystem = new EnhancedStorage();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// تخزين الصور والإيموجي
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = file.fieldname === 'emoji' ? 'emojis' : 'uploads';
        cb(null, folder + '/');
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
        fileSize: 20 * 1024 * 1024, // 20MB
        files: 50
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('يسمح برفع الملفات الوسائط فقط'), false);
        }
    }
});

// Middleware المصادقة
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

// نظام إدارة المحاولات
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000;

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
        
        setTimeout(() => {
            loginAttempts.delete(ip);
        }, LOCKOUT_TIME);
    }
}

// نظام الاتصال النشط
const activeConnections = new Map();

// إضافة معرف اتصال لكل طلب
app.use((req, res, next) => {
    req.connectionId = crypto.randomBytes(8).toString('hex');
    next();
});

// مسارات جديدة للواجهة المحسنة
app.get('/api/features', (req, res) => {
    const features = [
        {
            id: 1,
            title: 'نظام دردشة متطور',
            description: 'تواصل فوري مع الإدارة والطلاب',
            icon: 'comments',
            color: 'primary'
        },
        {
            id: 2,
            title: 'مشاركة الوسائط',
            description: 'إرسال الصور والفيديوهات بجودة عالية',
            icon: 'images',
            color: 'success'
        },
        {
            id: 3,
            title: 'إدارة ذكية',
            description: 'لوحة تحكم متكاملة للمدراء',
            icon: 'cogs',
            color: 'warning'
        },
        {
            id: 4,
            title: 'تحديثات فورية',
            description: 'مزامنة فورية للرسائل والإشعارات',
            icon: 'sync',
            color: 'info'
        },
        {
            id: 5,
            title: 'تخزين آمن',
            description: 'نسخ احتياطي تلقائي للبيانات',
            icon: 'shield-alt',
            color: 'danger'
        },
        {
            id: 6,
            title: 'واجهة تفاعلية',
            description: 'تصميم متجاوب لجميع الأجهزة',
            icon: 'mobile-alt',
            color: 'secondary'
        }
    ];
    
    res.json(features);
});

// مسار فحص الاتصال المحسن
app.get('/api/health', (req, res) => {
    res.json({
        status: 'connected',
        message: '✅ النظام يعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        serverTime: Date.now(),
        activeConnections: activeConnections.size
    });
});

// مسار الحفاظ على الاتصال
app.post('/api/keep-alive', authenticateToken, (req, res) => {
    activeConnections.set(req.user._id, {
        lastActive: Date.now(),
        connectionId: req.connectionId,
        userAgent: req.get('User-Agent')
    });
    
    res.json({ 
        status: 'active',
        timestamp: new Date().toISOString()
    });
});

// مسارات المصادقة (نفس السابق مع تحسينات)
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
            lastLogin: null,
            profileImage: null
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
            { expiresIn: '30d' }
        );

        activeConnections.set(user._id, {
            lastActive: Date.now(),
            connectionId: req.connectionId,
            userAgent: req.get('User-Agent')
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
                lastLogin: user.lastLogin,
                profileImage: user.profileImage
            }
        });
    } catch (error) {
        console.error('خطأ الدخول:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام الدردشة المحسن مع الإيموجي والوسائط
app.post('/api/chat/send', authenticateToken, upload.single('attachment'), async (req, res) => {
    try {
        const { text, receiverId, messageType = 'text', replyTo } = req.body;

        if (!text && !req.file) {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        const messages = storageSystem.readFile('local-messages.json');
        const users = storageSystem.readFile('local-users.json');
        
        const sender = users.find(u => u._id === req.user._id);
        if (!sender) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        let actualReceiverId;
        let actualReceiverName;
        
        if (req.user.role === 'admin') {
            if (!receiverId) {
                return res.status(400).json({ message: 'معرف المستلم مطلوب للمدير' });
            }
            actualReceiverId = receiverId;
            const receiver = users.find(u => u._id === receiverId);
            actualReceiverName = receiver ? receiver.fullName : 'مستخدم غير معروف';
        } else {
            actualReceiverId = 'admin';
            actualReceiverName = 'مدير النظام';
        }

        const newMessage = {
            _id: crypto.randomBytes(16).toString('hex'),
            senderId: req.user._id,
            senderName: sender.fullName,
            receiverId: actualReceiverId,
            receiverName: actualReceiverName,
            text: text ? text.trim() : '',
            timestamp: new Date().toISOString(),
            read: false,
            delivered: false,
            messageType: req.file ? 'attachment' : messageType,
            attachment: req.file ? {
                filename: req.file.filename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                url: `/uploads/${req.file.filename}`
            } : null,
            replyTo: replyTo || null,
            reactions: []
        };

        messages.push(newMessage);
        storageSystem.writeFile('local-messages.json', messages);

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

// مسارات الإدارة (نفس السابق مع تحسينات)
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
                lastLogin: user.lastLogin,
                profileImage: user.profileImage,
                isOnline: activeConnections.has(user._id)
            }));
        
        res.json(users);
    } catch (error) {
        console.error('خطأ جلب المستخدمين:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إحصائيات النظام المحسنة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = storageSystem.readFile('local-users.json');
        const messages = storageSystem.readFile('local-messages.json');
        const images = storageSystem.readFile('local-images.json');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayMessages = messages.filter(msg => 
            new Date(msg.timestamp) >= today
        ).length;

        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isActive !== false && u.role === 'student').length,
            onlineUsers: Array.from(activeConnections.keys()).length,
            totalMessages: messages.length,
            todayMessages: todayMessages,
            unreadMessages: messages.filter(m => m.receiverId === 'admin' && !m.read).length,
            totalImages: images.length,
            storageUsed: images.reduce((total, img) => total + (img.fileSize || 0), 0),
            systemUptime: process.uptime(),
            serverTime: new Date().toISOString()
        };

        res.json(stats);
    } catch (error) {
        console.error('خطأ جلب الإحصائيات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// خدمة الملفات الثابتة
app.use('/uploads', express.static('uploads'));
app.use('/emojis', express.static('emojis'));

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
                lastLogin: null,
                profileImage: null
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
    const timeout = 5 * 60 * 1000; // 5 دقائق
    
    activeConnections.forEach((connection, userId) => {
        if (now - connection.lastActive > timeout) {
            activeConnections.delete(userId);
        }
    });
}, 60000);

// بدء السيرفر
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log('🚀 بدء تشغيل السيرفر المحسن...');
    
    await createAdminUser();
    
    console.log(`✅ السيرفر يعمل على المنفذ ${PORT}`);
    console.log('📊 النظام جاهز للاستخدام');
    console.log('🔒 نظام النسخ الاحتياطي التلقائي مفعل');
    console.log('🎨 الواجهة التفاعلية جاهزة');
});

// معالجة الأخطاء
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ رفض وعد غير معالج:', reason);
});
