// client.js - العميل الكامل للمنصة التعليمية (محدث ومصحح)
class EducationalPlatformClient {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.token = localStorage.getItem('auth_token');
        this.refreshToken = localStorage.getItem('refresh_token');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.socket = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        this.initEventListeners();
        this.initSocket();
        
        // تحديث حالة المصادقة تلقائياً
        if (this.token) {
            this.validateToken();
        }
    }

    // تهيئة مستمعي الأحداث
    initEventListeners() {
        // إعادة الاتصال عند العودة للاتصال
        window.addEventListener('online', () => {
            console.log('🌐 تم استعادة الاتصال بالإنترنت');
            this.initSocket();
        });

        // تحديث التوكن قبل انتهاء الصلاحية
        setInterval(() => {
            if (this.token) {
                this.validateToken();
            }
        }, 5 * 60 * 1000); // كل 5 دقائق
    }

    // تهيئة اتصال WebSocket
    initSocket() {
        if (this.isConnecting || (this.socket && this.socket.connected)) {
            return;
        }

        if (!this.token) {
            console.log('🔐 لا يوجد رمز وصول، تأجيل اتصال WebSocket');
            return;
        }

        this.isConnecting = true;
        
        try {
            if (this.socket) {
                this.socket.disconnect();
            }

            this.socket = io(this.baseURL, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay
            });

            this.setupSocketEvents();
            
        } catch (error) {
            console.error('❌ خطأ في تهيئة WebSocket:', error);
            this.isConnecting = false;
            this.handleSocketError(error);
        }
    }

    // إعداد أحداث WebSocket
    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('🔌 متصل بـ WebSocket');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            
            // توثيق WebSocket
            if (this.token) {
                this.socket.emit('authenticate', this.token);
            }
        });

        this.socket.on('authenticated', (data) => {
            console.log('✅ تم توثيق WebSocket بنجاح');
            this.onSocketAuthenticated(data);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 انقطع اتصال WebSocket:', reason);
            this.isConnecting = false;
            this.handleSocketDisconnect(reason);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ خطأ في اتصال WebSocket:', error);
            this.isConnecting = false;
            this.handleSocketError(error);
        });

        this.socket.on('new_message', (data) => {
            this.handleNewMessage(data);
        });

        this.socket.on('user_typing', (data) => {
            this.handleUserTyping(data);
        });

        this.socket.on('messages_read', (data) => {
            this.handleMessagesRead(data);
        });

        this.socket.on('user_status_changed', (data) => {
            this.handleUserStatusChanged(data);
        });

        this.socket.on('reconnect_attempt', (attempt) => {
            console.log(`🔄 محاولة إعادة الاتصال ${attempt}`);
            this.reconnectAttempts = attempt;
        });

        this.socket.on('reconnect_failed', () => {
            console.error('❌ فشلت جميع محاولات إعادة الاتصال');
            this.handleReconnectFailed();
        });
    }

    // معالجة التوثيق الناجح لـ WebSocket
    onSocketAuthenticated(data) {
        if (data.success) {
            this.user = data.user;
            localStorage.setItem('user', JSON.stringify(this.user));
            this.dispatchEvent('socket_authenticated', { user: this.user });
        } else {
            console.error('❌ فشل توثيق WebSocket:', data.message);
            this.handleAuthError(data.message);
        }
    }

    // معالجة انقطاع اتصال WebSocket
    handleSocketDisconnect(reason) {
        this.dispatchEvent('socket_disconnected', { reason });
        
        if (reason === 'io server disconnect') {
            // الخادم قام بفصل الاتصال، إعادة الاتصال
            setTimeout(() => this.initSocket(), 1000);
        }
    }

    // معالجة أخطاء WebSocket
    handleSocketError(error) {
        this.dispatchEvent('socket_error', { error });
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
            setTimeout(() => this.initSocket(), delay);
        }
    }

    // معالجة فشل إعادة الاتصال
    handleReconnectFailed() {
        this.dispatchEvent('reconnect_failed');
        console.error('❌ يرجى تحديث الصفحة لإعادة الاتصال');
    }

    // طلبات HTTP المساعدة
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // إضافة رمز المصادقة إذا كان متوفراً
        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            console.log(`🌐 إرسال طلب إلى: ${endpoint}`);
            const response = await fetch(url, config);
            
            // إذا كان التوكن منتهي الصلاحية، حاول تجديده
            if (response.status === 401 && this.refreshToken) {
                const refreshed = await this.refreshAuthToken();
                if (refreshed) {
                    // إعادة الطلب الأصلي بالتوكن الجديد
                    config.headers['Authorization'] = `Bearer ${this.token}`;
                    return await fetch(url, config);
                }
            }

            return response;
        } catch (error) {
            console.error(`❌ خطأ في الطلب إلى ${endpoint}:`, error);
            throw error;
        }
    }

    async requestWithAuth(endpoint, options = {}) {
        if (!this.token) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }

        return await this.request(endpoint, options);
    }

    // تجديد رمز المصادقة
    async refreshAuthToken() {
        try {
            if (!this.refreshToken) {
                this.logout();
                return false;
            }

            const response = await this.request('/api/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.setAuthTokens(data.token, data.refreshToken);
                return true;
            } else {
                this.logout();
                return false;
            }
        } catch (error) {
            console.error('❌ خطأ في تجديد رمز المصادقة:', error);
            this.logout();
            return false;
        }
    }

    // التحقق من صلاحية التوكن
    async validateToken() {
        try {
            const response = await this.requestWithAuth('/api/users/profile');
            if (!response.ok) {
                const refreshed = await this.refreshAuthToken();
                if (!refreshed) {
                    this.logout();
                }
            }
        } catch (error) {
            console.error('❌ خطأ في التحقق من صلاحية التوكن:', error);
        }
    }

    // المصادقة
    async login(email, password) {
        try {
            const response = await this.request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                this.setAuthTokens(data.token, data.refreshToken, data.user);
                this.initSocket(); // تهيئة WebSocket بعد تسجيل الدخول
                this.dispatchEvent('login_success', { user: data.user });
                return data;
            } else {
                this.dispatchEvent('login_error', { error: data.message });
                return data;
            }
        } catch (error) {
            console.error('❌ خطأ في تسجيل الدخول:', error);
            this.dispatchEvent('login_error', { error: 'خطأ في الاتصال بالخادم' });
            throw error;
        }
    }

    async register(userData) {
        try {
            const response = await this.request('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (data.success) {
                this.setAuthTokens(data.token, data.refreshToken, data.user);
                this.initSocket();
                this.dispatchEvent('register_success', { user: data.user });
            } else {
                this.dispatchEvent('register_error', { error: data.message });
            }

            return data;
        } catch (error) {
            console.error('❌ خطأ في التسجيل:', error);
            this.dispatchEvent('register_error', { error: 'خطأ في الاتصال بالخادم' });
            throw error;
        }
    }

    async logout() {
        try {
            if (this.token) {
                await this.requestWithAuth('/api/auth/logout', {
                    method: 'POST'
                });
            }
        } catch (error) {
            console.error('❌ خطأ في تسجيل الخروج:', error);
        } finally {
            this.clearAuth();
            this.dispatchEvent('logout');
        }
    }

    // إدارة التوكن
    setAuthTokens(token, refreshToken, user = null) {
        this.token = token;
        this.refreshToken = refreshToken;
        
        if (user) {
            this.user = user;
        }

        localStorage.setItem('auth_token', token);
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('user', JSON.stringify(this.user));

        // تحديث رؤوس الطلبات المستقبلية
        if (this.socket && this.socket.connected) {
            this.socket.emit('authenticate', token);
        }
    }

    clearAuth() {
        this.token = null;
        this.refreshToken = null;
        this.user = null;
        
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // المستخدمون
    async getProfile() {
        const response = await this.requestWithAuth('/api/users/profile');
        return await response.json();
    }

    async updateProfile(profileData) {
        const formData = new FormData();
        
        Object.keys(profileData).forEach(key => {
            if (profileData[key] !== undefined && profileData[key] !== null) {
                formData.append(key, profileData[key]);
            }
        });

        const response = await this.requestWithAuth('/api/users/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        const data = await response.json();
        
        if (data.success && data.user) {
            this.user = data.user;
            localStorage.setItem('user', JSON.stringify(this.user));
            this.dispatchEvent('profile_updated', { user: this.user });
        }

        return data;
    }

    async searchUsers(query, limit = 20) {
        const response = await this.requestWithAuth(`/api/users/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        return await response.json();
    }

    // المحادثات
    async getConversations() {
        const response = await this.requestWithAuth('/api/conversations');
        return await response.json();
    }

    async createConversation(participantIds, name = null, isGroup = false) {
        const response = await this.requestWithAuth('/api/conversations', {
            method: 'POST',
            body: JSON.stringify({
                participantIds,
                name,
                isGroup
            })
        });
        return await response.json();
    }

    async getOrCreateConversation(userId) {
        const response = await this.requestWithAuth(`/api/conversations/with/${userId}`);
        return await response.json();
    }

    // الرسائل
    async getMessages(conversationId, limit = 50) {
        const response = await this.requestWithAuth(`/api/conversations/${conversationId}/messages?limit=${limit}`);
        return await response.json();
    }

    async sendMessage(conversationId, content, type = 'text', metadata = {}) {
        const response = await this.requestWithAuth(`/api/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                content,
                type,
                metadata
            })
        });
        return await response.json();
    }

    async markMessagesAsRead(conversationId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('message_read', { conversationId });
        }
    }

    // إدارة الكتابة
    startTyping(conversationId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('typing_start', { conversationId });
        }
    }

    stopTyping(conversationId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('typing_stop', { conversationId });
        }
    }

    // الانضمام للمحادثات
    joinConversation(conversationId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('join_conversation', conversationId);
        }
    }

    leaveConversation(conversationId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('leave_conversation', conversationId);
        }
    }

    // القنوات
    async getChannels() {
        const response = await this.requestWithAuth('/api/channels');
        return await response.json();
    }

    async getMyChannels() {
        const response = await this.requestWithAuth('/api/channels/my');
        return await response.json();
    }

    async createChannel(channelData) {
        const formData = new FormData();
        
        Object.keys(channelData).forEach(key => {
            if (channelData[key] !== undefined && channelData[key] !== null) {
                formData.append(key, channelData[key]);
            }
        });

        const response = await this.requestWithAuth('/api/channels', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        return await response.json();
    }

    async joinChannel(channelId) {
        const response = await this.requestWithAuth(`/api/channels/${channelId}/join`, {
            method: 'POST'
        });
        return await response.json();
    }

    // إدارة قنوات WebSocket
    joinChannelRoom(channelId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('join_channel', channelId);
        }
    }

    leaveChannelRoom(channelId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('leave_channel', channelId);
        }
    }

    // المجموعات
    async getGroups() {
        const response = await this.requestWithAuth('/api/groups');
        return await response.json();
    }

    async getMyGroups() {
        const response = await this.requestWithAuth('/api/groups/my');
        return await response.json();
    }

    async createGroup(groupData) {
        const formData = new FormData();
        
        Object.keys(groupData).forEach(key => {
            if (groupData[key] !== undefined && groupData[key] !== null) {
                formData.append(key, groupData[key]);
            }
        });

        const response = await this.requestWithAuth('/api/groups', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        return await response.json();
    }

    async joinGroup(groupId) {
        const response = await this.requestWithAuth(`/api/groups/${groupId}/join`, {
            method: 'POST'
        });
        return await response.json();
    }

    // إدارة مجموعات WebSocket
    joinGroupRoom(groupId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('join_group', groupId);
        }
    }

    leaveGroupRoom(groupId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('leave_group', groupId);
        }
    }

    // الستوريات
    async getStories() {
        const response = await this.requestWithAuth('/api/stories');
        return await response.json();
    }

    async createStory(storyData) {
        const formData = new FormData();
        
        Object.keys(storyData).forEach(key => {
            if (storyData[key] !== undefined && storyData[key] !== null) {
                formData.append(key, storyData[key]);
            }
        });

        const response = await this.requestWithAuth('/api/stories', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        return await response.json();
    }

    async viewStory(storyId) {
        const response = await this.requestWithAuth(`/api/stories/${storyId}/view`, {
            method: 'POST'
        });
        return await response.json();
    }

    // الإدارة
    async getAdminStats() {
        const response = await this.requestWithAuth('/api/admin/stats');
        return await response.json();
    }

    async createBackup() {
        const response = await this.requestWithAuth('/api/admin/backup', {
            method: 'POST'
        });
        return await response.json();
    }

    async cleanupData() {
        const response = await this.requestWithAuth('/api/admin/cleanup', {
            method: 'POST'
        });
        return await response.json();
    }

    // نظام الأحداث
    dispatchEvent(eventName, data = {}) {
        const event = new CustomEvent(eventName, { detail: data });
        window.dispatchEvent(event);
    }

    on(eventName, callback) {
        window.addEventListener(eventName, (event) => {
            callback(event.detail);
        });
    }

    off(eventName, callback) {
        window.removeEventListener(eventName, callback);
    }

    // معالجة الأحداث الواردة
    handleNewMessage(data) {
        this.dispatchEvent('new_message', data);
    }

    handleUserTyping(data) {
        this.dispatchEvent('user_typing', data);
    }

    handleMessagesRead(data) {
        this.dispatchEvent('messages_read', data);
    }

    handleUserStatusChanged(data) {
        this.dispatchEvent('user_status_changed', data);
    }

    handleAuthError(message) {
        this.dispatchEvent('auth_error', { message });
    }

    // أدوات مساعدة
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    getSocket() {
        return this.socket;
    }

    isSocketConnected() {
        return this.socket && this.socket.connected;
    }

    // إعادة الاتصال يدوياً
    reconnect() {
        this.initSocket();
    }

    // الحصول على حالة الاتصال
    getConnectionStatus() {
        if (!this.socket) return 'disconnected';
        if (this.socket.connected) return 'connected';
        if (this.isConnecting) return 'connecting';
        return 'disconnected';
    }
}

// إنشاء نسخة عامة للاستخدام
window.EducationalPlatformClient = EducationalPlatformClient;

// التصدير للاستخدام في الوحدات
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EducationalPlatformClient;
}
