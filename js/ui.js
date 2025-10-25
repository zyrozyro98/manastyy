// ui.js - واجهة المستخدم المحسنة للمنصة التعليمية (محدث ومصحح)
class EducationalPlatformUI {
    constructor(client) {
        this.client = client;
        this.currentView = 'home';
        this.currentConversation = null;
        this.currentChannel = null;
        this.currentGroup = null;
        this.typingUsers = new Map();
        this.typingTimeouts = new Map();
        
        this.initUI();
        this.setupEventListeners();
    }

    initUI() {
        this.updateAuthUI();
        this.showView('home');
        this.loadInitialData();
    }

    setupEventListeners() {
        // أحداث المصادقة
        this.client.on('login_success', (data) => {
            this.handleLoginSuccess(data);
        });

        this.client.on('logout', () => {
            this.handleLogout();
        });

        this.client.on('auth_error', (data) => {
            this.showError(data.message);
        });

        // أحداث المحادثات
        this.client.on('new_message', (data) => {
            this.handleNewMessage(data);
        });

        this.client.on('user_typing', (data) => {
            this.handleUserTyping(data);
        });

        this.client.on('messages_read', (data) => {
            this.handleMessagesRead(data);
        });

        this.client.on('user_status_changed', (data) => {
            this.handleUserStatusChanged(data);
        });

        // أحداث الاتصال
        this.client.on('socket_connected', () => {
            this.updateConnectionStatus('connected');
        });

        this.client.on('socket_disconnected', (data) => {
            this.updateConnectionStatus('disconnected', data.reason);
        });

        this.client.on('socket_error', (data) => {
            this.updateConnectionStatus('error', data.error);
        });

        // مستمعي واجهة المستخدم
        this.setupUIEventListeners();
    }

    setupUIEventListeners() {
        // التنقل
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.getAttribute('data-action');
            this.handleAction(action, target);
        });

        // إرسال الرسائل
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            messageInput.addEventListener('input', () => {
                this.handleMessageInput();
            });
        }

        // البحث
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => {
                this.handleSearch(searchInput.value);
            }, 300));
        }

        // النماذج
        this.setupFormHandlers();
    }

    setupFormHandlers() {
        // تسجيل الدخول
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLoginForm(e.target);
            });
        }

        // التسجيل
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleRegisterForm(e.target);
            });
        }

        // إنشاء قناة
        const createChannelForm = document.getElementById('create-channel-form');
        if (createChannelForm) {
            createChannelForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleCreateChannelForm(e.target);
            });
        }

        // إنشاء مجموعة
        const createGroupForm = document.getElementById('create-group-form');
        if (createGroupForm) {
            createGroupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleCreateGroupForm(e.target);
            });
        }

        // إنشاء ستوري
        const createStoryForm = document.getElementById('create-story-form');
        if (createStoryForm) {
            createStoryForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleCreateStoryForm(e.target);
            });
        }
    }

    // معالجة الأحداث
    async handleAction(action, element) {
        console.log(`🔘 معالجة الإجراء: ${action}`);

        switch (action) {
            case 'login':
                this.showView('login');
                break;

            case 'register':
                this.showView('register');
                break;

            case 'logout':
                await this.client.logout();
                break;

            case 'show-home':
                this.showView('home');
                break;

            case 'show-conversations':
                this.showView('conversations');
                await this.loadConversations();
                break;

            case 'show-channels':
                this.showView('channels');
                await this.loadChannels();
                break;

            case 'show-groups':
                this.showView('groups');
                await this.loadGroups();
                break;

            case 'show-stories':
                this.showView('stories');
                await this.loadStories();
                break;

            case 'show-profile':
                this.showView('profile');
                break;

            case 'show-admin':
                this.showView('admin');
                await this.loadAdminStats();
                break;

            case 'start-conversation':
                const userId = element.getAttribute('data-user-id');
                await this.startConversation(userId);
                break;

            case 'open-conversation':
                const conversationId = element.getAttribute('data-conversation-id');
                await this.openConversation(conversationId);
                break;

            case 'join-channel':
                const channelId = element.getAttribute('data-channel-id');
                await this.joinChannel(channelId);
                break;

            case 'open-channel':
                const openChannelId = element.getAttribute('data-channel-id');
                await this.openChannel(openChannelId);
                break;

            case 'join-group':
                const groupId = element.getAttribute('data-group-id');
                await this.joinGroup(groupId);
                break;

            case 'open-group':
                const openGroupId = element.getAttribute('data-group-id');
                await this.openGroup(openGroupId);
                break;

            case 'view-story':
                const storyId = element.getAttribute('data-story-id');
                await this.viewStory(storyId);
                break;

            case 'create-backup':
                await this.createBackup();
                break;

            case 'cleanup-data':
                await this.cleanupData();
                break;

            case 'show-create-channel':
                this.showModal('create-channel-modal');
                break;

            case 'show-create-group':
                this.showModal('create-group-modal');
                break;

            case 'show-create-story':
                this.showModal('create-story-modal');
                break;

            case 'close-modal':
                this.hideModal(element.closest('.modal'));
                break;

            default:
                console.warn(`⚠️ إجراء غير معروف: ${action}`);
        }
    }

    // المصادقة
    async handleLoginForm(form) {
        const formData = new FormData(form);
        const email = formData.get('email');
        const password = formData.get('password');

        this.showLoading('جاري تسجيل الدخول...');

        try {
            const result = await this.client.login(email, password);
            
            if (result.success) {
                this.showSuccess('تم تسجيل الدخول بنجاح');
                this.hideModal(form.closest('.modal'));
                this.updateAuthUI();
                this.showView('home');
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في الاتصال بالخادم');
        } finally {
            this.hideLoading();
        }
    }

    async handleRegisterForm(form) {
        const formData = new FormData(form);
        const userData = {
            fullName: formData.get('fullName'),
            email: formData.get('email'),
            password: formData.get('password'),
            role: formData.get('role') || 'student'
        };

        this.showLoading('جاري إنشاء الحساب...');

        try {
            const result = await this.client.register(userData);
            
            if (result.success) {
                this.showSuccess('تم إنشاء الحساب بنجاح');
                this.hideModal(form.closest('.modal'));
                this.updateAuthUI();
                this.showView('home');
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في الاتصال بالخادم');
        } finally {
            this.hideLoading();
        }
    }

    handleLoginSuccess(data) {
        this.updateAuthUI();
        this.showView('home');
        this.loadInitialData();
    }

    handleLogout() {
        this.updateAuthUI();
        this.showView('home');
        this.clearConversationUI();
    }

    // المحادثات
    async loadConversations() {
        if (!this.client.isAuthenticated()) return;

        this.showLoading('جاري تحميل المحادثات...');

        try {
            const result = await this.client.getConversations();
            
            if (result.success) {
                this.renderConversations(result.conversations);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في تحميل المحادثات');
        } finally {
            this.hideLoading();
        }
    }

    renderConversations(conversations) {
        const container = document.getElementById('conversations-list');
        if (!container) return;

        if (conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <p>لا توجد محادثات بعد</p>
                    <button class="btn btn-primary" data-action="show-home">
                        ابدأ محادثة جديدة
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = conversations.map(conv => `
            <div class="conversation-item" data-action="open-conversation" data-conversation-id="${conv._id}">
                <div class="conversation-avatar">
                    ${this.getAvatarHTML(conv.participantsDetails[0])}
                </div>
                <div class="conversation-info">
                    <div class="conversation-header">
                        <h4>${this.escapeHTML(conv.name)}</h4>
                        <span class="conversation-time">${this.formatTime(conv.updatedAt)}</span>
                    </div>
                    <div class="conversation-preview">
                        <p>${this.escapeHTML(conv.lastMessage?.content || 'لا توجد رسائل بعد')}</p>
                        ${conv.unreadCount[this.client.user._id] > 0 ? `
                            <span class="unread-badge">${conv.unreadCount[this.client.user._id]}</span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    async openConversation(conversationId) {
        this.currentConversation = conversationId;
        this.client.joinConversation(conversationId);
        
        this.showView('conversation');
        await this.loadMessages(conversationId);
        this.setupMessageInput();
    }

    async loadMessages(conversationId) {
        this.showLoading('جاري تحميل الرسائل...');

        try {
            const result = await this.client.getMessages(conversationId);
            
            if (result.success) {
                this.renderMessages(result.messages);
                this.client.markMessagesAsRead(conversationId);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في تحميل الرسائل');
        } finally {
            this.hideLoading();
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('messages-container');
        if (!container) return;

        container.innerHTML = messages.map(message => `
            <div class="message ${message.senderId === this.client.user._id ? 'message-sent' : 'message-received'}">
                <div class="message-content">
                    <p>${this.escapeHTML(message.content)}</p>
                    <div class="message-meta">
                        <span class="message-time">${this.formatTime(message.createdAt)}</span>
                        ${message.senderId === this.client.user._id ? `
                            <span class="message-status">
                                ${message.readBy.length > 1 ? '✓✓' : '✓'}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        this.scrollToBottom(container);
    }

    setupMessageInput() {
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-message');
        
        if (messageInput && sendButton) {
            // إعادة إعداد مستمعي الأحداث
            messageInput.onkeypress = null;
            messageInput.oninput = null;
            sendButton.onclick = null;

            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            messageInput.addEventListener('input', () => {
                this.handleMessageInput();
            });

            sendButton.addEventListener('click', () => {
                this.sendMessage();
            });

            messageInput.disabled = false;
            sendButton.disabled = false;
            messageInput.focus();
        }
    }

    handleMessageInput() {
        if (!this.currentConversation) return;

        this.client.startTyping(this.currentConversation);
        
        // إعادة تعيين مؤقت إيقاف الكتابة
        clearTimeout(this.typingTimeouts.get(this.currentConversation));
        this.typingTimeouts.set(this.currentConversation, setTimeout(() => {
            this.client.stopTyping(this.currentConversation);
        }, 1000));
    }

    async sendMessage() {
        const messageInput = document.getElementById('message-input');
        if (!messageInput || !this.currentConversation) return;

        const content = messageInput.value.trim();
        if (!content) return;

        // تعطيل الإدخال مؤقتاً
        messageInput.disabled = true;
        
        try {
            const result = await this.client.sendMessage(this.currentConversation, content);
            
            if (result.success) {
                messageInput.value = '';
                this.client.stopTyping(this.currentConversation);
                
                // إضافة الرسالة للواجهة فوراً
                this.handleNewMessage({
                    message: result.message,
                    conversation: { _id: this.currentConversation }
                });
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في إرسال الرسالة');
        } finally {
            messageInput.disabled = false;
            messageInput.focus();
        }
    }

    handleNewMessage(data) {
        // إذا كانت الرسالة للمحادثة الحالية
        if (this.currentConversation && data.conversation._id === this.currentConversation) {
            this.appendMessage(data.message);
            this.client.markMessagesAsRead(this.currentConversation);
        }
        
        // تحديث قائمة المحادثات
        this.loadConversations();
    }

    appendMessage(message) {
        const container = document.getElementById('messages-container');
        if (!container) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.senderId === this.client.user._id ? 'message-sent' : 'message-received'}`;
        messageElement.innerHTML = `
            <div class="message-content">
                <p>${this.escapeHTML(message.content)}</p>
                <div class="message-meta">
                    <span class="message-time">${this.formatTime(message.createdAt)}</span>
                    ${message.senderId === this.client.user._id ? `
                        <span class="message-status">✓</span>
                    ` : ''}
                </div>
            </div>
        `;

        container.appendChild(messageElement);
        this.scrollToBottom(container);
    }

    handleUserTyping(data) {
        if (data.conversationId !== this.currentConversation) return;

        const typingIndicator = document.getElementById('typing-indicator');
        if (!typingIndicator) return;

        if (data.isTyping) {
            this.typingUsers.set(data.userId, true);
        } else {
            this.typingUsers.delete(data.userId);
        }

        if (this.typingUsers.size > 0) {
            typingIndicator.style.display = 'block';
            typingIndicator.innerHTML = `
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <span>${this.typingUsers.size} مستخدم يكتب...</span>
            `;
        } else {
            typingIndicator.style.display = 'none';
        }
    }

    handleMessagesRead(data) {
        // تحديث حالة الرسائل المقروءة
        if (this.currentConversation === data.conversationId) {
            this.updateMessageReadStatus(data.userId);
        }
    }

    // القنوات
    async loadChannels() {
        this.showLoading('جاري تحميل القنوات...');

        try {
            const [allChannels, myChannels] = await Promise.all([
                this.client.getChannels(),
                this.client.getMyChannels()
            ]);

            this.renderChannels(allChannels.channels || [], myChannels.channels || []);
        } catch (error) {
            this.showError('خطأ في تحميل القنوات');
        } finally {
            this.hideLoading();
        }
    }

    renderChannels(allChannels, myChannels) {
        this.renderChannelList('all-channels-list', allChannels, 'join');
        this.renderChannelList('my-channels-list', myChannels, 'open');
    }

    renderChannelList(containerId, channels, action) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (channels.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tv"></i>
                    <p>لا توجد قنوات</p>
                </div>
            `;
            return;
        }

        container.innerHTML = channels.map(channel => `
            <div class="channel-item" data-action="${action}-channel" data-channel-id="${channel._id}">
                <div class="channel-avatar">
                    ${channel.avatar ? 
                        `<img src="${this.client.baseURL}${channel.avatar}" alt="${channel.name}">` : 
                        `<i class="fas fa-tv"></i>`
                    }
                </div>
                <div class="channel-info">
                    <h4>${this.escapeHTML(channel.name)}</h4>
                    <p>${this.escapeHTML(channel.description || 'لا يوجد وصف')}</p>
                    <div class="channel-stats">
                        <span><i class="fas fa-users"></i> ${channel.stats.memberCount}</span>
                        <span><i class="fas fa-comment"></i> ${channel.stats.messageCount}</span>
                    </div>
                </div>
                <button class="btn btn-${action === 'join' ? 'primary' : 'secondary'}" 
                        data-action="${action}-channel" 
                        data-channel-id="${channel._id}">
                    ${action === 'join' ? 'انضم' : 'فتح'}
                </button>
            </div>
        `).join('');
    }

    async joinChannel(channelId) {
        this.showLoading('جاري الانضمام للقناة...');

        try {
            const result = await this.client.joinChannel(channelId);
            
            if (result.success) {
                this.showSuccess('تم الانضمام للقناة بنجاح');
                this.loadChannels();
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في الانضمام للقناة');
        } finally {
            this.hideLoading();
        }
    }

    async openChannel(channelId) {
        this.currentChannel = channelId;
        this.client.joinChannelRoom(channelId);
        this.showView('channel');
        await this.loadChannelMessages(channelId);
    }

    // المجموعات
    async loadGroups() {
        this.showLoading('جاري تحميل المجموعات...');

        try {
            const [allGroups, myGroups] = await Promise.all([
                this.client.getGroups(),
                this.client.getMyGroups()
            ]);

            this.renderGroups(allGroups.groups || [], myGroups.groups || []);
        } catch (error) {
            this.showError('خطأ في تحميل المجموعات');
        } finally {
            this.hideLoading();
        }
    }

    renderGroups(allGroups, myGroups) {
        this.renderGroupList('all-groups-list', allGroups, 'join');
        this.renderGroupList('my-groups-list', myGroups, 'open');
    }

    renderGroupList(containerId, groups, action) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (groups.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>لا توجد مجموعات</p>
                </div>
            `;
            return;
        }

        container.innerHTML = groups.map(group => `
            <div class="group-item" data-action="${action}-group" data-group-id="${group._id}">
                <div class="group-avatar">
                    ${group.avatar ? 
                        `<img src="${this.client.baseURL}${group.avatar}" alt="${group.name}">` : 
                        `<i class="fas fa-users"></i>`
                    }
                </div>
                <div class="group-info">
                    <h4>${this.escapeHTML(group.name)}</h4>
                    <p>${this.escapeHTML(group.description || 'لا يوجد وصف')}</p>
                    <div class="group-stats">
                        <span><i class="fas fa-users"></i> ${group.stats.memberCount}</span>
                        <span><i class="fas fa-comment"></i> ${group.stats.messageCount}</span>
                    </div>
                </div>
                <button class="btn btn-${action === 'join' ? 'primary' : 'secondary'}" 
                        data-action="${action}-group" 
                        data-group-id="${group._id}">
                    ${action === 'join' ? 'انضم' : 'فتح'}
                </button>
            </div>
        `).join('');
    }

    async joinGroup(groupId) {
        this.showLoading('جاري الانضمام للمجموعة...');

        try {
            const result = await this.client.joinGroup(groupId);
            
            if (result.success) {
                this.showSuccess('تم الانضمام للمجموعة بنجاح');
                this.loadGroups();
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في الانضمام للمجموعة');
        } finally {
            this.hideLoading();
        }
    }

    async openGroup(groupId) {
        this.currentGroup = groupId;
        this.client.joinGroupRoom(groupId);
        this.showView('group');
        await this.loadGroupMessages(groupId);
    }

    // الستوريات
    async loadStories() {
        this.showLoading('جاري تحميل الستوريات...');

        try {
            const result = await this.client.getStories();
            
            if (result.success) {
                this.renderStories(result.stories);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في تحميل الستوريات');
        } finally {
            this.hideLoading();
        }
    }

    renderStories(stories) {
        const container = document.getElementById('stories-container');
        if (!container) return;

        if (stories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-camera"></i>
                    <p>لا توجد ستوريات حالية</p>
                    <button class="btn btn-primary" data-action="show-create-story">
                        أنشئ ستوري جديد
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = stories.map(story => `
            <div class="story-item" data-action="view-story" data-story-id="${story._id}">
                <div class="story-avatar">
                    ${story.user?.avatar ? 
                        `<img src="${this.client.baseURL}${story.user.avatar}" alt="${story.user.fullName}">` : 
                        `<i class="fas fa-user"></i>`
                    }
                </div>
                <div class="story-content">
                    <h4>${this.escapeHTML(story.user?.fullName || 'مستخدم')}</h4>
                    <p>${this.escapeHTML(story.caption || '')}</p>
                    <div class="story-stats">
                        <span><i class="fas fa-eye"></i> ${story.metrics.viewCount}</span>
                        <span><i class="fas fa-clock"></i> ${this.formatRelativeTime(story.createdAt)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async viewStory(storyId) {
        this.showLoading('جاري تحميل الستوري...');

        try {
            await this.client.viewStory(storyId);
            this.showModal('story-viewer-modal');
            // هنا يمكن إضافة منطق عرض الستوري
        } catch (error) {
            this.showError('خطأ في تحميل الستوري');
        } finally {
            this.hideLoading();
        }
    }

    // الإدارة
    async loadAdminStats() {
        if (this.client.user.role !== 'admin') {
            this.showError('غير مصرح لك بالوصول لهذه الصفحة');
            this.showView('home');
            return;
        }

        this.showLoading('جاري تحميل الإحصائيات...');

        try {
            const result = await this.client.getAdminStats();
            
            if (result.success) {
                this.renderAdminStats(result.stats);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في تحميل الإحصائيات');
        } finally {
            this.hideLoading();
        }
    }

    renderAdminStats(stats) {
        const container = document.getElementById('admin-stats');
        if (!container) return;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.totalUsers}</h3>
                        <p>إجمالي المستخدمين</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.totalMessages}</h3>
                        <p>إجمالي الرسائل</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-tv"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.totalChannels}</h3>
                        <p>إجمالي القنوات</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.totalGroups}</h3>
                        <p>إجمالي المجموعات</p>
                    </div>
                </div>
            </div>
        `;
    }

    async createBackup() {
        this.showLoading('جاري إنشاء نسخة احتياطية...');

        try {
            const result = await this.client.createBackup();
            
            if (result.success) {
                this.showSuccess('تم إنشاء النسخة الاحتياطية بنجاح');
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في إنشاء النسخة الاحتياطية');
        } finally {
            this.hideLoading();
        }
    }

    async cleanupData() {
        if (!confirm('هل أنت متأكد من رغبتك في تنظيف البيانات القديمة؟')) {
            return;
        }

        this.showLoading('جاري تنظيف البيانات...');

        try {
            const result = await this.client.cleanupData();
            
            if (result.success) {
                this.showSuccess('تم تنظيف البيانات بنجاح');
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في تنظيف البيانات');
        } finally {
            this.hideLoading();
        }
    }

    // إنشاء المحتوى
    async handleCreateChannelForm(form) {
        const formData = new FormData(form);
        const channelData = {
            name: formData.get('name'),
            description: formData.get('description'),
            isPublic: formData.get('isPublic') === 'true'
        };

        const avatarFile = formData.get('avatar');
        if (avatarFile && avatarFile.size > 0) {
            channelData.avatar = avatarFile;
        }

        this.showLoading('جاري إنشاء القناة...');

        try {
            const result = await this.client.createChannel(channelData);
            
            if (result.success) {
                this.showSuccess('تم إنشاء القناة بنجاح');
                this.hideModal(form.closest('.modal'));
                form.reset();
                this.loadChannels();
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في إنشاء القناة');
        } finally {
            this.hideLoading();
        }
    }

    async handleCreateGroupForm(form) {
        const formData = new FormData(form);
        const groupData = {
            name: formData.get('name'),
            description: formData.get('description'),
            isPublic: formData.get('isPublic') === 'true'
        };

        const avatarFile = formData.get('avatar');
        if (avatarFile && avatarFile.size > 0) {
            groupData.avatar = avatarFile;
        }

        this.showLoading('جاري إنشاء المجموعة...');

        try {
            const result = await this.client.createGroup(groupData);
            
            if (result.success) {
                this.showSuccess('تم إنشاء المجموعة بنجاح');
                this.hideModal(form.closest('.modal'));
                form.reset();
                this.loadGroups();
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في إنشاء المجموعة');
        } finally {
            this.hideLoading();
        }
    }

    async handleCreateStoryForm(form) {
        const formData = new FormData(form);
        const storyData = {
            caption: formData.get('caption'),
            type: 'image'
        };

        const mediaFile = formData.get('media');
        if (mediaFile && mediaFile.size > 0) {
            storyData.media = mediaFile;
            storyData.mediaType = mediaFile.type.startsWith('video') ? 'video' : 'image';
        } else {
            this.showError('يرجى اختيار صورة أو فيديو');
            return;
        }

        this.showLoading('جاري نشر الستوري...');

        try {
            const result = await this.client.createStory(storyData);
            
            if (result.success) {
                this.showSuccess('تم نشر الستوري بنجاح');
                this.hideModal(form.closest('.modal'));
                form.reset();
                this.loadStories();
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في نشر الستوري');
        } finally {
            this.hideLoading();
        }
    }

    // واجهة المستخدم
    updateAuthUI() {
        const authElements = document.querySelectorAll('.auth-only');
        const unauthElements = document.querySelectorAll('.unauth-only');
        const userInfo = document.getElementById('user-info');

        if (this.client.isAuthenticated()) {
            authElements.forEach(el => el.style.display = 'block');
            unauthElements.forEach(el => el.style.display = 'none');
            
            if (userInfo) {
                userInfo.innerHTML = `
                    <div class="user-profile">
                        <div class="user-avatar">
                            ${this.getAvatarHTML(this.client.user)}
                        </div>
                        <div class="user-details">
                            <span class="user-name">${this.escapeHTML(this.client.user.fullName)}</span>
                            <span class="user-role">${this.client.user.role === 'admin' ? 'مدير' : this.client.user.role === 'teacher' ? 'معلم' : 'طالب'}</span>
                        </div>
                    </div>
                `;
            }
        } else {
            authElements.forEach(el => el.style.display = 'none');
            unauthElements.forEach(el => el.style.display = 'block');
            
            if (userInfo) {
                userInfo.innerHTML = '';
            }
        }
    }

    showView(viewName) {
        this.currentView = viewName;
        
        // إخفاء جميع المشاهد
        const views = document.querySelectorAll('.view');
        views.forEach(view => view.style.display = 'none');
        
        // إظهار المشهد المطلوب
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.style.display = 'block';
        }
        
        // تحديث التنقل النشط
        this.updateActiveNav();
    }

    updateActiveNav() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-action') === `show-${this.currentView}`) {
                item.classList.add('active');
            }
        });
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
        }
    }

    hideModal(modal) {
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
        }
    }

    showLoading(message = 'جاري التحميل...') {
        this.hideLoading(); // إخفاء أي تحميل سابق
        
        const loadingEl = document.createElement('div');
        loadingEl.className = 'loading-overlay';
        loadingEl.id = 'loading-overlay';
        loadingEl.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        
        document.body.appendChild(loadingEl);
    }

    hideLoading() {
        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) {
            loadingEl.remove();
        }
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(notification);
        
        // إزالة الإشعار تلقائياً بعد 5 ثواني
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    // أدوات مساعدة
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleTimeString('ar-EG', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    formatRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'الآن';
        if (diffMins < 60) return `قبل ${diffMins} دقيقة`;
        if (diffHours < 24) return `قبل ${diffHours} ساعة`;
        if (diffDays < 7) return `قبل ${diffDays} يوم`;
        
        return date.toLocaleDateString('ar-EG');
    }

    getAvatarHTML(user) {
        if (user && user.avatar) {
            return `<img src="${this.client.baseURL}${user.avatar}" alt="${user.fullName}">`;
        }
        return `<i class="fas fa-user"></i>`;
    }

    scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }

    debounce(func, wait) {
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

    // تحميل البيانات الأولية
    async loadInitialData() {
        if (!this.client.isAuthenticated()) return;

        try {
            // تحميل البيانات الأساسية في الخلفية
            await Promise.allSettled([
                this.loadConversations(),
                this.loadChannels(),
                this.loadGroups(),
                this.loadStories()
            ]);
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات الأولية:', error);
        }
    }

    // تحديث حالة الاتصال
    updateConnectionStatus(status, reason = '') {
        const statusElement = document.getElementById('connection-status');
        if (!statusElement) return;

        const statusMap = {
            connected: { text: 'متصل', class: 'connected' },
            disconnected: { text: 'غير متصل', class: 'disconnected' },
            connecting: { text: 'جاري الاتصال...', class: 'connecting' },
            error: { text: 'خطأ في الاتصال', class: 'error' }
        };

        const statusInfo = statusMap[status] || statusMap.disconnected;
        
        statusElement.className = `connection-status ${statusInfo.class}`;
        statusElement.innerHTML = `
            <i class="fas fa-${status === 'connected' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${statusInfo.text} ${reason ? `- ${reason}` : ''}</span>
        `;
    }

    // تنظيف واجهة المحادثة
    clearConversationUI() {
        this.currentConversation = null;
        this.currentChannel = null;
        this.currentGroup = null;
        this.typingUsers.clear();
        
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = '';
            messageInput.disabled = true;
        }
        
        const sendButton = document.getElementById('send-message');
        if (sendButton) {
            sendButton.disabled = true;
        }
        
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    }

    // البحث
    async handleSearch(query) {
        if (query.length < 2) {
            this.clearSearchResults();
            return;
        }

        try {
            const result = await this.client.searchUsers(query);
            
            if (result.success) {
                this.renderSearchResults(result.users);
            }
        } catch (error) {
            console.error('❌ خطأ في البحث:', error);
        }
    }

    renderSearchResults(users) {
        const container = document.getElementById('search-results');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = '<p class="no-results">لا توجد نتائج</p>';
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="search-result-item" data-action="start-conversation" data-user-id="${user._id}">
                <div class="user-avatar">
                    ${this.getAvatarHTML(user)}
                </div>
                <div class="user-info">
                    <h4>${this.escapeHTML(user.fullName)}</h4>
                    <p>${user.role === 'teacher' ? 'معلم' : 'طالب'}</p>
                </div>
                <button class="btn btn-primary" data-action="start-conversation" data-user-id="${user._id}">
                    محادثة
                </button>
            </div>
        `).join('');
    }

    clearSearchResults() {
        const container = document.getElementById('search-results');
        if (container) {
            container.innerHTML = '';
        }
    }

    async startConversation(userId) {
        this.showLoading('جاري بدء المحادثة...');

        try {
            const result = await this.client.createConversation([userId]);
            
            if (result.success) {
                this.showSuccess('تم بدء المحادثة بنجاح');
                await this.openConversation(result.conversation._id);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('خطأ في بدء المحادثة');
        } finally {
            this.hideLoading();
        }
    }
}

// التهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    const client = new EducationalPlatformClient();
    window.platformUI = new EducationalPlatformUI(client);
    
    console.log('🚀 تم تحميل منصة التعلم بنجاح!');
});

// التصدير للاستخدام في الوحدات
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EducationalPlatformUI;
}
