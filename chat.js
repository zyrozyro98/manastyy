// نظام الدردشة
class ChatManager {
    static init() {
        this.setupEventListeners();
        this.setupEmojiPicker();
        this.setupFileUpload();
    }

    static setupEventListeners() {
        // إرسال الرسائل
        const sendBtn = document.getElementById('sendMessage');
        const messageInput = document.getElementById('messageInput');
        
        if (sendBtn && messageInput) {
            sendBtn.addEventListener('click', this.sendMessage.bind(this));
            
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // مؤشر الكتابة
            messageInput.addEventListener('input', this.handleTyping.bind(this));
        }

        // أزرار الإيموجي والمرفقات
        const emojiBtn = document.getElementById('emojiButton');
        const attachBtn = document.getElementById('attachButton');
        
        if (emojiBtn) {
            emojiBtn.addEventListener('click', this.toggleEmojiPicker.bind(this));
        }
        
        if (attachBtn) {
            attachBtn.addEventListener('click', this.attachFile.bind(this));
        }

        // مكانسور الجوال
        const mobileToggle = document.getElementById('mobileChatToggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', this.toggleMobileChat.bind(this));
        }
    }

    static setupEmojiPicker() {
        const picker = document.getElementById('emojiPicker');
        if (!picker) return;

        // إضافة الإيموجي حسب التصنيفات
        let emojiHTML = '';
        
        for (const [category, emojis] of Object.entries(EMOJI_CATEGORIES)) {
            emojiHTML += `<div class="emoji-category">`;
            emojis.forEach(emoji => {
                emojiHTML += `
                    <button class="emoji-btn" onclick="ChatManager.insertEmoji('${emoji}')">
                        ${emoji}
                    </button>
                `;
            });
            emojiHTML += `</div>`;
        }
        
        picker.innerHTML = emojiHTML;
    }

    static setupFileUpload() {
        const attachInput = document.createElement('input');
        attachInput.type = 'file';
        attachInput.id = 'fileInput';
        attachInput.style.display = 'none';
        attachInput.accept = 'image/*,video/*,.pdf,.doc,.docx';
        attachInput.multiple = true;
        
        attachInput.addEventListener('change', this.handleFileSelect.bind(this));
        document.body.appendChild(attachInput);
    }

    static toggleEmojiPicker() {
        const picker = document.getElementById('emojiPicker');
        if (picker) {
            picker.style.display = picker.style.display === 'grid' ? 'none' : 'grid';
        }
    }

    static insertEmoji(emoji) {
        const input = document.getElementById('messageInput');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.length;
        this.toggleEmojiPicker();
    }

    static attachFile() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    static async handleFileSelect(e) {
        const files = e.target.files;
        if (!files.length) return;

        for (const file of files) {
            if (file.size > CONFIG.MAX_FILE_SIZE) {
                Utils.showAlert('chatPage', `الملف ${file.name} كبير جداً (الحد الأقصى: ${Utils.formatFileSize(CONFIG.MAX_FILE_SIZE)})`, 'error');
                continue;
            }

            try {
                await this.sendFile(file);
            } catch (error) {
                Utils.showAlert('chatPage', `خطأ في رفع الملف ${file.name}`, 'error');
            }
        }

        // إعادة تعيين حقل الملف
        e.target.value = '';
    }

    static async sendFile(file) {
        const formData = new FormData();
        formData.append('attachment', file);
        
        if (currentUser.role === 'admin' && currentConversation) {
            formData.append('receiverId', currentConversation);
        }

        const btn = document.getElementById('sendMessage');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            const response = await API.sendMessageWithAttachment(formData);
            const data = await response.json();

            if (response.ok) {
                Utils.showNotification('تم إرسال الملف بنجاح', 'success');
                
                // تحديث الرسائل
                if (currentUser.role === 'admin' && currentConversation) {
                    await this.loadConversationMessages(currentConversation);
                } else {
                    await this.loadMessages();
                }
            } else {
                throw new Error(data.message || 'خطأ في إرسال الملف');
            }
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    static async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const text = messageInput.value.trim();
        
        if (!text) {
            Utils.showAlert('chatPage', 'الرسالة لا يمكن أن تكون فارغة', 'error');
            return;
        }

        if (text.length > CONFIG.MAX_MESSAGE_LENGTH) {
            Utils.showAlert('chatPage', `الرسالة طويلة جداً (الحد الأقصى: ${CONFIG.MAX_MESSAGE_LENGTH} حرف)`, 'error');
            return;
        }

        // للمدير: التأكد من اختيار محادثة
        if (currentUser.role === 'admin' && !currentConversation) {
            Utils.showAlert('chatPage', 'يجب اختيار محادثة أولاً من القائمة الجانبية', 'error');
            return;
        }

        const btn = document.getElementById('sendMessage');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            let receiverId = null;
            if (currentUser.role === 'admin') {
                receiverId = currentConversation;
            }

            await API.sendMessage(text, receiverId);
            messageInput.value = '';
            
            // تحديث الرسائل فوراً
            if (currentUser.role === 'admin' && currentConversation) {
                await this.loadConversationMessages(currentConversation);
            } else {
                await this.loadMessages();
            }
            
            // للمدير: تحديث قائمة المحادثات
            if (currentUser.role === 'admin') {
                setTimeout(() => {
                    this.loadConversations();
                }, 1000);
            }
        } catch (error) {
            Utils.showAlert('chatPage', error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    static handleTyping() {
        if (!isTyping) {
            isTyping = true;
            // هنا يمكن إرسال إشعار الكتابة للخادم
        }

        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            isTyping = false;
            // إيقاف إشعار الكتابة
        }, CONFIG.TYPING_TIMEOUT);
    }

    static async loadMessages() {
        try {
            const messages = await API.getMessages();
            this.displayMessages(messages);
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    static async loadConversations() {
        if (currentUser.role !== 'admin') return;

        try {
            const conversations = await API.getConversations();
            this.displayConversations(conversations);
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }

    static async loadConversationMessages(userId) {
        try {
            const messages = await API.getConversationMessages(userId);
            this.displayMessages(messages);
        } catch (error) {
            console.error('Error loading conversation messages:', error);
        }
    }

    static displayMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div class="chat-placeholder">
                    <i class="fas fa-comments"></i>
                    <h3>لا توجد رسائل بعد</h3>
                    <p>ابدأ المحادثة بإرسال رسالة ترحيب</p>
                </div>
            `;
            return;
        }

        let messagesHTML = '';
        
        // ترتيب الرسائل من الأقدم إلى الأحدث
        const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        sortedMessages.forEach(msg => {
            const isSent = msg.senderId === currentUser._id;
            const isBroadcast = msg.isBroadcast;
            const isSystem = msg.senderId === 'system';
            
            if (isSystem) {
                messagesHTML += `
                    <div class="message-system">
                        <i class="fas fa-info-circle"></i>
                        ${msg.text}
                    </div>
                `;
            } else {
                messagesHTML += `
                    <div class="message ${isSent ? 'sent' : 'received'} ${isBroadcast ? 'message-broadcast' : ''}">
                        <div class="message-header">
                            <span class="message-sender">${msg.senderName || 'مرسل غير معروف'}</span>
                            <span class="message-time">${Utils.formatTime(msg.timestamp)}</span>
                        </div>
                        <div class="message-content">${this.formatMessageContent(msg)}</div>
                    </div>
                `;
            }
        });
        
        container.innerHTML = messagesHTML;
        container.scrollTop = container.scrollHeight;
    }

    static formatMessageContent(message) {
        let content = message.text;
        
        // تحويل الروابط إلى روابط قابلة للنقر
        content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        
        // إضافة المرفقات إذا وجدت
        if (message.attachment) {
            const attachment = message.attachment;
            if (attachment.mimetype.startsWith('image/')) {
                content += `
                    <div class="message-attachment">
                        <img src="${CONFIG.API_BASE}${attachment.url}" 
                             alt="${attachment.originalname}"
                             onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPuWNleivleS4rTwvdGV4dD48L3N2Zz4='">
                        <div class="attachment-info">
                            <i class="fas fa-image"></i> ${attachment.originalname}
                        </div>
                    </div>
                `;
            } else {
                content += `
                    <div class="message-attachment">
                        <div class="attachment-info">
                            <i class="fas fa-file"></i> ${attachment.originalname}
                            <br>
                            <small>${Utils.formatFileSize(attachment.size)}</small>
                        </div>
                    </div>
                `;
            }
        }
        
        return content;
    }

    static displayConversations(conversations) {
        const container = document.getElementById('conversationsList');
        if (!container) return;
        
        if (!conversations || conversations.length === 0) {
            container.innerHTML = `
                <div class="no-conversations">
                    <i class="fas fa-comments"></i>
                    <p>لا توجد محادثات بعد</p>
                    <small>سيظهر المستخدمون هنا عندما يرسلون رسائل</small>
                </div>
            `;
            return;
        }

        let conversationsHTML = '';
        
        conversations.forEach(conv => {
            conversationsHTML += `
                <div class="conversation-item ${currentConversation === conv.userId ? 'active' : ''}" 
                     onclick="ChatManager.selectConversation('${conv.userId}', '${conv.userName}')">
                    <div class="user-avatar">
                        ${conv.userName ? conv.userName.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div class="conversation-info">
                        <div class="conversation-name">${conv.userName || 'مستخدم غير معروف'}</div>
                        <div class="conversation-preview">${conv.lastMessage || 'لا توجد رسائل'}</div>
                    </div>
                    <div class="conversation-time">${Utils.formatTime(conv.lastMessageTime)}</div>
                    ${conv.unreadCount > 0 ? `<div class="unread-badge">${conv.unreadCount}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = conversationsHTML;
    }

    static async selectConversation(userId, userName) {
        try {
            currentConversation = userId;
            
            // تحديث واجهة المحادثات
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
            
            document.querySelectorAll('.conversation-item').forEach(item => {
                if (item.querySelector('.conversation-name')?.textContent === userName) {
                    item.classList.add('active');
                }
            });

            // تحديث رأس المحادثة
            document.getElementById('chatWithName').textContent = userName;
            document.getElementById('chatStatus').innerHTML = '<i class="fas fa-circle" style="font-size: 0.5rem; color: var(--success);"></i> متصل الآن';

            // تحميل رسائل المحادثة
            await this.loadConversationMessages(userId);

            // إغلاق الشريط الجانبي على الجوال
            if (window.innerWidth <= 992) {
                this.toggleMobileChat();
            }

        } catch (error) {
            console.error('Error selecting conversation:', error);
            Utils.showAlert('chatPage', 'خطأ في فتح المحادثة', 'error');
        }
    }

    static toggleMobileChat() {
        const sidebar = document.getElementById('conversationsSidebar');
        if (sidebar) {
            sidebar.classList.toggle('mobile-visible');
        }
    }

    static startAutoRefresh() {
        if (chatInterval) {
            clearInterval(chatInterval);
        }
        
        chatInterval = setInterval(async () => {
            if (currentUser.role === 'admin' && currentConversation) {
                await this.loadConversationMessages(currentConversation);
                await this.loadConversations();
            } else if (currentUser.role === 'student') {
                await this.loadMessages();
            }
        }, CONFIG.AUTO_REFRESH_INTERVAL);
    }

    static cleanup() {
        if (chatInterval) {
            clearInterval(chatInterval);
            chatInterval = null;
        }
        
        if (typingTimer) {
            clearTimeout(typingTimer);
            typingTimer = null;
        }
        
        currentConversation = null;
        isTyping = false;
    }
}
