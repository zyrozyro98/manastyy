// public/js/app.js - الملف الرئيسي للتطبيق الكامل (محدث ومصحح)
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
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة المنصة التعليمية...');
        
        try {
            // إعداد مستمعي الأحداث أولاً
            this.setupEventListeners();
            
            // ثم التحقق من المصادقة
            await this.checkAuthentication();
            
            // تهيئة المكونات الأخرى
            this.initializeSocket();
            await this.loadInitialData();
            
            this.isInitialized = true;
            console.log('✅ تم تهيئة المنصة التعليمية بنجاح');
        } catch (error) {
            console.error('❌ خطأ في تهيئة التطبيق:', error);
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
                
                // التحقق من صحة التوكن
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
            // في النظام المحلي، نتحقق من وجود المستخدم في التخزين المحلي
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

    // ============ إدارة الواجهة ============
    showAuthenticatedUI() {
        const userInfo = document.getElementById('userInfo');
        const logoutBtn = document.getElementById('logoutBtn');
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');

        if (userInfo) userInfo.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (loginBtn) loginBtn.classList.add('hidden');
        if (registerBtn) registerBtn.classList.add('hidden');
        
        // تحديث بيانات المستخدم
        if (this.currentUser) {
            const userNameDisplay = document.getElementById('userNameDisplay');
            const userRoleDisplay = document.getElementById('userRoleDisplay');
            const userAvatarText = document.getElementById('userAvatarText');
            
            if (userNameDisplay) userNameDisplay.textContent = this.currentUser.fullName || 'مستخدم';
            if (userRoleDisplay) userRoleDisplay.textContent = this.currentUser.role || 'طالب';
            if (userAvatarText) userAvatarText.textContent = (this.currentUser.fullName || 'م').charAt(0);
        }
    }

    showUnauthenticatedUI() {
        const userInfo = document.getElementById('userInfo');
        const logoutBtn = document.getElementById('logoutBtn');
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');

        if (userInfo) userInfo.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (registerBtn) registerBtn.classList.remove('hidden');
    }

    navigateToPage(pageName) {
        console.log(`🔄 الانتقال إلى صفحة: ${pageName}`);
        
        // إخفاء جميع الصفحات
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // إظهار الصفحة المطلوبة
        const targetPage = document.getElementById(`${pageName}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            
            // تحميل محتوى الصفحة الديناميكي
            this.loadPageContent(pageName);
        } else {
            console.error(`❌ الصفحة غير موجودة: ${pageName}-page`);
        }

        // تحديث حالة التنقل
        this.updateNavigationState(pageName);
        
        // إخفاء القائمة المتنقلة
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
        }
    }

    // ============ إعداد مستمعي الأحداث ============
    setupEventListeners() {
        console.log('🔧 إعداد مستمعي الأحداث...');
        
        // التنقل بين الصفحات
        document.querySelectorAll('[data-page]').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                const pageName = element.getAttribute('data-page');
                console.log(`📱 نقر على: ${pageName}`);
                this.navigateToPage(pageName);
            });
        });

        // زر ابدأ الآن
        const startAppBtn = document.getElementById('startAppBtn');
        if (startAppBtn) {
            startAppBtn.addEventListener('click', () => {
                console.log('🎯 نقر على زر ابدأ الآن');
                this.startApp();
            });
        } else {
            console.error('❌ زر ابدأ الآن غير موجود');
        }

        // المصادقة
        this.setupAuthEventListeners();

        // الدردشة
        this.setupChatEventListeners();

        // القصص
        this.setupStoriesEventListeners();

        // المجموعات والقنوات
        this.setupGroupsChannelsEventListeners();

        // الأزرار الإضافية
        this.setupUtilityEventListeners();

        console.log('✅ تم إعداد مستمعي الأحداث بنجاح');
    }

    setupAuthEventListeners() {
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm')?.addEventListener('submit', (e) => this.handleRegister(e));
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
    }

    setupChatEventListeners() {
        document.getElementById('sendMessageBtn')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('emojiToggle')?.addEventListener('click', () => this.toggleEmojiPicker());
        document.getElementById('attachFileBtn')?.addEventListener('click', () => this.triggerFileInput());
        document.getElementById('fileInput')?.addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('chatToggle')?.addEventListener('click', () => this.toggleChatSidebar());
        document.getElementById('chatToggleMain')?.addEventListener('click', () => this.toggleChatSidebar());

        // إدخال الدردشة
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('input', () => this.handleTyping());
            chatInput.addEventListener('blur', () => this.stopTyping());
        }
    }

    setupStoriesEventListeners() {
        document.getElementById('storyClose')?.addEventListener('click', () => this.closeStoryViewer());
        document.getElementById('storyPrev')?.addEventListener('click', () => this.showPreviousStory());
        document.getElementById('storyNext')?.addEventListener('click', () => this.showNextStory());
        document.getElementById('createStoryBtn')?.addEventListener('click', () => this.showCreateStoryModal());
    }

    setupGroupsChannelsEventListeners() {
        // المجموعات
        document.getElementById('createGroupBtn')?.addEventListener('click', () => this.showCreateGroupModal());
        document.getElementById('createGroupForm')?.addEventListener('submit', (e) => this.createGroup(e));
        document.getElementById('closeGroupModal')?.addEventListener('click', () => this.hideCreateGroupModal());
        document.getElementById('cancelGroupBtn')?.addEventListener('click', () => this.hideCreateGroupModal());

        // القنوات
        document.getElementById('createChannelBtn')?.addEventListener('click', () => this.showCreateChannelModal());
        document.getElementById('createChannelForm')?.addEventListener('submit', (e) => this.createChannel(e));
        document.getElementById('closeChannelModal')?.addEventListener('click', () => this.hideCreateChannelModal());
        document.getElementById('cancelChannelBtn')?.addEventListener('click', () => this.hideCreateChannelModal());
    }

    setupUtilityEventListeners() {
        // الأزرار الإضافية
        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('overlay')?.addEventListener('click', () => this.closeMobileMenu());
        document.getElementById('floatingActionBtn')?.addEventListener('click', () => this.toggleQuickActions());
        document.getElementById('reloadBtn')?.addEventListener('click', () => location.reload());

        // إغلاق منتقي الإيموجي عند النقر خارجها
        document.addEventListener('click', (e) => {
            const emojiContainer = document.getElementById('emojiPickerContainer');
            const emojiToggle = document.getElementById('emojiToggle');
            
            if (emojiContainer && !e.target.closest('#emojiPickerContainer') && !e.target.closest('#emojiToggle')) {
                emojiContainer.classList.remove('active');
            }
        });

        // إغلاق النماذج عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
    }

    // ============ دوال التطبيق الرئيسية ============
    startApp() {
        console.log('🎬 بدء التطبيق...');
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            console.log('✅ تم إخفاء شاشة الترحيب');
        } else {
            console.error('❌ شاشة الترحيب غير موجودة');
        }
        
        this.navigateToPage('home');
        this.showNotification('مرحباً بك في المنصة التعليمية!', 'success');
    }

    toggleMobileMenu() {
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('overlay');
        
        if (mobileMenu && overlay) {
            mobileMenu.classList.toggle('active');
            overlay.classList.toggle('active');
        }
    }

    closeMobileMenu() {
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('overlay');
        
        if (mobileMenu && overlay) {
            mobileMenu.classList.remove('active');
            overlay.classList.remove('active');
        }
    }

    toggleQuickActions() {
        const quickActions = document.getElementById('quickActionsBar');
        if (quickActions) {
            quickActions.classList.toggle('active');
        }
    }

    toggleChatSidebar() {
        const chatSidebar = document.getElementById('chatSidebar');
        if (chatSidebar) {
            chatSidebar.classList.toggle('active');
        }
    }

    // ============ إدارة الدردشة ============
    initializeSocket() {
        // في النظام المحلي، نستخدم نظام events بديل عن WebSockets
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
                // إنشاء بيانات تجريبية إذا لم توجد
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
                        participants: [this.currentUser._id, '1'],
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
                        participants: [this.currentUser._id, '2'],
                        name: 'فاطمة علي',
                        lastMessage: {
                            content: 'شكراً على المساعدة',
                            senderId: this.currentUser._id,
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
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد محادثات</div>';
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
        const unreadCount = conversation.unreadCount && conversation.unreadCount[this.currentUser._id] 
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

        // إزالة زر إنشاء محادثة إذا كان موجوداً
        const existingButton = document.getElementById('newChatBtn');
        if (existingButton) {
            existingButton.remove();
        }

        // إنشاء زر جديد
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
                                .filter(user => user._id !== this.currentUser._id)
                                .map(user => `
                                <div class="user-item" data-user-id="${user._id}" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">
                                    <div class="user-avatar" style="width: 40px; height: 40px; background: #4361ee; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin-left: 10px;">
                                        ${user.fullName.charAt(0)}
                                    </div>
                                    <div>
                                        <div style="font-weight: bold;">${user.fullName}</div>
                                        <div style="font-size: 0.8rem; color: #666;">${user.role}</div>
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

        // إضافة مستمعي الأحداث
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#cancelNewChat').addEventListener('click', () => modal.remove());
        
        // اختيار مستخدم
        modal.querySelectorAll('.user-item').forEach(item => {
            item.addEventListener('click', async () => {
                const userId = item.dataset.userId;
                await this.startNewChat(userId);
                modal.remove();
            });
        });

        // إغلاق عند النقر خارج المحتوى
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

            // إنشاء محادثة جديدة
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

            // حفظ المحادثة
            const conversationsData = this.getLocalStorage('conversations');
            let conversations = conversationsData ? JSON.parse(conversationsData) : [];
            conversations.push(conversation);
            this.setLocalStorage('conversations', JSON.stringify(conversations));

            this.showNotification('تم بدء المحادثة بنجاح', 'success');
            await this.loadConversations();
            
            // تحديد المحادثة الجديدة
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

        // تحديث الواجهة
        document.getElementById('activeChatName').textContent = this.currentChat.name;
        document.getElementById('activeChatAvatar').textContent = this.currentChat.name.charAt(0);
        document.getElementById('activeChatStatus').textContent = 'متصل';
        
        const chatInputContainer = document.getElementById('chatInputContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (chatInputContainer) chatInputContainer.style.display = 'flex';
        if (emptyChat) emptyChat.style.display = 'none';

        // تحميل الرسائل
        this.loadMessages(conversationId);
        
        // تحديث حالة المحادثة النشطة
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeConversation = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (activeConversation) {
            activeConversation.classList.add('active');
        }

        // إعلام السيرفر بأن الرسائل قُرأت
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
            // إضافة الرسالة للواجهة مباشرة
            this.addMessageToUI(messageData, true);

            input.value = '';

            // حفظ الرسالة في التخزين المحلي
            const messagesData = this.getLocalStorage('messages') || '{}';
            const messages = JSON.parse(messagesData);
            
            if (!messages[this.currentChat._id]) {
                messages[this.currentChat._id] = [];
            }
            
            messages[this.currentChat._id].push(messageData);
            this.setLocalStorage('messages', JSON.stringify(messages));

            // تحديث آخر رسالة في المحادثة
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
            
            // تحديث الواجهة
            this.loadConversations();
        }
    }

    addMessageToUI(message, isSent) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        // إخفاء empty chat إذا كان ظاهر
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

    handleTyping() {
        // تنفيذ بسيط لمؤشر الكتابة
        console.log('المستخدم يكتب...');
    }

    stopTyping() {
        console.log('توقف المستخدم عن الكتابة');
    }

    async markMessagesAsRead(conversationId) {
        // في النظام المحلي، يمكننا تحديث حالة القراءة
        console.log('تم تحديد الرسائل كمقروءة للمحادثة:', conversationId);
    }

    // ============ إدارة القصص ============
    async loadStories() {
        try {
            const storiesData = this.getLocalStorage('stories');
            if (storiesData) {
                this.stories = JSON.parse(storiesData);
            } else {
                // إنشاء قصص تجريبية
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
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد قصص حالية</div>';
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

        // تسجيل المشاهدة
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

    showCreateStoryModal() {
        this.showNotification('ميزة إنشاء القصص قريباً', 'info');
    }

    // ============ إدارة المجموعات ============
    async loadGroups() {
        try {
            const groupsData = this.getLocalStorage('groups');
            let groups = [];
            
            if (groupsData) {
                groups = JSON.parse(groupsData);
            } else {
                // إنشاء مجموعات تجريبية
                groups = [
                    {
                        _id: 'group1',
                        name: 'مجموعة الرياضيات',
                        description: 'مجموعة مخصصة لدراسة الرياضيات وحل المسائل',
                        creatorId: '1',
                        members: [this.currentUser._id, '1', '2', '3'],
                        admins: ['1'],
                        createdAt: new Date().toISOString(),
                        isPublic: true
                    },
                    {
                        _id: 'group2',
                        name: 'مجموعة اللغة العربية',
                        description: 'مجموعة لدراسة الأدب والنحو العربي',
                        creatorId: this.currentUser._id,
                        members: [this.currentUser._id, '2'],
                        admins: [this.currentUser._id],
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
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد مجموعات</div>';
            return;
        }

        groups.forEach(group => {
            const groupElement = this.createGroupElement(group);
            container.appendChild(groupElement);
        });
    }

    createGroupElement(group) {
        const div = document.createElement('div');
        div.className = 'group-item';
        
        const isAdmin = group.admins.includes(this.currentUser._id);
        const memberCount = group.members.length;

        div.innerHTML = `
            <div class="group-header">
                <div class="group-avatar">
                    <span>${group.name.charAt(0)}</span>
                </div>
                <div class="group-info">
                    <h3 class="group-name">${group.name}</h3>
                    <p class="group-description">${group.description}</p>
                    <div class="group-meta">
                        <span class="group-members">
                            <i class="fas fa-users"></i> ${memberCount} عضو
                        </span>
                        ${isAdmin ? '<span class="group-admin-badge">مدير</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="group-actions">
                <button class="btn btn-primary btn-sm" onclick="app.joinGroup('${group._id}')">
                    <i class="fas fa-door-open"></i> الانضمام
                </button>
                ${isAdmin ? `
                    <button class="btn btn-outline btn-sm" onclick="app.manageGroup('${group._id}')">
                        <i class="fas fa-cog"></i> إدارة
                    </button>
                ` : ''}
            </div>
        `;

        return div;
    }

    showCreateGroupModal() {
        document.getElementById('createGroupModal').style.display = 'flex';
    }

    hideCreateGroupModal() {
        document.getElementById('createGroupModal').style.display = 'none';
    }

    async createGroup(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const name = formData.get('name');
        const description = formData.get('description');
        const isPublic = formData.get('privacy') === 'public';

        if (!name) {
            this.showNotification('يرجى إدخال اسم المجموعة', 'error');
            return;
        }

        try {
            const group = {
                _id: 'group_' + Date.now(),
                name: name,
                description: description || '',
                creatorId: this.currentUser._id,
                members: [this.currentUser._id],
                admins: [this.currentUser._id],
                createdAt: new Date().toISOString(),
                isPublic: isPublic
            };

            // حفظ المجموعة
            const groupsData = this.getLocalStorage('groups');
            let groups = groupsData ? JSON.parse(groupsData) : [];
            groups.push(group);
            this.setLocalStorage('groups', JSON.stringify(groups));

            this.showNotification('تم إنشاء المجموعة بنجاح', 'success');
            this.hideCreateGroupModal();
            e.target.reset();
            
            await this.loadGroups();

        } catch (error) {
            console.error('خطأ في إنشاء المجموعة:', error);
            this.showNotification('خطأ في إنشاء المجموعة', 'error');
        }
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

    manageGroup(groupId) {
        this.showNotification('صفحة إدارة المجموعة قريباً', 'info');
    }

    // ============ إدارة القنوات ============
    async loadChannels() {
        try {
            const channelsData = this.getLocalStorage('channels');
            let channels = [];
            
            if (channelsData) {
                channels = JSON.parse(channelsData);
            } else {
                // إنشاء قنوات تجريبية
                channels = [
                    {
                        _id: 'channel1',
                        name: 'قناة العلوم',
                        description: 'قناة لبث دروس العلوم والتجارب العملية',
                        creatorId: '1',
                        subscribers: [this.currentUser._id, '1', '2'],
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        _id: 'channel2',
                        name: 'قناة التاريخ',
                        description: 'قناة لبث محاضرات التاريخ والحضارات',
                        creatorId: this.currentUser._id,
                        subscribers: [this.currentUser._id, '3'],
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
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد قنوات</div>';
            return;
        }

        channels.forEach(channel => {
            const channelElement = this.createChannelElement(channel);
            container.appendChild(channelElement);
        });
    }

    createChannelElement(channel) {
        const div = document.createElement('div');
        div.className = 'channel-item';
        
        const isSubscribed = channel.subscribers.includes(this.currentUser._id);
        const isCreator = channel.creatorId === this.currentUser._id;
        const subscriberCount = channel.subscribers.length;

        div.innerHTML = `
            <div class="channel-header">
                <div class="channel-avatar ${channel.isActive ? 'live' : ''}">
                    <span>${channel.name.charAt(0)}</span>
                    ${channel.isActive ? '<div class="live-indicator">مباشر</div>' : ''}
                </div>
                <div class="channel-info">
                    <h3 class="channel-name">${channel.name}</h3>
                    <p class="channel-description">${channel.description}</p>
                    <div class="channel-meta">
                        <span class="channel-subscribers">
                            <i class="fas fa-users"></i> ${subscriberCount} مشترك
                        </span>
                        ${isCreator ? '<span class="channel-creator-badge">مالك القناة</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="channel-actions">
                ${isSubscribed ? `
                    <button class="btn btn-outline btn-sm" onclick="app.unsubscribeChannel('${channel._id}')">
                        <i class="fas fa-bell-slash"></i> إلغاء الاشتراك
                    </button>
                ` : `
                    <button class="btn btn-primary btn-sm" onclick="app.subscribeChannel('${channel._id}')">
                        <i class="fas fa-bell"></i> اشتراك
                    </button>
                `}
                ${isCreator ? `
                    <button class="btn btn-outline btn-sm" onclick="app.manageChannel('${channel._id}')">
                        <i class="fas fa-cog"></i> إدارة
                    </button>
                ` : ''}
            </div>
        `;

        return div;
    }

    showCreateChannelModal() {
        document.getElementById('createChannelModal').style.display = 'flex';
    }

    hideCreateChannelModal() {
        document.getElementById('createChannelModal').style.display = 'none';
    }

    async createChannel(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const name = formData.get('name');
        const description = formData.get('description');

        if (!name) {
            this.showNotification('يرجى إدخال اسم القناة', 'error');
            return;
        }

        try {
            const channel = {
                _id: 'channel_' + Date.now(),
                name: name,
                description: description || '',
                creatorId: this.currentUser._id,
                subscribers: [this.currentUser._id],
                isActive: false,
                createdAt: new Date().toISOString()
            };

            // حفظ القناة
            const channelsData = this.getLocalStorage('channels');
            let channels = channelsData ? JSON.parse(channelsData) : [];
            channels.push(channel);
            this.setLocalStorage('channels', JSON.stringify(channels));

            this.showNotification('تم إنشاء القناة بنجاح', 'success');
            this.hideCreateChannelModal();
            e.target.reset();
            
            await this.loadChannels();

        } catch (error) {
            console.error('خطأ في إنشاء القناة:', error);
            this.showNotification('خطأ في إنشاء القناة', 'error');
        }
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

    async unsubscribeChannel(channelId) {
        try {
            const channelsData = this.getLocalStorage('channels');
            if (!channelsData) return;
            
            let channels = JSON.parse(channelsData);
            const channelIndex = channels.findIndex(c => c._id === channelId);
            
            if (channelIndex !== -1) {
                channels[channelIndex].subscribers = channels[channelIndex].subscribers.filter(
                    id => id !== this.currentUser._id
                );
                this.setLocalStorage('channels', JSON.stringify(channels));
                
                this.showNotification('تم إلغاء الاشتراك من القناة', 'success');
                await this.loadChannels();
            }
        } catch (error) {
            console.error('خطأ في إلغاء الاشتراك:', error);
            this.showNotification('خطأ في إلغاء الاشتراك', 'error');
        }
    }

    manageChannel(channelId) {
        this.showNotification('صفحة إدارة القناة قريباً', 'info');
    }

    // ============ إدارة الوسائط ============
    async loadMedia() {
        try {
            const mediaData = this.getLocalStorage('media');
            let media = [];
            
            if (mediaData) {
                media = JSON.parse(mediaData);
            } else {
                // إنشاء وسائط تجريبية
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
                        uploadedBy: this.currentUser._id,
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
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد وسائط</div>';
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
            // تحميل الإحصائيات
            const stats = await this.getDashboardStats();
            this.renderDashboardStats(stats);
            
            // تحميل النشاطات الحديثة
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
            unreadMessages: 0 // يمكن إضافة منطق لحساب الرسائل غير المقروءة
        };
    }

    renderDashboardStats(stats) {
        const statsContainer = document.getElementById('dashboardStats');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(67, 97, 238, 0.1);">
                    <i class="fas fa-comments" style="color: #4361ee;"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.conversations}</h3>
                    <p>محادثة</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(247, 37, 133, 0.1);">
                    <i class="fas fa-users" style="color: #f72585;"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.groups}</h3>
                    <p>مجموعة</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(76, 201, 240, 0.1);">
                    <i class="fas fa-satellite-dish" style="color: #4cc9f0;"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.channels}</h3>
                    <p>قناة</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(106, 76, 147, 0.1);">
                    <i class="fas fa-file" style="color: #6a4c93;"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.media}</h3>
                    <p>ملف وسائط</p>
                </div>
            </div>
        `;
    }

    async getRecentActivities() {
        // جمع النشاطات من مختلف المصادر
        const conversationsData = this.getLocalStorage('conversations');
        const groupsData = this.getLocalStorage('groups');
        const channelsData = this.getLocalStorage('channels');
        
        const conversations = conversationsData ? JSON.parse(conversationsData) : [];
        const groups = groupsData ? JSON.parse(groupsData) : [];
        const channels = channelsData ? JSON.parse(channelsData) : [];
        
        let activities = [];
        
        // إضافة آخر المحادثات النشطة
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
        
        // إضافة المجموعات المنشأة حديثاً
        groups.slice(0, 3).forEach(group => {
            activities.push({
                type: 'group',
                content: `تم إنشاء مجموعة ${group.name}`,
                time: group.createdAt,
                icon: 'fas fa-users'
            });
        });
        
        // إضافة القنوات المنشأة حديثاً
        channels.slice(0, 2).forEach(channel => {
            activities.push({
                type: 'channel',
                content: `تم إنشاء قناة ${channel.name}`,
                time: channel.createdAt,
                icon: 'fas fa-satellite-dish'
            });
        });
        
        // ترتيب حسب الوقت
        return activities.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);
    }

    renderRecentActivities(activities) {
        const container = document.getElementById('recentActivities');
        if (!container) return;

        container.innerHTML = '';

        if (activities.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد نشاطات حديثة</div>';
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

            // تسجيل الدخول الناجح
            this.currentUser = user;
            this.setLocalStorage('authToken', 'local-token-' + Date.now());
            this.setLocalStorage('currentUser', JSON.stringify(user));

            this.showNotification('تم تسجيل الدخول بنجاح!', 'success');
            this.showAuthenticatedUI();
            this.navigateToPage('dashboard');
            
            // إعادة تحميل البيانات
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

            // التحقق من وجود المستخدم مسبقاً
            const existingUser = users.find(u => u.email === email);
            if (existingUser) {
                this.showNotification('البريد الإلكتروني مستخدم مسبقاً', 'error');
                return;
            }

            // إنشاء مستخدم جديد
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

            // تسجيل الدخول تلقائياً
            this.currentUser = newUser;
            this.setLocalStorage('authToken', 'local-token-' + Date.now());
            this.setLocalStorage('currentUser', JSON.stringify(newUser));

            this.showNotification('تم إنشاء الحساب بنجاح!', 'success');
            this.showAuthenticatedUI();
            this.navigateToPage('dashboard');
            
            // إعادة تحميل البيانات
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

        document.body.appendChild(notification);

        // إضافة مستمعي الأحداث
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        // إزالة تلقائية بعد 5 ثواني
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

    toggleEmojiPicker() {
        const emojiContainer = document.getElementById('emojiPickerContainer');
        if (!emojiContainer) return;

        emojiContainer.classList.toggle('active');
        
        if (emojiContainer.classList.contains('active')) {
            this.loadEmojiPicker();
        }
    }

    loadEmojiPicker() {
        const emojiContainer = document.getElementById('emojiPickerContainer');
        if (!emojiContainer) return;

        // إيموجيات بسيطة
        const emojis = ['😀', '😂', '🥰', '😎', '🤔', '👍', '❤️', '🔥', '✨', '🎉'];
        
        emojiContainer.innerHTML = emojis.map(emoji => `
            <span class="emoji" onclick="app.insertEmoji('${emoji}')">${emoji}</span>
        `).join('');
    }

    insertEmoji(emoji) {
        const input = document.getElementById('chatInput');
        if (input) {
            input.value += emoji;
            input.focus();
        }
        
        document.getElementById('emojiPickerContainer').classList.remove('active');
    }

    triggerFileInput() {
        document.getElementById('fileInput').click();
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        // هنا يمكن إضافة منطق رفع الملفات
        this.showNotification(`تم اختيار الملف: ${file.name}`, 'info');
        
        // إعادة تعيين المدخل
        e.target.value = '';
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 تم تحميل DOM، بدء التطبيق...');
    window.app = new EducationalPlatform();
});

// إضافة الأنماط الأساسية للإشعارات
const notificationStyles = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border-radius: 8px;
    padding: 15px 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border-left: 4px solid #4361ee;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 300px;
    max-width: 400px;
    animation: slideInRight 0.3s ease;
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
    gap: 10px;
}

.notification-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #666;
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

// إضافة الأنماط للصفحة
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);
