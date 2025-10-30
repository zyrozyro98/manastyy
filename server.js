// server.js - خادم المنصة التعليمية

const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname)));

// بيانات تجريبية
let users = [
    {
        id: 1,
        name: 'محمد أحمد',
        email: 'mohamed@example.com',
        password: 'password123',
        avatar: 'مح',
        role: 'طالب',
        createdAt: new Date()
    }
];

let conversations = [
    {
        id: 1,
        participants: [1, 2],
        messages: [
            {
                id: 1,
                senderId: 2,
                text: 'مرحباً، كيف يمكنني المساعدة؟',
                timestamp: new Date(),
                read: false
            }
        ],
        createdAt: new Date()
    }
];

let groups = [
    {
        id: 1,
        name: 'مجموعة الرياضيات',
        description: 'مجموعة لدراسة الرياضيات المتقدمة',
        avatar: 'مج',
        members: [1, 2, 3],
        posts: [],
        createdAt: new Date()
    }
];

let channels = [
    {
        id: 1,
        name: 'قناة التطوير',
        description: 'أخبار وتحديثات التطوير',
        avatar: 'تط',
        subscribers: [1, 2],
        posts: [],
        createdAt: new Date()
    }
];

let stories = [
    {
        id: 1,
        authorId: 1,
        authorName: 'أحمد محمد',
        authorAvatar: 'أح',
        image: 'https://via.placeholder.com/350x600/667eea/white?text=قصة+تعليمية',
        duration: 5,
        views: [2, 3],
        createdAt: new Date(Date.now() - 3600000) // قبل ساعة
    }
];

// مسارات API

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// المصادقة
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
        });
    }

    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
        });
    }

    // إرجاع بيانات المستخدم بدون كلمة المرور
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        user: userWithoutPassword
    });
});

app.post('/api/auth/register', (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // التحقق من البيانات
    if (!name || !email || !password || !confirmPassword) {
        return res.status(400).json({
            success: false,
            message: 'جميع الحقول مطلوبة'
        });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({
            success: false,
            message: 'كلمات المرور غير متطابقة'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
        });
    }

    // التحقق من عدم وجود مستخدم بنفس البريد الإلكتروني
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({
            success: false,
            message: 'البريد الإلكتروني مسجل مسبقاً'
        });
    }

    // إنشاء مستخدم جديد
    const newUser = {
        id: users.length + 1,
        name,
        email,
        password,
        avatar: name.charAt(0),
        role: 'طالب',
        createdAt: new Date()
    };

    users.push(newUser);

    // إرجاع بيانات المستخدم بدون كلمة المرور
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
        success: true,
        message: 'تم إنشاء الحساب بنجاح',
        user: userWithoutPassword
    });
});

// المحادثات
app.get('/api/conversations/:userId', (req, res) => {
    const { userId } = req.params;
    
    const userConversations = conversations.filter(conv => 
        conv.participants.includes(parseInt(userId))
    );

    res.json({
        success: true,
        conversations: userConversations
    });
});

app.post('/api/conversations/:conversationId/messages', (req, res) => {
    const { conversationId } = req.params;
    const { senderId, text } = req.body;

    if (!text || !senderId) {
        return res.status(400).json({
            success: false,
            message: 'الرسالة ومرسلها مطلوبان'
        });
    }

    const conversation = conversations.find(conv => conv.id === parseInt(conversationId));
    
    if (!conversation) {
        return res.status(404).json({
            success: false,
            message: 'المحادثة غير موجودة'
        });
    }

    const newMessage = {
        id: conversation.messages.length + 1,
        senderId: parseInt(senderId),
        text,
        timestamp: new Date(),
        read: false
    };

    conversation.messages.push(newMessage);

    res.json({
        success: true,
        message: 'تم إرسال الرسالة',
        message: newMessage
    });
});

// القصص
app.get('/api/stories', (req, res) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    // إرجاع القصص المنشورة خلال الـ24 ساعة الماضية فقط
    const recentStories = stories.filter(story => 
        new Date(story.createdAt) > twentyFourHoursAgo
    );

    res.json({
        success: true,
        stories: recentStories
    });
});

app.post('/api/stories', (req, res) => {
    const { authorId, authorName, authorAvatar, image } = req.body;

    if (!authorId || !image) {
        return res.status(400).json({
            success: false,
            message: 'بيانات القصة مطلوبة'
        });
    }

    const newStory = {
        id: stories.length + 1,
        authorId: parseInt(authorId),
        authorName: authorName || 'مستخدم',
        authorAvatar: authorAvatar || 'م',
        image,
        duration: 5,
        views: [],
        createdAt: new Date()
    };

    stories.push(newStory);

    res.status(201).json({
        success: true,
        message: 'تم نشر القصة بنجاح',
        story: newStory
    });
});

// المجموعات
app.get('/api/groups', (req, res) => {
    res.json({
        success: true,
        groups: groups
    });
});

app.post('/api/groups', (req, res) => {
    const { name, description, creatorId } = req.body;

    if (!name || !description || !creatorId) {
        return res.status(400).json({
            success: false,
            message: 'بيانات المجموعة مطلوبة'
        });
    }

    const newGroup = {
        id: groups.length + 1,
        name,
        description,
        avatar: name.charAt(0),
        creatorId: parseInt(creatorId),
        members: [parseInt(creatorId)],
        posts: [],
        createdAt: new Date()
    };

    groups.push(newGroup);

    res.status(201).json({
        success: true,
        message: 'تم إنشاء المجموعة بنجاح',
        group: newGroup
    });
});

// القنوات
app.get('/api/channels', (req, res) => {
    res.json({
        success: true,
        channels: channels
    });
});

app.post('/api/channels', (req, res) => {
    const { name, description, creatorId } = req.body;

    if (!name || !description || !creatorId) {
        return res.status(400).json({
            success: false,
            message: 'بيانات القناة مطلوبة'
        });
    }

    const newChannel = {
        id: channels.length + 1,
        name,
        description,
        avatar: name.charAt(0),
        creatorId: parseInt(creatorId),
        subscribers: [parseInt(creatorId)],
        posts: [],
        createdAt: new Date()
    };

    channels.push(newChannel);

    res.status(201).json({
        success: true,
        message: 'تم إنشاء القناة بنجاح',
        channel: newChannel
    });
});

// الوسائط
app.get('/api/media', (req, res) => {
    const { type, page = 1, limit = 12 } = req.query;

    let mediaItems = [
        { id: 1, type: 'image', title: 'شرح الرياضيات', url: 'https://via.placeholder.com/300x200/667eea/white?text=صورة+1' },
        { id: 2, type: 'video', title: 'تجربة كيميائية', url: 'https://via.placeholder.com/300x200/764ba2/white?text=فيديو+1' },
        { id: 3, type: 'file', title: 'ملخص التاريخ', url: 'https://via.placeholder.com/300x200/f72585/white?text=ملف+1' },
        { id: 4, type: 'image', title: 'خرائط ذهنية', url: 'https://via.placeholder.com/300x200/4cc9f0/white?text=صورة+2' }
    ];

    // تصفية حسب النوع إذا كان محدد
    if (type && type !== 'all') {
        mediaItems = mediaItems.filter(item => item.type === type);
    }

    // محاكاة التقسيم إلى صفحات
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedItems = mediaItems.slice(startIndex, endIndex);

    res.json({
        success: true,
        media: paginatedItems,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: mediaItems.length,
            pages: Math.ceil(mediaItems.length / limit)
        }
    });
});

// الإحصائيات
app.get('/api/stats/:userId', (req, res) => {
    const { userId } = req.params;

    const userStats = {
        conversations: conversations.filter(conv => 
            conv.participants.includes(parseInt(userId))
        ).length,
        groups: groups.filter(group => 
            group.members.includes(parseInt(userId))
        ).length,
        channels: channels.filter(channel => 
            channel.subscribers.includes(parseInt(userId))
        ).length,
        stories: stories.filter(story => 
            story.authorId === parseInt(userId) && 
            new Date(story.createdAt) > new Date(Date.now() - (24 * 60 * 60 * 1000))
        ).length
    };

    res.json({
        success: true,
        stats: userStats
    });
});

// معالجة الأخطاء 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'الصفحة غير موجودة'
    });
});

// معالجة الأخطاء العامة
app.use((err, req, res, next) => {
    console.error('خطأ في الخادم:', err);
    
    res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم'
    });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📚 منصة التعليم الإلكتروني جاهزة للاستخدام`);
});

module.exports = app;
