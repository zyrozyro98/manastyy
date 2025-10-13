// نظام المصادقة
class AuthManager {
    static init() {
        this.setupEventListeners();
        this.setupPasswordToggle();
        this.setupPasswordStrength();
    }

    static setupEventListeners() {
        // تسجيل الدخول
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }

        // التسجيل
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegister.bind(this));
        }

        // الروابط السريعة
        this.setupQuickActions();
    }

    static setupPasswordToggle() {
        // إضافة أزرار إظهار/إخفاء كلمة المرور
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(input => {
            if (!input.id.includes('login')) { // لا نضيفها لحقول تسجيل الدخول
                this.addPasswordToggle(input);
            }
        });
    }

    static addPasswordToggle(input) {
        const wrapper = input.parentNode;
        
        if (!wrapper.querySelector('.password-toggle')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'password-toggle';
            toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
            toggleBtn.setAttribute('data-tooltip', 'إظهار كلمة المرور');
            
            toggleBtn.addEventListener('click', () => {
                Utils.togglePasswordVisibility(input.id);
            });
            
            wrapper.style.position = 'relative';
            input.classList.add('with-toggle');
            wrapper.appendChild(toggleBtn);
        }
    }

    static setupPasswordStrength() {
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.addEventListener('input', (e) => {
                Utils.updatePasswordStrength(e.target.value);
                this.updatePasswordRequirements(e.target.value);
            });
        }

        const confirmPasswordInput = document.getElementById('confirmPassword');
        if (confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', (e) => {
                this.validatePasswordMatch();
            });
        }
    }

    static updatePasswordRequirements(password) {
        const requirements = Utils.checkPasswordRequirements(password);
        const requirementsContainer = document.getElementById('passwordRequirements');
        
        if (!requirementsContainer) return;

        requirementsContainer.innerHTML = `
            <div class="requirements-list">
                <div class="requirement ${requirements.length ? 'met' : ''}">
                    ٦ أحرف على الأقل
                </div>
                <div class="requirement ${requirements.lowercase ? 'met' : ''}">
                    حرف صغير (a-z)
                </div>
                <div class="requirement ${requirements.uppercase ? 'met' : ''}">
                    حرف كبير (A-Z)
                </div>
                <div class="requirement ${requirements.number ? 'met' : ''}">
                    رقم (0-9)
                </div>
                <div class="requirement ${requirements.special ? 'met' : ''}">
                    رمز خاص (!@#$%...)
                </div>
            </div>
        `;
    }

    static validatePasswordMatch() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const confirmInput = document.getElementById('confirmPassword');
        
        if (confirmPassword && password !== confirmPassword) {
            confirmInput.style.borderColor = 'var(--danger)';
        } else {
            confirmInput.style.borderColor = '';
        }
    }

    static setupQuickActions() {
        // إضافة إجراءات سريعة للتسجيل
        const quickActions = document.getElementById('quickActions');
        if (quickActions) {
            quickActions.innerHTML = `
                <div class="quick-actions">
                    <button type="button" class="quick-action-btn" onclick="AuthManager.fillDemoData('student')">
                        <i class="fas fa-user-graduate"></i>
                        <span>طالب تجريبي</span>
                    </button>
                    <button type="button" class="quick-action-btn" onclick="AuthManager.fillDemoData('admin')">
                        <i class="fas fa-user-tie"></i>
                        <span>مدير تجريبي</span>
                    </button>
                </div>
            `;
        }
    }

    static fillDemoData(type) {
        if (type === 'student') {
            document.getElementById('fullName').value = 'أحمد محمد';
            document.getElementById('phone').value = '512345678';
            document.getElementById('university').value = 'جامعة الملك سعود';
            document.getElementById('major').value = 'حاسب آلي';
            document.getElementById('batch').value = '2024';
            document.getElementById('password').value = 'Password123!';
            document.getElementById('confirmPassword').value = 'Password123!';
        } else if (type === 'admin') {
            document.getElementById('loginPhone').value = '500000000';
            document.getElementById('loginPassword').value = 'Admin123!@#';
        }
        
        // تحديث قوة كلمة المرور
        Utils.updatePasswordStrength('Password123!');
        this.validatePasswordMatch();
        
        Utils.showNotification('تم تعبئة البيانات التجريبية', 'info');
    }

    static async handleLogin(e) {
        e.preventDefault();
        
        const phone = document.getElementById('loginPhone').value;
        const password = document.getElementById('loginPassword').value;

        if (!phone || !password) {
            Utils.showAlert('loginAlert', 'جميع الحقول مطلوبة', 'error');
            return;
        }

        if (!Utils.isValidSaudiPhone(phone)) {
            Utils.showAlert('loginAlert', 'رقم الهاتف غير صحيح. يجب أن يبدأ بـ 5 ويحتوي على 9 أرقام', 'error');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]') || e.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الدخول...';
        btn.disabled = true;

        try {
            const data = await API.login(phone, password);

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            
            Utils.showAlert('loginAlert', 'تم تسجيل الدخول بنجاح', 'success');
            Utils.showNotification(`مرحباً بعودتك، ${data.user.fullName}!`, 'success');
            
            setTimeout(() => {
                if (currentUser.role === 'admin') {
                    showAdminPanel();
                } else {
                    showDashboard();
                }
            }, 1000);
        } catch (error) {
            Utils.showAlert('loginAlert', error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    static async handleRegister(e) {
        e.preventDefault();
        
        const formData = {
            fullName: document.getElementById('fullName').value,
            phone: document.getElementById('phone').value,
            university: document.getElementById('university').value,
            major: document.getElementById('major').value,
            batch: document.getElementById('batch').value,
            password: document.getElementById('password').value
        };

        // التحقق من البيانات
        if (!formData.fullName || !formData.phone || !formData.university || !formData.major || !formData.batch || !formData.password) {
            Utils.showAlert('registerAlert', 'جميع الحقول مطلوبة', 'error');
            return;
        }

        if (!Utils.isValidSaudiPhone(formData.phone)) {
            Utils.showAlert('registerAlert', 'رقم الهاتف غير صحيح. يجب أن يبدأ بـ 5 ويحتوي على 9 أرقام', 'error');
            return;
        }

        if (formData.password !== document.getElementById('confirmPassword').value) {
            Utils.showAlert('registerAlert', 'كلمتا المرور غير متطابقتين', 'error');
            return;
        }

        if (formData.password.length < 6) {
            Utils.showAlert('registerAlert', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]') || e.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الحساب...';
        btn.disabled = true;

        try {
            const data = await API.register(formData);

            Utils.showAlert('registerAlert', 'تم إنشاء الحساب بنجاح', 'success');
            Utils.showNotification('تم إنشاء حسابك بنجاح! يمكنك الآن تسجيل الدخول', 'success');
            
            setTimeout(() => showLogin(), 2000);
        } catch (error) {
            Utils.showAlert('registerAlert', error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    static logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        currentUser = null;
        
        if (chatInterval) {
            clearInterval(chatInterval);
            chatInterval = null;
        }
        
        Utils.showNotification('تم تسجيل الخروج بنجاح', 'info');
        showLandingPage();
    }
}
