// التطبيق الرئيسي
class EduTechApp {
    static init() {
        this.initializeApp();
    }

    static async initializeApp() {
        try {
            // تهيئة جميع المكونات
            this.setupEventListeners();
            this.initializeConnectionManager();
            AuthManager.init();
            ChatManager.init();
            AdminManager.init();
            ImagesManager.init();
            
            // تحميل المكونات الديناميكية
            await this.loadDynamicComponents();
            
            // التحقق من حالة المصادقة
            this.checkAuthStatus();
            
            // اختبار الاتصال
            await this.testConnection();
            
            console.log('✅ تم تهيئة التطبيق بنجاح');
        } catch (error) {
            console.error('❌ خطأ في تهيئة التطبيق:', error);
        }
    }

    static setupEventListeners() {
        // التنقل العام
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-page]');
            if (target) {
                e.preventDefault();
                const pageId = target.getAttribute('data-page');
                this.showPage(pageId);
            }
        });

        // إغلاق منتقي الإيموجي عند النقر خارجها
        document.addEventListener('click', (e) => {
            const emojiPicker = document.getElementById('emojiPicker');
            const emojiBtn = document.getElementById('emojiButton');
            
            if (emojiPicker && emojiBtn && 
                !emojiPicker.contains(e.target) && 
                !emojiBtn.contains(e.target) &&
                emojiPicker.style.display === 'grid') {
                emojiPicker.style.display = 'none';
            }
        });

        // إدارة حالة الاتصال
        window.addEventListener('online', () => {
            if (connectionManager) {
                connectionManager.updateStatus(true);
            }
        });

        window.addEventListener('offline', () => {
            if (connectionManager) {
                connectionManager.updateStatus(false);
            }
        });
    }

    static initializeConnectionManager() {
        connectionManager = {
            isOnline: true,
            retryCount: 0,
            maxRetries: 5,
            
            async checkConnection() {
                try {
                    const response = await fetch(`${CONFIG.API_BASE}/health`);
                    const data = await response.json();
                    
                    this.updateStatus(true);
                    this.retryCount = 0;
                } catch (error) {
                    this.retryCount++;
                    this.updateStatus(false);
                    
                    if (this.retryCount <= this.maxRetries) {
                        setTimeout(() => this.checkConnection(), 3000);
                    }
                }
            },

            updateStatus(online) {
                this.isOnline = online;
                this.showStatusIndicator();
                
                if (online && currentUser) {
                    this.sendKeepAlive();
                }
            },

            showStatusIndicator() {
                const statusElement = document.getElementById('connectionStatus');
                if (statusElement) {
                    if (this.isOnline) {
                        statusElement.innerHTML = '<i class="fas fa-wifi"></i> متصل بالنظام';
                        statusElement.className = 'connection-status';
                    } else {
                        statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i> محاولة إعادة اتصال...';
                        statusElement.className = 'connection-status offline';
                    }
                }
            },

            async sendKeepAlive() {
                try {
                    await API.keepAlive();
                } catch (error) {
                    console.log('فشل في إرسال إشارة البقاء متصلاً');
                }
            },

            startHealthCheck() {
                setInterval(() => this.checkConnection(), 30000);
                setInterval(() => {
                    if (this.isOnline && currentUser) {
                        this.sendKeepAlive();
                    }
                }, 60000);
            }
        };

        connectionManager.startHealthCheck();
    }

    static async loadDynamicComponents() {
        // تحميل الهيدر
        await this.loadHeader();
        
        // تحميل الصفحات
        await this.loadLandingPage();
        await this.loadLoginPage();
        await this.loadRegisterPage();
        await this.loadDashboardPage();
        await this.loadChatPage();
        await this.loadImagesPage();
        await this.loadAdminPage();
    }

    static async loadHeader() {
        const headerContainer = document.getElementById('headerContainer');
        if (!headerContainer) return;

        headerContainer.innerHTML = `
            <div class="header-content">
                <div class="logo" onclick="EduTechApp.showPage('landingPage')" style="cursor: pointer;">
                    <div class="logo-icon">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <div class="logo-text">${CONFIG.APP_NAME}</div>
                </div>
                
                <nav class="nav">
                    <a href="#" class="nav-item" data-page="landingPage">
                        <i class="fas fa-home"></i> الرئيسية
                    </a>
                    <a href="#" class="nav-item" data-page="loginPage">
                        <i class="fas fa-sign-in-alt"></i> تسجيل الدخول
                    </a>
                    <a href="#" class="nav-item" data-page="registerPage">
                        <i class="fas fa-user-plus"></i> إنشاء حساب
                    </a>
                    <a href="#" class="nav-item hidden" data-page="dashboardPage">
                        <i class="fas fa-tachometer-alt"></i> لوحة التحكم
                    </a>
                    <a href="#" class="nav-item hidden" data-page="chatPage">
                        <i class="fas fa-comments"></i> الدردشة
                    </a>
                    <a href="#" class="nav-item hidden" data-page="imagesPage">
                        <i class="fas fa-images"></i> الوسائط
                    </a>
                    <a href="#" class="nav-item hidden" data-page="adminPage">
                        <i class="fas fa-cogs"></i> الإدارة
                    </a>
                    <div class="user-info hidden" id="userInfo">
                        <span id="userName"></span>
                        <a href="#" class="nav-item" onclick="AuthManager.logout()">
                            <i class="fas fa-sign-out-alt"></i> خروج
                        </a>
                    </div>
                </nav>
            </div>
        `;
    }

    static async loadLandingPage() {
        const container = document.getElementById('landingPage');
        if (!container) return;

        container.innerHTML = `
            <div class="hero-section">
                <div class="hero-content">
                    <h1 class="hero-title">
                        منصة <span style="color: #4cc9f0">${CONFIG.APP_NAME}</span> التعليمية
                    </h1>
                    <p class="hero-subtitle">
                        نظام تواصل متطور يجمع بين الطلاب والإدارة التعليمية في بيئة تفاعلية آمنة ومتقدمة
                    </p>
                    
                    <div class="features-grid">
                        <div class="feature-card floating">
                            <div class="feature-icon">
                                <i class="fas fa-comments"></i>
                            </div>
                            <h3>دردشة مباشرة</h3>
                            <p>تواصل فوري مع الإدارة والزملاء في بيئة تفاعلية آمنة</p>
                        </div>
                        
                        <div class="feature-card floating" style="animation-delay: 0.2s;">
                            <div class="feature-icon">
                                <i class="fas fa-share-alt"></i>
                            </div>
                            <h3>مشاركة الوسائط</h3>
                            <p>إرسال الصور والفيديوهات والملفات بجودة عالية وسهولة</p>
                        </div>
                        
                        <div class="feature-card floating" style="animation-delay: 0.4s;">
                            <div class="feature-icon">
                                <i class="fas fa-mobile-alt"></i>
                            </div>
                            <h3>واجهة تفاعلية</h3>
                            <p>تصميم متجاوب يعمل بسلاسة على جميع الأجهزة والإعدادات</p>
                        </div>

                        <div class="feature-card floating" style="animation-delay: 0.6s;">
                            <div class="feature-icon">
                                <i class="fas fa-shield-alt"></i>
                            </div>
                            <h3>أمان متكامل</h3>
                            <p>نظام حماية متقدم مع تشفير البيانات ونسخ احتياطي تلقائي</p>
                        </div>

                        <div class="feature-card floating" style="animation-delay: 0.8s;">
                            <div class="feature-icon">
                                <i class="fas fa-bolt"></i>
                            </div>
                            <h3>أداء سريع</h3>
                            <p>استجابة فورية وتحديثات لحظية لأفضل تجربة مستخدم</p>
                        </div>

                        <div class="feature-card floating" style="animation-delay: 1s;">
                            <div class="feature-icon">
                                <i class="fas fa-cloud"></i>
                            </div>
                            <h3>تخزين سحابي</h3>
                            <p>احتفظ بجميع محادثاتك وملفاتك بشكل آمن ومتزامن</p>
                        </div>
                    </div>
                    
                    <div class="auth-buttons">
                        <button class="btn btn-primary" data-page="loginPage">
                            <i class="fas fa-sign-in-alt"></i>
                            تسجيل الدخول
                        </button>
                        <button class="btn btn-outline" data-page="registerPage">
                            <i class="fas fa-user-plus"></i>
                            إنشاء حساب جديد
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    static async loadLoginPage() {
        const container = document.getElementById('loginPage');
        if (!container) return;

        container.innerHTML = `
            <div class="auth-container">
                <div class="auth-header">
                    <h1><i class="fas fa-sign-in-alt"></i> تسجيل الدخول</h1>
                    <p>ادخل إلى حسابك في المنصة التعليمية</p>
                </div>
                <div class="auth-body">
                    <div id="loginAlert"></div>
                    <form id="loginForm">
                        <div class="form-group">
                            <label class="form-label" for="loginPhone">
                                <i class="fas fa-phone"></i> رقم الهاتف
                            </label>
                            <input type="tel" class="form-control" id="loginPhone" 
                                   placeholder="5XXXXXXXX" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="loginPassword">
                                <i class="fas fa-lock"></i> كلمة المرور
                            </label>
                            <input type="password" class="form-control" id="loginPassword" 
                                   placeholder="أدخل كلمة المرور" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block">
                            <i class="fas fa-sign-in-alt"></i> دخول إلى المنصة
                        </button>
                    </form>
                    <div class="text-center mt-3">
                        <a href="#" data-page="registerPage" style="color: var(--primary); text-decoration: none; font-weight: 600;">
                            ليس لديك حساب؟ سجل الآن
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    static async loadRegisterPage() {
        const container = document.getElementById('registerPage');
        if (!container) return;

        container.innerHTML = `
            <div class="auth-container">
                <div class="auth-header">
                    <h1><i class="fas fa-user-plus"></i> إنشاء حساب جديد</h1>
                    <p>انضم إلى مجتمعنا التعليمي المتطور</p>
                </div>
                <div class="auth-body">
                    <div id="registerAlert"></div>
                    <form id="registerForm">
                        <div class="form-group">
                            <label class="form-label" for="fullName">
                                <i class="fas fa-user"></i> الاسم الكامل
                            </label>
                            <input type="text" class="form-control" id="fullName" 
                                   placeholder="أدخل الاسم الكامل" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="phone">
                                <i class="fas fa-phone"></i> رقم الهاتف السعودي
                            </label>
                            <input type="tel" class="form-control" id="phone" 
                                   placeholder="5XXXXXXXX" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="university">
                                <i class="fas fa-university"></i> الجامعة
                            </label>
                            <select class="form-control" id="university" required>
                                <option value="">اختر الجامعة</option>
                                <option value="جامعة الملك سعود">جامعة الملك سعود</option>
                                <option value="جامعة الملك عبدالعزيز">جامعة الملك عبدالعزيز</option>
                                <option value="جامعة الإمام محمد">جامعة الإمام محمد</option>
                                <option value="جامعة الباحة">جامعة الباحة</option>
                                <option value="جامعة مقرن">جامعة مقرن</option>
                                <option value="جامعة فهد">جامعة فهد</option>
                                <option value="جامعة الأميرة نورة">جامعة الأميرة نورة</option>
                                <option value="اخرى">اخرى</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="major">
                                <i class="fas fa-book"></i> التخصص
                            </label>
                            <select class="form-control" id="major" required>
                                <option value="">اختر التخصص</option>
                                <option value="حاسب آلي">حاسب آلي</option>
                                <option value="أمن سيبراني">أمن سيبراني</option>
                                <option value="هندسة حاسب">هندسة حاسب</option>
                                <option value="علوم حاسب">علوم حاسب</option>
                                <option value="الصحة والسلامة">الصحة والسلامة</option>
                                <option value="محاسبة">محاسبة</option>
                                <option value="إدارة أعمال">إدارة أعمال</option>
                                <option value="إدارة مكتبية">إدارة مكتبية</option>
                                <option value="إدارة مستشفيات">إدارة مستشفيات</option>
                                <option value="إدارة تنفيذية">إدارة تنفيذية</option>
                                <option value="سكرتارية">سكرتارية</option>
                                <option value="موارد بشرية">موارد بشرية</option>
                                <option value="تسويق">تسويق</option>
                                <option value="برمجة">برمجة</option>
                                <option value="اخرى">اخرى</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="batch">
                                <i class="fas fa-graduation-cap"></i> الدفعة
                            </label>
                            <select class="form-control" id="batch" required>
                                <option value="">اختر الدفعة</option>
                                <option value="2020">2020</option>
                                <option value="2021">2021</option>
                                <option value="2022">2022</option>
                                <option value="2023">2023</option>
                                <option value="2024">2024</option>
                                <option value="2025">2025</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="password">
                                <i class="fas fa-lock"></i> كلمة المرور
                            </label>
                            <input type="password" class="form-control" id="password" 
                                   placeholder="كلمة مرور قوية (6 أحرف على الأقل)" required>
                            <div class="password-strength" id="passwordStrength">
                                <div class="password-strength-fill"></div>
                            </div>
                            <div id="passwordRequirements"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="confirmPassword">
                                <i class="fas fa-lock"></i> تأكيد كلمة المرور
                            </label>
                            <input type="password" class="form-control" id="confirmPassword" 
                                   placeholder="أعد إدخال كلمة المرور" required>
                        </div>
                        <div id="quickActions"></div>
                        <button type="submit" class="btn btn-primary btn-block">
                            <i class="fas fa-user-plus"></i> إنشاء الحساب
                        </button>
                    </form>
                    <div class="text-center mt-3">
                        <a href="#" data-page="loginPage" style="color: var(--primary); text-decoration: none; font-weight: 600;">
                            لديك حساب بالفعل؟ سجل الدخول
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    static async loadDashboardPage() {
        const container = document.getElementById('dashboardPage');
        if (!container) return;

        container.innerHTML = `
            <div class="dashboard">
                <div class="welcome-section">
                    <h1>مرحباً بعودتك، <span id="dashboardUserName" style="color: var(--primary);">!</span></h1>
                    <p>لوحة التحكم الشخصية - يمكنك الوصول إلى جميع خدمات المنصة المتطورة من هنا</p>
                </div>

                <div class="stats-grid" id="userStats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-university"></i>
                        </div>
                        <div class="stat-value" id="userUniversity">-</div>
                        <div class="stat-label">الجامعة</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-book"></i>
                        </div>
                        <div class="stat-value" id="userMajor">-</div>
                        <div class="stat-label">التخصص</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-graduation-cap"></i>
                        </div>
                        <div class="stat-value" id="userBatch">-</div>
                        <div class="stat-label">الدفعة</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-user-check"></i>
                        </div>
                        <div class="stat-value" id="userStatus">نشط</div>
                        <div class="stat-label">الحالة</div>
                    </div>
                </div>

                <div class="features-grid">
                    <div class="feature-card" data-page="chatPage" style="cursor: pointer;">
                        <div class="feature-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <h3>نظام الدردشة المتطور</h3>
                        <p>تواصل مباشر مع إدارة المنصة لحل استفساراتك وأسئلتك بسرعة وسهولة</p>
                        <div class="mt-3">
                            <span class="btn btn-primary">
                                <i class="fas fa-arrow-left"></i> الانتقال للدردشة
                            </span>
                        </div>
                    </div>
                    <div class="feature-card" data-page="imagesPage" style="cursor: pointer;">
                        <div class="feature-icon">
                            <i class="fas fa-images"></i>
                        </div>
                        <h3>معرض الوسائط</h3>
                        <p>عرض الصور والملفات المرسلة لك من قبل إدارة المنصة بشكل منظم</p>
                        <div class="mt-3">
                            <span class="btn btn-primary">
                                <i class="fas fa-arrow-left"></i> عرض الوسائط
                            </span>
                        </div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <i class="fas fa-user-shield"></i>
                        </div>
                        <h3>الحساب الشخصي</h3>
                        <p>إدارة معلوماتك الشخصية وتحديث بيانات التواصل والإعدادات</p>
                        <div class="mt-3">
                            <span class="btn btn-outline" style="border-color: var(--primary); color: var(--primary);">
                                <i class="fas fa-cog"></i> قريباً
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    static async loadChatPage() {
        const container = document.getElementById('chatPage');
        if (!container) return;

        container.innerHTML = `
            <button class="mobile-chat-toggle" id="mobileChatToggle">
                <i class="fas fa-comments"></i>
            </button>

            <div class="chat-container">
                <!-- Conversations Sidebar -->
                <div class="conversations-sidebar hidden" id="conversationsSidebar">
                    <div class="conversations-header">
                        <h3><i class="fas fa-users"></i> المحادثات النشطة</h3>
                    </div>
                    <div class="conversations-list" id="conversationsList">
                        <!-- Conversations will be loaded here -->
                    </div>
                </div>

                <!-- Chat Main Area -->
                <div class="chat-main">
                    <div class="chat-header">
                        <div class="user-avatar">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div>
                            <h3 id="chatWithName">مدير النظام</h3>
                            <small id="chatStatus" style="color: var(--success);">
                                <i class="fas fa-circle" style="font-size: 0.5rem;"></i> متصل الآن
                            </small>
                        </div>
                    </div>

                    <div class="chat-messages" id="chatMessages">
                        <div class="chat-placeholder">
                            <i class="fas fa-comments"></i>
                            <h3>مرحباً بك في نظام الدردشة</h3>
                            <p>ابدأ المحادثة بإرسال رسالة ترحيب للتواصل مع الإدارة</p>
                        </div>
                    </div>

                    <div class="chat-input-area">
                        <div class="chat-input-wrapper">
                            <textarea class="chat-input" id="messageInput" placeholder="اكتب رسالتك هنا..."></textarea>
                            <div class="emoji-picker" id="emojiPicker"></div>
                        </div>
                        <div class="chat-actions">
                            <button class="action-btn" id="emojiButton" data-tooltip="إيموجي">
                                <i class="fas fa-smile"></i>
                            </button>
                            <button class="action-btn" id="attachButton" data-tooltip="إرفاق ملف">
                                <i class="fas fa-paperclip"></i>
                            </button>
                            <button class="btn btn-primary" id="sendMessage">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    static async loadImagesPage() {
        const container = document.getElementById('imagesPage');
        if (!container) return;

        container.innerHTML = `
            <div class="dashboard">
                <div class="welcome-section">
                    <h1><i class="fas fa-images"></i> معرض الوسائط</h1>
                    <p>المحتوى المرسل إليك من إدارة المنصة بشكل منظم وآمن</p>
                </div>
                <div id="imagesAlert"></div>
                <div class="images-container" id="imagesContainer">
                    <!-- Images will be loaded here -->
                </div>
            </div>
        `;
    }

    static async loadAdminPage() {
        const container = document.getElementById('adminPage');
        if (!container) return;

        container.innerHTML = `
            <div class="dashboard">
                <div class="welcome-section">
                    <h1><i class="fas fa-cogs"></i> لوحة الإدارة المتقدمة</h1>
                    <p>إدارة النظام والتحكم بالمستخدمين والمحتوى بكل سهولة وأمان</p>
                </div>

                <div class="admin-stats-grid" id="adminStats">
                    <!-- Admin stats will be loaded here -->
                </div>

                <div class="admin-panel">
                    <div class="admin-tabs">
                        <button class="admin-tab active" data-tab="users">
                            <i class="fas fa-users"></i> إدارة المستخدمين
                        </button>
                        <button class="admin-tab" data-tab="broadcast">
                            <i class="fas fa-bullhorn"></i> الإرسال الجماعي
                        </button>
                        <button class="admin-tab" data-tab="batch">
                            <i class="fas fa-folder"></i> رفع مجلد الصور
                        </button>
                    </div>

                    <!-- Users Management Tab -->
                    <div class="tab-content active" id="usersTab">
                        <h3><i class="fas fa-users"></i> قائمة المستخدمين المسجلين</h3>
                        <div class="users-grid" id="usersList">
                            <!-- Users will be loaded here -->
                        </div>
                    </div>

                    <!-- Broadcast Tab -->
                    <div class="tab-content" id="broadcastTab">
                        <h3><i class="fas fa-bullhorn"></i> الإرسال الجماعي</h3>
                        <div class="broadcast-section">
                            <h4><i class="fas fa-envelope"></i> رسالة نصية جماعية</h4>
                            <textarea class="form-control" id="broadcastMessage" 
                                      placeholder="اكتب الرسالة الجماعية هنا..." rows="4"></textarea>
                            <button class="btn btn-primary" id="sendBroadcast">
                                <i class="fas fa-paper-plane"></i> إرسال للجميع
                            </button>
                        </div>
                    </div>

                    <!-- Batch Upload Tab -->
                    <div class="tab-content" id="batchTab">
                        <h3><i class="fas fa-folder"></i> رفع مجلد الصور</h3>
                        
                        <div class="upload-area" id="batchUploadArea">
                            <i class="fas fa-folder-open" style="font-size: 3rem; color: var(--gray); margin-bottom: 1rem;"></i>
                            <p>اسحب وأفلت مجلد الصور هنا أو انقر للاختيار</p>
                            <p style="font-size: 0.9rem; color: var(--gray); margin-top: 0.5rem;">
                                يمكنك اختيار multiple files (سيتم معاملتهم كمجلد)
                            </p>
                            <input type="file" id="batchImageInput" multiple accept="image/*" style="display: none;">
                        </div>
                        
                        <div class="file-list" id="batchFileList"></div>
                        
                        <div class="progress-container hidden" id="batchProgress">
                            <div class="progress-bar">
                                <div class="progress-fill" id="batchProgressFill"></div>
                            </div>
                            <div class="progress-text" id="batchProgressText">0%</div>
                        </div>
                        
                        <button class="btn btn-success btn-block" id="sendBatchImages" disabled>
                            <i class="fas fa-paper-plane"></i> إرسال جميع الصور
                        </button>
                        
                        <div id="batchResults" class="mt-3"></div>
                    </div>
                </div>
            </div>
        `;
    }

    static checkAuthStatus() {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        
        if (token && userData) {
            try {
                currentUser = JSON.parse(userData);
                this.updateNavigation(true, currentUser.role === 'admin');
                
                if (currentUser.role === 'admin') {
                    this.showPage('adminPage');
                } else {
                    this.showPage('dashboardPage');
                }
            } catch (error) {
                console.error('Error parsing user data:', error);
                AuthManager.logout();
            }
        } else {
            this.showPage('landingPage');
        }
    }

    static updateNavigation(isLoggedIn, isAdmin = false) {
        const publicLinks = document.querySelectorAll('[data-page="landingPage"], [data-page="loginPage"], [data-page="registerPage"]');
        const privateLinks = document.querySelectorAll('[data-page="dashboardPage"], [data-page="chatPage"], [data-page="imagesPage"]');
        const adminLinks = document.querySelectorAll('[data-page="adminPage"]');
        const userInfo = document.getElementById('userInfo');
        const userName = document.getElementById('userName');
        const conversationsSidebar = document.getElementById('conversationsSidebar');
        
        publicLinks.forEach(link => {
            link.classList.toggle('hidden', isLoggedIn);
        });
        
        privateLinks.forEach(link => {
            link.classList.toggle('hidden', !isLoggedIn);
        });
        
        adminLinks.forEach(link => {
            link.classList.toggle('hidden', !isAdmin);
        });
        
        if (userInfo && userName) {
            userInfo.classList.toggle('hidden', !isLoggedIn);
            if (isLoggedIn && currentUser) {
                userName.textContent = currentUser.fullName;
            }
        }
        
        if (conversationsSidebar) {
            conversationsSidebar.classList.toggle('hidden', !isAdmin);
        }

        // تحديث لوحة التحكم
        if (isLoggedIn && currentUser) {
            const dashboardUserName = document.getElementById('dashboardUserName');
            const userUniversity = document.getElementById('userUniversity');
            const userMajor = document.getElementById('userMajor');
            const userBatch = document.getElementById('userBatch');
            
            if (dashboardUserName) dashboardUserName.textContent = currentUser.fullName;
            if (userUniversity) userUniversity.textContent = currentUser.university;
            if (userMajor) userMajor.textContent = currentUser.major;
            if (userBatch) userBatch.textContent = currentUser.batch;
        }
    }

    static showPage(pageId) {
        // إخفاء جميع الصفحات
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // إظهار الصفحة المطلوبة
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // تحميل البيانات الخاصة بالصفحة
        switch(pageId) {
            case 'dashboardPage':
                this.updateNavigation(true, currentUser?.role === 'admin');
                break;
            case 'chatPage':
                this.updateNavigation(true, currentUser?.role === 'admin');
                if (currentUser) {
                    if (currentUser.role === 'admin') {
                        ChatManager.loadConversations();
                    } else {
                        ChatManager.loadMessages();
                        ChatManager.startAutoRefresh();
                    }
                }
                break;
            case 'imagesPage':
                this.updateNavigation(true, currentUser?.role === 'admin');
                if (currentUser) {
                    ImagesManager.loadUserImages();
                }
                break;
            case 'adminPage':
                this.updateNavigation(true, true);
                if (currentUser && currentUser.role === 'admin') {
                    AdminManager.loadAdminStats();
                    AdminManager.loadUsersList();
                }
                break;
            default:
                this.updateNavigation(false);
        }
        
        // إغلاق منتقي الإيموجي
        const emojiPicker = document.getElementById('emojiPicker');
        if (emojiPicker) {
            emojiPicker.style.display = 'none';
        }
    }

    static async testConnection() {
        if (connectionManager) {
            await connectionManager.checkConnection();
        }
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    EduTechApp.init();
});

// دوال عامة للاستدعاء من HTML
function showLandingPage() { EduTechApp.showPage('landingPage'); }
function showLogin() { EduTechApp.showPage('loginPage'); }
function showRegister() { EduTechApp.showPage('registerPage'); }
function showDashboard() { EduTechApp.showPage('dashboardPage'); }
function showChat() { EduTechApp.showPage('chatPage'); }
function showImages() { EduTechApp.showPage('imagesPage'); }
function showAdminPanel() { EduTechApp.showPage('adminPage'); }
function logout() { AuthManager.logout(); }
