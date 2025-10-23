// js/app.js - الملف الرئيسي للتطبيق التعليمي
// GitHub: https://github.com/zyrozyro98/manastyy/blob/main/public/js/app.js

// ============ المتغيرات العامة ============
let currentUser = null;
let isOnline = navigator.onLine;
let socket = null;
let emojiPicker = null;
let currentStoryIndex = 0;
let stories = [
    { id: 1, author: "الأستاذ أحمد", image: "https://via.placeholder.com/400x700" },
    { id: 2, author: "مجموعة الرياضيات", image: "https://via.placeholder.com/400x700" },
    { id: 3, author: "قناة العلوم", image: "https://via.placeholder.com/400x700" }
];

// ============ تهيئة التطبيق ============
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthentication();
    setupServiceWorker();
    initializeSocketConnection();
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

    // إعداد قصص
    initializeStories();

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

    // القصص
    document.getElementById('storyClose')?.addEventListener('click', closeStoryViewer);
    document.getElementById('storyPrev')?.addEventListener('click', showPreviousStory);
    document.getElementById('storyNext')?.addEventListener('click', showNextStory);

    // الوضع الليلي
    document.getElementById('darkModeToggle')?.addEventListener('change', toggleDarkMode);

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

// التحقق من المصادقة
function checkAuthentication() {
    const userData = localStorage.getItem('currentUser');
    const token = localStorage.getItem('authToken');
    
    if (userData && token) {
        try {
            currentUser = JSON.parse(userData);
            showAuthenticatedUI();
            navigateToPage('dashboard');
            loadUserData();
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
    }

    // إخفاء شاشة الترحيب بعد التنقل
    if (pageName !== 'welcome') {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen && welcomeScreen.style.display !== 'none') {
            setTimeout(() => {
                welcomeScreen.style.display = 'none';
            }, 500);
        }
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
        'groups': 'المجموعات - المنصة التعليمية',
        'channels': 'القنوات - المنصة التعليمية',
        'media': 'الوسائط - المنصة التعليمية',
        'settings': 'الإعدادات - المنصة التعليمية'
    };
    return titles[pageName] || 'المنصة التعليمية';
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

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.classList.remove('hidden');

    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileRegisterBtn = document.getElementById('mobileRegisterBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    
    if (mobileLoginBtn) mobileLoginBtn.classList.add('hidden');
    if (mobileRegisterBtn) mobileRegisterBtn.classList.add('hidden');
    if (mobileLogoutBtn) mobileLogoutBtn.classList.remove('hidden');
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

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.classList.add('hidden');

    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileRegisterBtn = document.getElementById('mobileRegisterBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    
    if (mobileLoginBtn) mobileLoginBtn.classList.remove('hidden');
    if (mobileRegisterBtn) mobileRegisterBtn.classList.remove('hidden');
    if (mobileLogoutBtn) mobileLogoutBtn.classList.add('hidden');
}

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
        
        // إعادة الاتصال بالسوكيت عند العودة للإنترنت
        if (!socket || !socket.connected) {
            initializeSocketConnection();
        }
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

// ============ إدارة المصادقة ============

// معالجة تسجيل الدخول
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showNotification('يرجى ملء جميع الحقول', 'error');
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            localStorage.setItem('authToken', data.token);
            
            showAuthenticatedUI();
            navigateToPage('dashboard');
            showNotification('تم تسجيل الدخول بنجاح', 'success');
            
            // إعادة تهيئة اتصال السوكيت مع التوكن الجديد
            initializeSocketConnection();
        } else {
            showNotification(data.message || 'فشل تسجيل الدخول', 'error');
        }
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}

// معالجة إنشاء الحساب
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;

    if (!name || !email || !password || !role) {
        showNotification('يرجى ملء جميع الحقول', 'error');
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, password, role })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            localStorage.setItem('authToken', data.token);
            
            showAuthenticatedUI();
            navigateToPage('dashboard');
            showNotification('تم إنشاء الحساب بنجاح', 'success');
            
            // إعادة تهيئة اتصال السوكيت مع التوكن الجديد
            initializeSocketConnection();
        } else {
            showNotification(data.message || 'فشل إنشاء الحساب', 'error');
        }
    } catch (error) {
        console.error('خطأ في إنشاء الحساب:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}

// تسجيل الخروج
function handleLogout() {
    // إرسال طلب تسجيل الخروج للخادم
    fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
    }).catch(error => {
        console.error('خطأ في تسجيل الخروج:', error);
    });

    // تنظيف البيانات المحلية
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    
    // إغلاق اتصال السوكيت
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    showUnauthenticatedUI();
    navigateToPage('home');
    showNotification('تم تسجيل الخروج بنجاح', 'info');
}

// تحميل بيانات المستخدم
async function loadUserData() {
    if (!currentUser) return;

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            // تحديث واجهة المستخدم بالبيانات الجديدة
            updateUserUI(userData);
        }
    } catch (error) {
        console.error('خطأ في تحميل بيانات المستخدم:', error);
    }
}

// تحديث واجهة المستخدم ببيانات المستخدم
function updateUserUI(userData) {
    const userNameElement = document.querySelector('.user-name');
    const userRoleElement = document.querySelector('.user-role');
    const userAvatarElement = document.querySelector('.user-avatar span');

    if (userNameElement) userNameElement.textContent = userData.name;
    if (userRoleElement) userRoleElement.textContent = userData.role;
    if (userAvatarElement) userAvatarElement.textContent = userData.name.charAt(0);
}

// ============ الميزات التفاعلية ============

// تبديل شريط الأدوات السريع
function toggleQuickActions() {
    const quickActionsBar = document.getElementById('quickActionsBar');
    quickActionsBar.classList.toggle('active');
}

// بدء التطبيق (إخفاء شاشة الترحيب)
function startApp() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    welcomeScreen.style.opacity = '0';
    setTimeout(() => {
        welcomeScreen.style.display = 'none';
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

// ============ نظام الدردشة ============

// إرسال رسالة
function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (message) {
        // إرسال الرسالة عبر السوكيت
        if (socket) {
            socket.emit('send_message', {
                message: message,
                receiver: 'الأستاذ أحمد', // مؤقت - يجب أن يكون ديناميكي
                timestamp: new Date().toISOString()
            });
        }

        // إضافة الرسالة للواجهة مباشرة
        addMessageToChat(message, 'sent');
        chatInput.value = '';
    }
}

// إضافة رسالة للدردشة
function addMessageToChat(message, type) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    
    messageElement.className = `message ${type}`;
    messageElement.innerHTML = `
        <div class="message-text">${message}</div>
        <div class="message-time">${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
        ${type === 'sent' ? '<div class="message-status"><i class="fas fa-check-double"></i></div>' : ''}
    `;

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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

// ============ نظام القصص ============

// تهيئة القصص
function initializeStories() {
    const storiesContainer = document.querySelector('.stories-container');
    if (!storiesContainer) return;

    stories.forEach((story, index) => {
        const storyElement = document.createElement('div');
        storyElement.className = 'story-item';
        storyElement.innerHTML = `
            <div class="story-avatar">
                <img src="https://via.placeholder.com/70" alt="${story.author}">
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
    const storyViewer = document.getElementById('storyViewer');
    const storyContent = storyViewer.querySelector('.story-content img');
    
    storyContent.src = stories[index].image;
    storyViewer.classList.add('active');
    
    startStoryProgress();
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

// بدء تقدم القصة
function startStoryProgress() {
    resetStoryProgress();
    const progressBars = document.querySelectorAll('.story-progress-fill');
    if (progressBars[currentStoryIndex]) {
        progressBars[currentStoryIndex].style.width = '100%';
        progressBars[currentStoryIndex].style.transition = 'width 5s linear';
    }
    
    setTimeout(() => {
        showNextStory();
    }, 5000);
}

// إعادة تعيين تقدم القصة
function resetStoryProgress() {
    const progressBars = document.querySelectorAll('.story-progress-fill');
    progressBars.forEach(bar => {
        bar.style.width = '0%';
        bar.style.transition = 'none';
    });
}

// ============ المظهر والثيم ============

// تبديل الوضع الليلي
function toggleDarkMode() {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
}

// التحقق من إعدادات الوضع الليلي المحفوظة
function checkDarkModePreference() {
    const darkMode = localStorage.getItem('darkMode');
    const darkModeToggle = document.getElementById('darkModeToggle');
    
    if (darkMode === 'true') {
        document.body.classList.add('dark-mode');
        if (darkModeToggle) darkModeToggle.checked = true;
    }
}

// ============ اتصال السوكيت ============

// تهيئة اتصال السوكيت
function initializeSocketConnection() {
    const token = localStorage.getItem('authToken');
    
    if (!token) {
        console.log('لا يوجد توكن مصادقة، تأجيل اتصال السوكيت');
        return;
    }

    try {
        // الاتصال بالسوكيت مع التوكن
        socket = io({
            auth: {
                token: token
            }
        });

        // معالجة أحداث السوكيت
        socket.on('connect', () => {
            console.log('تم الاتصال بالسوكيت بنجاح');
            showNotification('متصل بالخادم', 'success');
        });

        socket.on('disconnect', () => {
            console.log('تم قطع الاتصال بالسوكيت');
            showNotification('تم قطع الاتصال بالخادم', 'warning');
        });

        socket.on('new_message', (data) => {
            addMessageToChat(data.message, 'received');
        });

        socket.on('user_online', (data) => {
            updateUserOnlineStatus(data.userId, true);
        });

        socket.on('user_offline', (data) => {
            updateUserOnlineStatus(data.userId, false);
        });

        socket.on('error', (error) => {
            console.error('خطأ في السوكيت:', error);
            showNotification('خطأ في الاتصال', 'error');
        });

    } catch (error) {
        console.error('خطأ في اتصال السوكيت:', error);
    }
}

// تحديث حالة اتصال المستخدم
function updateUserOnlineStatus(userId, isOnline) {
    // تحديث واجهة المستخدم بناءً على حالة الاتصال
    const userElements = document.querySelectorAll(`[data-user-id="${userId}"]`);
    userElements.forEach(element => {
        const statusElement = element.querySelector('.user-status');
        if (statusElement) {
            statusElement.className = `user-status ${isOnline ? '' : 'offline'}`;
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

    // إضافة styles للإشعار
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

// ============ Service Worker ============

// إعداد Service Worker
function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('تم تسجيل Service Worker بنجاح:', registration);
                
                // التحقق من التحديثات
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(error => {
                console.log('فشل تسجيل Service Worker:', error);
            });

        // Listen for claims from the service worker
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
}

// عرض إشعار التحديث
function showUpdateNotification() {
    const updateNotification = document.getElementById('updateNotification');
    if (updateNotification) {
        updateNotification.classList.add('active');
        
        setTimeout(() => {
            updateNotification.classList.remove('active');
        }, 10000);
    }
}

// ============ وظائف مساعدة إضافية ============

// نسخ النص إلى الحافظة
function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            showNotification('تم نسخ النص', 'success');
        })
        .catch(err => {
            console.error('فشل نسخ النص: ', err);
            showNotification('فشل نسخ النص', 'error');
        });
}

// تنزيل الملف
function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// فتح النافذة المنبثقة
function openPopup(url, title, width = 800, height = 600) {
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(url, title, `width=${width},height=${height},left=${left},top=${top}`);
}

// إضافة تأثير الاهتزاز
function shakeElement(element) {
    element.classList.add('shake');
    setTimeout(() => {
        element.classList.remove('shake');
    }, 500);
}

// إضافة تأثير التوهج
function glowElement(element, color = 'var(--primary)') {
    element.style.boxShadow = `0 0 10px ${color}`;
    setTimeout(() => {
        element.style.boxShadow = '';
    }, 1000);
}

// ============ تهيئة إضافية عند التحميل ============
window.addEventListener('load', function() {
    // إظهار إشعار ترحيب
    setTimeout(() => {
        if (currentUser) {
            showNotification(`مرحباً بعودتك، ${currentUser.name}`, 'success');
        }
    }, 1000);

    // إضافة تأثيرات للعناصر
    document.querySelectorAll('.feature-card').forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 200);
    });

    // تحميل باهظ للصور
    lazyLoadImages();
});

// تحميل باهظ للبيانات
function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.getAttribute('data-src');
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        });

        images.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for browsers that don't support IntersectionObserver
        images.forEach(img => {
            img.src = img.getAttribute('data-src');
            img.removeAttribute('data-src');
        });
    }
}

// ============ إعدادات إضافية للتحسين ============

// تحسين أداء التمرير
let scrollTimeout;
window.addEventListener('scroll', function() {
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(handleHeaderScroll, 10);
});

// تحسين استهلاك الذاكرة
window.addEventListener('beforeunload', function() {
    if (socket) {
        socket.disconnect();
    }
});

// إدارة حالة التطبيق
const appState = {
    isInitialized: false,
    currentPage: 'home',
    notifications: [],
    
    setPage: function(page) {
        this.currentPage = page;
        localStorage.setItem('currentPage', page);
    },
    
    addNotification: function(notification) {
        this.notifications.push(notification);
        if (this.notifications.length > 50) {
            this.notifications.shift(); // إزالة الإشعارات القديمة
        }
    }
};

// تصدير الدوال للاستخدام العالمي (للتطوير)
window.App = {
    navigateToPage,
    showNotification,
    copyToClipboard,
    downloadFile,
    currentUser,
    socket
};

console.log('تم تحميل التطبيق بالكامل وجاهز للاستخدام');
