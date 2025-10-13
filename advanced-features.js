// وظائف متقدمة لنظام الدردشة والـ Stories

class AdvancedChatSystem {
    constructor() {
        this.typingUsers = new Set();
        this.typingTimeouts = new Map();
        this.messageQueue = [];
        this.isOnline = true;
    }

    // إدارة حالة الكتابة
    startTyping(conversationId, userId) {
        this.typingUsers.add(userId);
        this.updateTypingIndicator(conversationId);
        
        // إلغاء المهلة السابقة إن وجدت
        if (this.typingTimeouts.has(userId)) {
            clearTimeout(this.typingTimeouts.get(userId));
        }
        
        // تعيين مهلة جديدة لإيقاف حالة الكتابة
        const timeout = setTimeout(() => {
            this.stopTyping(conversationId, userId);
        }, 3000);
        
        this.typingTimeouts.set(userId, timeout);
    }

    stopTyping(conversationId, userId) {
        this.typingUsers.delete(userId);
        this.updateTypingIndicator(conversationId);
        
        if (this.typingTimeouts.has(userId)) {
            clearTimeout(this.typingTimeouts.get(userId));
            this.typingTimeouts.delete(userId);
        }
    }

    updateTypingIndicator(conversationId) {
        const indicator = document.getElementById('typingIndicator');
        const typingUserElement = document.getElementById('typingUser');
        
        if (this.typingUsers.size > 0) {
            const users = Array.from(this.typingUsers);
            typingUserElement.textContent = users.length === 1 ? users[0] : 'عدة أشخاص';
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    }

    // إدارة الاتصال
    setOnlineStatus(online) {
        this.isOnline = online;
        const statusElement = document.getElementById('connectionStatus');
        
        if (online) {
            statusElement.textContent = 'متصل';
            statusElement.classList.remove('offline');
            this.processMessageQueue();
        } else {
            statusElement.textContent = 'غير متصل';
            statusElement.classList.add('offline');
        }
    }

    // طابور الرسائل في حالة عدم الاتصال
    queueMessage(message) {
        this.messageQueue.push(message);
        this.saveMessageQueue();
    }

    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendMessage(message);
        }
        this.saveMessageQueue();
    }

    saveMessageQueue() {
        localStorage.setItem('messageQueue', JSON.stringify(this.messageQueue));
    }

    loadMessageQueue() {
        const queue = localStorage.getItem('messageQueue');
        if (queue) {
            this.messageQueue = JSON.parse(queue);
        }
    }

    // ردود ذكية
    generateSmartReply(message) {
        const replies = {
            'مرحبا': ['أهلاً وسهلاً!', 'مرحباً بك!', 'أهلاً! كيف يمكنني مساعدتك؟'],
            'شكرا': ['العفو!', 'لا شكر على واجب!', 'سعيد لأنني استطعت المساعدة!'],
            'مساعدة': ['بالطبع! ما الذي تحتاج مساعدة فيه؟', 'أنا هنا لمساعدتك!', 'أخبرني كيف يمكنني مساعدتك؟'],
            'واجب': ['الواجب سيكون جاهزاً قريباً', 'أعمل على إنهاء الواجب الآن', 'سأرفق الواجب في أقرب وقت']
        };

        const lowerMessage = message.toLowerCase();
        for (const [keyword, responseList] of Object.entries(replies)) {
            if (lowerMessage.includes(keyword)) {
                return responseList[Math.floor(Math.random() * responseList.length)];
            }
        }

        return this.getGenericReply();
    }

    getGenericReply() {
        const genericReplies = [
            "هذا مثير للاهتمام!",
            "أتفق معك في هذا الرأي",
            "شكراً على مشاركتك!",
            "هل يمكنك شرح المزيد؟",
            "هذه معلومات مفيدة جداً"
        ];
        return genericReplies[Math.floor(Math.random() * genericReplies.length)];
    }
}

class StoryManager {
    constructor() {
        this.currentStoryIndex = 0;
        this.storyProgressInterval = null;
        this.stories = [];
    }

    // إنشاء Story جديد
    createStory(mediaFile, caption = '') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const story = {
                    id: Date.now(),
                    userId: currentUser.username,
                    userAvatar: currentUser.avatar || 'https://via.placeholder.com/100',
                    media: e.target.result,
                    caption: caption,
                    type: mediaFile.type.startsWith('image/') ? 'image' : 'video',
                    timestamp: new Date(),
                    duration: 7000, // 7 ثواني
                    views: 0
                };
                
                this.stories.unshift(story);
                this.saveStories();
                resolve(story);
            };
            
            reader.onerror = reject;
            reader.readAsDataURL(mediaFile);
        });
    }

    // عرض الـ Stories
    openStoriesViewer(startIndex = 0) {
        this.currentStoryIndex = startIndex;
        this.showCurrentStory();
        this.startStoryProgress();
    }

    showCurrentStory() {
        const story = this.stories[this.currentStoryIndex];
        if (!story) return;

        const viewer = document.getElementById('storyViewer');
        const media = document.getElementById('storyMedia');
        const userAvatar = document.getElementById('storyUserAvatar');
        const userName = document.getElementById('storyUserName');
        const time = document.getElementById('storyTime');

        media.src = story.media;
        userAvatar.src = story.userAvatar;
        userName.textContent = story.userId;
        time.textContent = this.formatStoryTime(story.timestamp);

        if (story.type === 'video') {
            media.controls = true;
            media.addEventListener('ended', () => this.nextStory());
        } else {
            media.controls = false;
        }

        viewer.classList.add('active');
        
        // زيادة عدد المشاهدات
        story.views++;
        this.saveStories();
    }

    startStoryProgress() {
        this.clearStoryProgress();
        const progressContainer = document.getElementById('storyProgress');
        progressContainer.innerHTML = '';

        this.stories.forEach((story, index) => {
            const progressBar = document.createElement('div');
            progressBar.className = 'story-progress-bar';
            
            const progressFill = document.createElement('div');
            progressFill.className = 'story-progress-fill';
            
            progressBar.appendChild(progressFill);
            progressContainer.appendChild(progressBar);

            if (index === this.currentStoryIndex) {
                this.animateProgressBar(progressFill, story.duration);
            }
        });
    }

    animateProgressBar(progressFill, duration) {
        let startTime = null;
        
        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = (timestamp - startTime) / duration;
            
            progressFill.style.width = `${Math.min(progress * 100, 100)}%`;
            
            if (progress < 1) {
                this.storyProgressInterval = requestAnimationFrame(animate);
            } else {
                this.nextStory();
            }
        };
        
        this.storyProgressInterval = requestAnimationFrame(animate);
    }

    clearStoryProgress() {
        if (this.storyProgressInterval) {
            cancelAnimationFrame(this.storyProgressInterval);
            this.storyProgressInterval = null;
        }
    }

    nextStory() {
        if (this.currentStoryIndex < this.stories.length - 1) {
            this.currentStoryIndex++;
            this.showCurrentStory();
            this.startStoryProgress();
        } else {
            this.closeStoriesViewer();
        }
    }

    previousStory() {
        if (this.currentStoryIndex > 0) {
            this.currentStoryIndex--;
            this.showCurrentStory();
            this.startStoryProgress();
        }
    }

    closeStoriesViewer() {
        this.clearStoryProgress();
        document.getElementById('storyViewer').classList.remove('active');
        this.currentStoryIndex = 0;
    }

    formatStoryTime(timestamp) {
        const now = new Date();
        const diff = now - timestamp;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        
        if (hours < 1) {
            return 'منذ قليل';
        } else if (hours < 24) {
            return `منذ ${hours} ساعة`;
        } else {
            return timestamp.toLocaleDateString('ar-EG');
        }
    }

    saveStories() {
        localStorage.setItem('userStories', JSON.stringify(this.stories));
    }

    loadStories() {
        const savedStories = localStorage.getItem('userStories');
        if (savedStories) {
            this.stories = JSON.parse(savedStories);
        }
    }

    // إحصائيات الـ Stories
    getStoryStats() {
        const totalStories = this.stories.length;
        const totalViews = this.stories.reduce((sum, story) => sum + story.views, 0);
        const averageViews = totalStories > 0 ? Math.round(totalViews / totalStories) : 0;
        
        return {
            totalStories,
            totalViews,
            averageViews
        };
    }
}

// تهيئة الأنظمة المتقدمة
const advancedChat = new AdvancedChatSystem();
const storyManager = new StoryManager();

// تصدير الوظائف للاستخدام العام
window.advancedChat = advancedChat;
window.storyManager = storyManager;
