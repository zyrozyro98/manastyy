// public/js/app.js - الملف الرئيسي للتطبيق
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
        
        this.init();
    }

    async init() {
        await this.checkAuthentication();
        this.setupEventListeners();
        this.initializeSocket();
        this.loadStories();
        this.loadConversations();
        this.loadGroups();
        this.loadChannels();
        this.loadMedia();
        
        console.log('🚀 تم تهيئة المنصة التعليمية بنجاح');
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
            const response = await fetch('/api/auth/validate', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // ============ إدارة الواجهة ============
    showAuthenticatedUI() {
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('logoutBtn').classList.remove('hidden');
        document.getElementById('loginBtn').classList.add('hidden');
        document.getElementById('registerBtn').classList.add('hidden');
        
        // تحديث بيانات المستخدم
        document.getElementById('userNameDisplay').textContent = this.currentUser.name;
        document.getElementById('userRoleDisplay').textContent = this.currentUser.role;
        document.getElementById('userAvatarText').textContent = this.currentUser.name.charAt(0);
    }

    showUnauthenticatedUI() {
        document.getElementById('userInfo').classList.add('hidden');
        document.getElementById('logoutBtn').classList.add('hidden');
        document.getElementById('loginBtn').classList.remove('hidden');
        document.getElementById('registerBtn').classList.remove('hidden');
    }

    navigateToPage(pageName) {
        // إخفاء جميع الصفحات
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // إظهار الصفحة المطلوبة
        const targetPage = document.getElementById(`${pageName}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
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

    // ============ إعداد事件 المستمعين ============
    setupEventListeners() {
        // التنقل بين الصفحات
        document.querySelectorAll('[data-page]').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                const pageName = element.getAttribute('data-page');
                this.navigateToPage(pageName);
            });
        });

        // المصادقة
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm')?.addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());

        // الدردشة
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('emojiToggle').addEventListener('click', () => this.toggleEmojiPicker());
        document.getElementById('attachFileBtn').addEventListener('click', () => this.triggerFileInput());
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));

        // القصص
        document.getElementById('storyClose').addEventListener('click', () => this.closeStoryViewer());
        document.getElementById('storyPrev').addEventListener('click', () => this.showPreviousStory());
        document.getElementById('storyNext').addEventListener('click', () => this.showNextStory());

        // المجموعات والقنوات
        document.getElementById('createGroupBtn').addEventListener('click', () => this.showCreateGroupModal());
        document.getElementById('createChannelBtn').addEventListener('click', () => this.showCreateChannelModal());
        document.getElementById('createGroupForm').addEventListener('submit', (e) => this.createGroup(e));
        document.getElementById('createChannelForm').addEventListener('submit', (e) => this.createChannel(e));

        // الأزرار الإضافية
        document.getElementById('startAppBtn').addEventListener('click', () => this.startApp());
        document.getElementById('mobileMenuBtn').addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('overlay').addEventListener('click', () => this.closeMobileMenu());
        document.getElementById('floatingActionBtn').addEventListener('click', () => this.toggleQuickActions());

        // إغلاق منتقي الإيموجي عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#emojiPickerContainer') && !e.target.closest('#emojiToggle')) {
                document.getElementById('emojiPickerContainer').classList.remove('active');
            }
        });
    }

    // ============ إدارة الدردشة ============
    initializeSocket() {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        this.socket = io({
            auth: {
                token: token
            }
        });

        this.socket.on('connect', () => {
            console.log('✅ متصل بالسيرفر');
            this.showNotification('متصل بالخادم', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ تم قطع الاتصال');
            this.showNotification('تم قطع الاتصال بالخادم', 'error');
        });

        this.socket.on('new_message', (data) => {
            this.receiveMessage(data);
        });

        this.socket.on('user_online', (data) => {
            this.updateUserStatus(data.userId, true);
        });

        this.socket.on('user_offline', (data) => {
            this.updateUserStatus(data.userId, false);
        });

        this.socket.on('message_delivered', (data) => {
            this.updateMessageStatus(data.messageId, 'delivered');
        });

        this.socket.on('message_read', (data) => {
            this.updateMessageStatus(data.messageId, 'read');
        });
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/chat/conversations', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            if (response.ok) {
                const conversations = await response.json();
                this.renderConversations(conversations);
            }
        } catch (error) {
            console.error('خطأ في تحميل المحادثات:', error);
        }
    }

    renderConversations(conversations) {
        const container = document.getElementById('conversationsList');
        container.innerHTML = '';

        conversations.forEach(conversation => {
            const conversationElement = this.createConversationElement(conversation);
            container.appendChild(conversationElement);
            this.conversations.set(conversation.id, conversation);
        });
    }

    createConversationElement(conversation) {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.dataset.conversationId = conversation.id;
        
        div.innerHTML = `
            <div class="conversation-avatar">
                <span>${conversation.name.charAt(0)}</span>
            </div>
            <div class="conversation-info">
                <div class="conversation-name">${conversation.name}</div>
                <div class="conversation-last-message">${conversation.lastMessage || 'لا توجد رسائل'}</div>
            </div>
            <div class="conversation-meta">
                <div class="conversation-time">${this.formatTime(conversation.updatedAt)}</div>
                ${conversation.unreadCount > 0 ? 
                    `<div class="conversation-unread">${conversation.unreadCount}</div>` : ''}
            </div>
        `;

        div.addEventListener('click', () => this.selectConversation(conversation.id));
        return div;
    }

    selectConversation(conversationId) {
        this.currentChat = this.conversations.get(conversationId);
        if (!this.currentChat) return;

        // تحديث الواجهة
        document.getElementById('activeChatName').textContent = this.currentChat.name;
        document.getElementById('activeChatAvatar').textContent = this.currentChat.name.charAt(0);
        document.getElementById('activeChatStatus').textContent = 'متصل';
        document.getElementById('chatInputContainer').style.display = 'flex';
        document.getElementById('emptyChat').style.display = 'none';

        // تحميل الرسائل
        this.loadMessages(conversationId);
        
        // تحديث حالة المحادثة النشطة
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-conversation-id="${conversationId}"]`).classList.add('active');
    }

    async loadMessages(conversationId) {
        try {
            const response = await fetch(`/api/chat/messages/${conversationId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            if (response.ok) {
                const messages = await response.json();
                this.renderMessages(messages);
            }
        } catch (error) {
            console.error('خطأ في تحميل الرسائل:', error);
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';

        messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            container.appendChild(messageElement);
        });

        container.scrollTop = container.scrollHeight;
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        const isSent = message.senderId === this.currentUser.id;
        
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.innerHTML = `
            <div class="message-text">${message.content}</div>
            <div class="message-time">${this.formatTime(message.timestamp)}</div>
            ${isSent ? `
                <div class="message-status">
                    <i class="fas fa-${message.status === 'read' ? 'check-double' : 'check'}"></i>
                </div>
            ` : ''}
        `;

        return div;
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const content = input.value.trim();
        
        if (!content || !this.currentChat) return;

        const message = {
            content: content,
            conversationId: this.currentChat.id,
            timestamp: new Date().toISOString()
        };

        // إضافة الرسالة للواجهة مباشرة
        this.addMessageToUI(message, true);
        input.value = '';

        // إرسال الرسالة عبر السوكيت
        if (this.socket) {
            this.socket.emit('send_message', message);
        }

        // إرسال الرسالة عبر API
        try {
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(message)
            });
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
        }
    }

    receiveMessage(message) {
        if (this.currentChat && message.conversationId === this.currentChat.id) {
            this.addMessageToUI(message, false);
        }
        
        // تحديث عدد الرسائل غير المقروءة
        this.updateUnreadCount();
    }

    addMessageToUI(message, isSent) {
        const container = document.getElementById('chatMessages');
        const messageElement = this.createMessageElement({
            ...message,
            senderId: isSent ? this.currentUser.id : message.senderId,
            status: isSent ? 'sent' : 'received'
        });
        
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    // ============ إدارة الإيموجي والملفات ============
    toggleEmojiPicker() {
        const pickerContainer = document.getElementById('emojiPickerContainer');
        pickerContainer.classList.toggle('active');

        if (!this.emojiPicker) {
            this.emojiPicker = document.querySelector('emoji-picker');
            this.emojiPicker.addEventListener('emoji-click', (event) => {
                const input = document.getElementById('chatInput');
                input.value += event.detail.unicode;
                input.focus();
            });
        }
    }

    triggerFileInput() {
        document.getElementById('fileInput').click();
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversationId', this.currentChat.id);

        try {
            const response = await fetch('/api/chat/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });

            if (response.ok) {
                const fileData = await response.json();
                this.sendFileMessage(fileData);
            }
        } catch (error) {
            console.error('خطأ في رفع الملف:', error);
            this.showNotification('فشل في رفع الملف', 'error');
        }
    }

    sendFileMessage(fileData) {
        const message = {
            content: `📎 ${fileData.originalName}`,
            file: fileData,
            conversationId: this.currentChat.id,
            timestamp: new Date().toISOString()
        };

        this.addMessageToUI(message, true);
        
        if (this.socket) {
            this.socket.emit('send_message', message);
        }
    }

    // ============ إدارة القصص ============
    async loadStories() {
        try {
            const response = await fetch('/api/stories');
            if (response.ok) {
                this.stories = await response.json();
                this.renderStories();
            }
        } catch (error) {
            console.error('خطأ في تحميل القصص:', error);
        }
    }

    renderStories() {
        const container = document.getElementById('storiesContainer');
        container.innerHTML = '';

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
                <img src="${story.avatar}" alt="${story.author}">
            </div>
            <div class="story-author">${story.author}</div>
        `;

        div.addEventListener('click', () => this.openStoryViewer(index));
        return div;
    }

    openStoryViewer(index) {
        this.currentStoryIndex = index;
        const story = this.stories[index];
        
        document.getElementById('currentStoryImage').src = story.image;
        document.getElementById('storyAuthorName').textContent = story.author;
        document.getElementById('storyAuthorAvatar').textContent = story.author.charAt(0);
        document.getElementById('storyTime').textContent = this.formatTime(story.timestamp);
        
        document.getElementById('storyViewer').classList.add('active');
        this.startStoryProgress();
    }

    startStoryProgress() {
        this.clearStoryProgress();
        
        const progressBars = document.getElementById('storyProgress');
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
        document.getElementById('storyViewer').classList.remove('active');
    }

    // ============ إدارة المجموعات ============
    async loadGroups() {
        try {
            const response = await fetch('/api/groups');
            if (response.ok) {
                const groups = await response.json();
                this.renderGroups(groups);
            }
        } catch (error) {
            console.error('خطأ في تحميل المجموعات:', error);
        }
    }

    renderGroups(groups) {
        const container = document.getElementById('groupsGrid');
        container.innerHTML = '';

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
                <h3>${group.name}</h3>
                <p>${group.memberCount} عضو</p>
            </div>
            <div class="group-info">
                <p>${group.description}</p>
                <div class="group-stats">
                    <div class="group-stat">
                        <div class="group-stat-number">${group.postCount}</div>
                        <div class="group-stat-label">منشور</div>
                    </div>
                    <div class="group-stat">
                        <div class="group-stat-number">${group.onlineCount}</div>
                        <div class="group-stat-label">متصل</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3 join-group-btn" data-group-id="${group.id}">
                    <i class="fas fa-sign-in-alt"></i>
                    ${group.isMember ? 'الدخول' : 'الانضمام'}
                </button>
            </div>
        `;

        div.querySelector('.join-group-btn').addEventListener('click', () => this.joinGroup(group.id));
        return div;
    }

    async joinGroup(groupId) {
        try {
            const response = await fetch(`/api/groups/${groupId}/join`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (response.ok) {
                this.showNotification('تم الانضمام للمجموعة بنجاح', 'success');
                this.loadGroups(); // إعادة تحميل المجموعات
            }
        } catch (error) {
            console.error('خطأ في الانضمام للمجموعة:', error);
            this.showNotification('فشل في الانضمام للمجموعة', 'error');
        }
    }

    async createGroup(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const groupData = {
            name: formData.get('name'),
            description: formData.get('description'),
            privacy: formData.get('privacy')
        };

        try {
            const response = await fetch('/api/groups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(groupData)
            });

            if (response.ok) {
                this.showNotification('تم إنشاء المجموعة بنجاح', 'success');
                this.hideCreateGroupModal();
                this.loadGroups();
            }
        } catch (error) {
            console.error('خطأ في إنشاء المجموعة:', error);
            this.showNotification('فشل في إنشاء المجموعة', 'error');
        }
    }

    // ============ إدارة القنوات ============
    async loadChannels() {
        try {
            const response = await fetch('/api/channels');
            if (response.ok) {
                const channels = await response.json();
                this.renderChannels(channels);
            }
        } catch (error) {
            console.error('خطأ في تحميل القنوات:', error);
        }
    }

    renderChannels(channels) {
        const container = document.getElementById('channelsGrid');
        container.innerHTML = '';

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
                <h3>${channel.name}</h3>
                <p>${channel.subscriberCount} مشترك</p>
            </div>
            <div class="channel-info">
                <p>${channel.description}</p>
                <div class="channel-stats">
                    <div class="channel-stat">
                        <div class="channel-stat-number">${channel.videoCount}</div>
                        <div class="channel-stat-label">فيديو</div>
                    </div>
                    <div class="channel-stat">
                        <div class="channel-stat-number">${channel.viewCount}</div>
                        <div class="channel-stat-label">مشاهدة</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3 subscribe-channel-btn" data-channel-id="${channel.id}">
                    <i class="fas fa-bell"></i>
                    ${channel.isSubscribed ? 'مشترك' : 'اشترك'}
                </button>
            </div>
        `;

        div.querySelector('.subscribe-channel-btn').addEventListener('click', () => this.subscribeChannel(channel.id));
        return div;
    }

    async subscribeChannel(channelId) {
        try {
            const response = await fetch(`/api/channels/${channelId}/subscribe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (response.ok) {
                this.showNotification('تم الاشتراك في القناة بنجاح', 'success');
                this.loadChannels();
            }
        } catch (error) {
            console.error('خطأ في الاشتراك بالقناة:', error);
            this.showNotification('فشل في الاشتراك بالقناة', 'error');
        }
    }

    async createChannel(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const channelData = {
            name: formData.get('name'),
            description: formData.get('description'),
            category: formData.get('category')
        };

        try {
            const response = await fetch('/api/channels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(channelData)
            });

            if (response.ok) {
                this.showNotification('تم إنشاء القناة بنجاح', 'success');
                this.hideCreateChannelModal();
                this.loadChannels();
            }
        } catch (error) {
            console.error('خطأ في إنشاء القناة:', error);
            this.showNotification('فشل في إنشاء القناة', 'error');
        }
    }

    // ============ إدارة الوسائط ============
    async loadMedia() {
        try {
            const response = await fetch('/api/media');
            if (response.ok) {
                const media = await response.json();
                this.renderMedia(media);
            }
        } catch (error) {
            console.error('خطأ في تحميل الوسائط:', error);
        }
    }

    renderMedia(media) {
        const container = document.getElementById('mediaGrid');
        container.innerHTML = '';

        media.forEach(item => {
            const mediaElement = this.createMediaElement(item);
            container.appendChild(mediaElement);
        });
    }

    createMediaElement(media) {
        const div = document.createElement('div');
        div.className = 'media-item';
        
        div.innerHTML = `
            <img src="${media.thumbnail}" alt="${media.title}">
            <div class="media-type">${media.type}</div>
            <div class="media-overlay">
                <h4>${media.title}</h4>
                <p>${media.description}</p>
                <div class="media-actions">
                    <button class="btn btn-sm btn-outline view-media-btn" data-media-id="${media.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline download-media-btn" data-media-id="${media.id}">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            </div>
        `;

        div.querySelector('.view-media-btn').addEventListener('click', () => this.viewMedia(media));
        div.querySelector('.download-media-btn').addEventListener('click', () => this.downloadMedia(media));
        return div;
    }

    // ============ دوال مساعدة ============
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'الآن';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} د`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} س`;
        
        return date.toLocaleDateString('ar-EG');
    }

    showNotification(message, type = 'info') {
        // تنفيذ عرض الإشعارات
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    updateUnreadCount() {
        // تحديث عدد الرسائل غير المقروءة
        const unreadCount = Array.from(this.conversations.values())
            .reduce((total, conv) => total + (conv.unreadCount || 0), 0);
        
        document.getElementById('unreadMessagesCount').textContent = unreadCount;
    }

    updateUserStatus(userId, isOnline) {
        // تحديث حالة المستخدم
        const statusElement = document.querySelector(`[data-user-id="${userId}"] .user-status`);
        if (statusElement) {
            statusElement.className = `user-status ${isOnline ? '' : 'offline'}`;
        }
    }

    updateMessageStatus(messageId, status) {
        // تحديث حالة الرسالة
        const messageElement = document.querySelector(`[data-message-id="${messageId}"] .message-status i`);
        if (messageElement) {
            messageElement.className = `fas fa-${status === 'read' ? 'check-double' : 'check'}`;
        }
    }

    // ============ إدارة النماذج ============
    showCreateGroupModal() {
        document.getElementById('createGroupModal').style.display = 'block';
    }

    hideCreateGroupModal() {
        document.getElementById('createGroupModal').style.display = 'none';
        document.getElementById('createGroupForm').reset();
    }

    showCreateChannelModal() {
        document.getElementById('createChannelModal').style.display = 'block';
    }

    hideCreateChannelModal() {
        document.getElementById('createChannelModal').style.display = 'none';
        document.getElementById('createChannelForm').reset();
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

    startApp() {
        document.getElementById('welcomeScreen').style.display = 'none';
        this.navigateToPage('home');
    }

    // ============ إدارة المصادقة ============
    async handleLogin(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.get('email'),
                    password: formData.get('password')
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.handleAuthSuccess(data);
            } else {
                this.showNotification('فشل تسجيل الدخول', 'error');
            }
        } catch (error) {
            console.error('خطأ في تسجيل الدخول:', error);
            this.showNotification('خطأ في الاتصال', 'error');
        }
    }

    async handleRegister(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.get('name'),
                    email: formData.get('email'),
                    password: formData.get('password'),
                    role: formData.get('role')
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.handleAuthSuccess(data);
            } else {
                this.showNotification('فشل إنشاء الحساب', 'error');
            }
        } catch (error) {
            console.error('خطأ في إنشاء الحساب:', error);
            this.showNotification('خطأ في الاتصال', 'error');
        }
    }

    handleAuthSuccess(data) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        this.currentUser = data.user;
        this.showAuthenticatedUI();
        this.navigateToPage('dashboard');
        this.showNotification(`مرحباً ${data.user.name}`, 'success');
        
        // إعادة تهيئة السوكيت
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
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.educationalPlatform = new EducationalPlatform();
});
