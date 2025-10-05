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
app.use(express.static(__dirname));

// معدلات الأمان
app.disable('x-powered-by');

// تهيئة الملفات والمجلدات
function initializeApp() {
    const files = ['local-users.json', 'local-messages.json', 'local-images.json'];
    const folders = ['uploads', 'temp'];
    
    files.forEach(file => {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, '[]');
            console.log(`✅ تم إنشاء ${file}`);
        }
    });
    
    folders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
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
        files: 50 // زيادة عدد الملفات المسموح بها
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

// المسارات
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
                message: 'رقم الهاتف غير صحيح' 
            });
        }

        const users = readLocalFile('local-users.json');
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

app.post('/api/auth/login', checkLoginAttempts, async (req, res) => {
    try {
        const { phone, password } = req.body;
        const ip = req.ip;

        if (!phone || !password) {
            return res.status(400).json({ message: 'رقم الهاتف وكلمة المرور مطلوبان' });
        }

        const users = readLocalFile('local-users.json');
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
        writeLocalFile('local-users.json', users);

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

// نظام الدردشة المتقدم
app.post('/api/chat/send', authenticateToken, async (req, res) => {
    try {
        const { text, receiverId } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        if (text.length > 1000) {
            return res.status(400).json({ message: 'الرسالة طويلة جداً' });
        }

        const messages = readLocalFile('local-messages.json');
        const newMessage = {
            _id: crypto.randomBytes(16).toString('hex'),
            senderId: req.user._id,
            senderName: req.user.fullName,
            receiverId: receiverId || 'admin',
            text: text.trim(),
            timestamp: new Date().toISOString(),
            read: false
        };

        messages.push(newMessage);
        writeLocalFile('local-messages.json', messages);

        res.json({ 
            message: 'تم إرسال الرسالة',
            messageId: newMessage._id
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

        const messages = readLocalFile('local-messages.json');
        const users = readLocalFile('local-users.json');

        if (isBroadcast) {
            // إرسال جماعي
            users.forEach(user => {
                if (user.role === 'student' && user.isActive !== false) {
                    const broadcastMessage = {
                        _id: crypto.randomBytes(16).toString('hex'),
                        senderId: 'admin',
                        senderName: 'مدير النظام',
                        receiverId: user._id,
                        text: text.trim(),
                        timestamp: new Date().toISOString(),
                        read: false,
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
                text: text.trim(),
                timestamp: new Date().toISOString(),
                read: false,
                isBroadcast: false
            };
            messages.push(directMessage);
        }

        writeLocalFile('local-messages.json', messages);
        res.json({ 
            message: isBroadcast ? 'تم الإرسال الجماعي بنجاح' : 'تم إرسال الرسالة بنجاح'
        });
    } catch (error) {
        console.error('خطأ إرسال الرسالة:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على المحادثات
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const messages = readLocalFile('local-messages.json');
        const users = readLocalFile('local-users.json');
        
        if (req.user.role === 'admin') {
            // للمدير: جميع المحادثات مع المستخدمين
            const userConversations = {};
            
            messages.forEach(msg => {
                const otherUserId = msg.senderId === 'admin' ? msg.receiverId : msg.senderId;
                if (otherUserId !== 'admin' && !userConversations[otherUserId]) {
                    const user = users.find(u => u._id === otherUserId);
                    if (user) {
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
                            unreadCount: unreadCount
                        };
                    }
                }
            });
            
            res.json(Object.values(userConversations));
        } else {
            // للطالب: المحادثة مع المدير فقط
            const userMessages = messages.filter(msg => 
                msg.senderId === req.user._id || msg.receiverId === req.user._id
            );
            res.json(userMessages);
        }
    } catch (error) {
        console.error('خطأ جلب المحادثات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على رسائل محادثة محددة
app.get('/api/chat/messages/:userId?', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const messages = readLocalFile('local-messages.json');
        
        let conversationMessages;
        if (req.user.role === 'admin' && userId) {
            conversationMessages = messages.filter(msg => 
                (msg.senderId === 'admin' && msg.receiverId === userId) ||
                (msg.senderId === userId && msg.receiverId === 'admin')
            );
        } else {
            conversationMessages = messages.filter(msg => 
                (msg.senderId === req.user._id && msg.receiverId === 'admin') ||
                (msg.senderId === 'admin' && msg.receiverId === req.user._id)
            );
        }
        
        // تحديث حالة القراءة
        conversationMessages.forEach(msg => {
            if (msg.receiverId === req.user._id && !msg.read) {
                msg.read = true;
            }
        });
        writeLocalFile('local-messages.json', messages);
        
        res.json(conversationMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
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

        const users = readLocalFile('local-users.json');
        const receiver = users.find(u => u._id === receiverId);
        
        if (!receiver) {
            // حذف الصورة المرفوعة إذا فشل الإرسال
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        const images = readLocalFile('local-images.json');
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

        const users = readLocalFile('local-users.json');
        const images = readLocalFile('local-images.json');
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

        writeLocalFile('local-images.json', images);
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

// إرسال مجلد صور بناءً على أسماء الملفات (أرقام الهواتف)
app.post('/api/admin/send-folder', authenticateToken, requireAdmin, upload.array('images', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'لم يتم رفع أي صور' });
        }

        const users = readLocalFile('local-users.json');
        const images = readLocalFile('local-images.json');
        let successCount = 0;
        let failedCount = 0;
        const results = [];

        for (const file of req.files) {
            // استخراج رقم الهاتف من اسم الملف (إزالة الامتداد)
            const phoneFromFilename = file.originalname.replace(/\.[^/.]+$/, "");
            
            // البحث عن المستخدم باستخدام رقم الهاتف
            const user = users.find(u => u.phone === phoneFromFilename && u.role === 'student' && u.isActive !== false);
            
            if (user) {
                const newImage = {
                    _id: crypto.randomBytes(16).toString('hex'),
                    userId: user._id,
                    userName: user.fullName,
                    userPhone: user.phone,
                    imageName: file.filename,
                    originalName: file.originalname,
                    url: `/uploads/${file.filename}`,
                    description: `مرسل تلقائياً بناءً على اسم الملف`,
                    sentBy: req.user._id,
                    sentAt: new Date().toISOString(),
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    isAutoSent: true
                };

                images.push(newImage);
                successCount++;
                results.push({
                    fileName: file.originalname,
                    status: 'success',
                    userName: user.fullName,
                    phone: user.phone
                });
            } else {
                failedCount++;
                results.push({
                    fileName: file.originalname,
                    status: 'failed',
                    reason: 'لم يتم العثور على مستخدم بهذا الرقم'
                });
                
                // حذف الصورة إذا لم يتم العثور على مستخدم
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            }
        }

        writeLocalFile('local-images.json', images);

        res.json({ 
            message: `تم معالجة ${req.files.length} صورة`,
            summary: {
                total: req.files.length,
                success: successCount,
                failed: failedCount
            },
            details: results
        });
    } catch (error) {
        console.error('خطأ إرسال المجلد:', error);
        
        // تنظيف جميع الصور المرفوعة في حالة الخطأ
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        
        res.status(500).json({ message: 'خطأ في معالجة المجلد' });
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
                lastLogin: user.lastLogin
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

        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isActive !== false && u.role === 'student').length,
            totalMessages: messages.length,
            unreadMessages: messages.filter(m => m.receiverId === 'admin' && !m.read).length,
            totalImages: images.length,
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
                lastLogin: null
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
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development'
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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 المنصة الإلكترونية تعمل على البورت ${PORT}`);
    console.log(`🌐 الرابط: http://localhost:${PORT}`);
    console.log(`⚡ النسخة: 2.0.0 - الاحترافية`);
    console.log(`🔒 نظام أمان متقدم مفعل`);
    console.log(`💾 نظام التخزين: الملفات المحلية`);
    console.log(`📁 ميزة إرسال المجلدات: مفعلة`);
    
    setTimeout(createAdminUser, 2000);
});
