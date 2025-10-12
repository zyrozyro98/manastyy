// دوال الاتصال بالخادم
class API {
    static async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE}${endpoint}`;
        const token = localStorage.getItem('token');
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            ...options
        };

        try {
            const response = await fetch(url, defaultOptions);
            
            if (response.status === 401) {
                // غير مصرح - تسجيل الخروج
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.reload();
                return;
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'حدث خطأ في الخادم');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // المصادقة
    static async login(phone, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password })
        });
    }

    static async register(userData) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    // الدردشة
    static async sendMessage(text, receiverId = null) {
        const body = receiverId ? { text, receiverId } : { text };
        return this.request('/chat/send', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    static async sendMessageWithAttachment(formData) {
        const token = localStorage.getItem('token');
        return fetch(`${CONFIG.API_BASE}/chat/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
    }

    static async getMessages() {
        return this.request('/chat/messages');
    }

    static async getConversations() {
        return this.request('/chat/conversations');
    }

    static async getConversationMessages(userId) {
        return this.request(`/chat/conversation/${userId}`);
    }

    // الإدارة
    static async getUsers() {
        return this.request('/admin/users');
    }

    static async getStats() {
        return this.request('/admin/stats');
    }

    static async sendBroadcastMessage(text) {
        return this.request('/admin/send-message', {
            method: 'POST',
            body: JSON.stringify({ text, isBroadcast: true })
        });
    }

    static async sendImage(formData) {
        const token = localStorage.getItem('token');
        return fetch(`${CONFIG.API_BASE}/admin/send-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
    }

    static async sendBatchImages(formData) {
        const token = localStorage.getItem('token');
        return fetch(`${CONFIG.API_BASE}/admin/send-batch-images`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
    }

    static async broadcastImage(formData) {
        const token = localStorage.getItem('token');
        return fetch(`${CONFIG.API_BASE}/admin/broadcast-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
    }

    // الصور
    static async getImages() {
        return this.request('/images');
    }

    // الصحة والاتصال
    static async healthCheck() {
        return this.request('/health');
    }

    static async keepAlive() {
        return this.request('/keep-alive', {
            method: 'POST'
        });
    }
}
