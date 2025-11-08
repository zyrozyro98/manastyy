// public/js/app.js - التطبيق الأمامي الكامل
class EducationalPlatform {
    constructor() {
        this.currentUser = null;
        this.socket = null;
        this.currentChat = null;
        this.conversations = new Map();
        this.groups = new Map();
        this.stories = [];
        this.allUsers = [];
        this.notifications = [];
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة المنصة التعليمية...');
        
        try {
            this.setupEventListeners();
            await this.checkAuthentication();
            this.initializeSocket();
            await this.loadInitialData();
            
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
            } catch (error) {
                this.handleLogout();
            }
        } else {
            this.showUnauthenticatedUI();
            this.navigateToPage('home');
        }
    }

    showAuthenticatedUI() {
        document.getElementById('userInfo')?.classList.remove('hidden');
        document.getElementById('logoutBtn')?.classList.remove('hidden');
        document.getElementById('loginBtn')?.classList.add('hidden');
        document.getElementById('registerBtn')?.classList.add('hidden');
        
        if (this.currentUser) {
            document.getElementById('userNameDisplay').textContent = this.currentUser.fullName;
            document.getElementById('userRoleDisplay').textContent = this.currentUser.role;
            document.getElementById('userAvatarText').textContent = this.currentUser.fullName.charAt(0);
        }
    }

    showUnauthenticatedUI() {
        document.getElementById('userInfo')?.classList.add('hidden');
        document.getElementById('logoutBtn')?.classList.add('hidden');
        document.getElementById('loginBtn')?.classList.remove('hidden');
        document.getElementById('registerBtn')?.classList.remove('hidden');
    }

    // ============ إدارة التنقل ============
    navigateToPage(pageName) {
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
            case 'dashboard':
                await this.loadDashboard();
                break;
        }
    }

    // ============ إعداد مستمعي الأحداث ============
    setupEventListeners() {
        // التنقل
        document.querySelectorAll('[data-page]').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToPage(element.getAttribute('data-page'));
            });
        });

        // زر ابدأ الآن
        document.getElementById('startAppBtn')?.addEventListener('click', () => {
            this.startApp();
        });

        // المصادقة
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm')?.addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        // الدردشة
        this.setupChatEventListeners();

        // المجموعات
        this.setupGroupsEventListeners();

        // الأزرار الإضافية
        this.setupUtilityEventListeners();
    }

    setupChatEventListeners() {
        document.getElementById('sendMessageBtn')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        document.getElementById('chatInput')?.addEventListener('input', () => this.handleTyping());
        document.getElementById('chatInput')?.addEventListener('blur', () => this.stopTyping());
    }

    setupGroupsEventListeners() {
        document.getElementById('createGroupBtn')?.addEventListener('click', () => this.showCreateGroupModal());
        document.getElementById('createGroupForm')?.addEventListener('submit', (e) => this.createGroup(e));
        document.getElementById('closeGroupModal')?.addEventListener('click', () => this.hideCreateGroupModal());
        document.getElementById('cancelGroupBtn')?.addEventListener('click', () => this.hideCreateGroupModal());
    }

    setupUtilityEventListeners() {
        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('overlay')?.addEventListener('click', () => this.closeMobileMenu());
        document.getElementById('floatingActionBtn')?.addEventListener('click', () => this.toggleQuickActions());
    }

    // ============ دوال التطبيق الرئيسية ============
    startApp() {
        document.getElementById('welcomeScreen').style.display = 'none';
        this.navigateToPage('home');
        this.showNotification('مرحباً بك في المنصة التعليمية!', 'success');
    }

    toggleMobileMenu() {
        document.getElementById('mobileMenu').classList.toggle('active');
        document.getElementById('overlay').classList.toggle('active');
    }

    closeMobileMenu() {
        document.getElementById('mobileMenu').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
    }

    toggleQuickActions() {
        document.getElementById('quickActionsBar').classList.toggle('active');
    }

    // ============ نظام السوكت ============
    initializeSocket() {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        try {
            this.socket = io({
                auth: { token }
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

            this.socket.on('new_group_message', (data) => {
                this.receiveGroupMessage(data);
            });

            this.socket.on('user_typing', (data) => {
                this.showTypingIndicator(data);
            });

            this.socket.on('user_status_changed', (data) => {
                this.updateUserStatus(data);
            });

            this.socket.on('group_member_joined', (data) => {
                this.handleGroupMemberJoined(data);
            });

            this.socket.on('authenticated', (data) => {
                console.log('🔓 تمت المصادقة عبر السوكت');
            });

        } catch (error) {
            console.error('❌ خطأ في تهيئة السوكت:', error);
        }
    }

    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.innerHTML = isConnected ? 
                '<i class="fas fa-wifi"></i><span>متصل بالإنترنت</span>' :
                '<i class="fas fa-wifi-slash"></i><span>غير متصل</span>';
            statusElement.style.background = isConnected ? 
                'rgba(76, 201, 240, 0.9)' : 'rgba(247, 37, 133, 0.9)';
        }
    }

    // ============ تحميل البيانات ============
    async loadInitialData() {
        if (this.currentUser) {
            await Promise.all([
                this.loadUsers(),
                this.loadConversations(),
                this.loadGroups(),
                this.loadStories()
            ]);
        }
    }

    async loadUsers() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.allUsers = data.data.users || [];
            }
        } catch (error) {
            console.error('خطأ في تحميل المستخدمين:', error);
        }
    }

    async loadConversations() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/chat/conversations', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderConversations(data.data.conversations);
            }
        } catch (error) {
            console.error('خطأ في تحميل المحادثات:', error);
        }
    }

    async loadGroups() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/groups', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderGroups(data.data.groups);
            }
        } catch (error) {
            console.error('خطأ في تحميل المجموعات:', error);
        }
    }

    async loadStories() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/stories', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.stories = data.data.stories || [];
                this.renderStories();
            }
        } catch (error) {
            console.error('خطأ في تحميل القصص:', error);
        }
    }

    // ============ إدارة الدردشة ============
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
            conversation.lastMessage.content : 'لا توجد رسائل';
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

        const existingButton = document.getElementById('newChatBtn');
        if (existingButton) existingButton.remove();

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
                        <input type="text" id="userSearchInput" placeholder="ابحث عن مستخدم..." class="form-control" style="margin-bottom: 1rem;">
                        <div class="users-list" style="max-height: 300px; overflow-y: auto;">
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

        // البحث عن المستخدمين
        const searchInput = modal.querySelector('#userSearchInput');
        const usersList = modal.querySelector('.users-list');
        
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const userItems = usersList.querySelectorAll('.user-item');
            
            userItems.forEach(item => {
                const userName = item.querySelector('div:last-child div:first-child').textContent.toLowerCase();
                item.style.display = userName.includes(searchTerm) ? 'flex' : 'none';
            });
        });

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
            if (e.target === modal) modal.remove();
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
                body: JSON.stringify({ participantId: userId })
            });

            if (response.ok) {
                const data = await response.json();
                this.showNotification('تم بدء المحادثة بنجاح', 'success');
                await this.loadConversations();
                
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

        document.getElementById('activeChatName').textContent = this.currentChat.name;
        document.getElementById('activeChatAvatar').textContent = this.currentChat.name.charAt(0);
        
        document.getElementById('chatInputContainer').style.display = 'flex';
        document.getElementById('emptyChat').style.display = 'none';

        this.loadMessages(conversationId);
        
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-conversation-id="${conversationId}"]`)?.classList.add('active');

        this.markMessagesAsRead(conversationId);
    }

    async loadMessages(conversationId) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/chat/conversations/${conversationId}/messages?limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderMessages(data.data.messages);
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
            this.socket.emit('typing_start', { conversationId: this.currentChat._id });
        }
    }

    stopTyping() {
        if (this.currentChat && this.socket) {
            this.socket.emit('typing_stop', { conversationId: this.currentChat._id });
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

    // ============ إدارة المجموعات ============
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
            this.groups.set(group._id, group);
        });
    }

    createGroupElement(group) {
        const div = document.createElement('div');
        div.className = 'group-card';
        
        const isMember = group.members?.includes(this.currentUser._id);
        const isAdmin = group.admins?.includes(this.currentUser._id);
        
        div.innerHTML = `
            <div class="group-header">
                <div class="group-avatar">
                    <i class="fas fa-users"></i>
                </div>
                <h3>${this.escapeHtml(group.name)}</h3>
                <p>${group.members?.length || 0} عضو</p>
            </div>
            <div class="group-info">
                <p>${this.escapeHtml(group.description || 'لا يوجد وصف')}</p>
                <div class="group-stats">
                    <div class="group-stat">
                        <div class="group-stat-number">${group.members?.length || 0}</div>
                        <div class="group-stat-label">عضو</div>
                    </div>
                    <div class="group-stat">
                        <div class="group-stat-number">${isAdmin ? 'مدير' : 'عضو'}</div>
                        <div class="group-stat-label">صلاحياتك</div>
                    </div>
                </div>
                <div class="group-actions" style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button class="btn btn-primary join-group-btn" data-group-id="${group._id}" style="flex: 1;">
                        <i class="fas fa-sign-in-alt"></i>
                        ${isMember ? 'الدخول' : 'الانضمام'}
                    </button>
                    ${isMember ? `
                        <button class="btn btn-outline share-group-btn" data-group-id="${group._id}" title="مشاركة رابط المجموعة">
                            <i class="fas fa-share"></i>
                        </button>
                    ` : ''}
                </div>
                ${isMember && group.inviteCode ? `
                    <div class="invite-code" style="margin-top: 0.5rem; font-size: 0.8rem; color: #666;">
                        رمز الدعوة: <strong>${group.inviteCode}</strong>
                    </div>
                ` : ''}
            </div>
        `;

        div.querySelector('.join-group-btn').addEventListener('click', () => {
            if (isMember) {
                this.enterGroup(group._id);
            } else {
                this.joinGroup(group._id);
            }
        });

        const shareBtn = div.querySelector('.share-group-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.shareGroup(group));
        }

        return div;
    }

    async joinGroup(groupId) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/groups/${groupId}/join`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                this.showNotification('تم الانضمام للمجموعة بنجاح', 'success');
                this.loadGroups();
                
                // الانضمام لغرفة السوكت
                if (this.socket) {
                    this.socket.emit('join_group', { groupId });
                }
            } else {
                this.showNotification('فشل في الانضمام للمجموعة', 'error');
            }
        } catch (error) {
            console.error('خطأ في الانضمام للمجموعة:', error);
            this.showNotification('فشل في الانضمام للمجموعة', 'error');
        }
    }

    enterGroup(groupId) {
        this.showNotification('تم الدخول إلى المجموعة', 'success');
        // يمكنك إضافة منطق للدخول إلى دردشة المجموعة
    }

    shareGroup(group) {
        const inviteLink = `${window.location.origin}/groups/join?code=${group.inviteCode}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(inviteLink).then(() => {
                this.showNotification('تم نسخ رابط الدعوة', 'success');
            });
        } else {
            // Fallback for browsers that don't support clipboard API
            const textArea = document.createElement('textarea');
            textArea.value = inviteLink;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('تم نسخ رابط الدعوة', 'success');
        }
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
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/groups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
        document.getElementById('createGroupModal').style.display = 'flex';
    }

    hideCreateGroupModal() {
        document.getElementById('createGroupModal').style.display = 'none';
        document.getElementById('createGroupForm').reset();
    }

    receiveGroupMessage(data) {
        console.log('رسالة جماعية جديدة:', data);
        // معالجة الرسائل الجماعية
    }

    handleGroupMemberJoined(data) {
        this.showNotification(`انضم عضو جديد إلى المجموعة`, 'info');
    }

    // ============ إدارة القصص ============
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
        // تنفيذ مشاهد القصص
        this.showNotification('مشاهدة القصص قريباً', 'info');
    }

    // ============ لوحة التحكم ============
    async loadDashboard() {
        const dashboardPage = document.getElementById('dashboard-page');
        if (dashboardPage) {
            // جلب الإحصائيات
            let stats = { totalUsers: 0, totalConversations: 0, totalGroups: 0, totalStories: 0 };
            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch('/api/stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    stats = data.data.stats;
                }
            } catch (error) {
                console.error('خطأ في جلب الإحصائيات:', error);
            }

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
                            <div class="stat-number">${stats.totalUsers}</div>
                            <div class="stat-label">إجمالي المستخدمين</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <div class="stat-info">
                            <div class="stat-number">${stats.totalConversations}</div>
                            <div class="stat-label">المحادثات</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-info">
                            <div class="stat-number">${stats.totalGroups}</div>
                            <div class="stat-label">المجموعات</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-history"></i>
                        </div>
                        <div class="stat-info">
                            <div class="stat-number">${stats.totalStories}</div>
                            <div class="stat-label">القصص النشطة</div>
                        </div>
                    </div>
                </div>

                <div class="recent-activities">
                    <h3>النشاطات الأخيرة</h3>
                    <div class="activities-list">
                        <div class="activity-item">
                            <i class="fas fa-comment"></i>
                            <div class="activity-content">
                                <p>لديك ${this.conversations.size} محادثة نشطة</p>
                                <span class="activity-time">آخر تحديث: الآن</span>
                            </div>
                        </div>
                        <div class="activity-item">
                            <i class="fas fa-users"></i>
                            <div class="activity-content">
                                <p>أنت عضو في ${this.groups.size} مجموعة</p>
                                <span class="activity-time">آخر تحديث: الآن</span>
                            </div>
                        </div>
                        ${this.currentUser?.role === 'admin' ? `
                        <div class="activity-item">
                            <i class="fas fa-cog"></i>
                            <div class="activity-content">
                                <p>أنت مدير النظام - لديك صلاحيات كاملة</p>
                                <span class="activity-time">آخر تحديث: الآن</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
    }

    // ============ إدارة المصادقة ============
    async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            this.showNotification('يرجى ملء جميع الحقول', 'error');
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.handleAuthSuccess(data);
            } else {
                this.showNotification(data.message || 'فشل تسجيل الدخول', 'error');
            }
        } catch (error) {
            this.showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    async handleRegister(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
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

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.handleAuthSuccess(data);
            } else {
                this.showNotification(data.message || 'فشل إنشاء الحساب', 'error');
            }
        } catch (error) {
            this.showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    handleAuthSuccess(data) {
        localStorage.setItem('authToken', data.data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.data.user));
        
        this.currentUser = data.data.user;
        this.showAuthenticatedUI();
        this.navigateToPage('dashboard');
        this.showNotification(`مرحباً ${data.data.user.fullName}!`, 'success');
        
        this.initializeSocket();
        this.loadInitialData();
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
        return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
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
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: 'Cairo', sans-serif;
        `;
        
        if (type === 'success') {
            notification.style.background = '#4cc9f0';
        } else if (type === 'error') {
            notification.style.background = '#f72585';
        } else {
            notification.style.background = '#4361ee';
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    updateUnreadCount() {
        let totalUnread = 0;
        this.conversations.forEach(conv => {
            if (conv.unreadCount && conv.unreadCount[this.currentUser._id]) {
                totalUnread += conv.unreadCount[this.currentUser._id];
            }
        });
        
        const unreadBadge = document.getElementById('unreadMessagesCount');
        if (unreadBadge) {
            unreadBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            unreadBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
        }
    }

    updateUserStatus(data) {
        console.log('تحديث حالة المستخدم:', data);
    }
}

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', () => {
    window.educationalPlatform = new EducationalPlatform();
});
