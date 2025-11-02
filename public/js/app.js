// app.js - المنصة التعليمية المتكاملة - الإصدار النهائي
class EducationalPlatform {
    constructor() {
        this.currentUser = null;
        this.socket = null;
        this.currentChat = null;
        this.conversations = new Map();
        this.emojiPicker = null;
        this.stories = [];
        this.currentStoryIndex = 0;
        this.storyInterval = null;
        this.isInitialized = false;
        this.allUsers = [];
        this.groups = [];
        this.channels = [];
        this.media = [];
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة المنصة التعليمية...');
        
        try {
            this.setupEventListeners();
            await this.checkAuthentication();
            this.initializeSocket();
            await this.loadInitialData();
            
            this.isInitialized = true;
            console.log('✅ تم تهيئة المنصة التعليمية بنجاح');
        } catch (error) {
            console.error('❌ خطأ في تهيئة التطبيق:', error);
        }
    }

    // ============ إدارة التخزين المحلي ============
    getLocalStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.error('خطأ في قراءة التخزين المحلي:', error);
            return null;
        }
    }

    setLocalStorage(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.error('خطأ في كتابة التخزين المحلي:', error);
            return false;
        }
    }

    removeLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('خطأ في حذف من التخزين المحلي:', error);
            return false;
        }
    }

    // ============ إدارة المصادقة ============
    async checkAuthentication() {
        const token = this.getLocalStorage('authToken');
        const userData = this.getLocalStorage('currentUser');

        if (token && userData) {
            try {
                this.currentUser = JSON.parse(userData);
                this.showAuthenticatedUI();
                this.navigateToPage('dashboard');
                
                const isValid = await this.validateToken(token);
                if (!isValid) {
                    this.handleLogout();
                }
            } catch (error) {
                console.error('خطأ في تحميل بيانات المستخدم:', error);
                this.handleLogout();
            }
        } else {
            this.showUnauthenticatedUI();
            this.navigateToPage('home');
        }
    }

    async validateToken(token) {
        try {
            const users = this.getLocalStorage('users') || [];
            const currentUser = this.getLocalStorage('currentUser');
            
            if (!currentUser) return false;
            
            const user = JSON.parse(currentUser);
            const userExists = users.find(u => u._id === user._id && u.email === user.email);
            
            return !!userExists;
        } catch (error) {
            console.error('خطأ في التحقق من التوكن:', error);
            return false;
        }
    }

    // ============ إدارة الواجهة ============
    showAuthenticatedUI() {
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('logoutBtn').classList.remove('hidden');
        document.getElementById('loginBtn').classList.add('hidden');
        document.getElementById('registerBtn').classList.add('hidden');
        
        if (this.currentUser) {
            document.getElementById('userNameDisplay').textContent = this.currentUser.fullName || 'مستخدم';
            document.getElementById('userRoleDisplay').textContent = this.currentUser.role || 'طالب';
            document.getElementById('userAvatarText').textContent = (this.currentUser.fullName || 'م').charAt(0);
        }
    }

    showUnauthenticatedUI() {
        document.getElementById('userInfo').classList.add('hidden');
        document.getElementById('logoutBtn').classList.add('hidden');
        document.getElementById('loginBtn').classList.remove('hidden');
        document.getElementById('registerBtn').classList.remove('hidden');
    }

    navigateToPage(pageName) {
        console.log(`🔄 الانتقال إلى صفحة: ${pageName}`);
        
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        const targetPage = document.getElementById(`${pageName}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.loadPageContent(pageName);
        }

        this.updateNavigationState(pageName);
        this.closeMobileMenu();
    }

    updateNavigationState(pageName) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === pageName) {
                item.classList.add('active');
            }
        });
    }

    async loadPageContent(pageName) {
        switch (pageName) {
            case 'chat':
                await this.loadConversations();
                this.setupNewChatButton();
                break;
            case 'stories':
                await this.loadStories();
                break;
            case 'groups':
                await this.loadGroups();
                break;
            case 'channels':
                await this.loadChannels();
                break;
            case 'media':
                await this.loadMedia();
                break;
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'login':
                this.setupLoginForm();
                break;
            case 'register':
                this.setupRegisterForm();
                break;
        }
    }

    // ============ إعداد مستمعي الأحداث ============
    setupEventListeners() {
        console.log('🔧 إعداد مستمعي الأحداث...');
        
        // زر ابدأ الآن
        document.getElementById('startAppBtn').addEventListener('click', () => this.startApp());

        // التنقل بين الصفحات
        document.querySelectorAll('[data-page]').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                const pageName = element.getAttribute('data-page');
                this.navigateToPage(pageName);
            });
        });

        // القائمة المتنقلة
        document.getElementById('mobileMenuBtn').addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('overlay').addEventListener('click', () => this.closeMobileMenu());

        // الزر العائم
        document.getElementById('floatingActionBtn').addEventListener('click', () => this.toggleQuickActions());

        // تسجيل الخروج
        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        console.log('✅ تم إعداد مستمعي الأحداث بنجاح');
    }

    // ============ دوال التطبيق الرئيسية ============
    startApp() {
        console.log('🎬 بدء التطبيق...');
        const welcomeScreen = document.getElementById('welcomeScreen');
        const appContainer = document.getElementById('appContainer');
        
        welcomeScreen.style.display = 'none';
        appContainer.classList.add('active');
        
        this.navigateToPage('home');
        this.showNotification('مرحباً بك في المنصة التعليمية!', 'success');
    }

    toggleMobileMenu() {
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('overlay');
        
        mobileMenu.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    closeMobileMenu() {
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('overlay');
        
        mobileMenu.classList.remove('active');
        overlay.classList.remove('active');
    }

    toggleQuickActions() {
        const quickActions = document.getElementById('quickActionsBar');
        quickActions.classList.toggle('active');
    }

    // ============ نظام الدردشة ============
    initializeSocket() {
        console.log('🔌 تهيئة نظام الاتصال المحلي...');
        this.updateConnectionStatus(true);
    }

    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            if (isConnected) {
                statusElement.innerHTML = '<i class="fas fa-wifi"></i><span>متصل بالإنترنت</span>';
                statusElement.style.background = 'rgba(76, 201, 240, 0.9)';
            } else {
                statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i><span>غير متصل</span>';
                statusElement.style.background = 'rgba(247, 37, 133, 0.9)';
            }
        }
    }

    async loadInitialData() {
        if (this.currentUser) {
            await this.loadUsers();
            await this.loadConversations();
            await this.loadStories();
            await this.loadGroups();
            await this.loadChannels();
            await this.loadMedia();
        }
    }

    async loadUsers() {
        try {
            const usersData = this.getLocalStorage('users');
            if (usersData) {
                this.allUsers = JSON.parse(usersData);
            } else {
                // إنشاء بيانات تجريبية
                this.allUsers = [
                    {
                        _id: '1',
                        fullName: 'أحمد محمد',
                        email: 'ahmed@example.com',
                        role: 'teacher',
                        isOnline: true
                    },
                    {
                        _id: '2',
                        fullName: 'فاطمة علي',
                        email: 'fatima@example.com',
                        role: 'student',
                        isOnline: false
                    },
                    {
                        _id: '3',
                        fullName: 'خالد إبراهيم',
                        email: 'khaled@example.com',
                        role: 'student',
                        isOnline: true
                    }
                ];
                this.setLocalStorage('users', JSON.stringify(this.allUsers));
            }
        } catch (error) {
            console.error('خطأ في تحميل المستخدمين:', error);
            this.allUsers = [];
        }
    }

    async loadConversations() {
        try {
            const conversationsData = this.getLocalStorage('conversations');
            let conversations = [];
            
            if (conversationsData) {
                conversations = JSON.parse(conversationsData);
            } else {
                // إنشاء محادثات تجريبية
                conversations = [
                    {
                        _id: 'conv1',
                        participants: [this.currentUser?._id || 'user_1', '1'],
                        name: 'أحمد محمد',
                        lastMessage: {
                            content: 'مرحباً، كيف يمكنني مساعدتك؟',
                            senderId: '1',
                            createdAt: new Date().toISOString()
                        },
                        unreadCount: {},
                        isGroup: false
                    },
                    {
                        _id: 'conv2',
                        participants: [this.currentUser?._id || 'user_1', '2'],
                        name: 'فاطمة علي',
                        lastMessage: {
                            content: 'شكراً على المساعدة',
                            senderId: this.currentUser?._id || 'user_1',
                            createdAt: new Date().toISOString()
                        },
                        unreadCount: {},
                        isGroup: false
                    }
                ];
                this.setLocalStorage('conversations', JSON.stringify(conversations));
            }

            this.renderConversations(conversations);
        } catch (error) {
            console.error('خطأ في تحميل المحادثات:', error);
        }
    }

    renderConversations(conversations) {
        const container = document.getElementById('conversationsList');
        if (!container) return;

        container.innerHTML = '';

        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: rgba(255,255,255,0.7);">لا توجد محادثات</div>';
            return;
        }

        conversations.forEach(conversation => {
            const conversationElement = this.createConversationElement(conversation);
            container.appendChild(conversationElement);
            this.conversations.set(conversation._id, conversation);
        });
    }

    createConversationElement(conversation) {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.dataset.conversationId = conversation._id;
        
        const lastMessage = conversation.lastMessage ? 
            (conversation.lastMessage.content || 'ملف مرفق') : 'لا توجد رسائل';
        const unreadCount = conversation.unreadCount && conversation.unreadCount[this.currentUser?._id] 
            ? conversation.unreadCount[this.currentUser._id] 
            : 0;

        div.innerHTML = `
            <div class="conversation-avatar">
                <span>${conversation.name.charAt(0)}</span>
            </div>
            <div class="conversation-info">
                <div class="conversation-name">${conversation.name}</div>
                <div class="conversation-last-message">${this.truncateText(lastMessage, 30)}</div>
            </div>
            <div class="conversation-meta">
                <div class="conversation-time">${this.formatTime(conversation.lastMessage?.createdAt)}</div>
                ${unreadCount > 0 ? 
                    `<div class="conversation-unread">${unreadCount}</div>` : ''}
            </div>
        `;

        div.addEventListener('click', () => this.selectConversation(conversation._id));
        return div;
    }

    setupNewChatButton() {
        const chatHeader = document.querySelector('.chat-sidebar .chat-header');
        if (!chatHeader) return;

        const existingButton = document.getElementById('newChatBtn');
        if (existingButton) {
            existingButton.remove();
        }

        const newChatBtn = document.createElement('button');
        newChatBtn.id = 'newChatBtn';
        newChatBtn.className = 'btn btn-primary btn-sm';
        newChatBtn.innerHTML = '<i class="fas fa-plus"></i> محادثة جديدة';
        newChatBtn.style.marginRight = '10px';
        
        newChatBtn.addEventListener('click', () => this.showNewChatModal());
        
        chatHeader.appendChild(newChatBtn);
    }

    showNewChatModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>بدء محادثة جديدة</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>اختر مستخدم للدردشة:</label>
                        <div class="users-list" style="max-height: 300px; overflow-y: auto; margin-top: 1rem;">
                            ${this.allUsers
                                .filter(user => user._id !== this.currentUser?._id)
                                .map(user => `
                                <div class="user-item" data-user-id="${user._id}" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.2); cursor: pointer; color: white;">
                                    <div class="user-avatar" style="width: 40px; height: 40px; background: #4361ee; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin-left: 10px;">
                                        ${user.fullName.charAt(0)}
                                    </div>
                                    <div>
                                        <div style="font-weight: bold;">${user.fullName}</div>
                                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7);">${user.role}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-actions" style="margin-top: 1rem;">
                        <button type="button" class="btn btn-outline" id="cancelNewChat">إلغاء</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#cancelNewChat').addEventListener('click', () => modal.remove());
        
        modal.querySelectorAll('.user-item').forEach(item => {
            item.addEventListener('click', async () => {
                const userId = item.dataset.userId;
                await this.startNewChat(userId);
                modal.remove();
            });
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async startNewChat(userId) {
        try {
            const user = this.allUsers.find(u => u._id === userId);
            if (!user) {
                this.showNotification('المستخدم غير موجود', 'error');
                return;
            }

            const conversationId = 'conv_' + Date.now();
            const conversation = {
                _id: conversationId,
                participants: [this.currentUser._id, userId],
                name: user.fullName,
                lastMessage: null,
                unreadCount: {},
                isGroup: false,
                createdAt: new Date().toISOString()
            };

            const conversationsData = this.getLocalStorage('conversations');
            let conversations = conversationsData ? JSON.parse(conversationsData) : [];
            conversations.push(conversation);
            this.setLocalStorage('conversations', JSON.stringify(conversations));

            this.showNotification('تم بدء المحادثة بنجاح', 'success');
            await this.loadConversations();
            this.selectConversation(conversationId);

        } catch (error) {
            console.error('خطأ في بدء المحادثة:', error);
            this.showNotification('خطأ في بدء المحادثة', 'error');
        }
    }

    selectConversation(conversationId) {
        const conversation = Array.from(this.conversations.values()).find(conv => conv._id === conversationId);
        if (!conversation) return;

        this.currentChat = conversation;

        document.getElementById('activeChatName').textContent = this.currentChat.name;
        document.getElementById('activeChatAvatar').textContent = this.currentChat.name.charAt(0);
        document.getElementById('activeChatStatus').textContent = 'متصل';
        
        const chatInputContainer = document.getElementById('chatInputContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (chatInputContainer) chatInputContainer.style.display = 'flex';
        if (emptyChat) emptyChat.style.display = 'none';

        this.loadMessages(conversationId);
        
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeConversation = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (activeConversation) {
            activeConversation.classList.add('active');
        }

        this.markMessagesAsRead(conversationId);
    }

    async loadMessages(conversationId) {
        try {
            const messagesData = this.getLocalStorage('messages') || '{}';
            const messages = JSON.parse(messagesData);
            const conversationMessages = messages[conversationId] || [];
            
            this.renderMessages(conversationMessages);
        } catch (error) {
            console.error('خطأ في تحميل الرسائل:', error);
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        container.innerHTML = '';

        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div class="empty-chat">
                    <i class="fas fa-comments"></i>
                    <h3>ابدأ المحادثة</h3>
                    <p>ارسل رسالة لبدء المحادثة</p>
                </div>
            `;
            return;
        }

        messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            container.appendChild(messageElement);
        });

        this.scrollToBottom();
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        const isSent = message.senderId === this.currentUser._id;
        
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.innerHTML = `
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message.content)}</div>
                <div class="message-time">${this.formatTime(message.createdAt)}</div>
            </div>
            ${isSent ? `
                <div class="message-status">
                    <i class="fas fa-check-double"></i>
                </div>
            ` : ''}
        `;

        return div;
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const content = input?.value.trim();
        
        if (!content || !this.currentChat) return;

        const messageData = {
            _id: 'msg_' + Date.now(),
            content: content,
            conversationId: this.currentChat._id,
            senderId: this.currentUser._id,
            type: 'text',
            createdAt: new Date().toISOString(),
            readBy: [this.currentUser._id]
        };

        try {
            this.addMessageToUI(messageData, true);
            input.value = '';

            const messagesData = this.getLocalStorage('messages') || '{}';
            const messages = JSON.parse(messagesData);
            
            if (!messages[this.currentChat._id]) {
                messages[this.currentChat._id] = [];
            }
            
            messages[this.currentChat._id].push(messageData);
            this.setLocalStorage('messages', JSON.stringify(messages));

            this.updateConversationLastMessage(this.currentChat._id, messageData);

        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.showNotification('فشل في إرسال الرسالة', 'error');
        }
    }

    updateConversationLastMessage(conversationId, message) {
        const conversationsData = this.getLocalStorage('conversations');
        if (!conversationsData) return;
        
        let conversations = JSON.parse(conversationsData);
        const conversationIndex = conversations.findIndex(conv => conv._id === conversationId);
        
        if (conversationIndex !== -1) {
            conversations[conversationIndex].lastMessage = message;
            conversations[conversationIndex].updatedAt = new Date().toISOString();
            this.setLocalStorage('conversations', JSON.stringify(conversations));
            this.loadConversations();
        }
    }

    addMessageToUI(message, isSent) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        const emptyChat = document.getElementById('emptyChat');
        if (emptyChat) emptyChat.style.display = 'none';

        const messageElement = this.createMessageElement(message);
        container.appendChild(messageElement);
        this.scrollToBottom();
    }

    scrollToBottom() {
        const container = document.getElementById('chatMessages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    async markMessagesAsRead(conversationId) {
        console.log('تم تحديد الرسائل كمقروءة للمحادثة:', conversationId);
    }

    // ============ إدارة القصص ============
    async loadStories() {
        try {
            const storiesData = this.getLocalStorage('stories');
            if (storiesData) {
                this.stories = JSON.parse(storiesData);
            } else {
                this.stories = [
                    {
                        _id: 'story1',
                        userId: '1',
                        mediaUrl: 'https://via.placeholder.com/300x500/4361ee/ffffff?text=قصة+تعليمية',
                        caption: 'درس جديد في الرياضيات',
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    },
                    {
                        _id: 'story2',
                        userId: '2',
                        mediaUrl: 'https://via.placeholder.com/300x500/f72585/ffffff?text=نشاط+طلابي',
                        caption: 'أنشطة اليوم الدراسي',
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                ];
                this.setLocalStorage('stories', JSON.stringify(this.stories));
            }
            
            this.renderStories();
        } catch (error) {
            console.error('خطأ في تحميل القصص:', error);
        }
    }

    renderStories() {
        const container = document.getElementById('storiesContainer');
        if (!container) return;

        container.innerHTML = '';

        if (this.stories.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: rgba(255,255,255,0.7);">لا توجد قصص حالية</div>';
            return;
        }

        this.stories.forEach((story, index) => {
            const storyElement = this.createStoryElement(story, index);
            container.appendChild(storyElement);
        });
    }

    createStoryElement(story, index) {
        const user = this.allUsers.find(u => u._id === story.userId) || { fullName: 'مستخدم' };
        const div = document.createElement('div');
        div.className = 'story-item';
        
        div.innerHTML = `
            <div class="story-avatar">
                <span>${user.fullName.charAt(0)}</span>
            </div>
            <div class="story-author">${user.fullName}</div>
        `;

        div.addEventListener('click', () => this.openStoryViewer(index));
        return div;
    }

    openStoryViewer(index) {
        this.currentStoryIndex = index;
        const story = this.stories[index];
        
        if (!story) return;

        const user = this.allUsers.find(u => u._id === story.userId) || { fullName: 'مستخدم' };

        document.getElementById('currentStoryImage').src = story.mediaUrl;
        document.getElementById('storyAuthorName').textContent = user.fullName;
        document.getElementById('storyAuthorAvatar').textContent = user.fullName.charAt(0);
        document.getElementById('storyTime').textContent = this.formatTime(story.createdAt);
        
        document.getElementById('storyViewer').classList.add('active');
        this.startStoryProgress();

        this.recordStoryView(story._id);
    }

    startStoryProgress() {
        this.clearStoryProgress();
        
        const progressBars = document.getElementById('storyProgress');
        if (!progressBars) return;

        progressBars.innerHTML = '';
        
        this.stories.forEach((_, index) => {
            const progressBar = document.createElement('div');
            progressBar.className = 'story-progress-bar';
            progressBar.innerHTML = `<div class="story-progress-fill" id="progress-${index}"></div>`;
            progressBars.appendChild(progressBar);
        });

        this.animateProgressBar(this.currentStoryIndex);
        this.storyInterval = setTimeout(() => this.showNextStory(), 5000);
    }

    animateProgressBar(index) {
        const progressFill = document.getElementById(`progress-${index}`);
        if (progressFill) {
            progressFill.style.width = '100%';
            progressFill.style.transition = 'width 5s linear';
        }
    }

    clearStoryProgress() {
        if (this.storyInterval) {
            clearTimeout(this.storyInterval);
        }
        
        document.querySelectorAll('.story-progress-fill').forEach(fill => {
            fill.style.width = '0%';
            fill.style.transition = 'none';
        });
    }

    showNextStory() {
        if (this.currentStoryIndex < this.stories.length - 1) {
            this.currentStoryIndex++;
            this.openStoryViewer(this.currentStoryIndex);
        } else {
            this.closeStoryViewer();
        }
    }

    showPreviousStory() {
        if (this.currentStoryIndex > 0) {
            this.currentStoryIndex--;
            this.openStoryViewer(this.currentStoryIndex);
        }
    }

    closeStoryViewer() {
        this.clearStoryProgress();
        const storyViewer = document.getElementById('storyViewer');
        if (storyViewer) {
            storyViewer.classList.remove('active');
        }
    }

    async recordStoryView(storyId) {
        try {
            console.log('تم تسجيل مشاهدة القصة:', storyId);
        } catch (error) {
            console.error('خطأ في تسجيل مشاهدة القصة:', error);
        }
    }

    // ============ إدارة المجموعات ============
    async loadGroups() {
        try {
            const groupsData = this.getLocalStorage('groups');
            let groups = [];
            
            if (groupsData) {
                groups = JSON.parse(groupsData);
            } else {
                groups = [
                    {
                        _id: 'group1',
                        name: 'مجموعة الرياضيات',
                        description: 'مجموعة مخصصة لدراسة الرياضيات وحل المسائل',
                        creatorId: '1',
                        members: [this.currentUser?._id || 'user_1', '1', '2', '3'],
                        admins: ['1'],
                        createdAt: new Date().toISOString(),
                        isPublic: true
                    },
                    {
                        _id: 'group2',
                        name: 'مجموعة اللغة العربية',
                        description: 'مجموعة لدراسة الأدب والنحو العربي',
                        creatorId: this.currentUser?._id || 'user_1',
                        members: [this.currentUser?._id || 'user_1', '2'],
                        admins: [this.currentUser?._id || 'user_1'],
                        createdAt: new Date().toISOString(),
                        isPublic: false
                    }
                ];
                this.setLocalStorage('groups', JSON.stringify(groups));
            }
            
            this.renderGroups(groups);
        } catch (error) {
            console.error('خطأ في تحميل المجموعات:', error);
        }
    }

    renderGroups(groups) {
        const container = document.getElementById('groupsContainer');
        if (!container) return;

        container.innerHTML = '';

        if (groups.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: rgba(255,255,255,0.7);">لا توجد مجموعات</div>';
            return;
        }

        groups.forEach(group => {
            const groupElement = this.createGroupElement(group);
            container.appendChild(groupElement);
        });
    }

    createGroupElement(group) {
        const div = document.createElement('div');
        div.className = 'group-card';
        
        const isMember = group.members.includes(this.currentUser?._id);
        const memberCount = group.members.length;

        div.innerHTML = `
            <div class="group-header">
                <div class="group-avatar">
                    <i class="fas fa-users"></i>
                </div>
                <h3>${this.escapeHtml(group.name)}</h3>
                <p>${memberCount} عضو</p>
            </div>
            <div class="group-info">
                <p>${this.escapeHtml(group.description || 'لا يوجد وصف')}</p>
                <div class="group-stats">
                    <div class="group-stat">
                        <div class="group-stat-number">${group.members.length}</div>
                        <div class="group-stat-label">عضو</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3 join-group-btn" data-group-id="${group._id}">
                    <i class="fas fa-sign-in-alt"></i>
                    ${isMember ? 'الدخول' : 'الانضمام'}
                </button>
            </div>
        `;

        div.querySelector('.join-group-btn').addEventListener('click', () => {
            if (isMember) {
                this.enterGroup(group._id);
            } else {
                this.joinGroup(group._id);
            }
        });
        return div;
    }

    async joinGroup(groupId) {
        try {
            const groupsData = this.getLocalStorage('groups');
            if (!groupsData) return;
            
            let groups = JSON.parse(groupsData);
            const groupIndex = groups.findIndex(g => g._id === groupId);
            
            if (groupIndex !== -1 && !groups[groupIndex].members.includes(this.currentUser._id)) {
                groups[groupIndex].members.push(this.currentUser._id);
                this.setLocalStorage('groups', JSON.stringify(groups));
                
                this.showNotification('تم الانضمام للمجموعة بنجاح', 'success');
                await this.loadGroups();
            }
        } catch (error) {
            console.error('خطأ في الانضمام للمجموعة:', error);
            this.showNotification('خطأ في الانضمام للمجموعة', 'error');
        }
    }

    enterGroup(groupId) {
        this.showNotification('تم الدخول إلى المجموعة', 'success');
    }

    // ============ إدارة القنوات ============
    async loadChannels() {
        try {
            const channelsData = this.getLocalStorage('channels');
            let channels = [];
            
            if (channelsData) {
                channels = JSON.parse(channelsData);
            } else {
                channels = [
                    {
                        _id: 'channel1',
                        name: 'قناة العلوم',
                        description: 'قناة لبث دروس العلوم والتجارب العملية',
                        creatorId: '1',
                        subscribers: [this.currentUser?._id || 'user_1', '1', '2'],
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        _id: 'channel2',
                        name: 'قناة التاريخ',
                        description: 'قناة لبث محاضرات التاريخ والحضارات',
                        creatorId: this.currentUser?._id || 'user_1',
                        subscribers: [this.currentUser?._id || 'user_1', '3'],
                        isActive: false,
                        createdAt: new Date().toISOString()
                    }
                ];
                this.setLocalStorage('channels', JSON.stringify(channels));
            }
            
            this.renderChannels(channels);
        } catch (error) {
            console.error('خطأ في تحميل القنوات:', error);
        }
    }

    renderChannels(channels) {
        const container = document.getElementById('channelsContainer');
        if (!container) return;

        container.innerHTML = '';

        if (channels.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: rgba(255,255,255,0.7);">لا توجد قنوات</div>';
            return;
        }

        channels.forEach(channel => {
            const channelElement = this.createChannelElement(channel);
            container.appendChild(channelElement);
        });
    }

    createChannelElement(channel) {
        const div = document.createElement('div');
        div.className = 'channel-card';
        
        const isSubscribed = channel.subscribers.includes(this.currentUser?._id);
        const subscriberCount = channel.subscribers.length;

        div.innerHTML = `
            <div class="channel-header">
                <div class="channel-avatar">
                    <i class="fas fa-broadcast-tower"></i>
                </div>
                <h3>${this.escapeHtml(channel.name)}</h3>
                <p>${subscriberCount} مشترك</p>
            </div>
            <div class="channel-info">
                <p>${this.escapeHtml(channel.description || 'لا يوجد وصف')}</p>
                <div class="channel-stats">
                    <div class="channel-stat">
                        <div class="channel-stat-number">${channel.subscribers.length}</div>
                        <div class="channel-stat-label">مشترك</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3 subscribe-channel-btn" data-channel-id="${channel._id}">
                    <i class="fas fa-bell"></i>
                    ${isSubscribed ? 'مشترك' : 'اشترك'}
                </button>
            </div>
        `;

        div.querySelector('.subscribe-channel-btn').addEventListener('click', () => {
            if (isSubscribed) {
                this.enterChannel(channel._id);
            } else {
                this.subscribeChannel(channel._id);
            }
        });
        return div;
    }

    async subscribeChannel(channelId) {
        try {
            const channelsData = this.getLocalStorage('channels');
            if (!channelsData) return;
            
            let channels = JSON.parse(channelsData);
            const channelIndex = channels.findIndex(c => c._id === channelId);
            
            if (channelIndex !== -1 && !channels[channelIndex].subscribers.includes(this.currentUser._id)) {
                channels[channelIndex].subscribers.push(this.currentUser._id);
                this.setLocalStorage('channels', JSON.stringify(channels));
                
                this.showNotification('تم الاشتراك في القناة بنجاح', 'success');
                await this.loadChannels();
            }
        } catch (error) {
            console.error('خطأ في الاشتراك بالقناة:', error);
            this.showNotification('خطأ في الاشتراك بالقناة', 'error');
        }
    }

    enterChannel(channelId) {
        this.showNotification('تم الدخول إلى القناة', 'success');
    }

    // ============ إدارة الوسائط ============
    async loadMedia() {
        try {
            const mediaData = this.getLocalStorage('media');
            let media = [];
            
            if (mediaData) {
                media = JSON.parse(mediaData);
            } else {
                media = [
                    {
                        _id: 'media1',
                        name: 'درس الرياضيات',
                        type: 'video',
                        url: 'https://example.com/video1.mp4',
                        uploadedBy: '1',
                        size: '150 MB',
                        uploadedAt: new Date().toISOString()
                    },
                    {
                        _id: 'media2',
                        name: 'ملخص النحو',
                        type: 'document',
                        url: 'https://example.com/doc1.pdf',
                        uploadedBy: this.currentUser?._id || 'user_1',
                        size: '2.5 MB',
                        uploadedAt: new Date().toISOString()
                    }
                ];
                this.setLocalStorage('media', JSON.stringify(media));
            }
            
            this.renderMedia(media);
        } catch (error) {
            console.error('خطأ في تحميل الوسائط:', error);
        }
    }

    renderMedia(media) {
        const container = document.getElementById('mediaContainer');
        if (!container) return;

        container.innerHTML = '';

        if (media.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: rgba(255,255,255,0.7);">لا توجد وسائط</div>';
            return;
        }

        media.forEach(item => {
            const mediaElement = this.createMediaElement(item);
            container.appendChild(mediaElement);
        });
    }

    createMediaElement(media) {
        const div = document.createElement('div');
        div.className = 'media-item';
        
        const icon = this.getMediaIcon(media.type);
        const uploadedBy = this.allUsers.find(u => u._id === media.uploadedBy)?.fullName || 'مستخدم';

        div.innerHTML = `
            <div class="media-icon">
                <i class="${icon}"></i>
            </div>
            <div class="media-info">
                <h4 class="media-name">${media.name}</h4>
                <p class="media-meta">
                    <span>تم الرفع بواسطة: ${uploadedBy}</span>
                    <span>الحجم: ${media.size}</span>
                </p>
                <div class="media-actions">
                    <button class="btn btn-primary btn-sm" onclick="app.downloadMedia('${media._id}')">
                        <i class="fas fa-download"></i> تحميل
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="app.shareMedia('${media._id}')">
                        <i class="fas fa-share"></i> مشاركة
                    </button>
                </div>
            </div>
        `;

        return div;
    }

    getMediaIcon(type) {
        const icons = {
            'video': 'fas fa-video',
            'document': 'fas fa-file-pdf',
            'image': 'fas fa-image',
            'audio': 'fas fa-music'
        };
        return icons[type] || 'fas fa-file';
    }

    downloadMedia(mediaId) {
        this.showNotification('جاري تحميل الملف...', 'info');
    }

    shareMedia(mediaId) {
        this.showNotification('ميزة المشاركة قريباً', 'info');
    }

    // ============ لوحة التحكم ============
    async loadDashboard() {
        try {
            const stats = await this.getDashboardStats();
            this.renderDashboardStats(stats);
            
            const activities = await this.getRecentActivities();
            this.renderRecentActivities(activities);
            
        } catch (error) {
            console.error('خطأ في تحميل لوحة التحكم:', error);
        }
    }

    async getDashboardStats() {
        const conversationsData = this.getLocalStorage('conversations');
        const groupsData = this.getLocalStorage('groups');
        const channelsData = this.getLocalStorage('channels');
        const mediaData = this.getLocalStorage('media');
        
        const conversations = conversationsData ? JSON.parse(conversationsData) : [];
        const groups = groupsData ? JSON.parse(groupsData) : [];
        const channels = channelsData ? JSON.parse(channelsData) : [];
        const media = mediaData ? JSON.parse(mediaData) : [];
        
        return {
            conversations: conversations.length,
            groups: groups.length,
            channels: channels.length,
            media: media.length,
            unreadMessages: 0
        };
    }

    renderDashboardStats(stats) {
        const statsContainer = document.getElementById('dashboardStats');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-number">${stats.conversations}</div>
                    <div class="stat-label">محادثة</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-number">${stats.groups}</div>
                    <div class="stat-label">مجموعة</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-broadcast-tower"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-number">${stats.channels}</div>
                    <div class="stat-label">قناة</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-file"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-number">${stats.media}</div>
                    <div class="stat-label">ملف وسائط</div>
                </div>
            </div>
        `;
    }

    async getRecentActivities() {
        const conversationsData = this.getLocalStorage('conversations');
        const groupsData = this.getLocalStorage('groups');
        const channelsData = this.getLocalStorage('channels');
        
        const conversations = conversationsData ? JSON.parse(conversationsData) : [];
        const groups = groupsData ? JSON.parse(groupsData) : [];
        const channels = channelsData ? JSON.parse(channelsData) : [];
        
        let activities = [];
        
        conversations.slice(0, 5).forEach(conv => {
            if (conv.lastMessage) {
                activities.push({
                    type: 'message',
                    content: `رسالة جديدة في محادثة ${conv.name}`,
                    time: conv.lastMessage.createdAt,
                    icon: 'fas fa-comment'
                });
            }
        });
        
        groups.slice(0, 3).forEach(group => {
            activities.push({
                type: 'group',
                content: `تم إنشاء مجموعة ${group.name}`,
                time: group.createdAt,
                icon: 'fas fa-users'
            });
        });
        
        channels.slice(0, 2).forEach(channel => {
            activities.push({
                type: 'channel',
                content: `تم إنشاء قناة ${channel.name}`,
                time: channel.createdAt,
                icon: 'fas fa-broadcast-tower'
            });
        });
        
        return activities.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);
    }

    renderRecentActivities(activities) {
        const container = document.getElementById('recentActivities');
        if (!container) return;

        container.innerHTML = '';

        if (activities.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: rgba(255,255,255,0.7);">لا توجد نشاطات حديثة</div>';
            return;
        }

        activities.forEach(activity => {
            const activityElement = this.createActivityElement(activity);
            container.appendChild(activityElement);
        });
    }

    createActivityElement(activity) {
        const div = document.createElement('div');
        div.className = 'activity-item';
        
        div.innerHTML = `
            <div class="activity-icon">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <p>${activity.content}</p>
                <span class="activity-time">${this.formatTime(activity.time)}</span>
            </div>
        `;

        return div;
    }

    // ============ المصادقة ============
    setupLoginForm() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }
    }

    setupRegisterForm() {
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const email = formData.get('email');
        const password = formData.get('password');

        if (!email || !password) {
            this.showNotification('يرجى ملء جميع الحقول', 'error');
            return;
        }

        try {
            const usersData = this.getLocalStorage('users');
            if (!usersData) {
                this.showNotification('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'error');
                return;
            }

            const users = JSON.parse(usersData);
            const user = users.find(u => u.email === email && u.password === password);
            
            if (!user) {
                this.showNotification('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'error');
                return;
            }

            this.currentUser = user;
            this.setLocalStorage('authToken', 'local-token-' + Date.now());
            this.setLocalStorage('currentUser', JSON.stringify(user));

            this.showNotification('تم تسجيل الدخول بنجاح!', 'success');
            this.showAuthenticatedUI();
            this.navigateToPage('dashboard');
            
            await this.loadInitialData();

        } catch (error) {
            console.error('خطأ في تسجيل الدخول:', error);
            this.showNotification('حدث خطأ أثناء تسجيل الدخول', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const fullName = formData.get('fullName');
        const email = formData.get('email');
        const password = formData.get('password');
        const role = formData.get('role');

        if (!fullName || !email || !password) {
            this.showNotification('يرجى ملء جميع الحقول', 'error');
            return;
        }

        try {
            const usersData = this.getLocalStorage('users');
            const users = usersData ? JSON.parse(usersData) : [];

            const existingUser = users.find(u => u.email === email);
            if (existingUser) {
                this.showNotification('البريد الإلكتروني مستخدم مسبقاً', 'error');
                return;
            }

            const newUser = {
                _id: 'user_' + Date.now(),
                fullName: fullName,
                email: email,
                password: password,
                role: role || 'student',
                createdAt: new Date().toISOString(),
                isOnline: true
            };

            users.push(newUser);
            this.setLocalStorage('users', JSON.stringify(users));

            this.currentUser = newUser;
            this.setLocalStorage('authToken', 'local-token-' + Date.now());
            this.setLocalStorage('currentUser', JSON.stringify(newUser));

            this.showNotification('تم إنشاء الحساب بنجاح!', 'success');
            this.showAuthenticatedUI();
            this.navigateToPage('dashboard');
            
            await this.loadInitialData();

        } catch (error) {
            console.error('خطأ في إنشاء الحساب:', error);
            this.showNotification('حدث خطأ أثناء إنشاء الحساب', 'error');
        }
    }

    handleLogout() {
        this.currentUser = null;
        this.removeLocalStorage('authToken');
        this.removeLocalStorage('currentUser');
        
        this.showUnauthenticatedUI();
        this.navigateToPage('home');
        this.showNotification('تم تسجيل الخروج بنجاح', 'success');
    }

    // ============ أدوات مساعدة ============
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;

        // إضافة الأنماط إذا لم تكن موجودة
        if (!document.getElementById('notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    background: white;
                    border-radius: 12px;
                    padding: 20px 25px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    z-index: 10000;
                    animation: slideInRight 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    min-width: 300px;
                    max-width: 400px;
                    border-left: 4px solid #4361ee;
                }
                .notification.success {
                    border-left-color: #4caf50;
                }
                .notification.error {
                    border-left-color: #f44336;
                }
                .notification.warning {
                    border-left-color: #ff9800;
                }
                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .notification-close {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #666;
                    padding: 5px;
                    border-radius: 50%;
                }
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(notification);

        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'الآن';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        if (diffDays < 7) return `منذ ${diffDays} يوم`;
        
        return date.toLocaleDateString('ar-SA');
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 تم تحميل DOM، بدء التطبيق...');
    window.app = new EducationalPlatform();
});
