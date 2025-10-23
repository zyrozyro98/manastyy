// js/app.js - الملف النهائي المصحح

// ============ المتغيرات العامة ============
let currentUser = null;
let isOnline = navigator.onLine;
let socket = null;
let emojiPicker = null;
let currentStoryIndex = 0;
let currentChat = null;
let stories = [];
let conversations = [];
let mediaFiles = [];

// ============ تهيئة التطبيق ============
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthentication();
    initializeSocketConnection();
    loadSampleData();
});

// ============ الدوال الأساسية ============

// تهيئة التطبيق
function initializeApp() {
    // تهيئة منتقي الإيموجي
    emojiPicker = document.querySelector('emoji-picker');
    if (emojiPicker) {
        emojiPicker.addEventListener('emoji-click', event => {
            const chatInput = document.getElementById('chatInput');
            chatInput.value += event.detail.unicode;
            chatInput.focus();
        });
    }

    // التحقق من حالة الاتصال
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    // التحقق من تفضيلات الوضع الليلي
    checkDarkModePreference();

    console.log('تم تهيئة التطبيق بنجاح');
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // التنقل بين الصفحات
    document.querySelectorAll('[data-page]').forEach(element => {
        element.addEventListener('click', function(e) {
            e.preventDefault();
            const pageName = this.getAttribute('data-page');
            navigateToPage(pageName);
        });
    });

    // إعدادات القائمة
    document.querySelectorAll('.settings-menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            showSettingsSection(section);
        });
    });

    // النماذج
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('mobileLogoutBtn')?.addEventListener('click', handleLogout);

    // الزر العائم
    document.getElementById('floatingActionBtn')?.addEventListener('click', toggleQuickActions);

    // زر بدء التطبيق
    document.getElementById('startAppBtn')?.addEventListener('click', startApp);

    // زر التحديث
    document.getElementById('reloadBtn')?.addEventListener('click', reloadApp);

    // القائمة المتنقلة
    document.getElementById('mobileMenuBtn')?.addEventListener('click', toggleMobileMenu);
    document.getElementById('overlay')?.addEventListener('click', closeMobileMenu);

    // الدردشة
    document.getElementById('sendMessageBtn')?.addEventListener('click', sendMessage);
    document.getElementById('chatInput')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('emojiToggle')?.addEventListener('click', toggleEmojiPicker);
    document.getElementById('chatToggle')?.addEventListener('click', toggleChatSidebar);
    document.getElementById('chatToggleMain')?.addEventListener('click', toggleChatSidebar);
    document.getElementById('newChatBtn')?.addEventListener('click', createNewChat);
    document.getElementById('attachFileBtn')?.addEventListener('click', triggerFileUpload);
    document.getElementById('fileInput')?.addEventListener('change', handleFileUpload);

    // القصص
    document.getElementById('storyClose')?.addEventListener('click', closeStoryViewer);
    document.getElementById('storyPrev')?.addEventListener('click', showPreviousStory);
    document.getElementById('storyNext')?.addEventListener('click', showNextStory);

    // المجموعات والقنوات
    document.getElementById('createGroupBtn')?.addEventListener('click', createNewGroup);
    document.getElementById('createChannelBtn')?.addEventListener('click', createNewChannel);

    // الوسائط
    document.getElementById('uploadMediaBtn')?.addEventListener('click', triggerMediaUpload);
    document.getElementById('mediaUploadInput')?.addEventListener('change', handleMediaUpload);
    document.getElementById('uploadArea')?.addEventListener('click', () => document.getElementById('bulkUploadInput').click());
    document.getElementById('bulkUploadInput')?.addEventListener('change', handleBulkUpload);
    document.getElementById('uploadModalClose')?.addEventListener('click', closeUploadModal);

    // الإعدادات
    document.getElementById('darkModeToggle')?.addEventListener('change', toggleDarkMode);
    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfileSettings);

    // التمرير في الهيدر
    window.addEventListener('scroll', handleHeaderScroll);

    // إغلاق منتقي الإيموجي عند النقر خارجها
    document.addEventListener('click', function(e) {
        const emojiContainer = document.getElementById('emojiPickerContainer');
        const emojiBtn = document.getElementById('emojiToggle');
        
        if (emojiContainer && emojiBtn && 
            !emojiContainer.contains(e.target) && 
            !emojiBtn.contains(e.target)) {
            emojiContainer.classList.remove('active');
        }
    });
}

// تحميل بيانات نموذجية
function loadSampleData() {
    // محادثات نموذجية
    conversations = [
        {
            id: 1,
            name: "الأستاذ أحمد",
            avatar: "أ",
            lastMessage: "هل انتهيت من الواجب؟",
            time: "10:45",
            unread: 2,
            online: true,
            messages: [
                { id: 1, text: "مرحباً محمد، هل انتهيت من الواجب؟", time: "10:30", type: "received" },
                { id: 2, text: "نعم سيدي، سأرفعه الآن", time: "10:32", type: "sent" },
                { id: 3, text: "ممتاز، هل واجهتك أي صعوبات؟", time: "10:45", type: "received" }
            ]
        },
        {
            id: 2,
            name: "علي محمد",
            avatar: "ع",
            lastMessage: "شكراً على المساعدة",
            time: "أمس",
            unread: 0,
            online: true,
            messages: [
                { id: 1, text: "مرحباً، هل يمكنك مساعدتي في هذا السؤال؟", time: "09:15", type: "received" },
                { id: 2, text: "بالتأكيد، تفضل", time: "09:20", type: "sent" }
            ]
        },
        {
            id: 3,
            name: "مجموعة الرياضيات",
            avatar: "م",
            lastMessage: "فاطمة: سأرفع الملف الآن",
            time: "الجمعة",
            unread: 5,
            online: false,
            isGroup: true,
            messages: [
                { id: 1, text: "مرحباً بالجميع في مجموعة الرياضيات", time: "08:00", type: "received" },
                { id: 2, text: "شكراً على الانضمام", time: "08:05", type: "sent" }
            ]
        }
    ];

    // قصص نموذجية
    stories = [
        { 
            id: 1, 
            author: "الأستاذ أحمد", 
            avatar: "https://via.placeholder.com/70",
            image: "https://via.placeholder.com/400x700/667eea/ffffff?text=درس+الرياضيات",
            time: "منذ ساعتين"
        },
        { 
            id: 2, 
            author: "مجموعة الرياضيات", 
            avatar: "https://via.placeholder.com/70",
            image: "https://via.placeholder.com/400x700/764ba2/ffffff?text=تمارين+حلولة",
            time: "منذ 5 ساعات"
        },
        { 
            id: 3, 
            author: "قناة العلوم", 
            avatar: "https://via.placeholder.com/70",
            image: "https://via.placeholder.com/400x700/f093fb/ffffff?text=تجارب+علمية",
            time: "منذ يوم"
        }
    ];

    // وسائط نموذجية
    mediaFiles = [
        { id: 1, type: 'image', url: 'https://via.placeholder.com/300', title: 'رسم بياني للدوال', description: 'مادة الرياضيات' },
        { id: 2, type: 'image', url: 'https://via.placeholder.com/300', title: 'خريطة المفاهيم', description: 'مادة العلوم' },
        { id: 3, type: 'image', url: 'https://via.placeholder.com/300', title: 'جدول العناصر', description: 'مادة الكيمياء' },
        { id: 4, type: 'document', url: '#', title: 'ملخص الفصل الأول', description: 'مادة الفيزياء' },
        { id: 5, type: 'video', url: '#', title: 'شرح النظرية', description: 'مادة الرياضيات' }
    ];

    // تحديث الواجهات
    updateConversationsList();
    updateStoriesList();
    updateMediaGrid();
}

// التحقق من المصادقة
function checkAuthentication() {
    const userData = localStorage.getItem('currentUser');
    
    if (userData) {
        try {
            currentUser = JSON.parse(userData);
            showAuthenticatedUI();
            navigateToPage('dashboard');
            updateUserInfo();
        } catch (error) {
            console.error('خطأ في تحليل بيانات المستخدم:', error);
            showUnauthenticatedUI();
            navigateToPage('home');
        }
    } else {
        showUnauthenticatedUI();
        navigateToPage('home');
    }
}

// ============ التنقل والعرض ============

// التنقل بين الصفحات
function navigateToPage(pageName) {
    // إخفاء جميع الصفحات
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // إخفاء القائمة المتنقلة
    closeMobileMenu();

    // إخفاء شريط الأدوات السريع
    const quickActionsBar = document.getElementById('quickActionsBar');
    if (quickActionsBar) quickActionsBar.classList.remove('active');

    // إخفاء منتقي الإيموجي
    const emojiPickerContainer = document.getElementById('emojiPickerContainer');
    if (emojiPickerContainer) emojiPickerContainer.classList.remove('active');

    // إخفاء شاشة الترحيب إذا كانت مرئية
    if (pageName !== 'welcome') {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) welcomeScreen.style.display = 'none';
    }

    // عرض الصفحة المطلوبة
    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
        targetPage.classList.add('active');

        // تحديث حالة التنقل النشط
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === pageName) {
                item.classList.add('active');
            }
        });

        // تحديث عنوان الصفحة
        document.title = getPageTitle(pageName);

        // تحميل محتوى الصفحة
        loadPageContent(pageName);
    }
}

// تحميل محتوى الصفحة
function loadPageContent(pageName) {
    switch (pageName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'chat':
            loadChatData();
            break;
        case 'stories':
            loadStoriesData();
            break;
        case 'groups':
            loadGroupsData();
            break;
        case 'channels':
            loadChannelsData();
            break;
        case 'media':
            loadMediaData();
            break;
        case 'settings':
            loadSettingsData();
            break;
    }
}

// الحصول على عنوان الصفحة
function getPageTitle(pageName) {
    const titles = {
        'home': 'الرئيسية - المنصة التعليمية',
        'login': 'تسجيل الدخول - المنصة التعليمية',
        'register': 'إنشاء حساب - المنصة التعليمية',
        'dashboard': 'لوحة التحكم - المنصة التعليمية',
        'chat': 'الدردشة - المنصة التعليمية',
        'stories': 'القصص - المنصة التعليمية',
        'groups': 'المجموعات - المنصة التعليمية',
        'channels': 'القنوات - المنصة التعليمية',
        'media': 'الوسائط - المنصة التعليمية',
        'settings': 'الإعدادات - المنصة التعليمية'
    };
    return titles[pageName] || 'المنصة التعليمية';
}

// تحديث معلومات المستخدم
function updateUserInfo() {
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userRole').textContent = currentUser.role;
        document.getElementById('userAvatar').innerHTML = `<span>${currentUser.name.charAt(0)}</span>`;
        
        // تحديث الإعدادات
        document.getElementById('profileName').value = currentUser.name;
        document.getElementById('profileEmail').value = currentUser.email;
    }
}

// ============ نظام الدردشة ============

// تحميل بيانات الدردشة
function loadChatData() {
    updateConversationsList();
}

// تحديث قائمة المحادثات
function updateConversationsList() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;

    conversationsList.innerHTML = '';

    conversations.forEach(conversation => {
        const conversationElement = document.createElement('div');
        conversationElement.className = `conversation-item ${conversation.id === currentChat?.id ? 'active' : ''}`;
        conversationElement.innerHTML = `
            <div class="conversation-avatar">
                <span>${conversation.avatar}</span>
            </div>
            <div class="conversation-info">
                <div class="conversation-name">${conversation.name}</div>
                <div class="conversation-last-message">${conversation.lastMessage}</div>
            </div>
            <div class="conversation-meta">
                <div class="conversation-time">${conversation.time}</div>
                ${conversation.unread > 0 ? `<div class="conversation-unread">${conversation.unread}</div>` : ''}
            </div>
        `;

        conversationElement.addEventListener('click', () => openChat(conversation));
        conversationsList.appendChild(conversationElement);
    });
}

// فتح محادثة
function openChat(conversation) {
    currentChat = conversation;
    
    // تحديث الواجهة
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');

    // تحديث رأس المحادثة
    const chatHeader = document.getElementById('currentChatHeader');
    chatHeader.querySelector('.conversation-name').textContent = conversation.name;
    chatHeader.querySelector('.user-status-text').textContent = conversation.online ? 'متصل الآن' : 'غير متصل';

    // إظهار حقل الإدخال
    document.getElementById('chatInputContainer').style.display = 'flex';

    // تحميل الرسائل
    loadChatMessages(conversation.messages);
}

// تحميل الرسائل
function loadChatMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    messages.forEach(message => {
        addMessageToChat(message.text, message.type, message.time);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// إرسال رسالة
function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (message && currentChat) {
        // إنشاء رسالة جديدة
        const newMessage = {
            id: Date.now(),
            text: message,
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
            type: 'sent'
        };

        // إضافة الرسالة للمحادثة
        currentChat.messages.push(newMessage);
        currentChat.lastMessage = message;
        currentChat.time = newMessage.time;

        // إرسال عبر السوكيت إذا كان متصلاً
        if (socket) {
            socket.emit('send_message', {
                conversationId: currentChat.id,
                message: message,
                timestamp: new Date().toISOString()
            });
        }

        // تحديث الواجهة
        addMessageToChat(message, 'sent', newMessage.time);
        updateConversationsList();
        chatInput.value = '';

        // محاكاة رد تلقائي
        simulateAutoReply();
    }
}

// محاكاة رد تلقائي
function simulateAutoReply() {
    if (currentChat && !currentChat.isGroup) {
        setTimeout(() => {
            const replies = [
                "شكراً على رسالتك، سأرد عليك قريباً",
                "هل تحتاج إلى مساعدة إضافية؟",
                "تم استلام رسالتك بنجاح",
                "سأقوم بالتحقق من ذلك وأعود إليك"
            ];
            const randomReply = replies[Math.floor(Math.random() * replies.length)];
            
            const replyMessage = {
                id: Date.now(),
                text: randomReply,
                time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                type: 'received'
            };

            currentChat.messages.push(replyMessage);
            currentChat.lastMessage = randomReply;
            currentChat.time = replyMessage.time;

            addMessageToChat(randomReply, 'received', replyMessage.time);
            updateConversationsList();
        }, 2000);
    }
}

// إضافة رسالة للدردشة
function addMessageToChat(message, type, time = null) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    
    if (!time) {
        time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    }
    
    messageElement.className = `message ${type}`;
    messageElement.innerHTML = `
        <div class="message-text">${message}</div>
        <div class="message-time">${time}</div>
        ${type === 'sent' ? '<div class="message-status"><i class="fas fa-check-double"></i></div>' : ''}
    `;

    // إزالة حالة الدردشة الفارغة إذا كانت موجودة
    const emptyState = chatMessages.querySelector('.empty-chat-state');
    if (emptyState) {
        emptyState.remove();
    }

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// إنشاء محادثة جديدة
function createNewChat() {
    const contactName = prompt('أدخل اسم جهة الاتصال:');
    if (contactName) {
        const newConversation = {
            id: Date.now(),
            name: contactName,
            avatar: contactName.charAt(0),
            lastMessage: "بدء المحادثة",
            time: "الآن",
            unread: 0,
            online: true,
            messages: []
        };

        conversations.unshift(newConversation);
        updateConversationsList();
        openChat(newConversation);
        
        showNotification(`تم بدء محادثة مع ${contactName}`, 'success');
    }
}

// رفع ملف في الدردشة
function triggerFileUpload() {
    document.getElementById('fileInput').click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        // محاكاة رفع الملف
        showNotification(`جاري رفع الملف: ${file.name}`, 'info');
        
        setTimeout(() => {
            const fileType = file.type.split('/')[0];
            let message = `تم رفع ملف: ${file.name}`;
            
            if (fileType === 'image') {
                message = `📷 ${file.name}`;
            } else if (fileType === 'video') {
                message = `🎥 ${file.name}`;
            } else if (fileType === 'audio') {
                message = `🎵 ${file.name}`;
            } else {
                message = `📄 ${file.name}`;
            }
            
            addMessageToChat(message, 'sent');
            showNotification('تم رفع الملف بنجاح', 'success');
        }, 1500);
    }
}

// ============ نظام القصص ============

// تحميل بيانات القصص
function loadStoriesData() {
    updateStoriesList();
}

// تحديث قائمة القصص
function updateStoriesList() {
    const storiesContainer = document.getElementById('storiesContainer');
    if (!storiesContainer) return;

    storiesContainer.innerHTML = '';

    stories.forEach((story, index) => {
        const storyElement = document.createElement('div');
        storyElement.className = 'story-item';
        storyElement.innerHTML = `
            <div class="story-avatar">
                <img src="${story.avatar}" alt="${story.author}" onerror="this.src='https://via.placeholder.com/70'">
            </div>
            <div class="story-author">${story.author}</div>
        `;
        storyElement.addEventListener('click', () => openStoryViewer(index));
        storiesContainer.appendChild(storyElement);
    });
}

// فتح عارض القصص
function openStoryViewer(index) {
    currentStoryIndex = index;
    const story = stories[index];
    
    const storyViewer = document.getElementById('storyViewer');
    const storyImage = document.getElementById('currentStoryImage');
    const authorName = document.getElementById('storyAuthorName');
    const storyTime = document.getElementById('storyTime');
    const authorAvatar = document.getElementById('storyAuthorAvatar');
    const storyProgress = document.getElementById('storyProgress');

    // تعيين البيانات
    storyImage.src = story.image;
    authorName.textContent = story.author;
    storyTime.textContent = story.time;
    authorAvatar.src = story.avatar;
    authorAvatar.alt = story.author;

    // إعداد شريط التقدم
    storyProgress.innerHTML = '';
    stories.forEach((_, i) => {
        const progressBar = document.createElement('div');
        progressBar.className = 'story-progress-bar';
        const progressFill = document.createElement('div');
        progressFill.className = 'story-progress-fill';
        if (i === index) {
            progressFill.style.width = '0%';
        }
        progressBar.appendChild(progressFill);
        storyProgress.appendChild(progressBar);
    });

    storyViewer.classList.add('active');
    startStoryProgress();
}

// بدء تقدم القصة
function startStoryProgress() {
    const progressBars = document.querySelectorAll('.story-progress-fill');
    const currentProgressBar = progressBars[currentStoryIndex];
    
    if (currentProgressBar) {
        currentProgressBar.style.transition = 'width 5s linear';
        currentProgressBar.style.width = '100%';
    }
    
    setTimeout(() => {
        showNextStory();
    }, 5000);
}

// إغلاق عارض القصص
function closeStoryViewer() {
    const storyViewer = document.getElementById('storyViewer');
    storyViewer.classList.remove('active');
    resetStoryProgress();
}

// عرض القصة السابقة
function showPreviousStory() {
    if (currentStoryIndex > 0) {
        currentStoryIndex--;
        openStoryViewer(currentStoryIndex);
    }
}

// عرض القصة التالية
function showNextStory() {
    if (currentStoryIndex < stories.length - 1) {
        currentStoryIndex++;
        openStoryViewer(currentStoryIndex);
    } else {
        closeStoryViewer();
    }
}

// إعادة تعيين تقدم القصة
function resetStoryProgress() {
    const progressBars = document.querySelectorAll('.story-progress-fill');
    progressBars.forEach(bar => {
        bar.style.width = '0%';
        bar.style.transition = 'none';
    });
}

// ============ الوسائط ============

// تحميل بيانات الوسائط
function loadMediaData() {
    updateMediaGrid();
}

// تحديث شبكة الوسائط
function updateMediaGrid() {
    const mediaGrid = document.getElementById('mediaGrid');
    if (!mediaGrid) return;

    mediaGrid.innerHTML = '';

    mediaFiles.forEach(media => {
        const mediaElement = document.createElement('div');
        mediaElement.className = 'media-item';
        
        let mediaContent = '';
        if (media.type === 'image') {
            mediaContent = `<img src="${media.url}" alt="${media.title}" onerror="this.src='https://via.placeholder.com/300'">`;
        } else if (media.type === 'video') {
            mediaContent = `<i class="fas fa-play-circle fa-3x" style="color: var(--primary);"></i>`;
        } else if (media.type === 'document') {
            mediaContent = `<i class="fas fa-file-pdf fa-3x" style="color: var(--danger);"></i>`;
        } else {
            mediaContent = `<i class="fas fa-file fa-3x" style="color: var(--gray-500);"></i>`;
        }

        mediaElement.innerHTML = `
            ${mediaContent}
            <div class="media-overlay">
                <h4>${media.title}</h4>
                <p>${media.description}</p>
            </div>
            <div class="media-type">${getMediaTypeIcon(media.type)}</div>
        `;

        mediaGrid.appendChild(mediaElement);
    });
}

// الحصول على أيقونة نوع الوسائط
function getMediaTypeIcon(type) {
    const icons = {
        'image': '📷',
        'video': '🎥',
        'audio': '🎵',
        'document': '📄'
    };
    return icons[type] || '📁';
}

// رفع وسائط
function triggerMediaUpload() {
    document.getElementById('mediaUploadInput').click();
}

function handleMediaUpload(event) {
    const files = event.target.files;
    if (files.length > 0) {
        showUploadModal();
        simulateUploadProgress(files);
    }
}

function triggerBulkUpload() {
    document.getElementById('bulkUploadInput').click();
}

function handleBulkUpload(event) {
    const files = event.target.files;
    if (files.length > 0) {
        showUploadModal();
        simulateUploadProgress(files);
    }
}

// عرض نافذة الرفع
function showUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = '0%';
}

// محاكاة تقدم الرفع
function simulateUploadProgress(files) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadProgress = document.getElementById('uploadProgress');
    
    uploadProgress.style.display = 'block';
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            
            // إضافة الوسائط المرفوعة
            Array.from(files).forEach((file, index) => {
                setTimeout(() => {
                    const newMedia = {
                        id: Date.now() + index,
                        type: getFileType(file.type),
                        url: URL.createObjectURL(file),
                        title: file.name,
                        description: `تم الرفع: ${new Date().toLocaleDateString('ar-EG')}`
                    };
                    
                    mediaFiles.unshift(newMedia);
                    updateMediaGrid();
                }, index * 200);
            });
            
            setTimeout(() => {
                closeUploadModal();
                showNotification(`تم رفع ${files.length} ملف بنجاح`, 'success');
            }, 1000);
        }
        
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${Math.round(progress)}%`;
    }, 200);
}

// الحصول على نوع الملف
function getFileType(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
}

// ============ لوحة التحكم ============

// تحميل بيانات لوحة التحكم
function loadDashboardData() {
    // تحديث الإحصائيات
    document.getElementById('coursesCount').textContent = '12';
    document.getElementById('assignmentsCount').textContent = '8';
    document.getElementById('progressPercentage').textContent = '94%';
    document.getElementById('achievementsCount').textContent = '3';

    // تحديث النشاط الأخير
    updateActivityList();
    
    // تحديث المستخدمين المتصلين
    updateOnlineUsers();
}

// تحديث قائمة النشاط
function updateActivityList() {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;

    const activities = [
        { icon: 'book', text: 'تم إكمال الواجب في مادة الرياضيات', time: 'منذ ساعتين' },
        { icon: 'comment', text: 'رسالة جديدة من الأستاذ أحمد', time: 'منذ 5 ساعات' },
        { icon: 'video', text: 'حضور محاضرة العلوم', time: 'منذ يوم' },
        { icon: 'award', text: 'تم الحصول على إنجاز جديد', time: 'منذ يومين' }
    ];

    activityList.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon">
                <i class="fas fa-${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <p>${activity.text}</p>
                <span class="activity-time">${activity.time}</span>
            </div>
        </div>
    `).join('');
}

// تحديث المستخدمين المتصلين
function updateOnlineUsers() {
    const onlineUsersList = document.getElementById('onlineUsersList');
    if (!onlineUsersList) return;

    const users = [
        { name: 'علي محمد', avatar: 'ع', online: true },
        { name: 'فاطمة أحمد', avatar: 'ف', online: true },
        { name: 'خالد سعيد', avatar: 'خ', online: false }
    ];

    onlineUsersList.innerHTML = users.map(user => `
        <div class="user-list-item">
            <div class="user-status ${user.online ? '' : 'offline'}"></div>
            <div class="user-avatar small">
                <span>${user.avatar}</span>
            </div>
            <div class="user-details">
                <div class="user-name">${user.name}</div>
            </div>
        </div>
    `).join('');
}

// ============ المجموعات والقنوات ============

// تحميل بيانات المجموعات
function loadGroupsData() {
    updateGroupsGrid();
}

// تحميل بيانات القنوات
function loadChannelsData() {
    updateChannelsGrid();
}

// تحديث شبكة المجموعات
function updateGroupsGrid() {
    const groupsGrid = document.getElementById('groupsGrid');
    if (!groupsGrid) return;

    const groups = [
        { name: 'مجموعة الرياضيات', members: 24, icon: 'calculator', description: 'مجموعة مخصصة لدراسة مادة الرياضيات ومناقشة المسائل والحلول.' },
        { name: 'مجموعة العلوم', members: 18, icon: 'flask', description: 'مناقشة تجارب العلوم والظواهر الطبيعية والمفاهيم العلمية.' },
        { name: 'مجموعة اللغة العربية', members: 32, icon: 'language', description: 'تطوير مهارات اللغة العربية من خلال النقاشات والتمارين.' }
    ];

    groupsGrid.innerHTML = groups.map(group => `
        <div class="group-card">
            <div class="group-header">
                <div class="group-avatar">
                    <i class="fas fa-${group.icon}"></i>
                </div>
                <h3>${group.name}</h3>
                <p>${group.members} عضو</p>
            </div>
            <div class="group-info">
                <p>${group.description}</p>
                <div class="group-stats">
                    <div class="group-stat">
                        <div class="group-stat-number">${Math.floor(group.members / 3)}</div>
                        <div class="group-stat-label">منشور جديد</div>
                    </div>
                    <div class="group-stat">
                        <div class="group-stat-number">${Math.floor(group.members / 4)}</div>
                        <div class="group-stat-label">أعضاء متصلين</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3" onclick="joinGroup('${group.name}')">
                    <i class="fas fa-sign-in-alt"></i>
                    الانضمام للمجموعة
                </button>
            </div>
        </div>
    `).join('');
}

// تحديث شبكة القنوات
function updateChannelsGrid() {
    const channelsGrid = document.getElementById('channelsGrid');
    if (!channelsGrid) return;

    const channels = [
        { name: 'قناة الفيزياء', subscribers: 150, icon: 'video', description: 'قناة تعليمية متخصصة في شرح مفاهيم الفيزياء وتطبيقاتها.' },
        { name: 'قناة التاريخ', subscribers: 89, icon: 'history', description: 'استكشاف الأحداث التاريخية والشخصيات المؤثرة عبر العصور.' },
        { name: 'قناة الفنون', subscribers: 210, icon: 'paint-brush', description: 'تعلم تقنيات الرسم والتلوين ومبادئ التصميم والفنون المختلفة.' }
    ];

    channelsGrid.innerHTML = channels.map(channel => `
        <div class="channel-card">
            <div class="channel-header">
                <div class="channel-avatar">
                    <i class="fas fa-${channel.icon}"></i>
                </div>
                <h3>${channel.name}</h3>
                <p>${channel.subscribers} مشترك</p>
            </div>
            <div class="channel-info">
                <p>${channel.description}</p>
                <div class="channel-stats">
                    <div class="channel-stat">
                        <div class="channel-stat-number">${Math.floor(channel.subscribers / 50)}</div>
                        <div class="channel-stat-label">فيديوهات جديدة</div>
                    </div>
                    <div class="channel-stat">
                        <div class="channel-stat-number">${Math.floor(channel.subscribers * 10)}</div>
                        <div class="channel-stat-label">مشاهدة</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block mt-3" onclick="subscribeChannel('${channel.name}')">
                    <i class="fas fa-bell"></i>
                    الاشتراك في القناة
                </button>
            </div>
        </div>
    `).join('');
}

// الانضمام لمجموعة
function joinGroup(groupName) {
    showNotification(`تم الانضمام إلى ${groupName} بنجاح`, 'success');
}

// الاشتراك في قناة
function subscribeChannel(channelName) {
    showNotification(`تم الاشتراك في ${channelName} بنجاح`, 'success');
}

// إنشاء مجموعة جديدة
function createNewGroup() {
    const groupName = prompt('أدخل اسم المجموعة الجديدة:');
    if (groupName) {
        showNotification(`تم إنشاء المجموعة "${groupName}" بنجاح`, 'success');
        // إعادة تحميل البيانات
        loadGroupsData();
    }
}

// إنشاء قناة جديدة
function createNewChannel() {
    const channelName = prompt('أدخل اسم القناة الجديدة:');
    if (channelName) {
        showNotification(`تم إنشاء القناة "${channelName}" بنجاح`, 'success');
        // إعادة تحميل البيانات
        loadChannelsData();
    }
}

// ============ الإعدادات ============

// تحميل بيانات الإعدادات
function loadSettingsData() {
    // تحميل الإعدادات المحفوظة
    const darkMode = localStorage.getItem('darkMode') === 'true';
    document.getElementById('darkModeToggle').checked = darkMode;
    
    const privateAccount = localStorage.getItem('privateAccount') === 'true';
    document.getElementById('privateAccount').checked = privateAccount;
    
    const showOnlineStatus = localStorage.getItem('showOnlineStatus') !== 'false';
    document.getElementById('showOnlineStatus').checked = showOnlineStatus;
    
    const chatNotifications = localStorage.getItem('chatNotifications') !== 'false';
    document.getElementById('chatNotifications').checked = chatNotifications;
    
    const groupNotifications = localStorage.getItem('groupNotifications') !== 'false';
    document.getElementById('groupNotifications').checked = groupNotifications;
}

// حفظ إعدادات الملف الشخصي
function saveProfileSettings() {
    const name = document.getElementById('profileName').value;
    const email = document.getElementById('profileEmail').value;
    const bio = document.getElementById('profileBio').value;

    if (currentUser) {
        currentUser.name = name;
        currentUser.email = email;
        currentUser.bio = bio;
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateUserInfo();
        
        showNotification('تم حفظ التغييرات بنجاح', 'success');
    }
}

// ============ المصادقة ============

// معالجة تسجيل الدخول
function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (email && password) {
        // محاكاة تسجيل الدخول
        currentUser = {
            id: 1,
            name: 'محمد أحمد',
            email: email,
            role: 'student',
            bio: 'طالب مهتم بالتعلم'
        };

        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showAuthenticatedUI();
        navigateToPage('dashboard');
        showNotification('تم تسجيل الدخول بنجاح', 'success');
    } else {
        showNotification('يرجى ملء جميع الحقول', 'error');
    }
}

// معالجة إنشاء الحساب
function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;

    if (name && email && password && role) {
        // محاكاة إنشاء حساب
        currentUser = {
            id: Date.now(),
            name: name,
            email: email,
            role: role,
            bio: 'مستخدم جديد في المنصة'
        };

        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showAuthenticatedUI();
        navigateToPage('dashboard');
        showNotification('تم إنشاء الحساب بنجاح', 'success');
    } else {
        showNotification('يرجى ملء جميع الحقول', 'error');
    }
}

// تسجيل الخروج
function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showUnauthenticatedUI();
    navigateToPage('home');
    showNotification('تم تسجيل الخروج بنجاح', 'info');
}

// عرض واجهة المستخدم للمستخدم المصادق
function showAuthenticatedUI() {
    document.querySelectorAll('.nav-item.hidden').forEach(item => {
        if (item.id === 'logoutBtn') {
            item.classList.remove('hidden');
        } else if (item.id === 'loginBtn' || item.id === 'registerBtn') {
            item.classList.add('hidden');
        }
    });

    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('mobileLoginBtn').classList.add('hidden');
    document.getElementById('mobileRegisterBtn').classList.add('hidden');
    document.getElementById('mobileLogoutBtn').classList.remove('hidden');
}

// عرض واجهة المستخدم للزائر
function showUnauthenticatedUI() {
    document.querySelectorAll('.nav-item.hidden').forEach(item => {
        if (item.id === 'loginBtn' || item.id === 'registerBtn') {
            item.classList.remove('hidden');
        } else if (item.id === 'logoutBtn') {
            item.classList.add('hidden');
        }
    });

    document.getElementById('userInfo').classList.add('hidden');
    document.getElementById('mobileLoginBtn').classList.remove('hidden');
    document.getElementById('mobileRegisterBtn').classList.remove('hidden');
    document.getElementById('mobileLogoutBtn').classList.add('hidden');
}

// ============ الميزات التفاعلية ============

// تبديل شريط الأدوات السريع
function toggleQuickActions() {
    const quickActionsBar = document.getElementById('quickActionsBar');
    quickActionsBar.classList.toggle('active');
}

// بدء التطبيق (إخفاء شاشة الترحيب)
function startApp() {
    document.getElementById('welcomeScreen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('welcomeScreen').style.display = 'none';
        navigateToPage('home');
    }, 500);
}

// تحديث التطبيق
function reloadApp() {
    window.location.reload();
}

// تبديل القائمة المتنقلة
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('overlay');
    mobileMenu.classList.toggle('active');
    overlay.classList.toggle('active');
}

// إغلاق القائمة المتنقلة
function closeMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('overlay');
    mobileMenu.classList.remove('active');
    overlay.classList.remove('active');
}

// تبديل منتقي الإيموجي
function toggleEmojiPicker() {
    const emojiPickerContainer = document.getElementById('emojiPickerContainer');
    emojiPickerContainer.classList.toggle('active');
}

// تبديل الشريط الجانبي للدردشة
function toggleChatSidebar() {
    const chatSidebar = document.getElementById('chatSidebar');
    chatSidebar.classList.toggle('active');
}

// ============ المظهر والثيم ============

// تبديل الوضع الليلي
function toggleDarkMode() {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
    
    // حفظ إعدادات التبديل
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        localStorage.setItem('darkMode', darkModeToggle.checked);
    }
}

// التحقق من إعدادات الوضع الليلي المحفوظة
function checkDarkModePreference() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    const darkModeToggle = document.getElementById('darkModeToggle');
    
    if (darkMode) {
        document.body.classList.add('dark-mode');
        if (darkModeToggle) darkModeToggle.checked = true;
    }
}

// ============ إدارة الحالة ============

// تحديث حالة الاتصال
function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    isOnline = navigator.onLine;

    if (isOnline) {
        statusElement.innerHTML = '<i class="fas fa-wifi"></i><span>متصل بالإنترنت</span>';
        statusElement.className = 'connection-status';
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 3000);
    } else {
        statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i><span>غير متصل بالإنترنت</span>';
        statusElement.className = 'connection-status offline';
        statusElement.style.display = 'flex';
    }
}

// التعامل مع التمرير في الهيدر
function handleHeaderScroll() {
    const header = document.getElementById('header');
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
}

// ============ اتصال السوكيت ============

// تهيئة اتصال السوكيت
function initializeSocketConnection() {
    try {
        // محاكاة اتصال السوكيت
        socket = {
            connected: true,
            on: (event, callback) => {
                console.log(`تم إعداد مستمع لحدث: ${event}`);
            },
            emit: (event, data) => {
                console.log(`تم إرسال حدث: ${event}`, data);
                
                // محاكاة استقبال الرسائل
                if (event === 'send_message') {
                    setTimeout(() => {
                        // محاكاة وصول رسالة جديدة
                        if (Math.random() > 0.5) {
                            const mockResponse = {
                                id: Date.now(),
                                text: "شكراً على رسالتك!",
                                sender: "System",
                                timestamp: new Date().toISOString()
                            };
                            
                            // إضافة رسالة وهمية للمحادثة النشطة
                            if (currentChat) {
                                const newMessage = {
                                    id: mockResponse.id,
                                    text: mockResponse.text,
                                    time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                                    type: 'received'
                                };
                                
                                currentChat.messages.push(newMessage);
                                currentChat.lastMessage = mockResponse.text;
                                currentChat.time = newMessage.time;
                                
                                addMessageToChat(mockResponse.text, 'received', newMessage.time);
                                updateConversationsList();
                                
                                // تحديث عدد الرسائل غير المقروءة
                                updateUnreadMessagesCount();
                            }
                        }
                    }, 1000);
                }
            },
            disconnect: () => {
                console.log('تم قطع الاتصال بالسوكيت');
                this.connected = false;
            }
        };

        console.log('تم تهيئة اتصال السوكيت بنجاح');
    } catch (error) {
        console.error('خطأ في اتصال السوكيت:', error);
    }
}

// تحديث عدد الرسائل غير المقروءة
function updateUnreadMessagesCount() {
    const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread, 0);
    
    const badgeElements = [
        document.getElementById('unreadMessagesCount'),
        document.getElementById('mobileUnreadMessagesCount')
    ];
    
    badgeElements.forEach(badge => {
        if (badge) {
            badge.textContent = totalUnread;
            badge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
        }
    });
}

// ============ الإشعارات ============

// عرض الإشعارات
function showNotification(message, type = 'info') {
    // إنشاء عنصر الإشعار
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close">
            <i class="fas fa-times"></i>
        </button>
    `;

    // إضافة styles للإشعار إذا لم تكن موجودة
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: white;
                padding: 1rem 1.5rem;
                border-radius: var(--border-radius);
                box-shadow: var(--shadow-xl);
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 1rem;
                border-right: 4px solid var(--${type});
                animation: slideInDown 0.3s ease-out;
                max-width: 400px;
            }
            .notification.notification-success { border-right-color: var(--success); }
            .notification.notification-error { border-right-color: var(--danger); }
            .notification.notification-warning { border-right-color: var(--warning); }
            .notification.notification-info { border-right-color: var(--info); }
            
            .notification-content {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                flex: 1;
            }
            .notification-close {
                background: none;
                border: none;
                cursor: pointer;
                color: var(--gray-500);
                padding: 0.25rem;
                border-radius: var(--border-radius);
            }
            .notification-close:hover {
                background: var(--gray-100);
            }
        `;
        document.head.appendChild(style);
    }

    // إضافة الإشعار إلى الصفحة
    document.body.appendChild(notification);

    // إضافة مستمع حدث للإغلاق
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });

    // إزالة الإشعار تلقائياً بعد 5 ثوان
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// الحصول على أيقونة الإشعار
function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// ============ دوال مساعدة ============

// عرض قسم الإعدادات
function showSettingsSection(sectionName) {
    // إخفاء جميع الأقسام
    document.querySelectorAll('.settings-section').forEach(section => {
        section.classList.remove('active');
    });

    // تحديث القائمة النشطة
    document.querySelectorAll('.settings-menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === sectionName) {
            item.classList.add('active');
        }
    });

    // عرض القسم المطلوب
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
}

// تحديث إشعار التحديث
function showUpdateNotification() {
    const updateNotification = document.getElementById('updateNotification');
    if (updateNotification) {
        updateNotification.classList.add('active');
        
        setTimeout(() => {
            updateNotification.classList.remove('active');
        }, 10000);
    }
}

// ============ التهيئة النهائية ============

console.log('تم تحميل التطبيق بالكامل وجاهز للاستخدام');

// تحديث عدد الرسائل غير المقروءة عند التحميل
updateUnreadMessagesCount();
