// public/js/app.js - التطبيق الرئيسي الكامل للمنصة التعليمية (محدث ومحسن)
class EducationalPlatform {
    constructor() {
        this.currentUser = null;
        this.socket = null;
        this.currentChat = null;
        this.conversations = [];
        this.allUsers = [];
        this.stories = [];
        this.groups = [];
        this.channels = [];
        this.typingUsers = new Map();
        this.typingTimeouts = new Map();
        this.baseURL = window.location.origin;
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة المنصة التعليمية...');
        
        try {
            this.setupEventListeners();
            await this.checkAuthentication();
            await this.loadInitialData();
            
            this.isInitialized = true;
            console.log('✅ تم تهيئة المنصة التعليمية بنجاح');
        } catch (error) {
            console.error('❌ خطأ في تهيئة التطبيق:', error);
            this.showNotification('خطأ في تهيئة التطبيق', 'error');
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
                    await this.handleLogout();
                } else {
                    this.initializeSocket();
                }
            } catch (error) {
                console.error('خطأ في تحميل بيانات المستخدم:', error);
                await this.handleLogout();
            }
        } else {
            this.showUnauthenticatedUI();
            this.navigateToPage('home');
        }
    }

    async validateToken(token) {
        try {
            const response = await this.apiRequest('/api/users/me', {
                method: 'GET'
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
        
        // تحديث واجهة الجوال
        this.showElement('logoutBtnMobile');
        this.hideElement('loginBtnMobile');
        this.hideElement('registerBtnMobile');
        
        this.updateUserInfo();
    }

    showUnauthenticatedUI() {
        this.hideElement('userInfo');
        this.hideElement('logoutBtn');
        this.showElement('loginBtn');
        this.showElement('registerBtn');
        
        // تحديث واجهة الجوال
        this.hideElement('logoutBtnMobile');
        this.showElement('loginBtnMobile');
        this.showElement('registerBtnMobile');
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
        } else {
            console.error(`❌ الصفحة غير موجودة: ${pageName}`);
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
        try {
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
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'media':
                    await this.loadMedia();
                    break;
            }
        } catch (error) {
            console.error(`❌ خطأ في تحميل محتوى الصفحة ${pageName}:`, error);
            this.showNotification(`خطأ في تحميل ${pageName}`, 'error');
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

        // القصص
        this.setupStoriesEventListeners();

        // المجموعات والقنوات
        this.setupGroupsChannelsEventListeners();

        // الوسائط
        this.setupMediaEventListeners();

        // الأزرار الإضافية
        this.setupUtilityEventListeners();

        console.log('✅ تم إعداد مستمعي الأحداث بنجاح');
    }

    setupAuthEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const logoutBtn = document.getElementById('logoutBtn');
        const logoutBtnMobile = document.getElementById('logoutBtnMobile');

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

        if (logoutBtnMobile) {
            logoutBtnMobile.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
    }

    setupChatEventListeners() {
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const chatInput = document.getElementById('chatInput');
        const attachFileBtn = document.getElementById('attachFileBtn');
        const emojiToggle = document.getElementById('emojiToggle');
        const fileInput = document.getElementById('fileInput');

        if (sendMessageBtn) {
            sendMessageBtn.addEventListener('click', () => this.sendMessage());
        }

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            chatInput.addEventListener('input', () => this.handleTyping());
            chatInput.addEventListener('blur', () => this.stopTyping());
        }

        if (attachFileBtn) {
            attachFileBtn.addEventListener('click', () => this.triggerFileInput());
        }

        if (emojiToggle) {
            emojiToggle.addEventListener('click', () => this.toggleEmojiPicker());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
    }

    setupStoriesEventListeners() {
        const createStoryBtn = document.getElementById('createStoryBtn');
        const storyClose = document.getElementById('storyClose');
        const storyPrev = document.getElementById('storyPrev');
        const storyNext = document.getElementById('storyNext');

        if (createStoryBtn) {
            createStoryBtn.addEventListener('click', () => this.showCreateStoryModal());
        }

        if (storyClose) {
            storyClose.addEventListener('click', () => this.closeStoryViewer());
        }

        if (storyPrev) {
            storyPrev.addEventListener('click', () => this.showPreviousStory());
        }

        if (storyNext) {
            storyNext.addEventListener('click', () => this.showNextStory());
        }
    }

    setupGroupsChannelsEventListeners() {
        // المجموعات
        const createGroupBtn = document.getElementById('createGroupBtn');
        const createGroupForm = document.getElementById('createGroupForm');
        const closeGroupModal = document.getElementById('closeGroupModal');
        const cancelGroupBtn = document.getElementById('cancelGroupBtn');

        if (createGroupBtn) {
            createGroupBtn.addEventListener('click', () => this.showCreateGroupModal());
        }

        if (createGroupForm) {
            createGroupForm.addEventListener('submit', (e) => this.createGroup(e));
        }

        if (closeGroupModal) {
            closeGroupModal.addEventListener('click', () => this.hideCreateGroupModal());
        }

        if (cancelGroupBtn) {
            cancelGroupBtn.addEventListener('click', () => this.hideCreateGroupModal());
        }

        // القنوات
        const createChannelBtn = document.getElementById('createChannelBtn');
        const createChannelForm = document.getElementById('createChannelForm');
        const closeChannelModal = document.getElementById('closeChannelModal');
        const cancelChannelBtn = document.getElementById('cancelChannelBtn');

        if (createChannelBtn) {
            createChannelBtn.addEventListener('click', () => this.showCreateChannelModal());
        }

        if (createChannelForm) {
            createChannelForm.addEventListener('submit', (e) => this.createChannel(e));
        }

        if (closeChannelModal) {
            closeChannelModal.addEventListener('click', () => this.hideCreateChannelModal());
        }

        if (cancelChannelBtn) {
            cancelChannelBtn.addEventListener('click', () => this.hideCreateChannelModal());
        }
    }

    setupMediaEventListeners() {
        const uploadMediaBtn = document.getElementById('uploadMediaBtn');
        const uploadMediaForm = document.getElementById('uploadMediaForm');
        const closeUploadModal = document.getElementById('closeUploadModal');
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');

        if (uploadMediaBtn) {
            uploadMediaBtn.addEventListener('click', () => this.showUploadMediaModal());
        }

        if (uploadMediaForm) {
            uploadMediaForm.addEventListener('submit', (e) => this.uploadMedia(e));
        }

        if (closeUploadModal) {
            closeUploadModal.addEventListener('click', () => this.hideUploadMediaModal());
        }

        if (cancelUploadBtn) {
            cancelUploadBtn.addEventListener('click', () => this.hideUploadMediaModal());
        }
    }

    setupUtilityEventListeners() {
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const overlay = document.getElementById('overlay');
        const floatingActionBtn = document.getElementById('floatingActionBtn');
        const reloadBtn = document.getElementById('reloadBtn');
        const chatToggle = document.getElementById('chatToggle');
        const chatToggleMain = document.getElementById('chatToggleMain');

        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => this.toggleMobileMenu());
        }

        if (overlay) {
            overlay.addEventListener('click', () => this.closeMobileMenu());
        }

        if (floatingActionBtn) {
            floatingActionBtn.addEventListener('click', () => this.toggleQuickActions());
        }

        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => location.reload());
        }

        if (chatToggle) {
            chatToggle.addEventListener('click', () => this.toggleChatSidebar());
        }

        if (chatToggleMain) {
            chatToggleMain.addEventListener('click', () => this.toggleChatSidebar());
        }

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

        // تحديث حالة الاتصال
        window.addEventListener('online', () => {
            this.showNotification('تم استعادة الاتصال بالإنترنت', 'success');
            this.updateConnectionStatus(true);
        });

        window.addEventListener('offline', () => {
            this.showNotification('فقد الاتصال بالإنترنت', 'error');
            this.updateConnectionStatus(false);
        });
    }

    // ============ دوال التطبيق الرئيسية ============
    startApp() {
        console.log('🎬 بدء التطبيق...');
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            console.log('✅ تم إخفاء شاشة الترحيب');
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

    toggleEmojiPicker() {
        const pickerContainer = document.getElementById('emojiPickerContainer');
        if (pickerContainer) {
            pickerContainer.classList.toggle('active');
            
            // تهيئة منتقي الإيموجي إذا لم يكن معيناً
            if (!this.emojiPicker && window.EmojiPickerElement) {
                this.initializeEmojiPicker();
            }
        }
    }

    initializeEmojiPicker() {
        const emojiPicker = document.querySelector('emoji-picker');
        if (emojiPicker) {
            emojiPicker.addEventListener('emoji-click', (event) => {
                const input = document.getElementById('chatInput');
                if (input) {
                    input.value += event.detail.unicode;
                    input.focus();
                }
            });
            this.emojiPicker = emojiPicker;
        }
    }

    triggerFileInput() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
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
                },
                transports: ['websocket', 'polling']
            });

            this.setupSocketEvents();
            
        } catch (error) {
            console.error('❌ خطأ في تهيئة السوكت:', error);
            this.showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('✅ متصل بالسيرفر');
            this.updateConnectionStatus(true);
            this.showNotification('متصل بالخادم', 'success');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ تم قطع الاتصال:', reason);
            this.updateConnectionStatus(false);
            this.showNotification('تم قطع الاتصال بالخادم', 'error');
        });

        this.socket.on('authenticated', (data) => {
            console.log('🔓 تمت المصادقة عبر السوكت');
            if (data.user) {
                this.currentUser = data.user;
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                this.updateUserInfo();
            }
        });

        this.socket.on('new_message', (data) => {
            this.handleNewMessage(data);
        });

        this.socket.on('user_typing', (data) => {
            this.handleUserTyping(data);
        });

        this.socket.on('user_status_changed', (data) => {
            this.handleUserStatusChanged(data);
        });

        this.socket.on('error', (data) => {
            console.error('❌ خطأ في السوكت:', data);
            this.showNotification(data.message || 'خطأ في الاتصال', 'error');
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ خطأ في اتصال السوكت:', error);
            this.updateConnectionStatus(false);
        });
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
            await Promise.allSettled([
                this.loadUsers(),
                this.loadConversations(),
                this.loadStories(),
                this.loadGroups(),
                this.loadChannels()
            ]);
        }
    }

    async loadUsers() {
        try {
            const response = await this.apiRequest('/api/users');
            if (response.ok) {
                const data = await response.json();
                this.allUsers = data.users || [];
            }
        } catch (error) {
            console.error('خطأ في تحميل المستخدمين:', error);
        }
    }

    async loadConversations() {
        try {
            const response = await this.apiRequest('/api/chat/conversations');
            if (response.ok) {
                const data = await response.json();
                this.conversations = data.conversations || [];
                this.renderConversations(this.conversations);
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
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <p>لا توجد محادثات</p>
                    <button class="btn btn-primary" onclick="educationalPlatform.showNewChatModal()">
                        ابدأ محادثة جديدة
                    </button>
                </div>
            `;
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
                <div class="conversation-name">${this.escapeHtml(conversation.name)}</div>
                <div class="conversation-last-message">${this.truncateText(lastMessage, 30)}</div>
            </div>
            <div class="conversation-meta">
                <div class="conversation-time">${this.formatTime(conversation.updatedAt)}</div>
            </div>
        `;

        div.addEventListener('click', () => this.selectConversation(conversation._id));
        return div;
    }

    setupNewChatButton() {
        const chatHeader = document.querySelector('.chat-sidebar .chat-header');
        if (!chatHeader) return;

        // إزالة الزر إذا كان موجوداً
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
        if (this.allUsers.length === 0) {
            this.showNotification('جاري تحميل المستخدمين...', 'info');
            this.loadUsers();
            return;
        }

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
                                            <div style="font-size: 0.8rem; color: #666;">${this.getRoleText(user.role)}</div>
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
            const response = await this.apiRequest('/api/chat/conversations', {
                method: 'POST',
                body: JSON.stringify({
                    participantId: userId
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showNotification('تم بدء المحادثة بنجاح', 'success');
                await this.loadConversations();
                
                // تحديد المحادثة الجديدة
                if (data.conversation) {
                    this.selectConversation(data.conversation._id);
                }
            } else {
                this.showNotification(data.message || 'فشل في بدء المحادثة', 'error');
            }
        } catch (error) {
            console.error('خطأ في بدء المحادثة:', error);
            this.showNotification('خطأ في بدء المحادثة', 'error');
        }
    }

    selectConversation(conversationId) {
        const conversation = this.conversations.find(c => c._id === conversationId);
        if (!conversation) return;

        this.currentChat = conversation;
        
        document.getElementById('activeChatName').textContent = conversation.name;
        document.getElementById('activeChatAvatar').textContent = conversation.name.charAt(0);
        
        const chatInputContainer = document.getElementById('chatInputContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (chatInputContainer) chatInputContainer.style.display = 'flex';
        if (emptyChat) emptyChat.style.display = 'none';

        this.loadMessages(conversationId);
        
        // تحديث حالة المحادثة النشطة
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeConversation = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (activeConversation) {
            activeConversation.classList.add('active');
        }

        // الانضمام إلى غرفة المحادثة
        if (this.socket) {
            this.socket.emit('join_conversation', conversationId);
        }
    }

    async loadMessages(conversationId) {
        try {
            const response = await this.apiRequest(`/api/chat/conversations/${conversationId}/messages?limit=50`);
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
            ${isSent ? `
                <div class="message-status">
                    <i class="fas fa-check${message.readBy && message.readBy.length > 1 ? '-double' : ''}"></i>
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
            this.stopTyping();

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
        
        // تحديث قائمة المحادثات
        this.loadConversations();
    }

    handleTyping() {
        if (this.currentChat && this.socket) {
            this.socket.emit('typing_start', {
                conversationId: this.currentChat._id
            });
            
            // إعادة تعيين مؤقت إيقاف الكتابة
            clearTimeout(this.typingTimeouts.get(this.currentChat._id));
            this.typingTimeouts.set(this.currentChat._id, setTimeout(() => {
                this.stopTyping();
            }, 1000));
        }
    }

    stopTyping() {
        if (this.currentChat && this.socket) {
            this.socket.emit('typing_stop', {
                conversationId: this.currentChat._id
            });
        }
    }

    handleUserTyping(data) {
        if (data.conversationId !== this.currentChat?._id) return;

        const typingIndicator = document.getElementById('typingIndicator');
        if (!typingIndicator) return;

        if (data.isTyping) {
            this.typingUsers.set(data.userId, true);
        } else {
            this.typingUsers.delete(data.userId);
        }

        if (this.typingUsers.size > 0) {
            typingIndicator.style.display = 'block';
            typingIndicator.textContent = `${this.typingUsers.size} مستخدم يكتب...`;
        } else {
            typingIndicator.style.display = 'none';
        }
    }

    handleUserStatusChanged(data) {
        console.log('تحديث حالة المستخدم:', data);
        // يمكن تحديث حالة المستخدمين في القوائم
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
            const response = await this.apiRequest('/api/stories');
            if (response.ok) {
                const data = await response.json();
                this.stories = data.stories || [];
                this.renderStories(this.stories);
            }
        } catch (error) {
            console.error('خطأ في تحميل القصص:', error);
        }
    }

    renderStories(stories) {
        const container = document.getElementById('storiesContainer');
        if (!container) return;

        container.innerHTML = '';

        if (stories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-camera"></i>
                    <p>لا توجد قصص حالية</p>
                    <button class="btn btn-primary" onclick="educationalPlatform.showCreateStoryModal()">
                        أضف قصة جديدة
                    </button>
                </div>
            `;
            return;
        }

        stories.forEach((story, index) => {
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

        const storyViewer = document.getElementById('storyViewer');
        const storyImage = document.getElementById('currentStoryImage');
        
        if (storyViewer && storyImage) {
            storyImage.src = story.mediaUrl;
            document.getElementById('storyAuthorName').textContent = 'مستخدم';
            document.getElementById('storyAuthorAvatar').textContent = story.userId.charAt(0);
            document.getElementById('storyTime').textContent = this.formatTime(story.createdAt);
            
            storyViewer.classList.add('active');
            this.startStoryProgress();

            // تسجيل المشاهدة
            this.recordStoryView(story._id);
        }
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
            await this.apiRequest(`/api/stories/${storyId}/view`, {
                method: 'POST'
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
            const response = await this.apiRequest('/api/groups');
            if (response.ok) {
                const data = await response.json();
                this.groups = data.groups || [];
                this.renderGroups(this.groups);
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
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>لا توجد مجموعات</p>
                    <button class="btn btn-primary" onclick="educationalPlatform.showCreateGroupModal()">
                        أنشئ مجموعة جديدة
                    </button>
                </div>
            `;
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
            const response = await this.apiRequest(`/api/groups/${groupId}/join`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showNotification('تم الانضمام للمجموعة بنجاح', 'success');
                this.loadGroups();
            } else {
                const data = await response.json();
                this.showNotification(data.message || 'فشل في الانضمام للمجموعة', 'error');
            }
        } catch (error) {
            console.error('خطأ في الانضمام للمجموعة:', error);
            this.showNotification('فشل في الانضمام للمجموعة', 'error');
        }
    }

    enterGroup(groupId) {
        this.showNotification('تم الدخول إلى المجموعة', 'success');
        // هنا يمكن إضافة منطق للدخول إلى دردشة المجموعة
    }

    async createGroup(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const groupData = {
            name: formData.get('groupName'),
            description: formData.get('groupDescription'),
            isPublic: formData.get('groupPrivacy') === 'public'
        };

        try {
            const response = await this.apiRequest('/api/groups', {
                method: 'POST',
                body: JSON.stringify(groupData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showNotification('تم إنشاء المجموعة بنجاح', 'success');
                this.hideCreateGroupModal();
                this.loadGroups();
            } else {
                this.showNotification(data.message || 'فشل في إنشاء المجموعة', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء المجموعة:', error);
            this.showNotification('فشل في إنشاء المجموعة', 'error');
        }
    }

    showCreateGroupModal() {
        const modal = document.getElementById('createGroupModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideCreateGroupModal() {
        const modal = document.getElementById('createGroupModal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('createGroupForm').reset();
        }
    }

    // ============ إدارة القنوات ============
    async loadChannels() {
        try {
            const response = await this.apiRequest('/api/channels');
            if (response.ok) {
                const data = await response.json();
                this.channels = data.channels || [];
                this.renderChannels(this.channels);
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
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-broadcast-tower"></i>
                    <p>لا توجد قنوات</p>
                    <button class="btn btn-primary" onclick="educationalPlatform.showCreateChannelModal()">
                        أنشئ قناة جديدة
                    </button>
                </div>
            `;
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
        
        const isMember = channel.members?.includes(this.currentUser._id);
        
        div.innerHTML = `
            <div class="channel-header">
                <div class="channel-avatar">
                    <i class="fas fa-broadcast-tower"></i>
                </div>
                <h3>${this.escapeHtml(channel.name)}</h3>
                <p>${channel.stats?.memberCount || channel.members?.length || 0} مشترك</p>
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
                <button class="btn btn-primary btn-block mt-3 subscribe-channel-btn" data-channel-id="${channel._id}">
                    <i class="fas fa-bell"></i>
                    ${isMember ? 'مشترك' : 'اشترك'}
                </button>
            </div>
        `;

        div.querySelector('.subscribe-channel-btn').addEventListener('click', () => {
            if (isMember) {
                this.enterChannel(channel._id);
            } else {
                this.subscribeChannel(channel._id);
            }
        });
        return div;
    }

    async subscribeChannel(channelId) {
        try {
            const response = await this.apiRequest(`/api/channels/${channelId}/join`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showNotification('تم الاشتراك في القناة بنجاح', 'success');
                this.loadChannels();
            } else {
                const data = await response.json();
                this.showNotification(data.message || 'فشل في الاشتراك بالقناة', 'error');
            }
        } catch (error) {
            console.error('خطأ في الاشتراك بالقناة:', error);
            this.showNotification('فشل في الاشتراك بالقناة', 'error');
        }
    }

    enterChannel(channelId) {
        this.showNotification('تم الدخول إلى القناة', 'success');
        // هنا يمكن إضافة منطق للدخول إلى قناة البث
    }

    async createChannel(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const channelData = {
            name: formData.get('channelName'),
            description: formData.get('channelDescription'),
            category: formData.get('channelCategory')
        };

        try {
            const response = await this.apiRequest('/api/channels', {
                method: 'POST',
                body: JSON.stringify(channelData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showNotification('تم إنشاء القناة بنجاح', 'success');
                this.hideCreateChannelModal();
                this.loadChannels();
            } else {
                this.showNotification(data.message || 'فشل في إنشاء القناة', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء القناة:', error);
            this.showNotification('فشل في إنشاء القناة', 'error');
        }
    }

    showCreateChannelModal() {
        const modal = document.getElementById('createChannelModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideCreateChannelModal() {
        const modal = document.getElementById('createChannelModal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('createChannelForm').reset();
        }
    }

    // ============ إدارة الوسائط ============
    async loadMedia() {
        try {
            const mediaGrid = document.getElementById('mediaGrid');
            if (mediaGrid) {
                mediaGrid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-photo-video"></i>
                        <p>لا توجد وسائط بعد</p>
                        <button class="btn btn-primary" onclick="educationalPlatform.showUploadMediaModal()">
                            رفع وسائط جديدة
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            console.error('خطأ في تحميل الوسائط:', error);
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file || !this.currentChat) return;

        this.showNotification('جاري رفع الملف...', 'info');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await this.apiRequest('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const fileData = await response.json();
                this.sendFileMessage(fileData.data);
                this.showNotification('تم رفع الملف بنجاح', 'success');
            } else {
                this.showNotification('فشل في رفع الملف', 'error');
            }
        } catch (error) {
            console.error('خطأ في رفع الملف:', error);
            this.showNotification('فشل في رفع الملف', 'error');
        }

        event.target.value = '';
    }

    sendFileMessage(fileData) {
        const message = {
            content: `📎 ${fileData.originalName}`,
            file: fileData,
            conversationId: this.currentChat._id,
            type: 'file'
        };

        this.addMessageToUI({
            ...message,
            _id: 'temp-file-' + Date.now(),
            senderId: this.currentUser._id,
            createdAt: new Date().toISOString(),
            readBy: [this.currentUser._id]
        }, true);
        
        if (this.socket) {
            this.socket.emit('send_message', message);
        }
    }

    showUploadMediaModal() {
        const modal = document.getElementById('uploadMediaModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideUploadMediaModal() {
        const modal = document.getElementById('uploadMediaModal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('uploadMediaForm').reset();
        }
    }

    async uploadMedia(event) {
        event.preventDefault();
        this.showNotification('ميزة رفع الوسائط قريباً', 'info');
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
                                <div class="stat-number">${this.allUsers.length}</div>
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
                                <div class="stat-number">${this.stories.length}</div>
                                <div class="stat-label">القصص النشطة</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-broadcast-tower"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-number">${this.channels.length}</div>
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
                                    <p>انضم مستخدم جديد إلى المنصة</p>
                                    <span class="activity-time">منذ قليل</span>
                                </div>
                            </div>
                            <div class="activity-item">
                                <i class="fas fa-comment"></i>
                                <div class="activity-content">
                                    <p>تم إرسال رسالة جديدة</p>
                                    <span class="activity-time">منذ 5 دقائق</span>
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
        this.loadInitialData();
    }

    async handleLogout() {
        try {
            await this.apiRequest('/api/auth/logout', {
                method: 'POST'
            });
        } catch (error) {
            console.error('خطأ في تسجيل الخروج:', error);
        } finally {
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
    }

    // ============ دوال مساعدة ============
    async apiRequest(endpoint, options = {}) {
        const token = localStorage.getItem('authToken');
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            config.body = JSON.stringify(options.body);
        }

        return await fetch(endpoint, config);
    }

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
        // إنشاء عنصر الإشعار
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 20px;
            background: ${type === 'success' ? '#4cc9f0' : type === 'error' ? '#f72585' : '#4895ef'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 400px;
            animation: slideIn 0.3s ease;
        `;

        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // إزالة الإشعار بعد 5 ثواني
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);

        // إضافة أنيميشن
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(-100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    showLoading(message = 'جاري التحميل...') {
        this.hideLoading();

        const loadingEl = document.createElement('div');
        loadingEl.id = 'loading-overlay';
        loadingEl.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;

        loadingEl.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 12px; text-align: center;">
                <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #4361ee; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                <p>${message}</p>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

        document.body.appendChild(loadingEl);
    }

    hideLoading() {
        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) {
            loadingEl.remove();
        }
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 تم تحميل DOM بنجاح، بدء التطبيق...');
    window.educationalPlatform = new EducationalPlatform();
});

// التعامل مع أخطاء التحميل
window.addEventListener('error', (event) => {
    console.error('❌ خطأ في الصفحة:', event.error);
});
