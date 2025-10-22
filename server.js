import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// حل مشكلة __dirname في ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// إعدادات البيئة
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'simple-secret-key';

// وسائط middleware الأساسية
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// نظام التخزين المحلي المبسط
class SimpleStorage {
    constructor() {
        this.dataFile = path.join(__dirname, 'data.json');
        this.init();
    }

    init() {
        if (!fs.existsSync(this.dataFile)) {
            const defaultData = {
                users: [
                    {
                        _id: 'admin-001',
                        fullName: 'مدير النظام',
                        phone: '500000000',
                        university: 'المنصة التعليمية',
                        major: 'إدارة النظام',
                        batch: '2024',
                        password: '77007700',
                        role: 'admin',
                        isOnline: false,
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        _id: 'user-001',
                        fullName: 'أحمد محمد',
                        phone: '512345678',
                        university: 'جامعة الملك سعود',
                        major: 'هندسة الحاسب',
                        batch: '2024',
                        password: '12345678',
                        role: 'student',
                        isOnline: false,
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        _id: 'user-002',
                        fullName: 'سارة عبدالله',
                        phone: '511111111',
                        university: 'جامعة الأميرة نورة',
                        major: 'الطب',
                        batch: '2023',
                        password: '12345678',
                        role: 'student',
                        isOnline: false,
                        isActive: true,
                        createdAt: new Date().toISOString()
                    }
                ],
                messages: [],
                stories: []
            };
            this.saveData(defaultData);
            console.log('✅ تم إنشاء البيانات الافتراضية');
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات:', error);
            return { users: [], messages: [], stories: [] };
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('❌ خطأ في حفظ البيانات:', error);
            return false;
        }
    }

    async findUserByPhone(phone) {
        const data = this.loadData();
        const user = data.users.find(user => user.phone === phone && user.isActive);
        
        if (user) {
            console.log('🔍 تم العثور على المستخدم:', user.fullName);
        } else {
            console.log('❌ لم يتم العثور على مستخدم بالرقم:', phone);
        }
        
        return user;
    }

    async findUserById(userId) {
        const data = this.loadData();
        return data.users.find(user => user._id === userId && user.isActive);
    }

    async createUser(userData) {
        const data = this.loadData();
        const userId = uuidv4();
        const user = {
            _id: userId,
            ...userData,
            isOnline: false,
            isActive: true,
            createdAt: new Date().toISOString()
        };
        
        data.users.push(user);
        this.saveData(data);
        
        console.log('✅ تم إنشاء المستخدم:', user.fullName);
        return user;
    }

    async updateUser(userId, updates) {
        const data = this.loadData();
        const userIndex = data.users.findIndex(user => user._id === userId);
        
        if (userIndex !== -1) {
            data.users[userIndex] = {
                ...data.users[userIndex],
                ...updates
            };
            this.saveData(data);
            return data.users[userIndex];
        }
        return null;
    }
}

const storage = new SimpleStorage();

// دوال مساعدة
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

const formatUserResponse = (user) => {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
};

// ==================== مسارات API ====================

// مسار رئيسي
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية يعمل بنجاح!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// تسجيل الدخول المبسط
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        console.log('🔐 محاولة تسجيل الدخول:', { phone, password });

        // التحقق من البيانات
        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف وكلمة المرور مطلوبان'
            });
        }

        // البحث عن المستخدم
        const user = await storage.findUserByPhone(phone);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'رقم الهاتف غير مسجل'
            });
        }

        // مقارنة كلمة المرور مباشرة
        if (user.password !== password) {
            console.log('❌ كلمة المرور غير صحيحة:', {
                stored: user.password,
                provided: password
            });
            return res.status(401).json({
                success: false,
                message: 'كلمة المرور غير صحيحة'
            });
        }

        // تحديث حالة المستخدم
        await storage.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        // إنشاء التوكن
        const token = generateToken(user._id);

        console.log('✅ تسجيل الدخول ناجح:', user.fullName);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: formatUserResponse(user),
                token
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم: ' + error.message
        });
    }
});

// إنشاء حساب جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, university, major, batch, password } = req.body;

        console.log('📝 محاولة تسجيل:', { phone, fullName });

        // التحقق من البيانات
        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة'
            });
        }

        // التحقق من عدم وجود مستخدم بنفس الرقم
        const existingUser = await storage.findUserByPhone(phone);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف مسجل مسبقاً'
            });
        }

        // إنشاء المستخدم
        const user = await storage.createUser({
            fullName: fullName.trim(),
            phone,
            university,
            major,
            batch,
            password: password,
            role: 'student'
        });

        // إنشاء التوكن
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: {
                user: formatUserResponse(user),
                token
            }
        });

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم: ' + error.message
        });
    }
});

// التحقق من التوكن
app.get('/api/auth/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'التوكن مطلوب'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await storage.findUserById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        res.json({
            success: true,
            data: {
                user: formatUserResponse(user)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في التحقق:', error);
        res.status(401).json({
            success: false,
            message: 'التوكن غير صالح'
        });
    }
});

// مسارات الستوريات (مبسطة)
app.get('/api/stories', async (req, res) => {
    try {
        const data = storage.loadData();
        res.json({
            success: true,
            data: {
                stories: data.stories || []
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الستوريات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات المحادثات (مبسطة)
app.get('/api/conversations', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                conversations: []
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسار الصحة
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'الخادم يعمل بشكل طبيعي',
        timestamp: new Date().toISOString()
    });
});

// معالجة المسارات غير الموجودة
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود',
        path: req.originalUrl
    });
});

// معالجة الأخطاء
app.use((error, req, res, next) => {
    console.error('❌ خطأ غير معالج:', error);
    res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع في الخادم',
        error: error.message
    });
});

// بدء الخادم
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 خادم المنصة التعليمية يعمل بنجاح!
📍 العنوان: http://localhost:${PORT}
⏰ الوقت: ${new Date().toLocaleString('ar-SA')}

🔐 حسابات الاختبار المتاحة:
   👑 المدير: 500000000 / 77007700
   👨‍🎓 أحمد: 512345678 / 12345678
   👩‍🎓 سارة: 511111111 / 12345678

💡 ملاحظة: كلمات المرور مخزنة كنص عادي للمقارنة المباشرة
    `);
});

export default app;
