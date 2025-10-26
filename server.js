// server.js - الخادم الكامل للمنصة التعليمية (محدث ومصحح)
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
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
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    }
});

// إعدادات البيئة
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'educational-platform-secret-key-2024';

// إنشاء المجلدات اللازمة
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const requiredDirs = [
    UPLOAD_DIR,
    path.join(UPLOAD_DIR, 'profiles'),
    path.join(UPLOAD_DIR, 'stories'),
    path.join(UPLOAD_DIR, 'channels'),
    path.join(UPLOAD_DIR, 'groups'),
    path.join(UPLOAD_DIR, 'files')
];

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 تم إنشاء المجلد: ${dir}`);
    }
});

// وسائط middleware الأساسية
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// إعداد multer للتحميلات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = UPLOAD_DIR;
        if (file.fieldname === 'avatar') uploadPath = path.join(UPLOAD_DIR, 'profiles');
        else if (file.fieldname === 'story') uploadPath = path.join(UPLOAD_DIR, 'stories');
        else if (file.fieldname === 'channelAvatar') uploadPath = path.join(UPLOAD_DIR, 'channels');
        else if (file.fieldname === 'groupAvatar') uploadPath = path.join(UPLOAD_DIR, 'groups');
        else if (file.fieldname === 'file') uploadPath = path.join(UPLOAD_DIR, 'files');
        
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const fileExt = path.extname(file.originalname);
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
        cb(null, fileName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// نظام التخزين المحلي
class LocalStorageService {
    constructor() {
        this.dataFile = path.join(__dirname, 'local_data.json');
        this.init();
    }

    init() {
        if (!fs.existsSync(this.dataFile)) {
            const defaultData = this.getDefaultData();
            this.saveData(defaultData);
            console.log('✅ تم إنشاء ملف البيانات المحلي');
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات:', error);
            return this.getDefaultData();
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

    getDefaultData() {
        return {
            users: [],
            stories: [],
            messages: [],
            conversations: [],
            channels: [],
            groups: [],
            groupMessages: [],
            channelMessages: [],
            notifications: []
        };
    }

    // دوال المستخدمين
    async createUser(userData) {
        const data = this.loadData();
        const userId = uuidv4();
        const user = {
            _id: userId,
            ...userData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isOnline: false,
            lastSeen: new Date().toISOString(),
            isActive: true
        };
        
        data.users.push(user);
        this.saveData(data);
        return user;
    }

    async findUserByEmail(email) {
        const data = this.loadData();
        return data.users.find(user => user.email === email && user.isActive);
    }

    async findUserById(userId) {
        const data = this.loadData();
        return data.users.find(user => user._id === userId && user.isActive);
    }

    async updateUser(userId, updates) {
        const data = this.loadData();
        const userIndex = data.users.findIndex(user => user._id === userId);
        
        if (userIndex !== -1) {
            data.users[userIndex] = {
                ...data.users[userIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.saveData(data);
            return data.users[userIndex];
        }
        return null;
    }

    async getAllUsers() {
        const data = this.loadData();
        return data.users.filter(user => user.isActive);
    }

    async searchUsers(query, limit = 20) {
        const data = this.loadData();
        const searchTerm = query.toLowerCase();
        
        return data.users
            .filter(user => 
                user.isActive && 
                (user.fullName.toLowerCase().includes(searchTerm) || 
                 user.email.toLowerCase().includes(searchTerm))
            )
            .slice(0, limit)
            .map(user => this.formatUserResponse(user));
    }

    // دوال المحادثات
    async createConversation(participants, name = null) {
        const data = this.loadData();
        const conversationId = uuidv4();
        
        const conversation = {
            _id: conversationId,
            participants,
            name: name || `محادثة ${participants.length} أشخاص`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: null,
            unreadCount: {}
        };
        
        data.conversations.push(conversation);
        this.saveData(data);
        return conversation;
    }

    async getConversationsByUserId(userId) {
        const data = this.loadData();
        return data.conversations.filter(conv => 
            conv.participants.includes(userId)
        );
    }

    async getConversationById(conversationId) {
        const data = this.loadData();
        return data.conversations.find(conv => conv._id === conversationId);
    }

    async getOrCreateConversation(user1, user2) {
        const data = this.loadData();
        const existingConversation = data.conversations.find(conv => 
            conv.participants.includes(user1) && 
            conv.participants.includes(user2) &&
            conv.participants.length === 2
        );
        
        if (existingConversation) {
            return existingConversation;
        }
        
        return await this.createConversation([user1, user2]);
    }

    // دوال الرسائل
    async createMessage(messageData) {
        const data = this.loadData();
        const messageId = uuidv4();
        const message = {
            _id: messageId,
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [messageData.senderId]
        };
        
        data.messages.push(message);
        
        const convIndex = data.conversations.findIndex(conv => conv._id === messageData.conversationId);
        if (convIndex !== -1) {
            data.conversations[convIndex].lastMessage = message;
            data.conversations[convIndex].updatedAt = new Date().toISOString();
        }
        
        this.saveData(data);
        return message;
    }

    async getMessagesByConversation(conversationId, limit = 50) {
        const data = this.loadData();
        return data.messages
            .filter(msg => msg.conversationId === conversationId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(-limit);
    }

    formatUserResponse(user) {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
}

const localStorageService = new LocalStorageService();

// middleware المصادقة
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'رمز الوصول مطلوب'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await localStorageService.findUserById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'المستخدم غير موجود'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('❌ خطأ في المصادقة:', error);
        return res.status(401).json({ 
            success: false, 
            message: 'رمز وصول غير صالح'
        });
    }
};

// دوال مساعدة
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

// إنشاء حساب المدير الافتراضي
async function createDefaultAdmin() {
    try {
        const adminExists = await localStorageService.findUserByEmail('admin@platform.edu');
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('77007700', 12);
            await localStorageService.createUser({
                fullName: 'مدير النظام',
                email: 'admin@platform.edu',
                password: hashedPassword,
                role: 'admin'
            });
            console.log('✅ تم إنشاء حساب المدير الافتراضي');
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء حساب المدير:', error);
    }
}

// المسارات الرئيسية
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم المنصة التعليمية يعمل بنجاح!',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, role = 'student' } = req.body;

        console.log('📝 محاولة تسجيل مستخدم جديد:', { email, fullName, role });

        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة'
            });
        }

        const existingUser = await localStorageService.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مسجل مسبقاً'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await localStorageService.createUser({
            fullName,
            email,
            password: hashedPassword,
            role
        });

        const token = generateToken(user._id);

        console.log('✅ تم إنشاء حساب جديد:', user.email);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            user: localStorageService.formatUserResponse(user),
            token
        });

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('🔐 محاولة تسجيل دخول:', email);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
            });
        }

        const user = await localStorageService.findUserByEmail(email);
        if (!user) {
            console.log('❌ مستخدم غير موجود:', email);
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            console.log('❌ كلمة مرور خاطئة:', email);
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        // تحديث حالة المستخدم
        await localStorageService.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        const token = generateToken(user._id);

        console.log('✅ تم تسجيل الدخول بنجاح:', user.email);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: localStorageService.formatUserResponse(user),
            token
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await localStorageService.updateUser(req.user._id, {
            isOnline: false,
            lastSeen: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات المستخدمين
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: localStorageService.formatUserResponse(req.user)
        });
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await localStorageService.getAllUsers();
        res.json({
            success: true,
            users: users.map(user => localStorageService.formatUserResponse(user))
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال مصطلح بحث مكون من حرفين على الأقل'
            });
        }

        const users = await localStorageService.searchUsers(q, 20);

        res.json({
            success: true,
            users,
            query: q,
            total: users.length
        });

    } catch (error) {
        console.error('❌ خطأ في البحث عن المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء البحث'
        });
    }
});

// مسارات المحادثات
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await localStorageService.getConversationsByUserId(req.user._id);
        
        res.json({
            success: true,
            conversations
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantId } = req.body;
        
        if (!participantId) {
            return res.status(400).json({
                success: false,
                message: 'معرف المشارك مطلوب'
            });
        }

        const participant = await localStorageService.findUserById(participantId);
        if (!participant) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        const conversation = await localStorageService.getOrCreateConversation(
            req.user._id,
            participantId
        );

        res.json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.get('/api/chat/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50 } = req.query;
        
        const messages = await localStorageService.getMessagesByConversation(conversationId, parseInt(limit));

        res.json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات القنوات
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        // قنوات تجريبية
        const channels = [
            {
                _id: '1',
                name: 'قناة الرياضيات',
                description: 'قناة مخصصة لدروس الرياضيات والتمارين',
                members: [req.user._id],
                stats: { memberCount: 1, messageCount: 0 }
            },
            {
                _id: '2', 
                name: 'قناة العلوم',
                description: 'مناقشات وأخبار علمية',
                members: [req.user._id],
                stats: { memberCount: 1, messageCount: 0 }
            }
        ];

        res.json({
            success: true,
            channels
        });
    } catch (error) {
        console.error('❌ خطأ في جلب القنوات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات المجموعات
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        // مجموعات تجريبية
        const groups = [
            {
                _id: '1',
                name: 'مجموعة الرياضيات المتقدمة',
                description: 'مجموعة للمناقشات المتقدمة في الرياضيات',
                members: [req.user._id],
                stats: { memberCount: 1, messageCount: 0 }
            },
            {
                _id: '2',
                name: 'مجموعة مشاريع التخرج',
                description: 'لمناقشة مشاريع التخرج والتعاون',
                members: [req.user._id],
                stats: { memberCount: 1, messageCount: 0 }
            }
        ];

        res.json({
            success: true,
            groups
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المجموعات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات الستوريات
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = [];
        
        res.json({
            success: true,
            stories
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الستوريات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسار الحالة الصحية
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// معالجة الأخطاء
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود'
    });
});

// نظام WebSocket
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await localStorageService.findUserById(decoded.userId);
            
            if (user) {
                socket.userId = user._id;
                connectedUsers.set(user._id, socket.id);
                
                await localStorageService.updateUser(user._id, {
                    isOnline: true,
                    lastSeen: new Date().toISOString()
                });
                
                socket.join(user._id);
                
                socket.emit('authenticated', {
                    success: true,
                    user: localStorageService.formatUserResponse(user)
                });
                
                console.log(`✅ تم توثيق المستخدم: ${user.fullName}`);
            }
        } catch (error) {
            console.error('❌ خطأ في توثيق WebSocket:', error);
            socket.emit('authenticated', {
                success: false,
                message: 'رمز وصول غير صالح'
            });
        }
    });

    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'غير مصرح به' });
                return;
            }

            const { conversationId, content } = data;
            
            if (!conversationId || !content) {
                socket.emit('error', { message: 'معرف المحادثة والمحتوى مطلوبان' });
                return;
            }

            const message = await localStorageService.createMessage({
                conversationId,
                senderId: socket.userId,
                content,
                type: 'text'
            });

            const conversation = await localStorageService.getConversationById(conversationId);
            if (conversation) {
                conversation.participants.forEach(participantId => {
                    io.to(participantId).emit('new_message', {
                        conversationId,
                        message
                    });
                });
            }

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            socket.emit('error', { message: 'فشل إرسال الرسالة' });
        }
    });

    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منقطع:', socket.id);
        
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            
            try {
                await localStorageService.updateUser(socket.userId, {
                    isOnline: false,
                    lastSeen: new Date().toISOString()
                });
            } catch (error) {
                console.error('❌ خطأ في تحديث حالة المستخدم:', error);
            }
        }
    });
});

// بدء الخادم
async function startServer() {
    try {
        // إنشاء حساب المدير الافتراضي
        await createDefaultAdmin();
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(50));
            console.log('🚀 خادم المنصة التعليمية يعمل بنجاح!');
            console.log('='.repeat(50));
            console.log(`📍 العنوان: http://localhost:${PORT}`);
            console.log(`⏰ الوقت: ${new Date().toLocaleString()}`);
            console.log(`👥 المستخدمون المتصلون: ${connectedUsers.size}`);
            console.log('='.repeat(50));
            console.log('\n🔐 حساب المدير الافتراضي:');
            console.log('   📧 البريد: admin@platform.edu');
            console.log('   🔑 كلمة المرور: 77007700');
            console.log('='.repeat(50));
        });
    } catch (error) {
        console.error('❌ فشل في بدء الخادم:', error);
        process.exit(1);
    }
}

startServer();

export default app;
