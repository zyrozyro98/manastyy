// دوال المساعدة العامة
class Utils {
    // تنسيق الوقت
    static formatTime(timestamp) {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            
            if (diff < 60000) { // أقل من دقيقة
                return 'الآن';
            } else if (diff < 3600000) { // أقل من ساعة
                const minutes = Math.floor(diff / 60000);
                return `قبل ${minutes} دقيقة`;
            } else if (diff < 86400000) { // أقل من يوم
                const hours = Math.floor(diff / 3600000);
                return `قبل ${hours} ساعة`;
            } else {
                return date.toLocaleDateString('ar-SA', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (error) {
            return 'الآن';
        }
    }

    // تنسيق التاريخ
    static formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // تنسيق حجم الملف
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // التحقق من رقم الهاتف السعودي
    static isValidSaudiPhone(phone) {
        const saudiPhoneRegex = /^5\d{8}$/;
        return saudiPhoneRegex.test(phone);
    }

    // التحقق من قوة كلمة المرور
    static checkPasswordStrength(password) {
        let strength = 0;
        
        if (password.length >= 8) strength++;
        if (password.match(/[a-z]/)) strength++;
        if (password.match(/[A-Z]/)) strength++;
        if (password.match(/[0-9]/)) strength++;
        if (password.match(/[^a-zA-Z0-9]/)) strength++;
        
        return strength;
    }

    // إنشاء معرف فريد
    static generateId() {
        return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    // نسخ النص للحافظة
    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // طريقة بديلة
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        }
    }

    // تنزيل الملف
    static downloadFile(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // تحميل الصورة مع معالجة الأخطاء
    static loadImageWithFallback(imgElement, src, fallbackSrc) {
        imgElement.onerror = function() {
            this.src = fallbackSrc;
            this.onerror = null;
        };
        imgElement.src = src;
    }

    // إظهار/إخفاء كلمة المرور
    static togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const toggleBtn = input.parentNode.querySelector('.password-toggle');
        
        if (input.type === 'password') {
            input.type = 'text';
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            toggleBtn.setAttribute('data-tooltip', 'إخفاء كلمة المرور');
        } else {
            input.type = 'password';
            toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
            toggleBtn.setAttribute('data-tooltip', 'إظهار كلمة المرور');
        }
    }

    // تحديث قوة كلمة المرور
    static updatePasswordStrength(password) {
        const strength = this.checkPasswordStrength(password);
        const strengthBar = document.getElementById('passwordStrength');
        const strengthText = document.getElementById('passwordStrengthText');
        
        if (!strengthBar) return;
        
        strengthBar.className = 'password-strength';
        strengthBar.innerHTML = '<div class="password-strength-fill"></div>';
        const fill = strengthBar.querySelector('.password-strength-fill');
        
        let strengthLabel = 'ضعيفة';
        let strengthClass = 'weak';
        
        if (strength >= 4) {
            strengthLabel = 'قوية';
            strengthClass = 'strong';
        } else if (strength >= 3) {
            strengthLabel = 'متوسطة';
            strengthClass = 'medium';
        }
        
        strengthBar.classList.add(strengthClass);
        
        if (strengthText) {
            strengthText.textContent = `قوة كلمة المرور: ${strengthLabel}`;
        }
    }

    // التحقق من متطلبات كلمة المرور
    static checkPasswordRequirements(password) {
        const requirements = {
            length: password.length >= 6,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[^a-zA-Z0-9]/.test(password)
        };
        
        return requirements;
    }

    // إظهار التنبيه
    static showAlert(containerId, message, type = 'info') {
        let container;
        
        if (typeof containerId === 'string') {
            container = document.getElementById(containerId);
            if (!container) {
                const activePage = document.querySelector('.page.active');
                if (activePage) {
                    container = activePage;
                } else {
                    console.error('Container not found:', containerId);
                    return;
                }
            }
        } else {
            container = containerId;
        }

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = `
            <i class="fas fa-${this.getAlertIcon(type)}"></i>
            ${message}
        `;
        
        // إزالة أي تنبيهات سابقة من نفس النوع
        const existingAlerts = container.querySelectorAll('.alert');
        existingAlerts.forEach(alert => {
            if (alert.textContent.includes(message)) {
                alert.remove();
            }
        });
        
        // إدراج التنبيه في البداية
        if (container.children.length > 0) {
            container.insertBefore(alertDiv, container.firstChild);
        } else {
            container.appendChild(alertDiv);
        }
        
        // إزالة التنبيه تلقائياً بعد 5 ثواني
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    // الحصول على أيقونة التنبيه
    static getAlertIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // إظهار الإشعار
    static showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notificationContainer') || this.createNotificationContainer();
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getAlertIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(notification);
        
        // إزالة الإشعار تلقائياً
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    // إنشاء حاوية الإشعارات
    static createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
        `;
        document.body.appendChild(container);
        return container;
    }

    // إظهار modal
    static showModal(title, content, buttons = []) {
        const modalContainer = document.getElementById('modalContainer') || this.createModalContainer();
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: white;
                border-radius: 15px;
                padding: 2rem;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: var(--shadow-lg);
            ">
                <div class="modal-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid var(--border);
                ">
                    <h3 style="margin: 0; color: var(--primary);">${title}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: var(--gray);
                    ">×</button>
                </div>
                <div class="modal-body">${content}</div>
                ${buttons.length > 0 ? `
                <div class="modal-footer" style="
                    margin-top: 1.5rem;
                    display: flex;
                    gap: 1rem;
                    justify-content: flex-end;
                ">
                    ${buttons.map(btn => `
                        <button class="btn ${btn.class || 'btn-primary'}" onclick="${btn.onclick}">
                            ${btn.text}
                        </button>
                    `).join('')}
                </div>
                ` : ''}
            </div>
        `;
        
        modalContainer.appendChild(modal);
        
        // إغلاق بالنقر خارج المحتوى
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        return modal;
    }

    // إنشاء حافظة الـ modal
    static createModalContainer() {
        const container = document.createElement('div');
        container.id = 'modalContainer';
        document.body.appendChild(container);
        return container;
    }
}

// إضافة الأنيميشن للـ CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    .notification {
        background: white;
        border-radius: 10px;
        padding: 1rem;
        box-shadow: var(--shadow-lg);
        border-right: 4px solid var(--primary);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        animation: slideInRight 0.3s ease;
    }
    
    .notification-success {
        border-right-color: var(--success);
    }
    
    .notification-error {
        border-right-color: var(--danger);
    }
    
    .notification-warning {
        border-right-color: var(--warning);
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: var(--gray);
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.3s ease;
    }
    
    .notification-close:hover {
        background: var(--light);
        color: var(--dark);
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
