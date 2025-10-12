// نظام إدارة الصور
class ImagesManager {
    static init() {
        this.setupEventListeners();
    }

    static setupEventListeners() {
        // سيتم إضافة المستمعين للأحداث هنا
    }

    static async loadUserImages() {
        try {
            const images = await API.getImages();
            this.displayImages(images);
        } catch (error) {
            console.error('Error loading images:', error);
            Utils.showAlert('imagesPage', 'خطأ في تحميل الصور', 'error');
        }
    }

    static displayImages(images) {
        const container = document.getElementById('imagesContainer');
        if (!container) return;
        
        if (!images || images.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="grid-column: 1 / -1; padding: 3rem; color: var(--gray);">
                    <i class="fas fa-images" style="font-size: 4rem; margin-bottom: 1rem;"></i>
                    <h3>لا توجد صور متاحة</h3>
                    <p>لم يتم إرسال أي صور إليك بعد</p>
                </div>
            `;
            return;
        }

        let imagesHTML = '';
        images.forEach(image => {
            imagesHTML += `
                <div class="image-card" onclick="ImagesManager.showImageModal('${image._id}')">
                    <img src="${CONFIG.API_BASE}${image.url}" 
                         alt="${image.description || 'صورة مرسلة'}"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPuWNleivleS4rTwvdGV4dD48L3N2Zz4='">
                    <div class="image-info">
                        <h4>${image.description || 'صورة بدون وصف'}</h4>
                        <div class="image-meta">
                            <span><i class="fas fa-calendar"></i> ${Utils.formatDate(image.sentAt)}</span>
                            <span><i class="fas fa-download"></i> ${Utils.formatFileSize(image.fileSize)}</span>
                        </div>
                        ${image.isBroadcast ? '<div class="broadcast-badge"><i class="fas fa-bullhorn"></i> إرسال جماعي</div>' : ''}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = imagesHTML;
    }

    static showImageModal(imageId) {
        // هنا سيتم تنفيذ عرض الصورة في نافذة مشروحة
        Utils.showNotification('ميزة عرض الصورة في النافذة المشروحة قيد التطوير', 'info');
    }

    static downloadImage(imageUrl, filename) {
        Utils.downloadFile(imageUrl, filename);
    }
}
