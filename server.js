import express from 'express';
import http from 'http';
import cors from 'cors';

const app = express();
const server = http.createServer(app);

// إعدادات البيئة
const PORT = process.env.PORT || 3000;

// وسائط middleware الأساسية
app.use(cors());
app.use(express.json());

// بيانات المستخدمين المخزنة في الذاكرة
const users = [
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
    }
];

// ==================== مسارات API ====================

// مسار رئيسي
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية يعمل بنجاح!',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        usersCount: users.length
    });
});

// تسجيل الدخول المبسط جداً
app.post('/api/auth/login', (req, res) => {
    try {
        console.log('🔐 طلب تسجيل الدخول received:', req.body);
        
        const { phone, password } = req.body;

        // تسجيل تفاصيل الطلب
        console.log('📝 بيانات الإدخال:', { 
            phone, 
            password: password ? '***' : 'غير موجود',
            bodyKeys: Object.keys(req.body)
        });

        // التحقق من البيانات
        if (!phone || !password) {
            console.log('❌ بيانات ناقصة:', { phone: !!phone, password: !!password });
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف وكلمة المرور مطلوبان',
                provided: { phone: !!phone, password: !!password }
            });
        }

        // البحث عن المستخدم
        console.log('🔍 البحث عن المستخدم:', phone);
        const user = users.find(u => u.phone === phone && u.isActive);
        
        if (!user) {
            console.log('❌ مستخدم غير موجود:', phone);
            console.log('📊 المستخدمون المتاحون:', users.map(u => u.phone));
            return res.status(401).json({
                success: false,
                message: 'رقم الهاتف غير مسجل',
                availableUsers: users.map(u => u.phone)
            });
        }

        console.log('✅ تم العثور على المستخدم:', user.fullName);
        console.log('🔐 مقارنة كلمات المرور:', {
            stored: user.password,
            provided: password,
            match: user.password === password
        });

        // مقارنة كلمة المرور مباشرة
        if (user.password !== password) {
            console.log('❌ كلمة المرور غير صحيحة');
            return res.status(401).json({
                success: false,
                message: 'كلمة المرور غير صحيحة'
            });
        }

        // تحديث حالة المستخدم
        user.isOnline = true;
        user.lastSeen = new Date().toISOString();

        console.log('✅ تسجيل الدخول ناجح:', user.fullName);

        // إرجاع البيانات بدون كلمة المرور
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: userWithoutPassword,
                token: 'simple-token-' + user._id
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        console.error('تفاصيل الخطأ:', error.stack);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم: ' + error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// إنشاء حساب جديد
app.post('/api/auth/register', (req, res) => {
    try {
        console.log('📝 طلب تسجيل جديد:', req.body);
        
        const { fullName, phone, university, major, batch, password } = req.body;

        // التحقق من البيانات
        if (!fullName || !phone || !university || !major || !batch || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة'
            });
        }

        // التحقق من عدم وجود مستخدم بنفس الرقم
        const existingUser = users.find(u => u.phone === phone);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'رقم الهاتف مسجل مسبقاً'
            });
        }

        // إنشاء المستخدم
        const newUser = {
            _id: 'user-' + Date.now(),
            fullName: fullName.trim(),
            phone,
            university,
            major,
            batch,
            password: password,
            role: 'student',
            isOnline: true,
            isActive: true,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);

        // إرجاع البيانات بدون كلمة المرور
        const { password: _, ...userWithoutPassword } = newUser;

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: {
                user: userWithoutPassword,
                token: 'simple-token-' + newUser._id
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

// التحقق من المستخدم
app.get('/api/auth/me', (req, res) => {
    try {
        const token = req.headers.authorization;
        console.log('🔍 طلب التحقق:', { token });
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'التوكن مطلوب'
            });
        }

        // استخراج ID من التوكن البسيط
        const userId = token.replace('simple-token-', '');
        const user = users.find(u => u._id === userId);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            data: {
                user: userWithoutPassword
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

// مسارات بسيطة للبيانات
app.get('/api/stories', (req, res) => {
    res.json({
        success: true,
        data: {
            stories: []
        }
    });
});

app.get('/api/conversations', (req, res) => {
    res.json({
        success: true,
        data: {
            conversations: []
        }
    });
});

app.get('/api/backup/list', (req, res) => {
    res.json({
        success: true,
        data: {
            backups: []
        }
    });
});

// مسار الصحة
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'الخادم يعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        usersCount: users.length
    });
});

// معالجة المسارات غير الموجودة
app.use('*', (req, res) => {
    console.log('❌ مسار غير موجود:', req.originalUrl);
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود',
        path: req.originalUrl
    });
});

// بدء الخادم
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 خادم المنصة التعليمية يعمل بنجاح!
📍 المنفذ: ${PORT}
⏰ الوقت: ${new Date().toLocaleString('ar-SA')}

🔐 حسابات الاختبار المتاحة:
   👑 المدير: 500000000 / 77007700
   👨‍🎓 أحمد: 512345678 / 12345678

📊 إحصائيات:
   👥 عدد المستخدمين: ${users.length}
   🌐 البيئة: ${process.env.NODE_ENV || 'development'}

💡 سجّل الدخول الآن وجرب!
    `);
});

export default app;
