// js/app.js - التطبيق الرئيسي للمنصة التعليمية
class EducationalPlatform {
    constructor() {
        this.config = window.APP_CONFIG;
        this.socket = null;
        this.currentUser = null;
        this.currentPage = 'home';
        this.currentConversation = null;
        this.isAuthenticated = false;
        
        this.init();
    }

    init() {
        this.initializeSocket();
        this.setupEventListeners();
        this.checkAuthentication();
        this.setupServiceWorker();
        this.setupOnlineStatus();
    }

    initializeSocket() {
        this.socket = io(this.config.SOCKET_URL, {
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('✅ متصل بالسيرفر');
            this.updateConnectionStatus(true);
            
            // إعادة المصادقة إذا كان المستخدم مسجل الدخول
            const token = this.getStoredToken();
            if (token) {
                this.socket.emit('authenticate', { token });
            }
        });

        this.socket.on('disconnect', () => {
            console.log('❌ انقطع الاتصال بالسيرفر');
            this.updateConnectionStatus(false);
        });

        this.socket.on('authenticated', (data) => {
            console.log('✅ تمت المصادقة:', data.user.fullName);
            this.handleAuthenticationSuccess(data);
        });

        this.socket.on('authentication_failed', (data) => {
            console.error('❌ فشلت المصادقة:', data.message);
            this.handleAuthenticationFailure();
        });

        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // استلام رسائل جديدة
        this.socket.on('new_message', (data) => {
            this.handleNewMessage(data);
        });

        // استلام رسائل القنوات
        this.socket.on('new_channel_message', (data) => {
            this.handleNewChannelMessage(data);
        });

        // استلام رسائل المجموعات
        this.socket.on('new_group_message', (data) => {
            this.handleNewGroupMessage(data);
        });

        // تحديث حالة المستخدم
        this.socket.on('user_status_changed', (data) => {
            this.handleUserStatusChange(data);
        });

        // حالة الكتابة
        this.socket.on('user_typing', (data) => {
            this.handleUserTyping(data);
        });
    }

    setupEventListeners() {
        // التنقل بين الصفحات
        document.querySelectorAll('[data-page]').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                const page = element.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        // النماذج
        this.setupForms();
        
        // القائمة المتنقلة
        this.setupMobileMenu();
        
        // الدردشة
        this.setupChat();
        
        // الوسائط
        this.setupMedia();
        
        // القصص
        this.setupStories();
        
        // المجموعات والقنوات
        this.setupGroupsAndChannels();
        
        // الإعدادات
        this.setupSettings();
    }

    setupForms() {
        // تسجيل الدخول
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // التسجيل
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        // إنشاء مجموعة
        const createGroupForm = document.getElementById('createGroupForm');
        if (createGroupForm) {
            createGroupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreateGroup();
            });
        }

        // إنشاء قناة
        const createChannelForm = document.getElementById('createChannelForm');
        if (createChannelForm) {
            createChannelForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreateChannel();
            });
        }

        // إنشاء قصة
        const createStoryForm = document.getElementById('createStoryForm');
        if (createStoryForm) {
            createStoryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreateStory();
            });
        }
    }

    setupMobileMenu() {
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const mobileMenuClose = document.getElementById('mobileMenuClose');
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('overlay');

        if (mobileMenuBtn && mobileMenuClose && mobileMenu && overlay) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileMenu.classList.add('active');
                overlay.classList.add('active');
            });

            mobileMenuClose.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                overlay.classList.remove('active');
            });

            overlay.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                overlay.classList.remove('active');
            });
        }
    }

    setupChat() {
        const chatInput = document.getElementById('chatInput');
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const emojiToggle = document.getElementById('emojiToggle');
        const emojiPicker = document.querySelector('emoji-picker');

        if (chatInput && sendMessageBtn) {
            // إرسال الرسالة
            sendMessageBtn.addEventListener('click', () => {
                this.sendMessage();
            });

            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // الكتابة
            let typingTimer;
            chatInput.addEventListener('input', () => {
                if (this.currentConversation) {
                    this.socket.emit('typing_start', {
                        conversationId: this.currentConversation._id
                    });

                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(() => {
                        this.socket.emit('typing_stop', {
                            conversationId: this.currentConversation._id
                        });
                    }, this.config.TYPING_TIMEOUT);
                }
            });
        }

        // الإيموجي
        if (emojiToggle && emojiPicker) {
            emojiToggle.addEventListener('click', () => {
                const container = document.getElementById('emojiPickerContainer');
                container.classList.toggle('active');
            });

            emojiPicker.addEventListener('emoji-click', (event) => {
                if (chatInput) {
                    chatInput.value += event.detail.unicode;
                    chatInput.focus();
                }
            });

            // إغلاق منتقي الإيموجي عند النقر خارجها
            document.addEventListener('click', (e) => {
                if (!emojiToggle.contains(e.target) && !emojiPicker.contains(e.target)) {
                    document.getElementById('emojiPickerContainer').classList.remove('active');
                }
            });
        }
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                this.handleAuthenticationSuccess(data);
                this.showNotification('تم تسجيل الدخول بنجاح', 'success');
            } else {
                this.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('❌ خطأ في تسجيل الدخول:', error);
            this.showNotification('حدث خطأ أثناء تسجيل الدخول', 'error');
        }
    }

    async handleRegister() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const role = document.getElementById('registerRole').value;

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fullName: name,
                    email,
                    password,
                    role
                })
            });

            const data = await response.json();

            if (data.success) {
                this.handleAuthenticationSuccess(data);
                this.showNotification('تم إنشاء الحساب بنجاح', 'success');
            } else {
                this.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('❌ خطأ في التسجيل:', error);
            this.showNotification('حدث خطأ أثناء إنشاء الحساب', 'error');
        }
    }

    handleAuthenticationSuccess(data) {
        this.currentUser = data.data.user;
        this.isAuthenticated = true;
        
        // تخزين البيانات
        localStorage.setItem(this.config.STORAGE_KEYS.TOKEN, data.data.token);
        localStorage.setItem(this.config.STORAGE_KEYS.USER, JSON.stringify(data.data.user));
        
        // تحديث الواجهة
        this.updateUIAfterAuth();
        
        // المصادقة مع السوكت
        if (this.socket) {
            this.socket.emit('authenticate', { token: data.data.token });
        }
        
        // التنقل للصفحة الرئيسية
        this.navigateTo('home');
    }

    handleAuthenticationFailure() {
        this.currentUser = null;
        this.isAuthenticated = false;
        localStorage.removeItem(this.config.STORAGE_KEYS.TOKEN);
        localStorage.removeItem(this.config.STORAGE_KEYS.USER);
        this.updateUIAfterAuth();
    }

    async logout() {
        try {
            const token = this.getStoredToken();
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }
        } catch (error) {
            console.error('❌ خطأ في تسجيل الخروج:', error);
        } finally {
            this.handleAuthenticationFailure();
            this.showNotification('تم تسجيل الخروج بنجاح', 'success');
            this.navigateTo('home');
        }
    }

    updateUIAfterAuth() {
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const userInfo = document.getElementById('userInfo');
        const mobileLoginBtn = document.getElementById('loginBtnMobile');
        const mobileRegisterBtn = document.getElementById('registerBtnMobile');
        const mobileLogoutBtn = document.getElementById('logoutBtnMobile');
        const mobileUserInfo = document.querySelector('.mobile-menu-header .user-info');

        if (this.isAuthenticated && this.currentUser) {
            // إظهار عناصر المستخدم المسجل
            [loginBtn, registerBtn, mobileLoginBtn, mobileRegisterBtn].forEach(el => {
                if (el) el.classList.add('hidden');
            });
            [logoutBtn, userInfo, mobileLogoutBtn, mobileUserInfo].forEach(el => {
                if (el) el.classList.remove('hidden');
            });

            // تحديث معلومات المستخدم
            this.updateUserInfo();
        } else {
            // إظهار عناصر الزائر
            [loginBtn, registerBtn, mobileLoginBtn, mobileRegisterBtn].forEach(el => {
                if (el) el.classList.remove('hidden');
            });
            [logoutBtn, userInfo, mobileLogoutBtn, mobileUserInfo].forEach(el => {
                if (el) el.classList.add('hidden');
            });
        }
    }

    updateUserInfo() {
        if (!this.currentUser) return;

        const elements = [
            { id: 'userNameDisplay', text: this.currentUser.fullName },
            { id: 'userRoleDisplay', text: this.currentUser.role === 'teacher' ? 'معلم' : 'طالب' },
            { id: 'userAvatarText', text: this.currentUser.fullName.charAt(0) },
            { id: 'mobileUserNameDisplay', text: this.currentUser.fullName },
            { id: 'mobileUserRoleDisplay', text: this.currentUser.role === 'teacher' ? 'معلم' : 'طالب' },
            { id: 'mobileUserAvatarText', text: this.currentUser.fullName.charAt(0) }
        ];

        elements.forEach(({ id, text }) => {
            const element = document.getElementById(id);
            if (element) element.textContent = text;
        });
    }

    navigateTo(page) {
        // إخفاء جميع الصفحات
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });

        // إخفاء القائمة المتنقلة
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('overlay');
        if (mobileMenu && overlay) {
            mobileMenu.classList.remove('active');
            overlay.classList.remove('active');
        }

        // إظهار الصفحة المطلوبة
        const targetPage = document.getElementById(`${page}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = page;
            
            // تحميل بيانات الصفحة إذا لزم الأمر
            this.loadPageData(page);
        }

        // تحديث العناصر النشطة في القائمة
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        document.querySelectorAll(`[data-page="${page}"]`).forEach(item => {
            item.classList.add('active');
        });

        // إخفاء شاشة الترحيب إذا كانت موجودة
        if (page !== 'welcome') {
            const welcomeScreen = document.getElementById('welcomeScreen');
            if (welcomeScreen) {
                welcomeScreen.style.display = 'none';
            }
        }
    }

    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboardData();
                break;
            case 'chat':
                await this.loadChatData();
                break;
            case 'stories':
                await this.loadStoriesData();
                break;
            case 'groups':
                await this.loadGroupsData();
                break;
            case 'channels':
                await this.loadChannelsData();
                break;
            case 'media':
                await this.loadMediaData();
                break;
        }
    }

    async loadDashboardData() {
        if (!this.isAuthenticated) return;

        try {
            const token = this.getStoredToken();
            const response = await fetch('/api/health', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                this.updateDashboardStats(data.data.stats);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل بيانات لوحة التحكم:', error);
        }
    }

    updateDashboardStats(stats) {
        const elements = {
            'totalUsers': stats.totalUsers,
            'totalMessages': stats.totalMessages,
            'totalStories': stats.totalStories,
            'totalChannels': stats.totalChannels
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    async sendMessage() {
        const chatInput = document.getElementById('chatInput');
        const content = chatInput?.value.trim();

        if (!content || !this.currentConversation) return;

        try {
            this.socket.emit('send_message', {
                conversationId: this.currentConversation._id,
                content,
                type: 'text'
            });

            chatInput.value = '';
        } catch (error) {
            console.error('❌ خطأ في إرسال الرسالة:', error);
            this.showNotification('فشل إرسال الرسالة', 'error');
        }
    }

    handleNewMessage(data) {
        if (this.currentConversation && this.currentConversation._id === data.conversationId) {
            this.displayMessage(data.message);
        }
        
        // تحديث عدد الرسائل غير المقروءة
        this.updateUnreadCounts();
    }

    displayMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        const emptyChat = document.getElementById('emptyChat');

        if (emptyChat) {
            emptyChat.style.display = 'none';
        }

        const messageElement = this.createMessageElement(message);
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    createMessageElement(message) {
        const isSent = message.senderId === this.currentUser._id;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message.content)}</div>
                <div class="message-time">${this.formatTime(message.createdAt)}</div>
            </div>
            <div class="message-status">
                <i class="fas fa-check"></i>
            </div>
        `;

        return messageDiv;
    }

    // دوال مساعدة
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    getStoredToken() {
        return localStorage.getItem(this.config.STORAGE_KEYS.TOKEN);
    }

    showNotification(message, type = 'info') {
        // تنفيذ بسيط للإشعارات - يمكن تطويره لاحقاً
        console.log(`📢 ${type.toUpperCase()}: ${message}`);
        
        // يمكن إضافة تنفيذ أكثر تطوراً للإشعارات هنا
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, this.config.NOTIFICATION_TIMEOUT);
    }

    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            if (isConnected) {
                statusElement.innerHTML = '<i class="fas fa-wifi"></i><span>متصل بالإنترنت</span>';
                statusElement.classList.remove('offline');
            } else {
                statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i><span>غير متصل</span>';
                statusElement.classList.add('offline');
            }
        }
    }

    checkAuthentication() {
        const token = this.getStoredToken();
        const userData = localStorage.getItem(this.config.STORAGE_KEYS.USER);

        if (token && userData) {
            try {
                this.currentUser = JSON.parse(userData);
                this.isAuthenticated = true;
                this.updateUIAfterAuth();
                
                // المصادقة مع السوكت
                if (this.socket) {
                    this.socket.emit('authenticate', { token });
                }
            } catch (error) {
                console.error('❌ خطأ في تحميل بيانات المستخدم:', error);
                this.handleAuthenticationFailure();
            }
        }
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('✅ Service Worker مسجل:', registration);
                })
                .catch(error => {
                    console.log('❌ فشل تسجيل Service Worker:', error);
                });
        }
    }

    setupOnlineStatus() {
        window.addEventListener('online', () => {
            this.updateConnectionStatus(true);
        });

        window.addEventListener('offline', () => {
            this.updateConnectionStatus(false);
        });
    }

    // دوال إضافية للوظائف الأخرى
    setupMedia() {
        const uploadArea = document.getElementById('uploadArea');
        const mediaFileInput = document.getElementById('mediaFileInput');

        if (uploadArea && mediaFileInput) {
            uploadArea.addEventListener('click', () => {
                mediaFileInput.click();
            });

            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'var(--primary-color)';
                uploadArea.style.background = 'rgba(67, 97, 238, 0.05)';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = 'var(--border-color)';
                uploadArea.style.background = 'transparent';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'var(--border-color)';
                uploadArea.style.background = 'transparent';
                
                const files = e.dataTransfer.files;
                this.handleFileUpload(files);
            });

            mediaFileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files);
            });
        }
    }

    async handleFileUpload(files) {
        if (!files.length) return;

        const formData = new FormData();
        for (let file of files) {
            formData.append('files', file);
        }

        try {
            const token = this.getStoredToken();
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('تم رفع الملفات بنجاح', 'success');
                this.loadMediaData(); // إعادة تحميل الوسائط
            } else {
                this.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('❌ خطأ في رفع الملفات:', error);
            this.showNotification('فشل رفع الملفات', 'error');
        }
    }

    updateUnreadCounts() {
        // تحديث عدد الرسائل غير المقروءة في القائمة
        // يمكن تطوير هذا الجزء حسب الحاجة
        const elements = [
            'unreadMessagesCount',
            'unreadMessagesCountMobile'
        ];

        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                // تحديث العدد - يمكن جلب البيانات من السيرفر
                element.textContent = '0';
            }
        });
    }

    // دوال يمكن تطويرها لاحقاً
    setupStories() {
        // تنفيذ إدارة القصص
    }

    setupGroupsAndChannels() {
        // تنفيذ إدارة المجموعات والقنوات
    }

    setupSettings() {
        // تنفيذ إدارة الإعدادات
    }

    async loadChatData() {
        // تحميل بيانات الدردشة
    }

    async loadStoriesData() {
        // تحميل بيانات القصص
    }

    async loadGroupsData() {
        // تحميل بيانات المجموعات
    }

    async loadChannelsData() {
        // تحميل بيانات القنوات
    }

    async loadMediaData() {
        // تحميل بيانات الوسائط
    }

    async handleCreateGroup() {
        // إنشاء مجموعة جديدة
    }

    async handleCreateChannel() {
        // إنشاء قناة جديدة
    }

    async handleCreateStory() {
        // إنشاء قصة جديدة
    }

    handleNewChannelMessage(data) {
        // معالجة رسائل القنوات الجديدة
    }

    handleNewGroupMessage(data) {
        // معالجة رسائل المجموعات الجديدة
    }

    handleUserStatusChange(data) {
        // تحديث حالة المستخدم
    }

    handleUserTyping(data) {
        // معالجة حالة الكتابة
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // بدء شاشة الترحيب
    const startAppBtn = document.getElementById('startAppBtn');
    if (startAppBtn) {
        startAppBtn.addEventListener('click', () => {
            document.getElementById('welcomeScreen').style.display = 'none';
        });
    }

    // إنشاء instance من التطبيق
    window.educationalPlatform = new EducationalPlatform();
});

// دوال مساعدة عامة
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
