// نظام الإدارة
class AdminManager {
    static init() {
        this.setupEventListeners();
        this.setupTabs();
        this.setupFileUploads();
    }

    static setupEventListeners() {
        // الإرسال الجماعي
        const broadcastBtn = document.getElementById('sendBroadcast');
        if (broadcastBtn) {
            broadcastBtn.addEventListener('click', this.sendBroadcastMessage.bind(this));
        }

        // رفع الملفات
        const batchUploadBtn = document.getElementById('sendBatchImages');
        if (batchUploadBtn) {
            batchUploadBtn.addEventListener('click', this.sendBatchImages.bind(this));
        }
    }

    static setupTabs() {
        const tabs = document.querySelectorAll('.admin-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // إزالة النشاط من جميع الألسنة
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                
                // إضافة النشاط للسان المحدد
                tab.classList.add('active');
                const tabId = tab.getAttribute('data-tab');
                document.getElementById(tabId + 'Tab').classList.add('active');
                
                // تحميل البيانات حسب اللسان
                switch(tabId) {
                    case 'users':
                        this.loadUsersList();
                        break;
                    case 'images':
                        this.loadUsersForImages();
                        break;
                    case 'batch':
                        this.setupBatchUpload();
                        break;
                }
            });
        });
    }

    static setupFileUploads() {
        // رفع المجلد
        const batchUploadArea = document.getElementById('batchUploadArea');
        const batchImageInput = document.getElementById('batchImageInput');
        
        if (batchUploadArea && batchImageInput) {
            this.setupUploadArea(batchUploadArea, batchImageInput, 'batch');
        }
    }

    static setupUploadArea(uploadArea, fileInput, type) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files, type);
        });
        
        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files, type);
        });
    }

    static handleFileUpload(files, type) {
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            Utils.showAlert('batchTab', 'لم يتم اختيار أي صور صالحة', 'error');
            return;
        }

        if (type === 'batch') {
            this.batchUploadedFiles = imageFiles;
            this.updateFileList(imageFiles, 'batchFileList');
            document.getElementById('sendBatchImages').disabled = false;
            Utils.showAlert('batchTab', `تم اختيار ${imageFiles.length} صورة للمعالجة`, 'success');
        }
    }

    static updateFileList(files, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div>
                    <i class="fas fa-image"></i>
                    ${file.name}
                </div>
                <div>${Utils.formatFileSize(file.size)}</div>
            `;
            container.appendChild(fileItem);
        });
    }

    static setupBatchUpload() {
        // إضافة معلومات المجلد
        const batchTab = document.getElementById('batchTab');
        if (batchTab && !batchTab.querySelector('.batch-upload-info')) {
            const infoHTML = `
                <div class="batch-upload-info">
                    <h4><i class="fas fa-info-circle"></i> تعليمات رفع مجلد الصور</h4>
                    <ul>
                        <li>اسم كل صورة يجب أن يكون رقم هاتف المستخدم (مثال: 512345678.jpg)</li>
                        <li>يمكن رفع عدة صور في نفس الوقت (حد أقصى 50 صورة)</li>
                        <li>سيتم إرسال كل صورة تلقائياً للمستخدم الذي يحمل نفس رقم الهاتف</li>
                        <li>الصور التي لا تطابق أي مستخدم سيتم تخطيها</li>
                        <li>يجب أن تكون أسماء الملفات بأرقام الهواتف فقط (مثال: 512345678.png)</li>
                        <li>يدعم الصور بامتدادات: JPG, PNG, GIF, WebP</li>
                    </ul>
                </div>
            `;
            batchTab.insertAdjacentHTML('afterbegin', infoHTML);
        }
    }

    static async sendBroadcastMessage() {
        const messageInput = document.getElementById('broadcastMessage');
        const text = messageInput.value.trim();
        
        if (!text) {
            Utils.showAlert('broadcastTab', 'الرسالة لا يمكن أن تكون فارغة', 'error');
            return;
        }

        const btn = document.getElementById('sendBroadcast');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        btn.disabled = true;

        try {
            await API.sendBroadcastMessage(text);
            messageInput.value = '';
            Utils.showAlert('broadcastTab', 'تم الإرسال الجماعي بنجاح', 'success');
            Utils.showNotification('تم إرسال الرسالة لجميع المستخدمين', 'success');
        } catch (error) {
            Utils.showAlert('broadcastTab', error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    static async sendBatchImages() {
        if (!this.batchUploadedFiles || this.batchUploadedFiles.length === 0) {
            Utils.showAlert('batchTab', 'لم يتم اختيار أي صور', 'error');
            return;
        }

        const progressContainer = document.getElementById('batchProgress');
        const progressFill = document.getElementById('batchProgressFill');
        const progressText = document.getElementById('batchProgressText');
        const resultsContainer = document.getElementById('batchResults');
        
        if (progressContainer) progressContainer.classList.remove('hidden');
        
        const btn = document.getElementById('sendBatchImages');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
        btn.disabled = true;

        try {
            const formData = new FormData();
            this.batchUploadedFiles.forEach(file => {
                formData.append('images', file);
            });

            const response = await API.sendBatchImages(formData);
            const data = await response.json();

            if (response.ok) {
                // عرض النتائج التفصيلية
                let resultsHTML = '<div class="alert alert-success"><h4>نتائج معالجة المجلد:</h4>';
                resultsHTML += `<p><strong>تم بنجاح:</strong> ${data.results.success} صورة</p>`;
                resultsHTML += `<p><strong>فشل:</strong> ${data.results.failed} صورة</p>`;
                
                if (data.results.details && data.results.details.length > 0) {
                    resultsHTML += '<div class="batch-results">';
                    data.results.details.forEach(detail => {
                        const icon = detail.status === 'success' ? 'fa-check' : 'fa-times';
                        const color = detail.status === 'success' ? 'success' : 'error';
                        resultsHTML += `
                            <div class="result-item ${detail.status}">
                                <div class="result-icon ${detail.status}">
                                    <i class="fas ${icon}"></i>
                                </div>
                                <div>
                                    <strong>${detail.file}:</strong> ${detail.message}
                                </div>
                            </div>
                        `;
                    });
                    resultsHTML += '</div>';
                }
                resultsHTML += '</div>';
                
                if (resultsContainer) {
                    resultsContainer.innerHTML = resultsHTML;
                }
                
                if (data.results.failed === 0) {
                    Utils.showAlert('batchTab', `تم إرسال جميع الصور بنجاح (${data.results.success} صورة)`, 'success');
                } else {
                    Utils.showAlert('batchTab', `تم إرسال ${data.results.success} صورة، فشل ${data.results.failed} صورة`, 'warning');
                }

            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Error in batch upload:', error);
            Utils.showAlert('batchTab', error.message, 'error');
        } finally {
            if (progressContainer) progressContainer.classList.add('hidden');
            btn.innerHTML = originalText;
            btn.disabled = true;
            this.batchUploadedFiles = [];
            const fileList = document.getElementById('batchFileList');
            if (fileList) fileList.innerHTML = '';
        }
    }

    static async loadUsersList() {
        try {
            const users = await API.getUsers();
            this.displayUsers(users);
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    static displayUsers(users) {
        const container = document.getElementById('usersList');
        if (!container) return;
        
        if (users.length === 0) {
            container.innerHTML = '<div class="alert alert-info">لا توجد مستخدمين مسجلين</div>';
            return;
        }

        let usersHTML = '';
        users.forEach(user => {
            usersHTML += `
                <div class="user-card">
                    <div class="user-info">
                        <div class="user-avatar small">
                            ${user.fullName ? user.fullName.charAt(0) : '?'}
                        </div>
                        <div>
                            <div class="user-name">${user.fullName}</div>
                            <div class="user-phone">${user.phone}</div>
                        </div>
                        <div class="user-details">
                            <div><strong>الجامعة:</strong> ${user.university}</div>
                            <div><strong>التخصص:</strong> ${user.major}</div>
                            <div><strong>الدفعة:</strong> ${user.batch}</div>
                        </div>
                        <div class="user-status ${user.isActive === false ? 'inactive' : user.isOnline ? 'online' : 'active'}">
                            ${user.isActive === false ? 'غير نشط' : user.isOnline ? 'متصل الآن' : 'نشط'}
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = usersHTML;
    }

    static async loadUsersForImages() {
        try {
            const users = await API.getUsers();
            this.populateUserSelect(users, 'imageReceiver');
        } catch (error) {
            console.error('Error loading users for images:', error);
        }
    }

    static populateUserSelect(users, selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        select.innerHTML = '<option value="">اختر مستخدم</option>';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user._id;
            option.textContent = `${user.fullName} - ${user.phone}`;
            select.appendChild(option);
        });
    }

    static async loadAdminStats() {
        try {
            const stats = await API.getStats();
            this.displayAdminStats(stats);
        } catch (error) {
            console.error('Error loading admin stats:', error);
        }
    }

    static displayAdminStats(stats) {
        const container = document.getElementById('adminStats');
        if (!container) return;

        const statsCards = [
            {
                icon: 'users',
                value: stats.totalUsers,
                label: 'إجمالي المستخدمين',
                color: 'primary'
            },
            {
                icon: 'user-check',
                value: stats.activeUsers,
                label: 'المستخدمين النشطين',
                color: 'success'
            },
            {
                icon: 'comments',
                value: stats.totalMessages,
                label: 'إجمالي الرسائل',
                color: 'secondary'
            },
            {
                icon: 'envelope',
                value: stats.unreadMessages,
                label: 'الرسائل غير المقروءة',
                color: 'warning'
            },
            {
                icon: 'images',
                value: stats.totalImages,
                label: 'الصور المرسلة',
                color: 'info'
            },
            {
                icon: 'database',
                value: Utils.formatFileSize(stats.storageUsed),
                label: 'المساحة المستخدمة',
                color: 'dark'
            }
        ];

        container.innerHTML = '';
        statsCards.forEach(stat => {
            const statCard = document.createElement('div');
            statCard.className = 'admin-stat-card';
            statCard.innerHTML = `
                <div class="admin-stat-icon">
                    <i class="fas fa-${stat.icon}"></i>
                </div>
                <div class="admin-stat-value">${stat.value}</div>
                <div class="admin-stat-label">${stat.label}</div>
            `;
            container.appendChild(statCard);
        });
    }
}
