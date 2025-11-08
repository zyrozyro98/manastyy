// server.js - الخادم الكامل للمنصة التعليمية
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'educational_platform_secret_2024';

// إنشاء المجلدات اللازمة
const requiredDirs = [path.join(__dirname, 'public')];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// نظام التخزين المحلي المحسن
class DatabaseService {
    constructor() {
        this.dataFile = path.join(__dirname, 'data.json');
        this.init();
    }

    init() {
        if (!fs.existsSync(this.dataFile)) {
            const defaultData = this.getDefaultData();
            this.saveData(defaultData);
            console.log('✅ تم إنشاء قاعدة البيانات المحلية');
        }
    }

    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = fs.readFileSync(this.dataFile, 'utf8');
                return JSON.parse(data);
            }
            return this.getDefaultData();
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
            groups: [],
            groupMessages: [],
            stories: [],
            notifications: [],
            lastId: 1000
        };
    }

    // إدارة المستخدمين
    async createUser(userData) {
        const data = this.loadData();
        const userId = `user_${++data.lastId}`;
        
        const user = {
            _id: userId,
            ...userData,
            createdAt: new Date().toISOString(),
            isOnline: false,
            lastSeen: new Date().toISOString(),
            friends: [],
            blockedUsers: [],
            settings: {
                notifications: true,
                privacy: 'public'
            },
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

    async searchUsers(query) {
        const data = this.loadData();
        const searchTerm = query.toLowerCase();
        return data.users.filter(user => 
            user.isActive && (
                user.fullName.toLowerCase().includes(searchTerm) || 
                user.email.toLowerCase().includes(searchTerm)
            )
        );
    }

    // إدارة المحادثات
    async createConversation(participants, name = null, isGroup = false, groupId = null) {
        const data = this.loadData();
        const conversationId = `conv_${++data.lastId}`;
        
        const conversation = {
            _id: conversationId,
            participants,
            name: name || `محادثة ${participants.length} أشخاص`,
            isGroup,
            groupId,
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

    // إدارة الرسائل
    async createMessage(messageData) {
        const data = this.loadData();
        const messageId = `msg_${++data.lastId}`;
        
        const message = {
            _id: messageId,
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [messageData.senderId],
            status: 'sent'
        };
        
        data.messages.push(message);
        
        // تحديث المحادثة
        const convIndex = data.conversations.findIndex(conv => conv._id === messageData.conversationId);
        if (convIndex !== -1) {
            data.conversations[convIndex].lastMessage = message;
            data.conversations[convIndex].updatedAt = new Date().toISOString();
            
            // تحديث العداد غير المقروء
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
        
        // تحديث العداد غير المقروء
        const convIndex = data.conversations.findIndex(conv => conv._id === conversationId);
        if (convIndex !== -1) {
            data.conversations[convIndex].unreadCount[userId] = 0;
        }
        
        // تحديث الرسائل كمقروءة
        data.messages.forEach(msg => {
            if (msg.conversationId === conversationId && !msg.readBy.includes(userId)) {
                msg.readBy.push(userId);
            }
        });
        
        this.saveData(data);
        return true;
    }

    // إدارة المجموعات
    async createGroup(groupData) {
        const data = this.loadData();
        const groupId = `group_${++data.lastId}`;
        
        const group = {
            _id: groupId,
            ...groupData,
            createdAt: new Date().toISOString(),
            members: groupData.members || [groupData.creatorId],
            admins: [groupData.creatorId],
            inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            settings: {
                isPublic: groupData.isPublic !== false,
                allowInvites: true
            }
        };
        
        data.groups.push(group);
        
        // إنشاء محادثة جماعية
        await this.createConversation(
            group.members,
            group.name,
            true,
            groupId
        );
        
        this.saveData(data);
        return group;
    }

    async getGroupById(groupId) {
        const data = this.loadData();
        return data.groups.find(group => group._id === groupId);
    }

    async getUserGroups(userId) {
        const data = this.loadData();
        return data.groups.filter(group => group.members.includes(userId));
    }

    async getAllGroups() {
        const data = this.loadData();
        return data.groups;
    }

    async addMemberToGroup(groupId, userId) {
        const data = this.loadData();
        const groupIndex = data.groups.findIndex(group => group._id === groupId);
        
        if (groupIndex !== -1 && !data.groups[groupIndex].members.includes(userId)) {
            data.groups[groupIndex].members.push(userId);
            
            // إضافة المستخدم لمحادثة المجموعة
            const conversation = data.conversations.find(conv => 
                conv.isGroup && conv.groupId === groupId
            );
            if (conversation && !conversation.participants.includes(userId)) {
                conversation.participants.push(userId);
            }
            
            this.saveData(data);
            return true;
        }
        return false;
    }

    async createGroupMessage(messageData) {
        const data = this.loadData();
        const messageId = `gmsg_${++data.lastId}`;
        
        const message = {
            _id: messageId,
            ...messageData,
            createdAt: new Date().toISOString(),
            readBy: [messageData.senderId]
        };
        
        data.groupMessages.push(message);
        this.saveData(data);
        return message;
    }

    async getGroupMessages(groupId, limit = 50) {
        const data = this.loadData();
        return data.groupMessages
            .filter(msg => msg.groupId === groupId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(-limit);
    }

    // إدارة القصص
    async createStory(storyData) {
        const data = this.loadData();
        const storyId = `story_${++data.lastId}`;
        
        const story = {
            _id: storyId,
            ...storyData,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            views: []
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

    // إدارة الإشعارات
    async createNotification(notificationData) {
        const data = this.loadData();
        const notificationId = `notif_${++data.lastId}`;
        
        const notification = {
            _id: notificationId,
            ...notificationData,
            createdAt: new Date().toISOString(),
            isRead: false
        };
        
        data.notifications.push(notification);
        this.saveData(data);
        return notification;
    }

    async getUserNotifications(userId) {
        const data = this.loadData();
        return data.notifications
            .filter(notif => notif.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async markNotificationAsRead(notificationId) {
        const data = this.loadData();
        const notifIndex = data.notifications.findIndex(notif => notif._id === notificationId);
        
        if (notifIndex !== -1) {
            data.notifications[notifIndex].isRead = true;
            this.saveData(data);
            return true;
        }
        return false;
    }

    // الحصول على إحصائيات النظام
    async getSystemStats() {
        const data = this.loadData();
        return {
            totalUsers: data.users.filter(u => u.isActive).length,
            totalConversations: data.conversations.length,
            totalMessages: data.messages.length,
            totalGroups: data.groups.length,
            totalStories: data.stories.length,
            onlineUsers: data.users.filter(u => u.isOnline).length
        };
    }
}

const db = new DatabaseService();

// إنشاء حساب المدير الافتراضي
async function createDefaultAdmin() {
    const adminExists = await db.findUserByEmail('admin@platform.edu');
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('77007700', 12);
        await db.createUser({
            fullName: 'مدير النظام',
            email: 'admin@platform.edu',
            password: hashedPassword,
            role: 'admin',
            isActive: true
        });
        console.log('✅ تم إنشاء حساب المدير الافتراضي');
    }
}

// إنشاء بيانات تجريبية
async function createSampleData() {
    try {
        const users = [
            {
                fullName: 'أحمد محمد',
                email: 'ahmed@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'teacher'
            },
            {
                fullName: 'فاطمة علي',
                email: 'fatima@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'student'
            },
            {
                fullName: 'خالد إبراهيم',
                email: 'khaled@example.com',
                password: await bcrypt.hash('123456', 12),
                role: 'student'
            }
        ];

        for (const userData of users) {
            const existingUser = await db.findUserByEmail(userData.email);
            if (!existingUser) {
                await db.createUser(userData);
            }
        }

        // إنشاء مجموعات تجريبية
        const allUsers = await db.getAllUsers();
        const adminUser = allUsers.find(u => u.role === 'admin');
        const teacherUser = allUsers.find(u => u.role === 'teacher');

        if (adminUser && teacherUser) {
            const groups = [
                {
                    name: 'مجموعة الرياضيات',
                    description: 'مجموعة مخصصة لدروس الرياضيات والتمارين',
                    creatorId: adminUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true
                },
                {
                    name: 'مجموعة العلوم',
                    description: 'مناقشات وأخبار علمية',
                    creatorId: teacherUser._id,
                    members: allUsers.map(u => u._id),
                    isPublic: true
                }
            ];

            for (const groupData of groups) {
                const existingGroups = await db.getAllGroups();
                if (!existingGroups.find(g => g.name === groupData.name)) {
                    await db.createGroup(groupData);
                }
            }
        }

        console.log('✅ تم إنشاء البيانات التجريبية بنجاح');
    } catch (error) {
        console.error('❌ خطأ في إنشاء البيانات التجريبية:', error);
    }
}

// تهيئة البيانات
createDefaultAdmin().then(() => {
    setTimeout(createSampleData, 1000);
});

// middleware المصادقة
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ success: false, message: 'رمز الوصول مطلوب' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.findUserById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'المستخدم غير موجود' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'رمز وصول غير صالح' });
    }
};

// دوال مساعدة
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

// ==================== مسارات API ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
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

        if (!fullName || !email || !password) {
            return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
        }

        const existingUser = await db.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await db.createUser({
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
                user: { ...user, password: undefined },
                token
            }
        });

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
        }

        const user = await db.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        const updatedUser = await db.updateUser(user._id, {
            isOnline: true,
            lastSeen: new Date().toISOString()
        });

        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: { ...updatedUser, password: undefined },
                token
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await db.updateUser(req.user._id, {
            isOnline: false,
            lastSeen: new Date().toISOString()
        });

        res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

// مسارات المستخدمين
app.get('/api/users/me', authenticateToken, async (req, res) => {
    res.json({
        success: true,
        data: { user: { ...req.user, password: undefined } }
    });
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json({
            success: true,
            data: {
                users: users.map(user => ({ ...user, password: undefined }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, message: 'مصطلح البحث مطلوب' });
        }

        const users = await db.searchUsers(q);
        res.json({
            success: true,
            data: {
                users: users.map(user => ({ ...user, password: undefined }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في البحث' });
    }
});

// مسارات الدردشة
app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await db.getConversationsByUserId(req.user._id);
        res.json({ success: true, data: { conversations } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const { participantId } = req.body;
        
        if (!participantId) {
            return res.status(400).json({ success: false, message: 'معرف المشارك مطلوب' });
        }

        const participant = await db.findUserById(participantId);
        if (!participant) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        const conversation = await db.getOrCreateConversation(req.user._id, participantId);
        res.json({ success: true, data: { conversation } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/chat/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50 } = req.query;
        
        const messages = await db.getMessagesByConversation(conversationId, parseInt(limit));
        await db.markMessagesAsRead(conversationId, req.user._id);

        res.json({ success: true, data: { messages } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

// مسارات المجموعات
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const groups = await db.getUserGroups(req.user._id);
        res.json({ success: true, data: { groups } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/groups', authenticateToken, async (req, res) => {
    try {
        const { name, description, isPublic = true } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'اسم المجموعة مطلوب' });
        }

        const group = await db.createGroup({
            name,
            description,
            isPublic,
            creatorId: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المجموعة بنجاح',
            data: { group }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/groups/:groupId/join', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const success = await db.addMemberToGroup(groupId, req.user._id);
        
        if (success) {
            res.json({ success: true, message: 'تم الانضمام إلى المجموعة بنجاح' });
        } else {
            res.status(400).json({ success: false, message: 'لم يتمكن من الانضمام إلى المجموعة' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const { limit = 50 } = req.query;
        
        const messages = await db.getGroupMessages(groupId, parseInt(limit));
        res.json({ success: true, data: { messages } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

// مسارات القصص
app.get('/api/stories', authenticateToken, async (req, res) => {
    try {
        const stories = await db.getActiveStories();
        res.json({ success: true, data: { stories } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/stories', authenticateToken, async (req, res) => {
    try {
        const { mediaUrl, caption } = req.body;
        
        if (!mediaUrl) {
            return res.status(400).json({ success: false, message: 'الوسائط مطلوبة' });
        }

        const story = await db.createStory({
            userId: req.user._id,
            mediaUrl,
            caption
        });

        res.status(201).json({
            success: true,
            message: 'تم نشر القصة بنجاح',
            data: { story }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

// مسارات الإشعارات
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await db.getUserNotifications(req.user._id);
        res.json({ success: true, data: { notifications } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/notifications/:notificationId/read', authenticateToken, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const success = await db.markNotificationAsRead(notificationId);
        
        if (success) {
            res.json({ success: true, message: 'تم تحديد الإشعار كمقروء' });
        } else {
            res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

// مسار الإحصائيات
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await db.getSystemStats();
        res.json({ success: true, data: { stats } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
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
            const user = await db.findUserById(decoded.userId);
            
            if (!user) return;

            socket.userId = user._id;
            connectedUsers.set(user._id, {
                socketId: socket.id,
                user: { ...user, password: undefined }
            });

            await db.updateUser(user._id, { isOnline: true });

            // الانضمام للغرف
            socket.join(`user:${user._id}`);
            
            const userGroups = await db.getUserGroups(user._id);
            userGroups.forEach(group => {
                socket.join(`group:${group._id}`);
            });

            // إعلام الآخرين بتحديث الحالة
            io.emit('user_status_changed', {
                userId: user._id,
                isOnline: true,
                lastSeen: new Date().toISOString()
            });

            socket.emit('authenticated', { 
                user: { ...user, password: undefined }
            });

            console.log(`✅ تم مصادقة المستخدم: ${user.fullName} (${socket.id})`);

        } catch (error) {
            console.error('❌ خطأ في مصادقة السوكت:', error);
        }
    });

    // إرسال رسالة خاصة
    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) return;

            const { conversationId, content, type = 'text' } = data;
            
            if (!conversationId || !content) return;

            const conversation = await db.getConversationById(conversationId);
            if (!conversation) return;

            const message = await db.createMessage({
                conversationId,
                senderId: socket.userId,
                content,
                type
            });

            const sender = await db.findUserById(socket.userId);

            // إرسال الرسالة لجميع المشاركين
            conversation.participants.forEach(participantId => {
                io.to(`user:${participantId}`).emit('new_message', {
                    conversationId,
                    message: {
                        ...message,
                        sender: { ...sender, password: undefined }
                    }
                });
            });

            console.log(`💬 رسالة جديدة في المحادثة ${conversationId}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
        }
    });

    // إرسال رسالة جماعية
    socket.on('send_group_message', async (data) => {
        try {
            if (!socket.userId) return;

            const { groupId, content, type = 'text' } = data;
            
            if (!groupId || !content) return;

            const group = await db.getGroupById(groupId);
            if (!group || !group.members.includes(socket.userId)) return;

            const message = await db.createGroupMessage({
                groupId,
                senderId: socket.userId,
                content,
                type
            });

            const sender = await db.findUserById(socket.userId);

            // إرسال الرسالة لجميع أعضاء المجموعة
            io.to(`group:${groupId}`).emit('new_group_message', {
                groupId,
                message: {
                    ...message,
                    sender: { ...sender, password: undefined }
                }
            });

            console.log(`👥 رسالة جديدة في المجموعة ${groupId}`);

        } catch (error) {
            console.error('❌ خطأ في إرسال رسالة المجموعة:', error);
        }
    });

    // مؤشر الكتابة
    socket.on('typing_start', (data) => {
        const { conversationId } = data;
        if (conversationId && socket.userId) {
            socket.to(conversationId).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: true
            });
        }
    });

    socket.on('typing_stop', (data) => {
        const { conversationId } = data;
        if (conversationId && socket.userId) {
            socket.to(conversationId).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: false
            });
        }
    });

    // تحديد الرسائل كمقروءة
    socket.on('mark_messages_read', async (data) => {
        try {
            const { conversationId } = data;
            if (conversationId && socket.userId) {
                await db.markMessagesAsRead(conversationId, socket.userId);
            }
        } catch (error) {
            console.error('❌ خطأ في تحديد الرسائل كمقروءة:', error);
        }
    });

    // الانضمام للمجموعة
    socket.on('join_group', async (data) => {
        try {
            const { groupId } = data;
            if (groupId && socket.userId) {
                const success = await db.addMemberToGroup(groupId, socket.userId);
                if (success) {
                    socket.join(`group:${groupId}`);
                    socket.emit('group_joined', { groupId });
                    
                    // إعلام أعضاء المجموعة
                    io.to(`group:${groupId}`).emit('group_member_joined', {
                        groupId,
                        userId: socket.userId
                    });

                    console.log(`✅ المستخدم ${socket.userId} انضم إلى المجموعة ${groupId}`);
                }
            }
        } catch (error) {
            console.error('❌ خطأ في الانضمام إلى المجموعة:', error);
        }
    });

    socket.on('disconnect', async () => {
        console.log('🔌 مستخدم منفصل:', socket.id);
        
        const userId = socket.userId;
        if (userId) {
            await db.updateUser(userId, {
                isOnline: false,
                lastSeen: new Date().toISOString()
            });

            io.emit('user_status_changed', {
                userId,
                isOnline: false,
                lastSeen: new Date().toISOString()
            });

            connectedUsers.delete(userId);
        }
    });
});

// بدء الخادم
server.listen(PORT, () => {
    console.log(`
🚀 خادم المنصة التعليمية يعمل بنجاح!
📍 العنوان: http://localhost:${PORT}
👥 المستخدمون المتصلون: ${connectedUsers.size}

🔐 حساب المدير الافتراضي:
   📧 البريد الإلكتروني: admin@platform.edu
   🔑 كلمة المرور: 77007700

✨ المميزات المتوفرة:
   💬 دردشة فورية مع الأصدقاء
   👥 مجموعات دردشة جماعية
   📱 تحديثات في الوقت الحقيقي
   🔔 نظام إشعارات متكامل
   📊 إحصائيات ونظام مراقبة
    `);
});

export default app;
