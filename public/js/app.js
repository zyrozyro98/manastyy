// public/js/app.js - التطبيق الرئيسي للعميل (محدث ومصحح)
class EducationalPlatform {
    constructor() {
        this.currentUser = null;
        this.socket = null;
        this.currentChat = null;
        this.conversations = [];
        this.baseURL = window.location.origin;
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة المنصة التعليمية...');
        
        try {
            this.setupEventListeners();
            await this.checkAuthentication();
            
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
                } else {
                    this.initializeSocket();
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
        this.showElement('userInfo');
        this.showElement('logoutBtn');
        this.hideElement('loginBtn');
        this.hideElement('registerBtn');
        
        this.updateUserInfo();
    }

    showUnauthenticatedUI() {
        this.hideElement('userInfo');
        this.hideElement('logoutBtn');
        this.showElement('loginBtn');
        this.showElement('registerBtn');
    }

    showElement(id) {
        const element = document.getElementById(id);
        if (element) element.classList.remove('hidden');
    }

    hideElement(id) {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    }

    updateUserInfo() {
        if (this.currentUser) {
            const userNameDisplay = document.getElementById('userNameDisplay');
            const userRoleDisplay = document.getElementById('userRoleDisplay');
            const userAvatarText = document.getElementById('userAvatarText');
            
            if (userNameDisplay) userNameDisplay.textContent = this.currentUser.fullName || 'مستخدم';
            if (userRoleDisplay) userRoleDisplay.textContent = this.getRoleText(this.currentUser.role);
            if (userAvatarText) userAvatarText.textContent = (this.currentUser.fullName || 'م').charAt(0);
        }
    }

    getRoleText(role) {
        const roles = {
            'admin': 'مدير',
            'teacher': 'معلم', 
            'student': 'طالب'
        };
        return roles[role] || 'مستخدم';
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
                this.navigateToPage(pageName);
            });
        });

        // زر ابدأ الآن
        const startAppBtn = document.getElementById('startAppBtn');
        if (startAppBtn) {
            startAppBtn.addEventListener('click', () => {
                this.startApp();
            });
        }

        // المصادقة
        this.setupAuthEventListeners();

        // الدردشة
        this.setupChatEventListeners();

        // الأزرار الإضافية
        this.setupUtilityEventListeners();

        console.log('✅ تم إعداد مستمعي الأحداث بنجاح');
    }

    setupAuthEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const logoutBtn = document.getElementById('logoutBtn');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
    }

    setupChatEventListeners() {
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const chatInput = document.getElementById('chatInput');

        if (sendMessageBtn) {
            sendMessageBtn.addEventListener('click', () => this.sendMessage());
        }

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
    }

    setupUtilityEventListeners() {
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const overlay = document.getElementById('overlay');
        const floatingActionBtn = document.getElementById('floatingActionBtn');

        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => this.toggleMobileMenu());
        }

        if (overlay) {
            overlay.addEventListener('click', () => this.closeMobileMenu());
        }

        if (floatingActionBtn) {
            floatingActionBtn.addEventListener('click', () => this.toggleQuickActions());
        }
    }

    // ============ دوال التطبيق الرئيسية ============
    startApp() {
        console.log('🎬 بدء التطبيق...');
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
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
            });

            this.socket.on('disconnect', () => {
                console.log('❌ تم قطع الاتصال');
                this.updateConnectionStatus(false);
            });

            this.socket.on('new_message', (data) => {
                this.receiveMessage(data);
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
                this.renderConversations(data.conversations);
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
        });
    }

    createConversationElement(conversation) {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.dataset.conversationId = conversation._id;
        
        const lastMessage = conversation.lastMessage ? 
            (conversation.lastMessage.content || 'ملف مرفق') : 'لا توجد رسائل';

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
            </div>
        `;

        div.addEventListener('click', () => this.selectConversation(conversation._id));
        return div;
    }

    selectConversation(conversationId) {
        this.currentChat = conversationId;
        
        document.getElementById('activeChatName').textContent = 'محادثة';
        document.getElementById('activeChatAvatar').textContent = 'م';
        
        const chatInputContainer = document.getElementById('chatInputContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (chatInputContainer) chatInputContainer.style.display = 'flex';
        if (emptyChat) emptyChat.style.display = 'none';

        this.loadMessages(conversationId);
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
                this.renderMessages(data.messages);
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
        `;

        return div;
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const content = input?.value.trim();
        
        if (!content || !this.currentChat) return;

        try {
            // إضافة الرسالة للواجهة مباشرة
            this.addMessageToUI({
                content: content,
                _id: 'temp-' + Date.now(),
                senderId: this.currentUser._id,
                createdAt: new Date().toISOString()
            }, true);

            input.value = '';

            // إرسال الرسالة عبر السوكيت
            if (this.socket) {
                this.socket.emit('send_message', {
                    conversationId: this.currentChat,
                    content: content
                });
            }

        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.showNotification('فشل في إرسال الرسالة', 'error');
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

    receiveMessage(data) {
        if (this.currentChat && data.conversationId === this.currentChat) {
            this.addMessageToUI(data.message, false);
        }
    }

    scrollToBottom() {
        const container = document.getElementById('chatMessages');
        if (container) {
            container.scrollTop = container.scrollHeight;
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
                this.renderStories(data.stories);
            }
        } catch (error) {
            console.error('خطأ في تحميل القصص:', error);
        }
    }

    renderStories(stories) {
        const container = document.getElementById('storiesContainer');
        if (!container) return;

        if (stories.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد قصص حالية</div>';
            return;
        }

        // تنفيذ عرض القصص هنا
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
                this.renderGroups(data.groups);
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
        
        div.innerHTML = `
            <div class="group-header">
                <div class="group-avatar">
                    <i class="fas fa-users"></i>
                </div>
                <h3>${this.escapeHtml(group.name)}</h3>
                <p>${group.stats?.memberCount || 0} عضو</p>
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
                <button class="btn btn-primary btn-block mt-3">
                    <i class="fas fa-sign-in-alt"></i>
                    الدخول
                </button>
            </div>
        `;

        return div;
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
                this.renderChannels(data.channels);
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
        
        div.innerHTML = `
            <div class="channel-header">
                <div class="channel-avatar">
                    <i class="fas fa-broadcast-tower"></i>
                </div>
                <h3>${this.escapeHtml(channel.name)}</h3>
                <p>${channel.stats?.memberCount || 0} مشترك</p>
            </div>
            <div class="channel-info">
                <p>${this.escapeHtml(channel.description || 'لا يوجد وصف')}</p>
                <div class="channel-stats">
                    <div class="channel-stat">
                        <div class="channel-stat-number">${channel.stats?.messageCount || 0}</div>
                        <div class="channel-stat-label">رسالة</div>
                    </div>
                    <div class="channel-stat">
                        <div class="channel-stat-number">${channel.members?.length || 0}</div>
                        <div class="channel-stat-label">مشترك</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3">
                    <i class="fas fa-bell"></i>
                    اشترك
                </button>
            </div>
        `;

        return div;
    }

    // ============ لوحة التحكم ============
    async loadDashboard() {
        try {
            const dashboardPage = document.getElementById('dashboard-page');
            if (dashboardPage) {
                dashboardPage.innerHTML = `
                    <div class="dashboard-header">
                        <h1 class="section-title">
                            <i class="fas fa-tachometer-alt"></i>
                            لوحة التحكم
                        </h1>
                        <p>مرحباً بك ${this.currentUser?.fullName || 'مستخدم'} في المنصة التعليمية</p>
                    </div>
                    
                    <div class="dashboard-stats">
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-number">0</div>
                                <div class="stat-label">إجمالي المستخدمين</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-comments"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-number">${this.conversations.length}</div>
                                <div class="stat-label">المحادثات</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-history"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-number">0</div>
                                <div class="stat-label">القصص النشطة</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-broadcast-tower"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-number">2</div>
                                <div class="stat-label">القنوات</div>
                            </div>
                        </div>
                    </div>

                    <div class="recent-activities">
                        <h3>النشاطات الأخيرة</h3>
                        <div class="activities-list">
                            <div class="activity-item">
                                <i class="fas fa-user-plus"></i>
                                <div class="activity-content">
                                    <p>تم تسجيل الدخول بنجاح</p>
                                    <span class="activity-time">الآن</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('خطأ في تحميل لوحة التحكم:', error);
        }
    }

    // ============ إدارة المصادقة ============
    async handleLogin(event) {
        if (event) event.preventDefault();
        
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;

        if (!email || !password) {
            this.showNotification('يرجى ملء جميع الحقول', 'error');
            return;
        }

        this.showLoading('جاري تسجيل الدخول...');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.handleAuthSuccess(data);
            } else {
                this.showNotification(data.message || 'فشل تسجيل الدخول', 'error');
            }
        } catch (error) {
            console.error('خطأ في تسجيل الدخول:', error);
            this.showNotification('خطأ في الاتصال بالخادم', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async handleRegister(event) {
        if (event) event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const userData = {
            fullName: formData.get('name'),
            email: formData.get('email'),
            password: formData.get('password'),
            role: formData.get('role') || 'student'
        };

        if (!userData.fullName || !userData.email || !userData.password) {
            this.showNotification('يرجى ملء جميع الحقول', 'error');
            return;
        }

        this.showLoading('جاري إنشاء الحساب...');

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.handleAuthSuccess(data);
            } else {
                this.showNotification(data.message || 'فشل إنشاء الحساب', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء الحساب:', error);
            this.showNotification('خطأ في الاتصال بالخادم', 'error');
        } finally {
            this.hideLoading();
        }
    }

    handleAuthSuccess(data) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        this.currentUser = data.user;
        this.showAuthenticatedUI();
        this.navigateToPage('dashboard');
        this.showNotification(`مرحباً ${data.user.fullName}!`, 'success');
        
        this.initializeSocket();
    }

    handleLogout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.currentUser = null;
        this.showUnauthenticatedUI();
        this.navigateToPage('home');
        this.showNotification('تم تسجيل الخروج', 'info');
    }

    // ============ دوال مساعدة ============
    formatTime(timestamp) {
        if (!timestamp) return 'الآن';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'الآن';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} د`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} س`;
        
        return date.toLocaleDateString('ar-EG');
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    showNotification(message, type = 'info') {
        // تنفيذ بسيط للإشعارات
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // يمكن استبدال هذا بتنفيذ أكثر تطوراً
        alert(message);
    }

    showLoading(message = 'جاري التحميل...') {
        // تنفيذ بسيط للتحميل
        console.log(`⏳ ${message}`);
    }

    hideLoading() {
        // إخفاء التحميل
        console.log('✅ تم إخفاء التحميل');
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 تم تحميل DOM بنجاح، بدء التطبيق...');
    window.educationalPlatform = new EducationalPlatform();
});
