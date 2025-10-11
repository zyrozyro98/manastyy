const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const csv = require('csv-parser');
const { stringify } = require('csv-stringify');
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

// معدلات الأمان
app.disable('x-powered-by');

// تهيئة الملفات والمجلدات
function initializeApp() {
    const files = ['local-users.json', 'local-messages.json', 'local-images.json'];
    const folders = ['uploads', 'temp', 'exports', 'profile-pictures'];
    
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
        if (file.fieldname === 'profileImage') {
            folder = 'profile-pictures/';
        }
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
        fileSize: 20 * 1024 * 1024, // 20MB
        files: 10
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('application/')) {
            cb(null, true);
        } else {
            cb(new Error('يسمح برفع الصور وملفات CSV فقط'), false);
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

// المسارات الأساسية
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
            return res.status(400).json({ message: 'رقم الهاتف غير صحيح' });
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
            lastLogin: null,
            profileImage: null
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
                lastLogin: user.lastLogin,
                profileImage: user.profileImage
            }
        });
    } catch (error) {
        console.error('خطأ الدخول:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نظام الدردشة المتقدم مع الصور والإيموجي
app.post('/api/chat/send', authenticateToken, async (req, res) => {
    try {
        const { text, receiverId, image, emoji, messageType = 'text' } = req.body;

        if (!text && !image && messageType === 'text') {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        if (text && text.length > 2000) {
            return res.status(400).json({ message: 'الرسالة طويلة جداً' });
        }

        const messages = readLocalFile('local-messages.json');
        const users = readLocalFile('local-users.json');
        
        const sender = users.find(u => u._id === req.user._id);
        if (!sender) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        let actualReceiverId = receiverId;
        if (req.user.role === 'student') {
            actualReceiverId = 'admin';
        } else if (req.user.role === 'admin' && !receiverId) {
            return res.status(400).json({ message: 'يجب تحديد مستلم للرسالة' });
        }

        const newMessage = {
            _id: crypto.randomBytes(16).toString('hex'),
            senderId: req.user._id,
            senderName: sender.fullName,
            receiverId: actualReceiverId,
            text: text ? text.trim() : '',
            image: image || null,
            emoji: emoji || null,
            messageType: messageType,
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

// رفع صورة في الدردشة
app.post('/api/chat/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة' });
        }

        res.json({
            success: true,
            imageUrl: `/uploads/${req.file.filename}`,
            fileName: req.file.filename
        });
    } catch (error) {
        console.error('خطأ رفع الصورة:', error);
        res.status(500).json({ message: 'خطأ في رفع الصورة' });
    }
});

// إرسال رسالة من المدير
app.post('/api/admin/send-message', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { text, receiverId, isBroadcast, image, emoji } = req.body;

        if (!text && !image && !emoji) {
            return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });
        }

        const messages = readLocalFile('local-messages.json');
        const users = readLocalFile('local-users.json');

        if (isBroadcast) {
            users.forEach(user => {
                if (user.role === 'student' && user.isActive !== false) {
                    const broadcastMessage = {
                        _id: crypto.randomBytes(16).toString('hex'),
                        senderId: 'admin',
                        senderName: 'مدير النظام',
                        receiverId: user._id,
                        text: text ? text.trim() : '',
                        image: image || null,
                        emoji: emoji || null,
                        messageType: image ? 'image' : (emoji ? 'emoji' : 'text'),
                        timestamp: new Date().toISOString(),
                        read: false,
                        isBroadcast: true
                    };
                    messages.push(broadcastMessage);
                }
            });
        } else {
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
                text: text ? text.trim() : '',
                image: image || null,
                emoji: emoji || null,
                messageType: image ? 'image' : (emoji ? 'emoji' : 'text'),
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

// الحصول على المحادثات للمدير
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'صلاحيات غير كافية' });
        }

        const messages = readLocalFile('local-messages.json');
        const users = readLocalFile('local-users.json');
        
        const userConversations = {};
        
        messages.forEach(msg => {
            const otherUserId = msg.senderId === 'admin' ? msg.receiverId : msg.senderId;
            
            if (otherUserId === 'admin') return;
            
            if (!userConversations[otherUserId]) {
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
                        lastMessage: lastMessage?.text || (lastMessage?.image ? '📷 صورة' : (lastMessage?.emoji ? lastMessage.emoji : 'لا توجد رسائل')),
                        lastMessageTime: lastMessage?.timestamp || new Date().toISOString(),
                        unreadCount: unreadCount,
                        userInfo: {
                            university: user.university,
                            major: user.major,
                            batch: user.batch,
                            profileImage: user.profileImage
                        }
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
        const messages = readLocalFile('local-messages.json');
        
        let conversationMessages;
        if (req.user.role === 'admin') {
            conversationMessages = messages.filter(msg => 
                (msg.senderId === 'admin' && msg.receiverId === userId) ||
                (msg.senderId === userId && msg.receiverId === 'admin')
            );
        } else {
            if (userId !== req.user._id && userId !== 'admin') {
                return res.status(403).json({ message: 'غير مصرح' });
            }
            conversationMessages = messages.filter(msg => 
                (msg.senderId === req.user._id && msg.receiverId === 'admin') ||
                (msg.senderId === 'admin' && msg.receiverId === req.user._id)
            );
        }
        
        let updated = false;
        conversationMessages.forEach(msg => {
            if (msg.receiverId === req.user._id && !msg.read) {
                msg.read = true;
                updated = true;
            }
        });
        
        if (updated) {
            writeLocalFile('local-messages.json', messages);
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
        const messages = readLocalFile('local-messages.json');
        
        const userMessages = messages.filter(msg => 
            (msg.senderId === req.user._id && msg.receiverId === 'admin') ||
            (msg.senderId === 'admin' && msg.receiverId === req.user._id)
        );
        
        let updated = false;
        userMessages.forEach(msg => {
            if (msg.receiverId === req.user._id && !msg.read) {
                msg.read = true;
                updated = true;
            }
        });
        
        if (updated) {
            writeLocalFile('local-messages.json', messages);
        }
        
        res.json(userMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    } catch (error) {
        console.error('خطأ جلب الرسائل:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة المستخدمين المتقدمة
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        let users = readLocalFile('local-users.json')
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
                profileImage: user.profileImage
            }));

        // البحث
        if (search) {
            users = users.filter(user => 
                user.fullName.toLowerCase().includes(search.toLowerCase()) ||
                user.phone.includes(search) ||
                user.university.toLowerCase().includes(search.toLowerCase()) ||
                user.major.toLowerCase().includes(search.toLowerCase())
            );
        }

        // الترتيب
        users.sort((a, b) => {
            if (sortOrder === 'asc') {
                return a[sortBy] > b[sortBy] ? 1 : -1;
            } else {
                return a[sortBy] < b[sortBy] ? 1 : -1;
            }
        });

        // التقسيم للصفحات
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedUsers = users.slice(startIndex, endIndex);

        res.json({
            users: paginatedUsers,
            totalUsers: users.length,
            totalPages: Math.ceil(users.length / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error('خطأ جلب المستخدمين:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تحديث بيانات المستخدم
app.put('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { fullName, university, major, batch, isActive } = req.body;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        if (fullName) users[userIndex].fullName = fullName;
        if (university) users[userIndex].university = university;
        if (major) users[userIndex].major = major;
        if (batch) users[userIndex].batch = batch;
        if (typeof isActive === 'boolean') users[userIndex].isActive = isActive;

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

// حذف المستخدم
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // لا يمكن حذف المدير
        if (users[userIndex].role === 'admin') {
            return res.status(400).json({ message: 'لا يمكن حذف حساب المدير' });
        }

        users.splice(userIndex, 1);
        writeLocalFile('local-users.json', users);

        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
        console.error('خطأ حذف المستخدم:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تصدير بيانات المستخدمين
app.get('/api/admin/export-users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { format = 'csv' } = req.query;
        const users = readLocalFile('local-users.json')
            .filter(user => user.role === 'student')
            .map(user => ({
                الاسم: user.fullName,
                الهاتف: user.phone,
                الجامعة: user.university,
                التخصص: user.major,
                الدفعة: user.batch,
                الحالة: user.isActive ? 'نشط' : 'غير نشط',
                تاريخ_التسجيل: new Date(user.createdAt).toLocaleDateString('ar-SA'),
                آخر_دخول: user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('ar-SA') : 'لم يسجل دخول'
            }));

        if (format === 'csv') {
            const filename = `users-export-${Date.now()}.csv`;
            const filepath = path.join(__dirname, 'exports', filename);
            
            stringify(users, { header: true }, (err, output) => {
                if (err) throw err;
                
                fs.writeFileSync(filepath, '\uFEFF' + output, 'utf8');
                
                res.download(filepath, filename, (err) => {
                    if (err) {
                        console.error('خطأ في التحميل:', err);
                    }
                    // تنظيف الملف بعد التحميل
                    setTimeout(() => {
                        if (fs.existsSync(filepath)) {
                            fs.unlinkSync(filepath);
                        }
                    }, 5000);
                });
            });
        } else {
            res.json({ users });
        }
    } catch (error) {
        console.error('خطأ تصدير البيانات:', error);
        res.status(500).json({ message: 'خطأ في التصدير' });
    }
});

// استيراد بيانات المستخدمين
app.post('/api/admin/import-users', authenticateToken, requireAdmin, upload.single('usersFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي ملف' });
        }

        if (req.file.mimetype !== 'text/csv') {
            return res.status(400).json({ message: 'يجب رفع ملف CSV فقط' });
        }

        const results = [];
        const errors = [];
        let successCount = 0;
        let errorCount = 0;

        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => {
                results.push(data);
            })
            .on('end', async () => {
                const users = readLocalFile('local-users.json');
                
                for (const row of results) {
                    try {
                        const phone = row['الهاتف'] || row['phone'];
                        
                        if (!phone) {
                            errors.push({ row, error: 'رقم الهاتف مطلوب' });
                            errorCount++;
                            continue;
                        }

                        const existingUser = users.find(u => u.phone === phone);
                        if (existingUser) {
                            errors.push({ row, error: 'رقم الهاتف مسجل مسبقاً' });
                            errorCount++;
                            continue;
                        }

                        const hashedPassword = await bcrypt.hash('123456', 12); // كلمة مرور افتراضية
                        const newUser = {
                            _id: crypto.randomBytes(16).toString('hex'),
                            fullName: row['الاسم'] || row['fullName'] || 'مستخدم',
                            phone: phone,
                            university: row['الجامعة'] || row['university'] || 'غير محدد',
                            major: row['التخصص'] || row['major'] || 'غير محدد',
                            batch: row['الدفعة'] || row['batch'] || '2024',
                            password: hashedPassword,
                            role: 'student',
                            isActive: true,
                            createdAt: new Date().toISOString(),
                            lastLogin: null
                        };

                        users.push(newUser);
                        successCount++;
                    } catch (error) {
                        errors.push({ row, error: error.message });
                        errorCount++;
                    }
                }

                writeLocalFile('local-users.json', users);
                
                // حذف الملف المؤقت
                fs.unlinkSync(req.file.path);

                res.json({
                    message: `تم استيراد ${successCount} مستخدم بنجاح`,
                    successCount,
                    errorCount,
                    errors: errors.slice(0, 10) // إرجاع أول 10 أخطاء فقط
                });
            })
            .on('error', (error) => {
                console.error('خطأ قراءة الملف:', error);
                res.status(500).json({ message: 'خطأ في قراءة الملف' });
            });
    } catch (error) {
        console.error('خطأ استيراد البيانات:', error);
        res.status(500).json({ message: 'خطأ في الاستيراد' });
    }
});

// تحديث صورة الملف الشخصي
app.post('/api/user/profile-image', authenticateToken, upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة' });
        }

        const users = readLocalFile('local-users.json');
        const userIndex = users.findIndex(u => u._id === req.user._id);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // حذف الصورة القديمة إذا كانت موجودة
        if (users[userIndex].profileImage) {
            const oldImagePath = path.join(__dirname, users[userIndex].profileImage);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        users[userIndex].profileImage = `/profile-pictures/${req.file.filename}`;
        writeLocalFile('local-users.json', users);

        res.json({
            message: 'تم تحديث الصورة الشخصية بنجاح',
            profileImage: users[userIndex].profileImage
        });
    } catch (error) {
        console.error('خطأ تحديث الصورة:', error);
        res.status(500).json({ message: 'خطأ في تحديث الصورة' });
    }
});

// إحصائيات النظام المتقدمة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = readLocalFile('local-users.json');
        const messages = readLocalFile('local-messages.json');
        const images = readLocalFile('local-images.json');

        const today = new Date();
        const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const newUsersThisWeek = users.filter(user => 
            new Date(user.createdAt) >= lastWeek && user.role === 'student'
        ).length;

        const activeUsersThisWeek = users.filter(user => 
            user.lastLogin && new Date(user.lastLogin) >= lastWeek && user.role === 'student'
        ).length;

        const stats = {
            totalUsers: users.filter(u => u.role === 'student').length,
            activeUsers: users.filter(u => u.isActive !== false && u.role === 'student').length,
            newUsersThisWeek,
            activeUsersThisWeek,
            totalMessages: messages.length,
            unreadMessages: messages.filter(m => m.receiverId === 'admin' && !m.read).length,
            totalImages: images.length,
            storageUsed: images.reduce((total, img) => total + (img.fileSize || 0), 0),
            messagesToday: messages.filter(m => 
                new Date(m.timestamp).toDateString() === today.toDateString()
            ).length
        };

        res.json(stats);
    } catch (error) {
        console.error('خطأ جلب الإحصائيات:', error);
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

// خدمة الملفات الثابتة
app.use('/uploads', express.static('uploads'));
app.use('/profile-pictures', express.static('profile-pictures'));
app.use('/exports', express.static('exports'));

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
                profileImage: null
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
        environment: process.env.NODE_ENV || 'development'
    });
});

// Middleware للأمان
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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
    console.log(`⚡ النسخة: 3.0.0 - المتقدمة`);
    console.log(`🔒 نظام أمان متقدم مفعل`);
    console.log(`💾 نظام التخزين: الملفات المحلية`);
    console.log(`📊 الميزات: دردشة متقدمة، إيموجي، إدارة مستخدمين، تصدير واستيراد`);
    
    setTimeout(createAdminUser, 2000);
});
