// js/script.js - الملف النهائي الكامل للمنصة التعليمية

class EduPlatform {
    constructor() {
        this.currentUser = null;
        this.currentPage = 'home';
        this.conversations = [];
        this.currentConversation = null;
        this.stories = [];
        this.currentStoryIndex = 0;
        this.storyInterval = null;
        this.isChatSidebarVisible = true;
        
        this.initializeApp();
    }

    // تهيئة التطبيق
    initializeApp() {
        this.initializeEventListeners();
        this.checkAuthentication();
        this.loadMockData();
        this.showWelcomeScreen();
    }

    // تهيئة مستمعي الأحداث
    initializeEventListeners() {
        // التنقل بين الصفحات
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                if (page) {
                    this.navigateToPage(page);
                }
            });
        });

        // زر القائمة المتنقلة
        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        // زر تسجيل الدخول
        document.getElementById('loginBtn').addEventListener('click', () => {
            this.showLoginModal();
        });

        // زر التسجيل
        document.getElementById('registerBtn').addEventListener('click', () => {
            this.showRegisterModal();
        });

        // زر تسجيل الخروج
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // نموذج تسجيل الدخول
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // نموذج التسجيل
        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // إغلاق النماذج
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.closeModal(modal);
            });
        });

        // النقر خارج النموذج لإغلاقه
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal);
                }
            });
        });

        // إرسال الرسائل
        document.getElementById('sendMessageBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // إدارة القصص
        document.querySelectorAll('.story-item').forEach((story, index) => {
            story.addEventListener('click', () => {
                this.openStory(index);
            });
        });

        document.getElementById('storyClose').addEventListener('click', () => {
            this.closeStory();
        });

        document.getElementById('prevStory').addEventListener('click', () => {
            this.previousStory();
        });

        document.getElementById('nextStory').addEventListener('click', () => {
            this.nextStory();
        });

        // إدارة الدردشة
        document.getElementById('toggleChatSidebar').addEventListener('click', () => {
            this.toggleChatSidebar();
        });

        // التبويبات
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        // إعدادات التبويبات
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const tabId = item.getAttribute('data-tab');
                this.switchSettingsTab(tabId);
            });
        });

        // إنشاء مجموعات وقنوات جديدة
        document.getElementById('createGroupBtn').addEventListener('click', () => {
            this.showCreateGroupModal();
        });

        document.getElementById('createChannelBtn').addEventListener('click', () => {
            this.showCreateChannelModal();
        });

        // تحميل الوسائط
        document.getElementById('loadMoreMedia').addEventListener('click', () => {
            this.loadMoreMedia();
        });
    }

    // التحقق من المصادقة
    checkAuthentication() {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.updateUIAfterAuth();
        }
    }

    // تحميل بيانات تجريبية
    loadMockData() {
        // محادثات تجريبية
        this.conversations = [
            {
                id: 1,
                name: "أحمد محمد",
                avatar: "أح",
                lastMessage: "مرحباً، كيف يمكنني المساعدة؟",
                time: "10:30",
                unread: 2,
                messages: [
                    { id: 1, text: "مرحباً!", time: "10:25", sent: false },
                    { id: 2, text: "كيف يمكنني المساعدة؟", time: "10:30", sent: false }
                ]
            },
            {
                id: 2,
                name: "فريق التطوير",
                avatar: "فريق",
                lastMessage: "اجتماع اليوم الساعة 3",
                time: "أمس",
                unread: 0,
                messages: [
                    { id: 1, text: "تذكير: اجتماع اليوم الساعة 3", time: "أمس 15:00", sent: false }
                ]
            },
            {
                id: 3,
                name: "سارة علي",
                avatar: "سا",
                lastMessage: "شكراً على المساعدة!",
                time: "22/03",
                unread: 0,
                messages: [
                    { id: 1, text: "شكراً على المساعدة في المشروع!", time: "22/03 14:20", sent: false }
                ]
            }
        ];

        // قصص تجريبية
        this.stories = [
            {
                id: 1,
                author: "أحمد محمد",
                avatar: "أح",
                time: "قبل ساعة",
                image: "https://via.placeholder.com/350x600/667eea/white?text=قصة+تعليمية",
                seen: false
            },
            {
                id: 2,
                author: "سارة علي",
                avatar: "سا",
                time: "قبل 3 ساعات",
                image: "https://via.placeholder.com/350x600/764ba2/white?text=نصيحة+دراسية",
                seen: true
            },
            {
                id: 3,
                author: "فريق الرياضيات",
                avatar: "ري",
                time: "قبل 5 ساعات",
                image: "https://via.placeholder.com/350x600/f72585/white?text=مسابقة+رياضيات",
                seen: false
            }
        ];

        // تحديث واجهة المحادثات
        this.updateConversationsList();
    }

    // عرض شاشة الترحيب
    showWelcomeScreen() {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (!localStorage.getItem('welcomeShown')) {
            welcomeScreen.style.display = 'flex';
            setTimeout(() => {
                welcomeScreen.style.opacity = '1';
            }, 100);
        } else {
            welcomeScreen.style.display = 'none';
        }
    }

    // إخفاء شاشة الترحيب
    hideWelcomeScreen() {
        const welcomeScreen = document.getElementById('welcomeScreen');
        welcomeScreen.style.opacity = '0';
        setTimeout(() => {
            welcomeScreen.style.display = 'none';
            localStorage.setItem('welcomeShown', 'true');
        }, 500);
    }

    // التنقل بين الصفحات
    navigateToPage(page) {
        // إخفاء جميع الصفحات
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });

        // إزالة النشاط من عناصر التنقل
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // إظهار الصفحة المطلوبة
        const targetPage = document.getElementById(`${page}Page`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = page;

            // إضافة النشاط لعنصر التنقل
            const navItem = document.querySelector(`[data-page="${page}"]`);
            if (navItem) {
                navItem.classList.add('active');
            }

            // تحميل محتوى الصفحة حسب الحاجة
            this.loadPageContent(page);
        }

        // إغلاق القائمة المتنقلة على الأجهزة الصغيرة
        if (window.innerWidth <= 768) {
            this.closeMobileMenu();
        }
    }

    // تحميل محتوى الصفحة
    loadPageContent(page) {
        switch (page) {
            case 'chat':
                this.initializeChat();
                break;
            case 'stories':
                this.initializeStories();
                break;
            case 'groups':
                this.loadGroups();
                break;
            case 'channels':
                this.loadChannels();
                break;
            case 'media':
                this.loadMedia();
                break;
        }
    }

    // تهيئة الدردشة
    initializeChat() {
        if (this.conversations.length > 0 && !this.currentConversation) {
            this.selectConversation(this.conversations[0].id);
        }
    }

    // تحديث قائمة المحادثات
    updateConversationsList() {
        const list = document.getElementById('conversationsList');
        if (!list) return;

        list.innerHTML = '';

        this.conversations.forEach(conversation => {
            const item = document.createElement('div');
            item.className = `conversation-item ${this.currentConversation?.id === conversation.id ? 'active' : ''}`;
            item.innerHTML = `
                <div class="conversation-avatar">${conversation.avatar}</div>
                <div class="conversation-info">
                    <div class="conversation-name">${conversation.name}</div>
                    <div class="conversation-last-message">${conversation.lastMessage}</div>
                </div>
                <div class="conversation-meta">
                    <div class="conversation-time">${conversation.time}</div>
                    ${conversation.unread > 0 ? `<div class="conversation-unread">${conversation.unread}</div>` : ''}
                </div>
            `;
            item.addEventListener('click', () => {
                this.selectConversation(conversation.id);
            });
            list.appendChild(item);
        });
    }

    // اختيار محادثة
    selectConversation(conversationId) {
        this.currentConversation = this.conversations.find(c => c.id === conversationId);
        this.updateConversationsList();
        this.updateChatMessages();
        
        // إظهار منطقة الدردشة الرئيسية
        document.getElementById('emptyChat').style.display = 'none';
        document.getElementById('chatMain').style.display = 'flex';
        
        // تحديث معلومات المستخدم في الدردشة
        document.getElementById('chatUserName').textContent = this.currentConversation.name;
        document.getElementById('chatUserAvatar').textContent = this.currentConversation.avatar;
    }

    // تحديث رسائل الدردشة
    updateChatMessages() {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer || !this.currentConversation) return;

        messagesContainer.innerHTML = '';

        this.currentConversation.messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.sent ? 'sent' : 'received'}`;
            messageElement.innerHTML = `
                <div class="message-content">
                    <div class="message-text">${message.text}</div>
                    <div class="message-time">${message.time}</div>
                </div>
                <div class="message-status">
                    ${message.sent ? '<i class="fas fa-check"></i>' : ''}
                </div>
            `;
            messagesContainer.appendChild(messageElement);
        });

        // التمرير إلى الأسفل
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // إرسال رسالة
    sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();

        if (!text || !this.currentConversation) return;

        // إنشاء رسالة جديدة
        const newMessage = {
            id: Date.now(),
            text: text,
            time: this.getCurrentTime(),
            sent: true
        };

        // إضافة الرسالة للمحادثة الحالية
        this.currentConversation.messages.push(newMessage);
        this.currentConversation.lastMessage = text;
        this.currentConversation.time = 'الآن';

        // تحديث الواجهة
        this.updateChatMessages();
        this.updateConversationsList();

        // مسح حقل الإدخال
        input.value = '';

        // محاكاة رد تلقائي بعد ثانيتين
        setTimeout(() => {
            this.receiveAutoReply();
        }, 2000);
    }

    // استلام رد تلقائي
    receiveAutoReply() {
        if (!this.currentConversation) return;

        const replies = [
            "شكراً على رسالتك!",
            "سأرد عليك قريباً",
            "هل تحتاج مساعدة إضافية؟",
            "هذا مثير للاهتمام!"
        ];

        const randomReply = replies[Math.floor(Math.random() * replies.length)];

        const autoMessage = {
            id: Date.now(),
            text: randomReply,
            time: this.getCurrentTime(),
            sent: false
        };

        this.currentConversation.messages.push(autoMessage);
        this.currentConversation.lastMessage = randomReply;
        this.currentConversation.time = 'الآن';

        this.updateChatMessages();
        this.updateConversationsList();
    }

    // الحصول على الوقت الحالي
    getCurrentTime() {
        const now = new Date();
        return `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    // تهيئة القصص
    initializeStories() {
        this.updateStoriesList();
    }

    // تحديث قائمة القصص
    updateStoriesList() {
        const container = document.getElementById('storiesContainer');
        if (!container) return;

        container.innerHTML = '';

        this.stories.forEach((story, index) => {
            const storyElement = document.createElement('div');
            storyElement.className = 'story-item';
            storyElement.innerHTML = `
                <div class="story-avatar">
                    <span>${story.avatar}</span>
                </div>
                <div class="story-author">${story.author}</div>
            `;
            storyElement.addEventListener('click', () => {
                this.openStory(index);
            });
            container.appendChild(storyElement);
        });
    }

    // فتح قصة
    openStory(index) {
        this.currentStoryIndex = index;
        const story = this.stories[index];
        
        document.getElementById('storyViewer').classList.add('active');
        document.getElementById('currentStoryImage').src = story.image;
        document.getElementById('storyAuthorName').textContent = story.author;
        document.getElementById('storyAuthorAvatar').textContent = story.avatar;
        document.getElementById('storyTime').textContent = story.time;

        // بدء تقدم القصة
        this.startStoryProgress();

        // تعطيل التمرير في الخلفية
        document.body.style.overflow = 'hidden';
    }

    // إغلاق القصة
    closeStory() {
        document.getElementById('storyViewer').classList.remove('active');
        this.stopStoryProgress();
        document.body.style.overflow = 'auto';
    }

    // بدء تقدم القصة
    startStoryProgress() {
        this.stopStoryProgress();
        
        const progressBar = document.querySelector('.story-progress-fill');
        progressBar.style.width = '0%';
        
        setTimeout(() => {
            progressBar.style.width = '100%';
        }, 10);

        this.storyInterval = setTimeout(() => {
            this.nextStory();
        }, 5000);
    }

    // إيقاف تقدم القصة
    stopStoryProgress() {
        if (this.storyInterval) {
            clearTimeout(this.storyInterval);
            this.storyInterval = null;
        }
    }

    // القصة التالية
    nextStory() {
        if (this.currentStoryIndex < this.stories.length - 1) {
            this.currentStoryIndex++;
            this.openStory(this.currentStoryIndex);
        } else {
            this.closeStory();
        }
    }

    // القصة السابقة
    previousStory() {
        if (this.currentStoryIndex > 0) {
            this.currentStoryIndex--;
            this.openStory(this.currentStoryIndex);
        }
    }

    // تحميل المجموعات
    loadGroups() {
        // محاكاة تحميل المجموعات
        const groupsGrid = document.getElementById('groupsGrid');
        if (!groupsGrid) return;

        groupsGrid.innerHTML = `
            <div class="group-card">
                <div class="group-header">
                    <div class="group-avatar">مج</div>
                    <h3>مجموعة الرياضيات</h3>
                    <p>مجموعة لدراسة الرياضيات المتقدمة</p>
                </div>
                <div class="group-info">
                    <p>مجموعة مخصصة لطلاب الرياضيات لمناقشة المسائل والحلول.</p>
                    <div class="group-stats">
                        <div class="group-stat">
                            <div class="group-stat-number">150</div>
                            <div class="group-stat-label">عضو</div>
                        </div>
                        <div class="group-stat">
                            <div class="group-stat-number">24</div>
                            <div class="group-stat-label">منشور</div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block">انضم للمجموعة</button>
                </div>
            </div>
            <div class="group-card">
                <div class="group-header">
                    <div class="group-avatar">عل</div>
                    <h3>مجموعة العلوم</h3>
                    <p>مناقشة التجارب العلمية</p>
                </div>
                <div class="group-info">
                    <p>مجموعة لمحبي العلوم والتجارب العملية.</p>
                    <div class="group-stats">
                        <div class="group-stat">
                            <div class="group-stat-number">89</div>
                            <div class="group-stat-label">عضو</div>
                        </div>
                        <div class="group-stat">
                            <div class="group-stat-number">15</div>
                            <div class="group-stat-label">منشور</div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block">انضم للمجموعة</button>
                </div>
            </div>
        `;
    }

    // تحميل القنوات
    loadChannels() {
        // محاكاة تحميل القنوات
        const channelsGrid = document.getElementById('channelsGrid');
        if (!channelsGrid) return;

        channelsGrid.innerHTML = `
            <div class="channel-card">
                <div class="channel-header">
                    <div class="channel-avatar">تط</div>
                    <h3>قناة التطوير</h3>
                    <p>أخبار وتحديثات التطوير</p>
                </div>
                <div class="channel-info">
                    <p>قناة مخصصة لأخبار التطوير والتحديثات التقنية.</p>
                    <div class="channel-stats">
                        <div class="channel-stat">
                            <div class="channel-stat-number">1.2K</div>
                            <div class="channel-stat-label">مشترك</div>
                        </div>
                        <div class="channel-stat">
                            <div class="channel-stat-number">156</div>
                            <div class="channel-stat-label">منشور</div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block">اشترك في القناة</button>
                </div>
            </div>
            <div class="channel-card">
                <div class="channel-header">
                    <div class="channel-avatar">أخ</div>
                    <h3>قناة الأخبار</h3>
                    <p>أخبار التعليم والطلاب</p>
                </div>
                <div class="channel-info">
                    <p>أحدث الأخبار والتحديثات في مجال التعليم.</p>
                    <div class="channel-stats">
                        <div class="channel-stat">
                            <div class="channel-stat-number">2.5K</div>
                            <div class="channel-stat-label">مشترك</div>
                        </div>
                        <div class="channel-stat">
                            <div class="channel-stat-number">342</div>
                            <div class="channel-stat-label">منشور</div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block">اشترك في القناة</button>
                </div>
            </div>
        `;
    }

    // تحميل الوسائط
    loadMedia() {
        // محاكاة تحميل الوسائط
        const mediaGrid = document.getElementById('mediaGrid');
        if (!mediaGrid) return;

        const mediaItems = [
            { type: 'صورة', title: 'شرح الرياضيات', description: 'شرح مفصل لنظرية فيثاغورس' },
            { type: 'فيديو', title: 'تجربة كيميائية', description: 'تجربة تفاعل كيميائي مذهلة' },
            { type: 'ملف', title: 'ملخص التاريخ', description: 'ملخص شامل لمادة التاريخ' },
            { type: 'صورة', title: 'خرائط ذهنية', description: 'خرائط ذهنية للفيزياء' }
        ];

        mediaGrid.innerHTML = mediaItems.map((media, index) => `
            <div class="media-item">
                <img src="https://via.placeholder.com/300x200/667eea/white?text=${media.type}+${index + 1}" alt="${media.title}">
                <div class="media-type">${media.type}</div>
                <div class="media-overlay">
                    <h4>${media.title}</h4>
                    <p>${media.description}</p>
                    <div class="media-actions">
                        <button class="btn btn-sm btn-outline">عرض</button>
                        <button class="btn btn-sm btn-primary">تحميل</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // تحميل المزيد من الوسائط
    loadMoreMedia() {
        // محاكاة تحميل المزيد من الوسائط
        const btn = document.getElementById('loadMoreMedia');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...';
        btn.disabled = true;

        setTimeout(() => {
            this.loadMedia();
            btn.innerHTML = 'تم تحميل المزيد من الوسائط';
            setTimeout(() => {
                btn.innerHTML = 'تحميل المزيد';
                btn.disabled = false;
            }, 2000);
        }, 1500);
    }

    // تبديل شريط الدردشة الجانبي
    toggleChatSidebar() {
        const sidebar = document.getElementById('chatSidebar');
        const toggleBtn = document.getElementById('toggleChatSidebar');
        
        this.isChatSidebarVisible = !this.isChatSidebarVisible;
        
        if (this.isChatSidebarVisible) {
            sidebar.style.display = 'flex';
            toggleBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        } else {
            sidebar.style.display = 'none';
            toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        }
    }

    // تبديل التبويبات
    switchTab(tabId) {
        // إزالة النشاط من جميع التبويبات
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // إخفاء جميع محتويات التبويبات
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // إضافة النشاط للتبويب المحدد
        const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
        const activeContent = document.getElementById(`${tabId}Tab`);

        if (activeTab && activeContent) {
            activeTab.classList.add('active');
            activeContent.classList.add('active');
        }
    }

    // تبديل تبويبات الإعدادات
    switchSettingsTab(tabId) {
        // إزالة النشاط من جميع عناصر التنقل
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // إخفاء جميع محتويات التبويبات
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // إضافة النشاط للتبويب المحدد
        const activeNav = document.querySelector(`[data-tab="${tabId}"]`);
        const activeTab = document.getElementById(`${tabId}Settings`);

        if (activeNav && activeTab) {
            activeNav.classList.add('active');
            activeTab.classList.add('active');
        }
    }

    // عرض نموذج تسجيل الدخول
    showLoginModal() {
        this.showModal('loginModal');
    }

    // عرض نموذج التسجيل
    showRegisterModal() {
        this.showModal('registerModal');
    }

    // عرض نموذج إنشاء مجموعة
    showCreateGroupModal() {
        this.showModal('createGroupModal');
    }

    // عرض نموذج إنشاء قناة
    showCreateChannelModal() {
        this.showModal('createChannelModal');
    }

    // عرض النموذج
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => {
                modal.style.opacity = '1';
            }, 10);
        }
    }

    // إغلاق النموذج
    closeModal(modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    // معالجة تسجيل الدخول
    handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        // التحقق البسيط من البيانات
        if (!email || !password) {
            this.showAlert('يرجى ملء جميع الحقول', 'error');
            return;
        }

        // محاكاة تسجيل الدخول
        this.showAlert('جاري تسجيل الدخول...', 'info');

        setTimeout(() => {
            this.currentUser = {
                id: 1,
                name: 'محمد أحمد',
                email: email,
                avatar: 'مح',
                role: 'طالب'
            };

            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            this.updateUIAfterAuth();
            this.closeModal(document.getElementById('loginModal'));
            this.showAlert('تم تسجيل الدخول بنجاح!', 'success');
        }, 1500);
    }

    // معالجة التسجيل
    handleRegister() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;

        // التحقق من البيانات
        if (!name || !email || !password || !confirmPassword) {
            this.showAlert('يرجى ملء جميع الحقول', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showAlert('كلمات المرور غير متطابقة', 'error');
            return;
        }

        if (password.length < 6) {
            this.showAlert('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }

        // محاكاة التسجيل
        this.showAlert('جاري إنشاء الحساب...', 'info');

        setTimeout(() => {
            this.currentUser = {
                id: Date.now(),
                name: name,
                email: email,
                avatar: name.charAt(0),
                role: 'طالب'
            };

            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            this.updateUIAfterAuth();
            this.closeModal(document.getElementById('registerModal'));
            this.showAlert('تم إنشاء الحساب بنجاح!', 'success');
        }, 2000);
    }

    // تسجيل الخروج
    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        this.updateUIAfterAuth();
        this.showAlert('تم تسجيل الخروج بنجاح', 'success');
        this.navigateToPage('home');
    }

    // تحديث واجهة المستخدم بعد المصادقة
    updateUIAfterAuth() {
        const authElements = document.querySelectorAll('.auth-required');
        const unauthElements = document.querySelectorAll('.unauth-only');
        const userInfoElements = document.querySelectorAll('.user-info');

        if (this.currentUser) {
            // المستخدم مسجل الدخول
            authElements.forEach(el => el.style.display = 'flex');
            unauthElements.forEach(el => el.style.display = 'none');
            
            userInfoElements.forEach(el => {
                el.innerHTML = `
                    <div class="user-avatar">${this.currentUser.avatar}</div>
                    <div>
                        <div class="user-name">${this.currentUser.name}</div>
                        <div class="user-role">${this.currentUser.role}</div>
                    </div>
                `;
            });

            // إخفاء شاشة الترحيب إذا كانت ظاهرة
            this.hideWelcomeScreen();
        } else {
            // المستخدم غير مسجل الدخول
            authElements.forEach(el => el.style.display = 'none');
            unauthElements.forEach(el => el.style.display = 'flex');
            userInfoElements.forEach(el => el.innerHTML = '');
        }
    }

    // عرض التنبيهات
    showAlert(message, type = 'info') {
        // إزالة التنبيهات القديمة
        const oldAlerts = document.querySelectorAll('.alert');
        oldAlerts.forEach(alert => alert.remove());

        // إنشاء تنبيه جديد
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.innerHTML = `
            <i class="fas fa-${this.getAlertIcon(type)}"></i>
            <div>${message}</div>
        `;

        // إضافة التنبيه للصفحة
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.insertBefore(alert, mainContent.firstChild);
        }

        // إزالة التنبيه تلقائياً بعد 5 ثوان
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }

    // الحصول على أيقونة التنبيه
    getAlertIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // تبديل القائمة المتنقلة
    toggleMobileMenu() {
        const nav = document.querySelector('.nav');
        nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
    }

    // إغلاق القائمة المتنقلة
    closeMobileMenu() {
        const nav = document.querySelector('.nav');
        if (window.innerWidth <= 768) {
            nav.style.display = 'none';
        }
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.eduPlatform = new EduPlatform();
});

// إغلاق القائمة المتنقلة عند تغيير حجم النافذة
window.addEventListener('resize', () => {
    if (window.eduPlatform) {
        window.eduPlatform.closeMobileMenu();
    }
});
