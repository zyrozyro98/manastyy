const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
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

// تهيئة قاعدة البيانات
const db = new sqlite3.Database('./platform.db', (err) => {
    if (err) {
        console.error('❌ خطأ في فتح قاعدة البيانات:', err.message);
    } else {
        console.log('✅ تم الاتصال بقاعدة البيانات SQLite');
        initializeDatabase();
    }
});

// إنشاء الجداول
function initializeDatabase() {
    // جدول المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT UNIQUE NOT NULL,
        fullName TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        university TEXT NOT NULL,
        major TEXT NOT NULL,
        batch TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'student',
        isActive BOOLEAN DEFAULT 1,
        profileImage TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastLogin DATETIME,
        lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // جدول الرسائل
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT UNIQUE NOT NULL,
        senderId TEXT NOT NULL,
        senderName TEXT NOT NULL,
        receiverId TEXT NOT NULL,
        text TEXT,
        image TEXT,
        emoji TEXT,
        messageType TEXT DEFAULT 'text',
        isBroadcast BOOLEAN DEFAULT 0,
        read BOOLEAN DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (senderId) REFERENCES users (_id),
        FOREIGN KEY (receiverId) REFERENCES users (_id)
    )`);

    // جدول الصور
    db.run(`CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT UNIQUE NOT NULL,
        userId TEXT NOT NULL,
        userName TEXT NOT NULL,
        userPhone TEXT NOT NULL,
        imageName TEXT NOT NULL,
        originalName TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        sentBy TEXT NOT NULL,
        sentAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        fileSize INTEGER,
        mimeType TEXT,
        isBroadcast BOOLEAN DEFAULT 0,
        FOREIGN KEY (userId) REFERENCES users (_id),
        FOREIGN KEY (sentBy) REFERENCES users (_id)
    )`);

    // جدول الإحصائيات
    db.run(`CREATE TABLE IF NOT EXISTS statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // إنشاء المدير الافتراضي
    createAdminUser();
}

// مفتاح JWT آمن
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// تخزين متقدم للصور والملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads/';
        if (file.fieldname === 'profileImage') {
            folder = 'profile-pictures/';
        }
        // التأكد من وجود المجلد
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
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

// دوال مساعدة لقاعدة البيانات
function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

// إنشاء مدير افتراضي
async function createAdminUser() {
    try {
        const adminExists = await dbGet("SELECT * FROM users WHERE role = 'admin'");
        
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('Admin123!@#', 12);
            const adminId = 'admin-' + crypto.randomBytes(8).toString('hex');
            
            await dbRun(
                `INSERT INTO users (_id, fullName, phone, university, major, batch, password, role) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [adminId, 'مدير النظام', '500000000', 'الإدارة العامة', 'نظم المعلومات', '2024', hashedPassword, 'admin']
            );
            
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
            console.log('📱 رقم الهاتف: 500000000');
            console.log('🔐 كلمة المرور: Admin123!@#');
        }
    } catch (error) {
        console.error('خطأ في إنشاء المدير:', error);
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

        // التحقق من وجود المستخدم
        const existingUser = await dbGet("SELECT * FROM users WHERE phone = ?", [phone]);
        if (existingUser) {
            return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const userId = crypto.randomBytes(16).toString('hex');

        await dbRun(
            `INSERT INTO users (_id, fullName, phone, university, major, batch, password) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, fullName.trim(), phone, university, major, batch, hashedPassword]
        );

        res.status(201).json({ 
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                _id: userId,
                fullName: fullName.trim(),
                phone: phone,
                university: university
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

        const user = await dbGet("SELECT * FROM users WHERE phone = ? AND isActive = 1", [phone]);

        if (!user) {
            return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        }

        // تحديث آخر دخول
        await dbRun("UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE _id = ?", [user._id]);

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

        const sender = await dbGet("SELECT * FROM users WHERE _id = ?", [req.user._id]);
        if (!sender) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        let actualReceiverId = receiverId;
        if (req.user.role === 'student') {
            actualReceiverId = 'admin';
        } else if (req.user.role === 'admin' && !receiverId) {
            return res.status(400).json({ message: 'يجب تحديد مستلم للرسالة' });
        }

        const messageId = crypto.randomBytes(16).toString('hex');

        await dbRun(
            `INSERT INTO messages (_id, senderId, senderName, receiverId, text, image, emoji, messageType) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [messageId, req.user._id, sender.fullName, actualReceiverId, text, image, emoji, messageType]
        );

        res.json({ 
            message: 'تم إرسال الرسالة',
            messageId: messageId
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

        if (isBroadcast) {
            // إرسال جماعي
            const users = await dbAll("SELECT _id, fullName FROM users WHERE role = 'student' AND isActive = 1");
            
            for (const user of users) {
                const messageId = crypto.randomBytes(16).toString('hex');
                await dbRun(
                    `INSERT INTO messages (_id, senderId, senderName, receiverId, text, image, emoji, messageType, isBroadcast) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [messageId, 'admin', 'مدير النظام', user._id, text, image, emoji, image ? 'image' : (emoji ? 'emoji' : 'text'), 1]
                );
            }
        } else {
            // إرسال فردي
            if (!receiverId) {
                return res.status(400).json({ message: 'معرف المستخدم مطلوب' });
            }

            const receiver = await dbGet("SELECT * FROM users WHERE _id = ?", [receiverId]);
            if (!receiver) {
                return res.status(404).json({ message: 'المستخدم غير موجود' });
            }

            const messageId = crypto.randomBytes(16).toString('hex');
            await dbRun(
                `INSERT INTO messages (_id, senderId, senderName, receiverId, text, image, emoji, messageType) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [messageId, 'admin', 'مدير النظام', receiverId, text, image, emoji, image ? 'image' : (emoji ? 'emoji' : 'text')]
            );
        }

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

        const conversations = await dbAll(`
            SELECT 
                u._id as userId,
                u.fullName as userName,
                u.phone as userPhone,
                u.university,
                u.major,
                u.batch,
                u.profileImage,
                m.text as lastMessage,
                m.timestamp as lastMessageTime,
                (SELECT COUNT(*) FROM messages WHERE receiverId = 'admin' AND senderId = u._id AND read = 0) as unreadCount
            FROM users u
            INNER JOIN (
                SELECT 
                    CASE WHEN senderId = 'admin' THEN receiverId ELSE senderId END as otherUserId,
                    MAX(timestamp) as maxTime
                FROM messages 
                WHERE senderId = 'admin' OR receiverId = 'admin'
                GROUP BY otherUserId
            ) latest ON u._id = latest.otherUserId
            INNER JOIN messages m ON (m.senderId = u._id OR m.receiverId = u._id) AND m.timestamp = latest.maxTime
            WHERE u.role = 'student' AND u.isActive = 1
            ORDER BY m.timestamp DESC
        `);

        res.json(conversations);
    } catch (error) {
        console.error('خطأ جلب المحادثات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على رسائل محادثة محددة
app.get('/api/chat/conversation/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        let messages;
        if (req.user.role === 'admin') {
            messages = await dbAll(`
                SELECT * FROM messages 
                WHERE (senderId = 'admin' AND receiverId = ?) OR (senderId = ? AND receiverId = 'admin')
                ORDER BY timestamp ASC
            `, [userId, userId]);
        } else {
            if (userId !== req.user._id && userId !== 'admin') {
                return res.status(403).json({ message: 'غير مصرح' });
            }
            messages = await dbAll(`
                SELECT * FROM messages 
                WHERE (senderId = ? AND receiverId = 'admin') OR (senderId = 'admin' AND receiverId = ?)
                ORDER BY timestamp ASC
            `, [req.user._id, req.user._id]);
        }
        
        // تحديث حالة القراءة
        await dbRun(`
            UPDATE messages SET read = 1 
            WHERE receiverId = ? AND read = 0
        `, [req.user._id]);
        
        res.json(messages);
    } catch (error) {
        console.error('خطأ جلب الرسائل:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الحصول على جميع الرسائل (للمستخدم العادي)
app.get('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        const messages = await dbAll(`
            SELECT * FROM messages 
            WHERE (senderId = ? AND receiverId = 'admin') OR (senderId = 'admin' AND receiverId = ?)
            ORDER BY timestamp ASC
        `, [req.user._id, req.user._id]);
        
        // تحديث حالة القراءة
        await dbRun(`
            UPDATE messages SET read = 1 
            WHERE receiverId = ? AND read = 0
        `, [req.user._id]);
        
        res.json(messages);
    } catch (error) {
        console.error('خطأ جلب الرسائل:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إدارة المستخدمين المتقدمة
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        const offset = (page - 1) * limit;
        let whereClause = "WHERE role = 'student'";
        let params = [];

        if (search) {
            whereClause += ` AND (fullName LIKE ? OR phone LIKE ? OR university LIKE ? OR major LIKE ?)`;
            const searchTerm = `%${search}%`;
            params = [searchTerm, searchTerm, searchTerm, searchTerm];
        }

        const users = await dbAll(`
            SELECT 
                _id, fullName, phone, university, major, batch, 
                isActive, createdAt, lastLogin, profileImage
            FROM users 
            ${whereClause}
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const totalResult = await dbGet(`SELECT COUNT(*) as count FROM users ${whereClause}`, params);
        const totalUsers = totalResult.count;

        res.json({
            users: users,
            totalUsers: totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
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

        const user = await dbGet("SELECT * FROM users WHERE _id = ?", [userId]);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        const updates = [];
        const params = [];

        if (fullName) { updates.push("fullName = ?"); params.push(fullName); }
        if (university) { updates.push("university = ?"); params.push(university); }
        if (major) { updates.push("major = ?"); params.push(major); }
        if (batch) { updates.push("batch = ?"); params.push(batch); }
        if (typeof isActive === 'boolean') { updates.push("isActive = ?"); params.push(isActive); }

        if (updates.length > 0) {
            updates.push("lastUpdated = CURRENT_TIMESTAMP");
            params.push(userId);

            await dbRun(
                `UPDATE users SET ${updates.join(', ')} WHERE _id = ?`,
                params
            );
        }

        const updatedUser = await dbGet("SELECT * FROM users WHERE _id = ?", [userId]);

        res.json({ 
            message: 'تم تحديث بيانات المستخدم بنجاح',
            user: updatedUser
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

        const user = await dbGet("SELECT * FROM users WHERE _id = ?", [userId]);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        if (user.role === 'admin') {
            return res.status(400).json({ message: 'لا يمكن حذف حساب المدير' });
        }

        await dbRun("DELETE FROM users WHERE _id = ?", [userId]);

        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
        console.error('خطأ حذف المستخدم:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تحديث صورة الملف الشخصي
app.post('/api/user/profile-image', authenticateToken, upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة' });
        }

        const user = await dbGet("SELECT * FROM users WHERE _id = ?", [req.user._id]);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // حذف الصورة القديمة إذا كانت موجودة
        if (user.profileImage) {
            const oldImagePath = path.join(__dirname, user.profileImage);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        await dbRun(
            "UPDATE users SET profileImage = ?, lastUpdated = CURRENT_TIMESTAMP WHERE _id = ?",
            [`/profile-pictures/${req.file.filename}`, req.user._id]
        );

        const updatedUser = await dbGet("SELECT * FROM users WHERE _id = ?", [req.user._id]);

        res.json({
            message: 'تم تحديث الصورة الشخصية بنجاح',
            profileImage: updatedUser.profileImage
        });
    } catch (error) {
        console.error('خطأ تحديث الصورة:', error);
        res.status(500).json({ message: 'خطأ في تحديث الصورة' });
    }
});

// إحصائيات النظام المتقدمة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await dbGet("SELECT COUNT(*) as count FROM users WHERE role = 'student'");
        const activeUsers = await dbGet("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND isActive = 1");
        const totalMessages = await dbGet("SELECT COUNT(*) as count FROM messages");
        const unreadMessages = await dbGet("SELECT COUNT(*) as count FROM messages WHERE receiverId = 'admin' AND read = 0");
        const totalImages = await dbGet("SELECT COUNT(*) as count FROM images");
        
        const today = new Date().toISOString().split('T')[0];
        const messagesToday = await dbGet("SELECT COUNT(*) as count FROM messages WHERE DATE(timestamp) = ?", [today]);
        
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const newUsersThisWeek = await dbGet("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND DATE(createdAt) >= ?", [lastWeek]);
        const activeUsersThisWeek = await dbGet("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND lastLogin IS NOT NULL AND DATE(lastLogin) >= ?", [lastWeek]);

        const stats = {
            totalUsers: totalUsers.count,
            activeUsers: activeUsers.count,
            newUsersThisWeek: newUsersThisWeek.count,
            activeUsersThisWeek: activeUsersThisWeek.count,
            totalMessages: totalMessages.count,
            unreadMessages: unreadMessages.count,
            totalImages: totalImages.count,
            messagesToday: messagesToday.count,
            storageUsed: 0 // يمكن إضافة حساب المساحة المستخدمة لاحقاً
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

        const receiver = await dbGet("SELECT * FROM users WHERE _id = ?", [receiverId]);
        if (!receiver) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        const imageId = crypto.randomBytes(16).toString('hex');

        await dbRun(
            `INSERT INTO images (_id, userId, userName, userPhone, imageName, originalName, url, description, sentBy, fileSize, mimeType) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [imageId, receiverId, receiver.fullName, receiver.phone, req.file.filename, req.file.originalname, 
             `/uploads/${req.file.filename}`, description, req.user._id, req.file.size, req.file.mimetype]
        );

        res.json({ 
            message: 'تم إرسال الصورة بنجاح',
            image: {
                id: imageId,
                url: `/uploads/${req.file.filename}`,
                userName: receiver.fullName,
                sentAt: new Date().toISOString()
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

        const users = await dbAll("SELECT _id, fullName, phone FROM users WHERE role = 'student' AND isActive = 1");
        let successCount = 0;

        for (const user of users) {
            const imageId = crypto.randomBytes(16).toString('hex');
            await dbRun(
                `INSERT INTO images (_id, userId, userName, userPhone, imageName, originalName, url, description, sentBy, fileSize, mimeType, isBroadcast) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [imageId, user._id, user.fullName, user.phone, req.file.filename, req.file.originalname, 
                 `/uploads/${req.file.filename}`, description || 'إرسال جماعي', req.user._id, req.file.size, req.file.mimetype, 1]
            );
            successCount++;
        }

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
        const images = await dbAll(`
            SELECT * FROM images 
            WHERE userId = ? 
            ORDER BY sentAt DESC
        `, [req.user._id]);
        
        res.json(images);
    } catch (error) {
        console.error('خطأ جلب الصور:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// نسخ احتياطي للبيانات
app.get('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const backupData = {
            users: await dbAll("SELECT * FROM users"),
            messages: await dbAll("SELECT * FROM messages"),
            images: await dbAll("SELECT * FROM images"),
            backupDate: new Date().toISOString()
        };

        const backupDir = './backups';
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }

        const backupFile = path.join(backupDir, `backup-${Date.now()}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

        res.json({
            message: 'تم إنشاء نسخة احتياطية بنجاح',
            backupFile: backupFile,
            usersCount: backupData.users.length,
            messagesCount: backupData.messages.length,
            imagesCount: backupData.images.length
        });
    } catch (error) {
        console.error('خطأ في النسخ الاحتياطي:', error);
        res.status(500).json({ message: 'خطأ في النسخ الاحتياطي' });
    }
});

// استعادة البيانات من نسخة احتياطية
app.post('/api/admin/restore', authenticateToken, requireAdmin, upload.single('backupFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي ملف نسخة احتياطية' });
        }

        const backupData = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));

        // بدء transaction
        await dbRun("BEGIN TRANSACTION");

        try {
            // حذف البيانات الحالية
            await dbRun("DELETE FROM images");
            await dbRun("DELETE FROM messages");
            await dbRun("DELETE FROM users WHERE role != 'admin'"); // الحفاظ على المدير

            // استعادة المستخدمين
            for (const user of backupData.users) {
                if (user.role !== 'admin') {
                    await dbRun(
                        `INSERT INTO users (_id, fullName, phone, university, major, batch, password, role, isActive, profileImage, createdAt, lastLogin) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [user._id, user.fullName, user.phone, user.university, user.major, user.batch, 
                         user.password, user.role, user.isActive, user.profileImage, user.createdAt, user.lastLogin]
                    );
                }
            }

            // استعادة الرسائل
            for (const message of backupData.messages) {
                await dbRun(
                    `INSERT INTO messages (_id, senderId, senderName, receiverId, text, image, emoji, messageType, isBroadcast, read, timestamp) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [message._id, message.senderId, message.senderName, message.receiverId, message.text, 
                     message.image, message.emoji, message.messageType, message.isBroadcast, message.read, message.timestamp]
                );
            }

            // استعادة الصور
            for (const image of backupData.images) {
                await dbRun(
                    `INSERT INTO images (_id, userId, userName, userPhone, imageName, originalName, url, description, sentBy, sentAt, fileSize, mimeType, isBroadcast) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [image._id, image.userId, image.userName, image.userPhone, image.imageName, image.originalName,
                     image.url, image.description, image.sentBy, image.sentAt, image.fileSize, image.mimeType, image.isBroadcast]
                );
            }

            await dbRun("COMMIT");
            
            // حذف الملف المؤقت
            fs.unlinkSync(req.file.path);

            res.json({ 
                message: 'تم استعادة البيانات بنجاح',
                usersRestored: backupData.users.length,
                messagesRestored: backupData.messages.length,
                imagesRestored: backupData.images.length
            });
        } catch (error) {
            await dbRun("ROLLBACK");
            throw error;
        }
    } catch (error) {
        console.error('خطأ في استعادة البيانات:', error);
        res.status(500).json({ message: 'خطأ في استعادة البيانات' });
    }
});

// خدمة الملفات الثابتة
app.use('/uploads', express.static('uploads'));
app.use('/profile-pictures', express.static('profile-pictures'));
app.use('/backups', express.static('backups'));

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
        database: 'SQLite'
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
    console.log(`⚡ النسخة: 3.0.0 - نظام التخزين الدائم`);
    console.log(`💾 قاعدة البيانات: SQLite (platform.db)`);
    console.log(`🔒 نظام أمان متقدم مفعل`);
    console.log(`📊 الميزات: تخزين دائم، نسخ احتياطي، استعادة بيانات`);
});

// إغلاق قاعدة البيانات عند إيقاف السيرفر
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('❌ خطأ في إغلاق قاعدة البيانات:', err.message);
        } else {
            console.log('✅ تم إغلاق قاعدة البيانات');
        }
        process.exit(0);
    });
});
