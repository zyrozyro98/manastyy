// public/js/app.js - الملف الرئيسي الكامل
class EducationalPlatform {
    constructor() {
        this.currentUser = null;
        this.socket = null;
        this.currentChat = null;
        this.conversations = new Map();
        this.allUsers = [];
        this.stories = [];
        this.groups = [];
        this.channels = [];
        
        this.init();
    }

    async init() {
        console.log('🚀 بدء تهيئة المنصة التعليمية...');
        
        try {
            this.setupEventListeners();
            await this.checkAuthentication();
            
            if (this.currentUser) {
                this.initializeSocket();
                await this.loadInitialData();
                this.setupAdminFeatures();
            }
            
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
                console.error('خطأ في تحميل بيانات المستخدم:', error);
                this.handleLogout();
            }
        } else {
            this.showUnauthenticatedUI();
            this.navigateToPage('home');
        }
    }

    showAuthenticatedUI() {
        document.getElementById('header').style.display = 'block';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('welcomeScreen').style.display = 'none';

        const userInfo = document.getElementById('userInfo');
        const logoutBtn = document.getElementById('logoutBtn');
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');

        if (userInfo) userInfo.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (loginBtn) loginBtn.classList.add('hidden');
        if (registerBtn) registerBtn.classList.add('hidden');
        
        if (this.currentUser) {
            const userNameDisplay = document.getElementById('userNameDisplay');
            const userRoleDisplay = document.getElementById('userRoleDisplay');
            const userAvatarText = document.getElementById('userAvatarText');
            
            if (userNameDisplay) userNameDisplay.textContent = this.currentUser.fullName;
            if (userRoleDisplay) userRoleDisplay.textContent = this.getRoleText(this.currentUser.role);
            if (userAvatarText) userAvatarText.textContent = this.currentUser.fullName.charAt(0);
        }
    }

    showUnauthenticatedUI() {
        document.getElementById('header').style.display = 'block';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('welcomeScreen').style.display = 'none';

        const userInfo = document.getElementById('userInfo');
        const logoutBtn = document.getElementById('logoutBtn');
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');

        if (userInfo) userInfo.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (registerBtn) registerBtn.classList.remove('hidden');
    }

    getRoleText(role) {
        const roles = {
            'admin': 'مدير',
            'teacher': 'معلم',
            'student': 'طالب'
        };
        return roles[role] || role;
    }

    // ============ إدارة الواجهة ============
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
            case 'dashboard':
                await this.loadDashboard();
                break;
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
            case 'admin':
                await this.loadAdminPage();
                break;
        }
    }

    // ============ إعداد مستمعي الأحداث ============
    setupEventListeners() {
        console.log('🔧 إعداد مستمعي الأحداث...');
        
        // زر ابدأ الآن
        document.getElementById('startAppBtn').addEventListener('click', () => {
            this.startApp();
        });

        // التنقل بين الصفحات
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-page]');
            if (target) {
                e.preventDefault();
                const pageName = target.getAttribute('data-page');
                this.navigateToPage(pageName);
            }
        });

        // المصادقة
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        // الدردشة
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('newChatBtn').addEventListener('click', () => this.showNewChatModal());

        // القصص
        document.getElementById('createStoryBtn').addEventListener('click', () => this.showCreateStoryModal());

        // المجموعات والقنوات
        document.getElementById('createGroupBtn').addEventListener('click', () => this.showCreateGroupModal());
        document.getElementById('createChannelBtn').addEventListener('click', () => this.showCreateChannelModal());
    }

    // ============ بدء التطبيق ============
    startApp() {
        console.log('🎬 بدء التطبيق...');
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('header').style.display = 'block';
        document.getElementById('main-content').style.display = 'block';
        this.navigateToPage('home');
        this.showNotification('مرحباً بك في المنصة التعليمية!', 'success');
    }

    // ============ نظام السوكت ============
    initializeSocket() {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        try {
            this.socket = io({
                auth: {
                    token: token
                }
            });

            this.socket.on('connect', () => {
                console.log('✅ متصل بالسيرفر');
            });

            this.socket.on('authenticated', (data) => {
                console.log('🔓 تمت المصادقة عبر السوكت');
            });

            this.socket.on('new_message', (data) => {
                this.receiveMessage(data);
            });

            this.socket.on('user_status_changed', (data) => {
                this.updateUserStatus(data);
            });

        } catch (error) {
            console.error('❌ خطأ في تهيئة السوكت:', error);
        }
    }

    // ============ تحميل البيانات الأولية ============
    async loadInitialData() {
        if (!this.currentUser) return;

        try {
            await Promise.all([
                this.loadUsers(),
                this.loadConversations(),
                this.loadStories(),
                this.loadGroups(),
                this.loadChannels()
            ]);
        } catch (error) {
            console.error('خطأ في تحميل البيانات الأولية:', error);
        }
    }

    async loadUsers() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.allUsers = data.data.users;
            }
        } catch (error) {
            console.error('خطأ في تحميل المستخدمين:', error);
        }
    }

    // ============ نظام الدردشة ============
    async loadConversations() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/chat/conversations', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderConversations(data.data.conversations);
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
            conversation.lastMessage.content : 'لا توجد رسائل';

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

    showNewChatModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>بدء محادثة جديدة</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="users-list" style="max-height: 300px; overflow-y: auto;">
                        ${this.allUsers
                            .filter(user => user._id !== this.currentUser._id)
                            .map(user => `
                                <div class="user-item" data-user-id="${user._id}" 
                                     style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">
                                    <div class="user-avatar" 
                                         style="width: 40px; height: 40px; background: #4361ee; border-radius: 50%; 
                                                display: flex; align-items: center; justify-content: center; 
                                                color: white; font-weight: bold; margin-left: 10px;">
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
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        
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
                body: JSON.stringify({
                    participantId: userId
                })
            });

            if (response.ok) {
                this.showNotification('تم بدء المحادثة بنجاح', 'success');
                await this.loadConversations();
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
        
        const chatInputContainer = document.getElementById('chatInputContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (chatInputContainer) chatInputContainer.style.display = 'flex';
        if (emptyChat) emptyChat.style.display = 'none';

        this.loadMessages(conversationId);
        
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-conversation-id="${conversationId}"]`).classList.add('active');
    }

    async loadMessages(conversationId) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/chat/conversations/${conversationId}/messages?limit=50`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
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

        const messageData = {
            content: content,
            conversationId: this.currentChat._id
        };

        try {
            this.addMessageToUI({
                ...messageData,
                _id: 'temp-' + Date.now(),
                senderId: this.currentUser._id,
                createdAt: new Date().toISOString()
            }, true);

            input.value = '';

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

        const messageElement = this.createMessageElement(message);
        container.appendChild(messageElement);
        this.scrollToBottom();
    }

    receiveMessage(data) {
        if (this.currentChat && data.conversationId === this.currentChat._id) {
            this.addMessageToUI(data.message, false);
        }
    }

    scrollToBottom() {
        const container = document.getElementById('chatMessages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // ============ نظام القصص ============
    async loadStories() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/stories', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.stories = data.data.stories;
                this.renderStories();
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
        
        const storyUser = this.allUsers.find(user => user._id === story.userId) || { fullName: 'مستخدم' };
        
        div.innerHTML = `
            <div class="story-avatar">
                <span>${storyUser.fullName.charAt(0)}</span>
            </div>
            <div class="story-author">${storyUser.fullName}</div>
        `;

        div.addEventListener('click', () => this.viewStory(story));
        return div;
    }

    viewStory(story) {
        this.showNotification('عرض القصة: ' + (story.caption || 'بدون تعليق'), 'info');
    }

    showCreateStoryModal() {
        this.showNotification('ميزة إنشاء القصص قريباً', 'info');
    }

    // ============ نظام المجموعات ============
    async loadGroups() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/groups', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.groups = data.data.groups;
                this.renderGroups();
            }
        } catch (error) {
            console.error('خطأ في تحميل المجموعات:', error);
        }
    }

    renderGroups() {
        const container = document.getElementById('groupsGrid');
        if (!container) return;

        container.innerHTML = '';

        if (!this.groups || this.groups.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد مجموعات</div>';
            return;
        }

        this.groups.forEach(group => {
            const groupElement = this.createGroupElement(group);
            container.appendChild(groupElement);
        });
    }

    createGroupElement(group) {
        const div = document.createElement('div');
        div.className = 'group-card';
        
        const isMember = group.members.includes(this.currentUser._id);
        
        div.innerHTML = `
            <div class="group-header">
                <div class="group-avatar">
                    <i class="fas fa-users"></i>
                </div>
                <h3>${this.escapeHtml(group.name)}</h3>
                <p>${group.members.length} عضو</p>
            </div>
            <div class="group-info">
                <p>${this.escapeHtml(group.description || 'لا يوجد وصف')}</p>
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
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/groups/${groupId}/join`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.showNotification('تم الانضمام للمجموعة بنجاح', 'success');
                this.loadGroups();
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
    }

    showCreateGroupModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>إنشاء مجموعة جديدة</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="createGroupForm">
                        <div class="form-group">
                            <label for="groupName">اسم المجموعة</label>
                            <input type="text" id="groupName" required class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="groupDescription">وصف المجموعة</label>
                            <textarea id="groupDescription" rows="3" class="form-control"></textarea>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-outline" id="cancelGroupBtn">إلغاء</button>
                            <button type="submit" class="btn btn-primary">إنشاء المجموعة</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#cancelGroupBtn').addEventListener('click', () => modal.remove());

        modal.querySelector('#createGroupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const groupData = {
                name: document.getElementById('groupName').value,
                description: document.getElementById('groupDescription').value
            };

            await this.createGroup(groupData);
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    async createGroup(groupData) {
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
                this.loadGroups();
            } else {
                this.showNotification('فشل في إنشاء المجموعة', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء المجموعة:', error);
            this.showNotification('فشل في إنشاء المجموعة', 'error');
        }
    }

    // ============ نظام القنوات ============
    async loadChannels() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/channels', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.channels = data.data.channels;
                this.renderChannels();
            }
        } catch (error) {
            console.error('خطأ في تحميل القنوات:', error);
        }
    }

    renderChannels() {
        const container = document.getElementById('channelsGrid');
        if (!container) return;

        container.innerHTML = '';

        if (!this.channels || this.channels.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: #666;">لا توجد قنوات</div>';
            return;
        }

        this.channels.forEach(channel => {
            const channelElement = this.createChannelElement(channel);
            container.appendChild(channelElement);
        });
    }

    createChannelElement(channel) {
        const div = document.createElement('div');
        div.className = 'channel-card';
        
        const isMember = channel.members.includes(this.currentUser._id);
        
        div.innerHTML = `
            <div class="channel-header">
                <div class="channel-avatar">
                    <i class="fas fa-broadcast-tower"></i>
                </div>
                <h3>${this.escapeHtml(channel.name)}</h3>
                <p>${channel.members.length} مشترك</p>
            </div>
            <div class="channel-info">
                <p>${this.escapeHtml(channel.description || 'لا يوجد وصف')}</p>
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
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/channels/${channelId}/join`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.showNotification('تم الاشتراك في القناة بنجاح', 'success');
                this.loadChannels();
            } else {
                this.showNotification('فشل في الاشتراك بالقناة', 'error');
            }
        } catch (error) {
            console.error('خطأ في الاشتراك بالقناة:', error);
            this.showNotification('فشل في الاشتراك بالقناة', 'error');
        }
    }

    enterChannel(channelId) {
        this.showNotification('تم الدخول إلى القناة', 'success');
    }

    showCreateChannelModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>إنشاء قناة جديدة</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="createChannelForm">
                        <div class="form-group">
                            <label for="channelName">اسم القناة</label>
                            <input type="text" id="channelName" required class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="channelDescription">وصف القناة</label>
                            <textarea id="channelDescription" rows="3" class="form-control"></textarea>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-outline" id="cancelChannelBtn">إلغاء</button>
                            <button type="submit" class="btn btn-primary">إنشاء القناة</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#cancelChannelBtn').addEventListener('click', () => modal.remove());

        modal.querySelector('#createChannelForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const channelData = {
                name: document.getElementById('channelName').value,
                description: document.getElementById('channelDescription').value
            };

            await this.createChannel(channelData);
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    async createChannel(channelData) {
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
                this.loadChannels();
            } else {
                this.showNotification('فشل في إنشاء القناة', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء القناة:', error);
            this.showNotification('فشل في إنشاء القناة', 'error');
        }
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
                        <p>مرحباً بك ${this.currentUser.fullName} في المنصة التعليمية</p>
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
                                <div class="stat-number">${this.conversations.size}</div>
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
                `;
            }
        } catch (error) {
            console.error('خطأ في تحميل لوحة التحكم:', error);
        }
    }

    // ============ الميزات الإدارية ============
    setupAdminFeatures() {
        if (this.currentUser.role === 'admin') {
            this.addAdminNavigation();
            this.setupAdminPage();
        }
    }

    addAdminNavigation() {
        const nav = document.querySelector('.nav');
        const adminNavItem = document.createElement('a');
        adminNavItem.href = '#';
        adminNavItem.className = 'nav-item';
        adminNavItem.dataset.page = 'admin';
        adminNavItem.innerHTML = `
            <i class="fas fa-crown"></i>
            لوحة المدير
        `;
        nav.insertBefore(adminNavItem, nav.querySelector('[data-page="chat"]'));
    }

    setupAdminPage() {
        const mainContent = document.querySelector('.main-content');
        const adminPage = document.createElement('div');
        adminPage.className = 'page';
        adminPage.id = 'admin-page';
        adminPage.innerHTML = this.getAdminPageHTML();
        mainContent.appendChild(adminPage);
    }

    getAdminPageHTML() {
        return `
            <div class="admin-dashboard">
                <h1 class="section-title">
                    <i class="fas fa-crown"></i>
                    لوحة إدارة المنصة
                </h1>
                
                <div class="admin-stats" id="adminStats">
                    <!-- سيتم ملء الإحصائيات ديناميكياً -->
                </div>

                <div class="admin-tabs">
                    <div class="tab-nav">
                        <button class="tab-btn active" data-tab="users">إدارة المستخدمين</button>
                        <button class="tab-btn" data-tab="reports">التقارير</button>
                    </div>
                    
                    <div class="tab-content">
                        <div class="tab-pane active" id="users-tab">
                            <div class="admin-section">
                                <h3>إدارة المستخدمين</h3>
                                <div class="admin-actions">
                                    <button class="btn btn-primary" id="createUserBtn">
                                        <i class="fas fa-user-plus"></i>
                                        إنشاء مستخدم
                                    </button>
                                </div>
                                <div class="users-table-container">
                                    <table class="admin-table">
                                        <thead>
                                            <tr>
                                                <th>الاسم</th>
                                                <th>البريد الإلكتروني</th>
                                                <th>الدور</th>
                                                <th>الحالة</th>
                                                <th>آخر نشاط</th>
                                                <
