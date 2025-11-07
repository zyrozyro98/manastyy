// server.js - الخادم الكامل مع التخزين المحلي
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

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'educational-platform-secret-key-2024';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// إنشاء المجلدات اللازمة
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// إعداد multer للتحميلات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
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

// middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// نظام التخزين المحلي
class LocalStorageService {
    constructor() {
        this.dataFile = path.join(__dirname, 'data.json');
        this.init();
    }

    init() {
        if (!fs.existsSync(this.dataFile)) {
            const defaultData = {
                users: [],
                conversations: [],
                messages: [],
                stories: [],
                groups: [],
                channels: [],
                notifications: []
            };
            this.saveData(defaultData);
            
            // إنشاء مدير افتراضي
            this.createDefaultAdmin();
        }
    }

    async createDefaultAdmin() {
        const hashedPassword = await bcrypt.hash('77007700', 12);
        const adminUser = {
            _id: uuidv4(),
            fullName: 'مدير النظام',
            email: 'admin@platform.edu',
            password: hashedPassword,
            role: 'admin',
            isOnline: false,
            isActive: true,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        };
        
        const data = this.loadData();
        data.users.push(adminUser);
        this.saveData(data);
        
        console.log('✅ تم إنشاء حساب المدير الافتراضي');
        console.log('📧 admin@platform.edu');
        console.log('🔑 77007700');
    }

    loadData() {
        try {
            if (!fs.existsSync(this.dataFile)) {
                return this.getDefaultData();
            }
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
            conversations: [],
            messages: [],
            stories: [],
            groups: [],
            channels: [],
            notifications: []
        };
    }

    // دوال المستخدمين
    async createUser(userData) {
        const data = this.loadData();
        const user = {
            _id: uuidv4(),
            ...userData,
            isOnline: false,
            isActive: true,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
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

    async getAllUsers() {
        const data = this.loadData();
        return data.users.filter(user => user.isActive);
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

    // دوال المحادثات
    async createConversation(participants, name = null, isGroup = false) {
        const data = this.loadData();
        const conversation = {
            _id: uuidv4(),
            participants,
            name: name || `محادثة ${participants.length} أشخاص`,
            isGroup,
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
            conv.participants.length === 2 &&
            !conv.isGroup
        );
        
        if (existingConversation) {
            return existingConversation;
        }
        
        return await this.createConversation([user1, user2]);
    }

    // دوال الرسائل
    async createMessage(messageData) {
        const data = this.loadData();
        const message = {
            _id: uuidv4(),
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [messageData.senderId]
        };
        
        data.messages.push(message);
        
        // تحديث المحادثة الأخيرة
        const convIndex = data.conversations.findIndex(conv => conv._id === messageData.conversationId);
        if (convIndex !== -1) {
            data.conversations[convIndex].lastMessage = message;
            data.conversations[convIndex].updatedAt = new Date().toISOString();
            
            // تحديث الرسائل غير المقروءة
            data.conversations[convIndex].participants.forEach(participantId => {
                if (participantId !== messageData.senderId) {
                    data.conversations[convIndex].unreadCount[participantId] = 
                        (data.conversations[convIndex].unreadCount[participantId] || 0) + 1;
                }
            });
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

    async markMessagesAsRead(conversationId, userId) {
        const data = this.loadData();
        const convIndex = data.conversations.findIndex(conv => conv._id === conversationId);
        
        if (convIndex !== -1) {
            data.conversations[convIndex].unreadCount[userId] = 0;
            this.saveData(data);
        }
        
        return true;
    }

    // دوال القصص
    async createStory(storyData) {
        const data = this.loadData();
        const story = {
            _id: uuidv4(),
            ...storyData,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            views: [],
            reactions: []
        };
        
        data.stories.push(story);
        this.saveData(data);
        return story;
    }

    async getActiveStories() {
        const data = this.loadData();
        const now = new Date().toISOString();
        return data.stories.filter(story => story.expiresAt > now);
    }

    async addStoryView(storyId, userId) {
        const data = this.loadData();
        const storyIndex = data.stories.findIndex(story => story._id === storyId);
        
        if (storyIndex !== -1 && !data.stories[storyIndex].views.includes(userId)) {
            data.stories[storyIndex].views.push(userId);
            this.saveData(data);
            return true;
        }
        return false;
    }

    // دوال المجموعات
    async createGroup(groupData) {
        const data = this.loadData();
        const group = {
            _id: uuidv4(),
            ...groupData,
            createdAt: new Date().toISOString(),
            members: groupData.members || [groupData.creatorId],
            isActive: true
        };
        
        data.groups.push(group);
        this.saveData(data);
        return group;
    }

    async getAllGroups() {
        const data = this.loadData();
        return data.groups.filter(group => group.isActive);
    }

    async addMemberToGroup(groupId, userId) {
        const data = this.loadData();
        const groupIndex = data.groups.findIndex(group => group._id === groupId);
        
        if (groupIndex !== -1 && !data.groups[groupIndex].members.includes(userId)) {
            data.groups[groupIndex].members.push(userId);
            this.saveData(data);
            return true;
        }
        return false;
    }

    // دوال القنوات
    async createChannel(channelData) {
        const data = this.loadData();
        const channel = {
            _id: uuidv4(),
            ...channelData,
            createdAt: new Date().toISOString(),
            members: channelData.members || [channelData.creatorId],
            isActive: true
        };
        
        data.channels.push(channel);
        this.saveData(data);
        return channel;
    }

    async getAllChannels() {
        const data = this.loadData();
        return data.channels.filter(channel => channel.isActive);
    }

    async addMemberToChannel(channelId, userId) {
        const data = this.loadData();
        const channelIndex = data.channels.findIndex(channel => channel._id === channelId);
        
        if (channelIndex !== -1 && !data.channels[channelIndex].members.includes(userId)) {
            data.channels[channelIndex].members.push(userId);
            this.saveData(data);
            return true;
        }
        return false;
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
        return res.status(401).json({ 
            success: false, 
            message: 'رمز وصول غير صالح'
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'صلاحيات مدير مطلوبة'
        });
    }
    next();
};

// دوال مساعدة
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
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

// مسارات المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, role = 'student' } = req.body;

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

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: {
                user: {
                    _id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role
                },
                token
            }
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

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
            });
        }

        const user = await localStorageService.findUserByEmail(email);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        await localStorageService.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: {
                    _id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    isOnline: true
                },
                token
            }
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
            data: {
                user: req.user
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await localStorageService.getAllUsers();
        const usersWithoutPasswords = users.map(user => ({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            isOnline: user.isOnline,
            lastSeen: user.lastSeen
        }));
        
        res.json({
            success: true,
            data: {
                users: usersWithoutPasswords
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات الدردشة
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await localStorageService.getConversationsByUserId(req.user._id);
        
        const conversationsWithDetails = await Promise.all(
            conversations.map(async (conv) => {
                const messages = await localStorageService.getMessagesByConversation(conv._id, 1);
                const lastMessage = messages[messages.length - 1];
                return {
                    ...conv,
                    lastMessage: lastMessage || null
                };
            })
        );

        res.json({
            success: true,
            data: {
                conversations: conversationsWithDetails
            }
        });
    } catch (error) {
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
            data: {
                conversation
            }
        });
    } catch (error) {
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
        
        await localStorageService.markMessagesAsRead(conversationId, req.user._id);

        res.json({
            success: true,
            data: {
                messages
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات القصص
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await localStorageService.getActiveStories();
        res.json({
            success: true,
            data: {
                stories
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/stories', authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const { caption } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'الوسائط مطلوبة'
            });
        }

        const story = await localStorageService.createStory({
            userId: req.user._id,
            mediaUrl: `/uploads/${req.file.filename}`,
            mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
            caption,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({
            success: true,
            message: 'تم نشر القصة بنجاح',
            data: {
                story
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/stories/:storyId/view', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const success = await localStorageService.addStoryView(storyId, req.user._id);
        
        if (success) {
            res.json({
                success: true,
                message: 'تم تسجيل المشاهدة'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'لم يتم تسجيل المشاهدة'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات المجموعات
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const groups = await localStorageService.getAllGroups();
        res.json({
            success: true,
            data: {
                groups
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/groups', authenticateToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم المجموعة مطلوب'
            });
        }

        const group = await localStorageService.createGroup({
            name,
            description,
            creatorId: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المجموعة بنجاح',
            data: {
                group
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/groups/:groupId/join', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const success = await localStorageService.addMemberToGroup(groupId, req.user._id);
        
        if (success) {
            res.json({
                success: true,
                message: 'تم الانضمام إلى المجموعة بنجاح'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'لم يتمكن من الانضمام إلى المجموعة'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات القنوات
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = await localStorageService.getAllChannels();
        res.json({
            success: true,
            data: {
                channels
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/channels', authenticateToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم القناة مطلوب'
            });
        }

        const channel = await localStorageService.createChannel({
            name,
            description,
            creatorId: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء القناة بنجاح',
            data: {
                channel
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/channels/:channelId/join', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;
        const success = await localStorageService.addMemberToChannel(channelId, req.user._id);
        
        if (success) {
            res.json({
                success: true,
                message: 'تم الانضمام إلى القناة بنجاح'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'لم يتمكن من الانضمام إلى القناة'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// مسارات الإدارة
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await localStorageService.getAllUsers();
        const stories = await localStorageService.getActiveStories();
        const groups = await localStorageService.getAllGroups();
        const channels = await localStorageService.getAllChannels();
        
        const stats = {
            totalUsers: users.length,
            onlineUsers: users.filter(u => u.isOnline).length,
            activeStories: stories.length,
            totalGroups: groups.length,
            totalChannels: channels.length
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/admin/users/:userId/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await localStorageService.findUserById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        const updatedUser = await localStorageService.updateUser(userId, {
            isActive: !user.isActive
        });

        res.json({
            success: true,
            message: `تم ${updatedUser.isActive ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح`,
            data: {
                user: updatedUser
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// ==================== نظام السوكت ====================

const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);

    socket.on('authenticate', async (data) => {
        try {
            const { token } = data;
            if (!token) return;

            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await localStorageService.findUserById(decoded.userId);
            
            if (!user) return;

            socket.userId = user._id;
            connectedUsers.set(user._id, {
                socketId: socket.id,
                user: user
            });

            await localStorageService.updateUser(user._id, {
                isOnline: true
            });

            socket.join(`user:${user._id}`);
            
            io.emit('user_status_changed', {
                userId: user._id,
                isOnline: true
            });

            socket.emit('authenticated', { 
                user: user,
                message: 'تم المصادقة بنجاح'
            });

        } catch (error) {
            console.error('❌ خطأ في مصادقة السوكت:', error);
        }
    });

    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) return;

            const { conversationId, content } = data;
            
            if (!conversationId || !content) return;

            const message = await localStorageService.createMessage({
                conversationId,
                senderId: socket.userId,
                content,
                type: 'text'
            });

            const conversation = await localStorageService.getConversationById(conversationId);
            if (!conversation) return;

            // إرسال الرسالة لجميع المشاركين
            conversation.participants.forEach(participantId => {
                io.to(`user:${participantId}`).emit('new_message', {
                    conversationId,
                    message
                });
            });

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
        }
    });

    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منفصل:', socket.id);
        
        const userId = socket.userId;
        if (userId) {
            await localStorageService.updateUser(userId, {
                isOnline: false,
                lastSeen: new Date().toISOString()
            });

            connectedUsers.delete(userId);

            io.emit('user_status_changed', {
                userId,
                isOnline: false
            });
        }
    });
});

// بدء الخادم
server.listen(PORT, () => {
    console.log(`
🚀 خادم المنصة التعليمية يعمل بنجاح!
📍 العنوان: http://localhost:${PORT}
⏰ الوقت: ${new Date().toLocaleString('ar-SA')}

🔐 حساب المدير الافتراضي:
   📧 البريد الإلكتروني: admin@platform.edu
   🔑 كلمة المرور: 77007700

✨ المميزات المتاحة:
   💬 دردشة فورية
   📖 قصص تفاعلية
   👥 مجموعات وقنوات
   👑 لوحة إدارة متكاملة
   📱 واجهة مستخدم متجاوبة
    `);
});

export default app;
