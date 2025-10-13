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
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// نظام التخزين
class StorageSystem {
    constructor() {
        this.init();
    }

    init() {
        const files = ['users.json', 'messages.json', 'images.json'];
        const folders = ['uploads', 'backups'];
        
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
                const data = fs.readFileSync(filename, 'utf8');
                return JSON.parse(data);
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

const storageSystem = new StorageSystem();
const JWT_SECRET = process.env.JWT_SECRET || 'edutech-secret-key-2024';

// تخزين الصور
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(8).toString('hex');
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('يسمح برفع الصور فقط'), false);
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

// المسارات
app.get('/api/health', (req, res) => {
    res.json({ status: 'connected', message: 'النظام يعمل بشكل طبيعي' });
});

// التسجيل
app.post('/api/auth/register', async (req, res) => {
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
            fullName, phone, university, major, batch,
            password: hashedPassword,
            role: 'student',
            isActive: true,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        storageSystem.writeFile('users.json', users);

        res.status(201).json({ 
            message: 'تم إنشاء الحساب بنجاح',
            user: { _id: newUser._id, fullName, phone, university }
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

        const token = jwt.sign(
            { _id: user._id, fullName: user.fullName, phone: user.phone, role: user.role },
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
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إرسال رسالة
app.post('/api/chat/send', auth, async (req, res) => {
    try {
        const { text, receiverId } = req.body;
        if (!text?.trim()) return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });

        const messages = storageSystem.readFile('messages.json');
        const users = storageSystem.readFile('users.json');
        const sender = users.find(u => u._id === req.user._id);
        if (!sender) return res.status(404).json({ message: 'المستخدم غير موجود' });

        const actualReceiverId = req.user.role === 'admin' ? receiverId : 'admin';
        const receiver = users.find(u => u._id === actualReceiverId);
        
        const newMessage = {
            _id: crypto.randomBytes(16).toString('hex'),
            senderId: req.user._id,
            senderName: sender.fullName,
            receiverId: actualReceiverId,
            receiverName: receiver?.fullName || 'مدير النظام',
            text: text.trim(),
            timestamp: new Date().toISOString(),
            read: false
        };

        messages.push(newMessage);
        storageSystem.writeFile('messages.json', messages);

        res.json({ message: 'تم إرسال الرسالة', messageId: newMessage._id });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// جلب الرسائل
app.get('/api/chat/messages', auth, async (req, res) => {
    try {
        const messages = storageSystem.readFile('messages.json');
        const userMessages = messages.filter(msg => 
            (msg.senderId === req.user._id && msg.receiverId === 'admin') ||
            (msg.senderId === 'admin' && msg.receiverId === req.user._id)
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        res.json(userMessages);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// المحادثات (للمدير)
app.get('/api/chat/conversations', auth, adminOnly, async (req, res) => {
    try {
        const messages = storageSystem.readFile('messages.json');
        const users = storageSystem.readFile('users.json');
        const conversations = {};

        messages.forEach(msg => {
            const otherUserId = msg.senderId === 'admin' ? msg.receiverId : msg.senderId;
            if (otherUserId === 'admin') return;

            if (!conversations[otherUserId]) {
                const user = users.find(u => u._id === otherUserId);
                if (user) {
                    const userMessages = messages.filter(m => 
                        (m.senderId === 'admin' && m.receiverId === otherUserId) ||
                        (m.senderId === otherUserId && m.receiverId === 'admin')
                    );
                    
                    conversations[otherUserId] = {
                        userId: user._id,
                        userName: user.fullName,
                        lastMessage: userMessages[userMessages.length - 1]?.text || 'لا توجد رسائل',
                        unreadCount: userMessages.filter(m => m.receiverId === 'admin' && !m.read).length
                    };
                }
            }
        });
        
        res.json(Object.values(conversations));
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// الإرسال الجماعي
app.post('/api/admin/broadcast', auth, adminOnly, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text?.trim()) return res.status(400).json({ message: 'الرسالة لا يمكن أن تكون فارغة' });

        const messages = storageSystem.readFile('messages.json');
        const users = storageSystem.readFile('users.json');

        users.forEach(user => {
            if (user.role === 'student' && user.isActive !== false) {
                messages.push({
                    _id: crypto.randomBytes(16).toString('hex'),
                    senderId: 'admin',
                    senderName: 'مدير النظام',
                    receiverId: user._id,
                    receiverName: user.fullName,
                    text: text.trim(),
                    timestamp: new Date().toISOString(),
                    read: false,
                    isBroadcast: true
                });
            }
        });

        storageSystem.writeFile('messages.json', messages);
        res.json({ message: 'تم الإرسال الجماعي بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// رفع مجلد الصور
app.post('/api/admin/upload-batch', auth, adminOnly, upload.array('images', 50), async (req, res) => {
    try {
        if (!req.files?.length) return res.status(400).json({ message: 'لم يتم رفع أي صور' });

        const users = storageSystem.readFile('users.json');
        const images = storageSystem.readFile('images.json');
        const results = { success: 0, failed: 0, details: [] };

        for (const file of req.files) {
            try {
                const phoneFromFilename = file.originalname.replace(/\.[^/.]+$/, "");
                const user = users.find(u => u.phone === phoneFromFilename);
                
                if (user) {
                    images.push({
                        _id: crypto.randomBytes(16).toString('hex'),
                        userId: user._id,
                        userName: user.fullName,
                        imageName: file.filename,
                        originalName: file.originalname,
                        url: `/uploads/${file.filename}`,
                        sentAt: new Date().toISOString(),
                        fileSize: file.size
                    });
                    results.success++;
                    results.details.push({
                        file: file.originalname,
                        status: 'success',
                        message: `تم الإرسال إلى ${user.fullName}`
                    });
                } else {
                    results.failed++;
                    results.details.push({
                        file: file.originalname,
                        status: 'failed',
                        message: `لا يوجد مستخدم برقم ${phoneFromFilename}`
                    });
                    fs.unlinkSync(file.path);
                }
            } catch (error) {
                results.failed++;
                results.details.push({
                    file: file.originalname,
                    status: 'failed',
                    message: 'خطأ في المعالجة'
                });
            }
        }

        storageSystem.writeFile('images.json', images);
        res.json({ message: `تم معالجة ${req.files.length} صورة`, results });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// جلب الصور
app.get('/api/images', auth, async (req, res) => {
    try {
        const images = storageSystem.readFile('images.json')
            .filter(img => img.userId === req.user._id)
            .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
        res.json(images);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// خدمة الملفات
app.use('/uploads', express.static('uploads'));

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
            university: 'الإدارة',
            major: 'إدارة',
            batch: '2024',
            password: hashedPassword,
            role: 'admin',
            isActive: true,
            createdAt: new Date().toISOString()
        });
        storageSystem.writeFile('users.json', users);
        console.log('✅ تم إنشاء حساب المدير: 500000000 / admin123');
    }
};

// بدء السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await createAdmin();
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
});
