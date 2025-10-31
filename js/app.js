// public/js/app.js - الملف الرئيسي للتطبيق الكامل (محدث ومصلح)
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
        const token = localStorage.getItem('authToken');
        const userData = localStorage.getItem('currentUser');

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
            const response = await fetch('/api/users/me', {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('خطأ في التحقق من التوكن:', error);
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
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('🔐 لا يوجد توكن للمصادقة، تخطي تهيئة السوكت');
            return;
        }

        try {
            this.socket = io({
                auth: {
                    token: token
                }
            });

            this.socket.on('connect', () => {
                console.log('✅ متصل بالسيرفر');
                this.updateConnectionStatus(true);
                this.showNotification('متصل بالخادم', 'success');
            });

            this.socket.on('disconnect', () => {
                console.log('❌ تم قطع الاتصال');
                this.updateConnectionStatus(false);
                this.showNotification('تم قطع الاتصال بالخادم', 'error');
            });

            this.socket.on('new_message', (data) => {
                this.receiveMessage(data);
            });

            this.socket.on('user_typing', (data) => {
                this.showTypingIndicator(data);
            });

            this.socket.on('user_status_changed', (data) => {
                this.updateUserStatus(data);
            });

            this.socket.on('authenticated', (data) => {
                console.log('🔓 تمت المصادقة عبر السوكت');
            });

            this.socket.on('error', (data) => {
                console.error('❌ خطأ في السوكت:', data);
                this.showNotification(data.message || 'خطأ في الاتصال', 'error');
            });

        } catch (error) {
            console.error('❌ خطأ في تهيئة السوكت:', error);
        }
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
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.allUsers = data.data?.users || [];
            } else {
                console.error('فشل في تحميل المستخدمين:', response.status);
            }
        } catch (error) {
            console.error('خطأ في تحميل المستخدمين:', error);
        }
    }

    async loadConversations() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch('/api/chat/conversations', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderConversations(data.data?.conversations || []);
            } else {
                console.error('فشل في تحميل المحادثات:', response.status);
            }
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
                <div class="conversation-time">${this.formatTime(conversation.updatedAt)}</div>
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
                            ${this.allUsers.filter(user => user._id !== this.currentUser._id).map(user => `
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
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/chat/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    participantId: userId
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.showNotification('تم بدء المحادثة بنجاح', 'success');
                await this.loadConversations();
                
                // تحديد المحادثة الجديدة
                if (data.data.conversation) {
                    this.selectConversation(data.data.conversation._id);
                }
            } else {
                this.showNotification('فشل في بدء المحادثة', 'error');
            }
        } catch (error) {
            console.error('خطأ في بدء المحادثة:', error);
            this.showNotification('خطأ في بدء المحادثة', 'error');
        }
    }

    selectConversation(conversationId) {
        this.currentChat = this.conversations.get(conversationId);
        if (!this.currentChat) return;

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
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch(`/api/chat/conversations/${conversationId}/messages?limit=50`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderMessages(data.data?.messages || []);
            } else {
                console.error('فشل في تحميل الرسائل:', response.status);
            }
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
                    <i class="fas fa-${message.readBy && message.readBy.length > 1 ? 'check-double' : 'check'}"></i>
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
            content: content,
            conversationId: this.currentChat._id,
            type: 'text'
        };

        try {
            // إضافة الرسالة للواجهة مباشرة
            this.addMessageToUI({
                ...messageData,
                _id: 'temp-' + Date.now(),
                senderId: this.currentUser._id,
                createdAt: new Date().toISOString(),
                readBy: [this.currentUser._id]
            }, true);

            input.value = '';

            // إرسال الرسالة عبر السوكيت
            if (this.socket) {
                this.socket.emit('send_message', messageData);
            }

        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.showNotification('فشل في إرسال الرسالة', 'error');
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

    receiveMessage(data) {
        if (this.currentChat && data.conversationId === this.currentChat._id) {
            this.addMessageToUI(data.message, false);
        }
        
        // تحديث عدد الرسائل غير المقروءة
        this.updateUnreadCount();
    }

    scrollToBottom() {
        const container = document.getElementById('chatMessages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    handleTyping() {
        if (this.currentChat && this.socket) {
            this.socket.emit('typing_start', {
                conversationId: this.currentChat._id
            });
        }
    }

    stopTyping() {
        if (this.currentChat && this.socket) {
            this.socket.emit('typing_stop', {
                conversationId: this.currentChat._id
            });
        }
    }

    showTypingIndicator(data) {
        // تنفيذ مؤشر الكتابة
        console.log('المستخدم يكتب:', data);
    }

    async markMessagesAsRead(conversationId) {
        if (this.socket) {
            this.socket.emit('mark_messages_read', { conversationId });
        }
    }

    // ============ إدارة القصص ============
    async loadStories() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch('/api/stories', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.stories = data.data?.stories || [];
                this.renderStories();
            } else {
                console.error('فشل في تحميل القصص:', response.status);
            }
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
        const div = document.createElement('div');
        div.className = 'story-item';
        
        div.innerHTML = `
            <div class="story-avatar">
                <span>${story.userId.charAt(0)}</span>
            </div>
            <div class="story-author">قصة ${index + 1}</div>
        `;

        div.addEventListener('click', () => this.openStoryViewer(index));
        return div;
    }

    openStoryViewer(index) {
        this.currentStoryIndex = index;
        const story = this.stories[index];
        
        if (!story) return;

        document.getElementById('currentStoryImage').src = story.mediaUrl;
        document.getElementById('storyAuthorName').textContent = 'مستخدم';
        document.getElementById('storyAuthorAvatar').textContent = story.userId.charAt(0);
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
            const token = localStorage.getItem('authToken');
            if (!token) return;

            await fetch(`/api/stories/${storyId}/view`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
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
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch('/api/groups', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.groups = data.data?.groups || [];
                this.renderGroups(this.groups);
            } else {
                console.error('فشل في تحميل المجموعات:', response.status);
            }
        } catch (error) {
            console.error('خطأ في تحميل المجموعات:', error);
        }
    }

    renderGroups(groups) {
        const container = document.getElementById('groupsGrid');
        if (!container) return;

        container.innerHTML = '';

        if (!groups || groups.length === 0) {
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
        div.className = 'group-card';
        
        const isMember = group.members?.includes(this.currentUser._id);
        
        div.innerHTML = `
            <div class="group-header">
                <div class="group-avatar">
                    <i class="fas fa-users"></i>
                </div>
                <h3>${this.escapeHtml(group.name)}</h3>
                <p>${group.stats?.memberCount || group.members?.length || 0} عضو</p>
            </div>
            <div class="group-info">
                <p>${this.escapeHtml(group.description || 'لا يوجد وصف')}</p>
                <div class="group-stats">
                    <div class="group-stat">
                        <div class="group-stat-number">${group.stats?.messageCount || 0}</div>
                        <div class="group-stat-label">رسالة</div>
                    </div>
                    <div class="group-stat">
                        <div class="group-stat-number">${group.members?.length || 0}</div>
                        <div class="group-stat-label">عضو</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3 join-group-btn" data-group-id="${group._id}">
                    <i class="fas ${isMember ? 'fa-sign-out-alt' : 'fa-sign-in-alt'}"></i>
                    ${isMember ? 'مغادرة' : 'انضمام'}
                </button>
            </div>
        `;

        const joinBtn = div.querySelector('.join-group-btn');
        joinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleGroupJoin(group._id, isMember);
        });

        div.addEventListener('click', () => this.openGroup(group._id));
        return div;
    }

    async handleGroupJoin(groupId, isMember) {
        try {
            const token = localStorage.getItem('authToken');
            const method = isMember ? 'DELETE' : 'POST';
            
            const response = await fetch(`/api/groups/${groupId}/members`, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.showNotification(isMember ? 'تم مغادرة المجموعة' : 'تم الانضمام للمجموعة', 'success');
                await this.loadGroups();
            } else {
                this.showNotification('فشل في العملية', 'error');
            }
        } catch (error) {
            console.error('خطأ في إدارة المجموعة:', error);
            this.showNotification('خطأ في العملية', 'error');
        }
    }

    openGroup(groupId) {
        this.showNotification('فتح المجموعة: ' + groupId, 'info');
        // يمكن تنفيذ فتح المجموعة هنا
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
        const groupData = {
            name: formData.get('groupName'),
            description: formData.get('groupDescription'),
            privacy: formData.get('groupPrivacy')
        };

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/groups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(groupData)
            });

            if (response.ok) {
                this.showNotification('تم إنشاء المجموعة بنجاح', 'success');
                this.hideCreateGroupModal();
                e.target.reset();
                await this.loadGroups();
            } else {
                this.showNotification('فشل في إنشاء المجموعة', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء المجموعة:', error);
            this.showNotification('خطأ في إنشاء المجموعة', 'error');
        }
    }

    // ============ إدارة القنوات ============
    async loadChannels() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch('/api/channels', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.channels = data.data?.channels || [];
                this.renderChannels(this.channels);
            } else {
                console.error('فشل في تحميل القنوات:', response.status);
            }
        } catch (error) {
            console.error('خطأ في تحميل القنوات:', error);
        }
    }

    renderChannels(channels) {
        const container = document.getElementById('channelsGrid');
        if (!container) return;

        container.innerHTML = '';

        if (!channels || channels.length === 0) {
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
        div.className = 'channel-card';
        
        const isSubscribed = channel.subscribers?.includes(this.currentUser._id);
        
        div.innerHTML = `
            <div class="channel-header">
                <div class="channel-avatar">
                    <i class="fas fa-broadcast-tower"></i>
                </div>
                <h3>${this.escapeHtml(channel.name)}</h3>
                <p>${channel.stats?.subscriberCount || channel.subscribers?.length || 0} مشترك</p>
            </div>
            <div class="channel-info">
                <p>${this.escapeHtml(channel.description || 'لا يوجد وصف')}</p>
                <div class="channel-stats">
                    <div class="channel-stat">
                        <div class="channel-stat-number">${channel.stats?.postCount || 0}</div>
                        <div class="channel-stat-label">منشور</div>
                    </div>
                    <div class="channel-stat">
                        <div class="channel-stat-number">${channel.subscribers?.length || 0}</div>
                        <div class="channel-stat-label">مشترك</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3 subscribe-channel-btn" data-channel-id="${channel._id}">
                    <i class="fas ${isSubscribed ? 'fa-bell-slash' : 'fa-bell'}"></i>
                    ${isSubscribed ? 'إلغاء الاشتراك' : 'اشتراك'}
                </button>
            </div>
        `;

        const subscribeBtn = div.querySelector('.subscribe-channel-btn');
        subscribeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleChannelSubscription(channel._id, isSubscribed);
        });

        div.addEventListener('click', () => this.openChannel(channel._id));
        return div;
    }

    async handleChannelSubscription(channelId, isSubscribed) {
        try {
            const token = localStorage.getItem('authToken');
            const method = isSubscribed ? 'DELETE' : 'POST';
            
            const response = await fetch(`/api/channels/${channelId}/subscriptions`, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.showNotification(isSubscribed ? 'تم إلغاء الاشتراك' : 'تم الاشتراك في القناة', 'success');
                await this.loadChannels();
            } else {
                this.showNotification('فشل في العملية', 'error');
            }
        } catch (error) {
            console.error('خطأ في إدارة القناة:', error);
            this.showNotification('خطأ في العملية', 'error');
        }
    }

    openChannel(channelId) {
        this.showNotification('فتح القناة: ' + channelId, 'info');
        // يمكن تنفيذ فتح القناة هنا
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
        const channelData = {
            name: formData.get('channelName'),
            description: formData.get('channelDescription'),
            category: formData.get('channelCategory')
        };

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/channels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(channelData)
            });

            if (response.ok) {
                this.showNotification('تم إنشاء القناة بنجاح', 'success');
                this.hideCreateChannelModal();
                e.target.reset();
                await this.loadChannels();
            } else {
                this.showNotification('فشل في إنشاء القناة', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء القناة:', error);
            this.showNotification('خطأ في إنشاء القناة', 'error');
        }
    }

    // ============ إدارة الوسائط ============
    async loadMedia() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch('/api/media', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderMedia(data.data?.media || []);
            } else {
                console.error('فشل في تحميل الوسائط:', response.status);
            }
        } catch (error) {
            console.error('خطأ في تحميل الوسائط:', error);
        }
    }

    renderMedia(mediaItems) {
        const container = document.getElementById('mediaGrid');
        if (!container) return;

        container.innerHTML = '';

        if (!mediaItems || mediaItems.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد وسائط</div>';
            return;
        }

        mediaItems.forEach(media => {
            const mediaElement = this.createMediaElement(media);
            container.appendChild(mediaElement);
        });
    }

    createMediaElement(media) {
        const div = document.createElement('div');
        div.className = 'media-item';
        
        div.innerHTML = `
            <div class="media-thumbnail">
                <img src="${media.thumbnailUrl || media.url}" alt="${media.name}" onerror="this.src='https://via.placeholder.com/150'">
                <div class="media-overlay">
                    <div class="media-info">
                        <h4>${this.escapeHtml(media.name)}</h4>
                        <p>${this.formatFileSize(media.size)} • ${this.formatTime(media.createdAt)}</p>
                    </div>
                    <div class="media-actions">
                        <button class="btn btn-sm btn-outline" onclick="app.downloadMedia('${media._id}')">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        return div;
    }

    async downloadMedia(mediaId) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/media/${mediaId}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'media-file';
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                this.showNotification('فشل في تحميل الملف', 'error');
            }
        } catch (error) {
            console.error('خطأ في تحميل الوسائط:', error);
            this.showNotification('خطأ في تحميل الملف', 'error');
        }
    }

    // ============ لوحة التحكم ============
    async loadDashboard() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch('/api/dashboard', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderDashboard(data.data);
            } else {
                console.error('فشل في تحميل لوحة التحكم:', response.status);
            }
        } catch (error) {
            console.error('خطأ في تحميل لوحة التحكم:', error);
        }
    }

    renderDashboard(data) {
        // تحديث الإحصائيات
        const stats = data?.stats || {};
        
        const statsElements = {
            totalMessages: document.getElementById('totalMessages'),
            totalGroups: document.getElementById('totalGroups'),
            totalChannels: document.getElementById('totalChannels'),
            totalMedia: document.getElementById('totalMedia')
        };

        Object.keys(statsElements).forEach(key => {
            if (statsElements[key]) {
                statsElements[key].textContent = stats[key] || 0;
            }
        });

        // تحديث النشاط الأخير
        const recentActivity = data?.recentActivity || [];
        this.renderRecentActivity(recentActivity);
    }

    renderRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        container.innerHTML = '';

        if (!activities || activities.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 1rem; color: #666;">لا توجد نشاطات حديثة</div>';
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
                <i class="fas ${this.getActivityIcon(activity.type)}"></i>
            </div>
            <div class="activity-content">
                <p>${this.escapeHtml(activity.description)}</p>
                <span class="activity-time">${this.formatTime(activity.createdAt)}</span>
            </div>
        `;

        return div;
    }

    getActivityIcon(type) {
        const icons = {
            message: 'fa-comment',
            group: 'fa-users',
            channel: 'fa-broadcast-tower',
            media: 'fa-file',
            story: 'fa-history'
        };
        return icons[type] || 'fa-circle';
    }

    // ============ إدارة المصادقة ============
    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const loginData = {
            email: formData.get('email'),
            password: formData.get('password')
        };

        try {
            const response = await fetch('/api/users/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(loginData)
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('authToken', data.data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.data.user));
                
                this.currentUser = data.data.user;
                this.showAuthenticatedUI();
                this.navigateToPage('dashboard');
                
                this.showNotification('تم تسجيل الدخول بنجاح!', 'success');
                
                // إعادة تهيئة السوكت
                this.initializeSocket();
                await this.loadInitialData();
                
            } else {
                this.showNotification(data.message || 'فشل في تسجيل الدخول', 'error');
            }
        } catch (error) {
            console.error('خطأ في تسجيل الدخول:', error);
            this.showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const registerData = {
            fullName: formData.get('fullName'),
            email: formData.get('email'),
            password: formData.get('password'),
            role: formData.get('role')
        };

        try {
            const response = await fetch('/api/users/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(registerData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('تم إنشاء الحساب بنجاح!', 'success');
                e.target.reset();
                
                // الانتقال إلى صفحة تسجيل الدخول
                document.getElementById('loginTab').click();
                
            } else {
                this.showNotification(data.message || 'فشل في إنشاء الحساب', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء الحساب:', error);
            this.showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    handleLogout() {
        // إغلاق السوكت
        if (this.socket) {
            this.socket.disconnect();
        }

        // مسح بيانات التخزين المحلي
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        
        this.currentUser = null;
        this.currentChat = null;
        this.conversations.clear();
        
        this.showUnauthenticatedUI();
        this.navigateToPage('home');
        
        this.showNotification('تم تسجيل الخروج بنجاح', 'success');
    }

    // ============ أدوات مساعدة ============
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;

        document.body.appendChild(notification);

        // إضافة مستمعي الأحداث
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        // إزالة الإشعار تلقائياً بعد 5 ثواني
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || 'fa-info-circle';
    }

    updateUnreadCount() {
        // تحديث عدد الرسائل غير المقروءة
        console.log('تحديث عدد الرسائل غير المقروءة');
    }

    updateUserStatus(data) {
        // تحديث حالة المستخدم
        console.log('تحديث حالة المستخدم:', data);
    }

    toggleEmojiPicker() {
        const container = document.getElementById('emojiPickerContainer');
        if (container) {
            container.classList.toggle('active');
        }
    }

    triggerFileInput() {
        document.getElementById('fileInput').click();
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (file) {
            this.showNotification(`تم اختيار الملف: ${file.name}`, 'info');
            // يمكن إضافة رفع الملف هنا
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }

    formatTime(dateString) {
        const date = new Date(dateString);
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

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// ============ تهيئة التطبيق ============
let app;

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 تم تحميل DOM بالكامل');
    
    // تهيئة التطبيق
    app = new EducationalPlatform();
    
    // جعل التطبيق متاحاً عالمياً
    window.app = app;
    
    // إضافة الأنماط للإشعارات
    const style = document.createElement('style');
    style.textContent = `
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
            max-width: 500px;
            animation: slideInRight 0.3s ease;
        }
        
        .notification-success {
            border-left-color: #4caf50;
        }
        
        .notification-error {
            border-left-color: #f44336;
        }
        
        .notification-warning {
            border-left-color: #ff9800;
        }
        
        .notification-info {
            border-left-color: #2196f3;
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
        
        .connection-status {
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(76, 201, 240, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
    `;
    document.head.appendChild(style);
    
    // إضافة شريط حالة الاتصال
    const connectionStatus = document.createElement('div');
    connectionStatus.id = 'connectionStatus';
    connectionStatus.className = 'connection-status';
    connectionStatus.innerHTML = '<i class="fas fa-wifi"></i><span>جاري الاتصال...</span>';
    document.body.appendChild(connectionStatus);
});

// معالجة الأخطاء غير المتوقعة
window.addEventListener('error', function(e) {
    console.error('خطأ غير متوقع:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Promise مرفوض:', e.reason);
});
