// public/sw.js - Service Worker للمنصة التعليمية
// GitHub: https://github.com/zyrozyro98/manastyy/blob/main/public/sw.js

const CACHE_NAME = 'manastyy-educational-platform-v2.1.0';
const API_CACHE_NAME = 'manastyy-api-cache-v1';

// الملفات التي سيتم تخزينها في الكاش عند التثبيت
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/css.css',
    '/js/app.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/emoji-picker-element@1.14.0/index.min.css',
    'https://cdn.jsdelivr.net/npm/emoji-picker-element@1.14.0/index.min.js',
    '/socket.io/socket.io.js'
];

// نقاط نهاية API التي يجب تخزينها في الكاش
const API_ENDPOINTS = [
    '/api/user/profile',
    '/api/courses',
    '/api/groups'
];

// ============ أحداث Service Worker ============

// حدث التثبيت
self.addEventListener('install', (event) => {
    console.log('Service Worker: التثبيت');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: تخزين الملفات في الكاش');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: تم التثبيت بنجاح');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: خطأ في التثبيت', error);
            })
    );
});

// حدث التنشيط
self.addEventListener('activate', (event) => {
    console.log('Service Worker: التنشيط');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // حذف الكاش القديم
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('Service Worker: حذف الكاش القديم', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            console.log('Service Worker: تم التنشيط بنجاح');
            return self.clients.claim();
        })
    );
});

// حدث fetch - إدارة الطلبات
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // تجاهل طلبات غير HTTP/HTTPS
    if (!request.url.startsWith('http')) {
        return;
    }

    // استراتيجيات مختلفة لأنواع الطلبات
    if (request.method === 'GET') {
        // للطلبات الملاحية (الصفحات)
        if (request.destination === 'document' || 
            request.destination === '' && url.pathname === '/') {
            event.respondWith(networkFirstStrategy(request));
        }
        // للملفات الثابتة (CSS, JS, صور)
        else if (request.destination === 'style' || 
                 request.destination === 'script' || 
                 request.destination === 'image' ||
                 request.destination === 'font') {
            event.respondWith(cacheFirstStrategy(request));
        }
        // لطلبات API
        else if (url.pathname.startsWith('/api/')) {
            event.respondWith(networkFirstApiStrategy(request));
        }
        // للطلبات الأخرى
        else {
            event.respondWith(networkFirstStrategy(request));
        }
    } else {
        // للطلبات غير GET (POST, PUT, DELETE)
        event.respondWith(networkOnlyStrategy(request));
    }
});

// ============ استراتيجيات التخزين المؤقت ============

// استراتيجية الشبكة أولاً
async function networkFirstStrategy(request) {
    try {
        // محاولة جلب من الشبكة أولاً
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // تخزين الاستجابة في الكاش
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        
        throw new Error('استجابة الشبكة غير ناجحة');
    } catch (error) {
        console.log('Service Worker: استخدام الكاش للطلب', request.url, error);
        
        // العودة للكاش إذا فشلت الشبكة
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // إذا لم يوجد في الكاش، إرجاع صفحة غير متصل
        return getOfflinePage();
    }
}

// استراتيجية الكاش أولاً
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        // تحديث الكاش في الخلفية
        updateCacheInBackground(request);
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Service Worker: خطأ في جلب المورد', request.url, error);
        
        // إرجاع رد بديل للموارد المهمة
        return getFallbackResponse(request);
    }
}

// استراتيجية الشبكة أولاً لـ API
async function networkFirstApiStrategy(request) {
    const url = new URL(request.url);
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok && shouldCacheApiRequest(request)) {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Service Worker: استخدام كاش API للطلب', request.url, error);
        
        // للطلبات التي يمكن استخدام الكاش لها
        if (shouldUseCachedApi(request)) {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
        }
        
        // إرجاع رد خطأ للـ API
        return new Response(
            JSON.stringify({ 
                error: 'غير متصل بالإنترنت',
                message: 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// استراتيجية الشبكة فقط
async function networkOnlyStrategy(request) {
    try {
        return await fetch(request);
    } catch (error) {
        console.log('Service Worker: فشل الطلب غير GET', request.url, error);
        
        return new Response(
            JSON.stringify({ 
                error: 'فشل في الإرسال',
                message: 'تعذر إرسال البيانات. يرجى المحاولة مرة أخرى.'
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// ============ دوال مساعدة ============

// تحديث الكاش في الخلفية
async function updateCacheInBackground(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
    } catch (error) {
        // تجاهل الأخطاء في التحديث الخلفي
        console.log('Service Worker: فشل التحديث الخلفي للكاش', request.url);
    }
}

// الحصول على صفحة غير متصل
async function getOfflinePage() {
    const cache = await caches.open(CACHE_NAME);
    const cachedPage = await cache.match('/offline.html');
    
    if (cachedPage) {
        return cachedPage;
    }
    
    // إنشاء صفحة غير متصل ديناميكياً
    return new Response(
        `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>غير متصل - المنصة التعليمية</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    text-align: center;
                }
                .offline-container {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 3rem;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                .offline-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }
                h1 {
                    margin-bottom: 1rem;
                }
                p {
                    margin-bottom: 2rem;
                    opacity: 0.9;
                }
                .retry-btn {
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 0.75rem 2rem;
                    border-radius: 25px;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.3s;
                }
                .retry-btn:hover {
                    transform: translateY(-2px);
                }
            </style>
        </head>
        <body>
            <div class="offline-container">
                <div class="offline-icon">📶</div>
                <h1>غير متصل بالإنترنت</h1>
                <p>تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.</p>
                <button class="retry-btn" onclick="window.location.reload()">إعادة المحاولة</button>
            </div>
        </body>
        </html>
        `,
        {
            headers: {
                'Content-Type': 'text/html; charset=utf-8'
            }
        }
    );
}

// الحصول على رد بديل
async function getFallbackResponse(request) {
    const url = new URL(request.url);
    
    // ردود بديلة لأنواع الملفات المختلفة
    if (request.destination === 'image') {
        // صورة بديلة
        return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
            <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#f0f0f0"/>
                <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#666" text-anchor="middle" dy=".3em">صورة غير متوفرة</text>
            </svg>`,
            {
                headers: {
                    'Content-Type': 'image/svg+xml'
                }
            }
        );
    }
    
    if (request.destination === 'font') {
        // خط بديل (فارغ)
        return new Response('', { status: 404 });
    }
    
    // رد فارغ للأنواع الأخرى
    return new Response('', { status: 404 });
}

// التحقق إذا كان يجب تخزين طلب API
function shouldCacheApiRequest(request) {
    const url = new URL(request.url);
    
    // تخزين طلبات GET فقط لبعض نقاط النهاية
    const cacheableEndpoints = [
        '/api/user/profile',
        '/api/courses',
        '/api/groups',
        '/api/channels'
    ];
    
    return cacheableEndpoints.some(endpoint => 
        url.pathname.startsWith(endpoint)
    );
}

// التحقق إذا كان يمكن استخدام الكاش المخزن لـ API
function shouldUseCachedApi(request) {
    const url = new URL(request.url);
    
    // السماح باستخدام الكاش المخزن لبعض طلبات API
    const allowedEndpoints = [
        '/api/user/profile',
        '/api/courses'
    ];
    
    return allowedEndpoints.some(endpoint => 
        url.pathname.startsWith(endpoint)
    );
}

// ============ أحداث إضافية ============

// حدث sync - لمزامنة البيانات عند عودة الاتصال
self.addEventListener('sync', (event) => {
    console.log('Service Worker: حدث sync', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

// مزامنة الخلفية
async function doBackgroundSync() {
    try {
        // هنا يمكنك إضافة منطق لمزامنة البيانات
        // مثل إرسال الرسائل المحفوظة محلياً
        console.log('Service Worker: مزامنة البيانات في الخلفية');
        
        // مثال: مزامنة الرسائل غير المرسلة
        await syncPendingMessages();
        
    } catch (error) {
        console.error('Service Worker: خطأ في المزامنة', error);
    }
}

// مزامنة الرسائل غير المرسلة
async function syncPendingMessages() {
    // هذا مثال - يمكنك تعديله حسب احتياجاتك
    const pendingMessages = await getPendingMessages();
    
    for (const message of pendingMessages) {
        try {
            await sendMessageToServer(message);
            await removePendingMessage(message.id);
        } catch (error) {
            console.error('Service Worker: فشل إرسال الرسالة', message.id, error);
        }
    }
}

// الحصول على الرسائل غير المرسلة (وهمي - تحتاج للتطبيق)
async function getPendingMessages() {
    // في التطبيق الحقيقي، ستأتي هذه من IndexedDB
    return [];
}

// إرسال الرسالة للخادم (وهمي - تحتاج للتطبيق)
async function sendMessageToServer(message) {
    // في التطبيق الحقيقي، ستستخدم fetch أو Socket.io
    return Promise.resolve();
}

// إزالة الرسالة من قائمة الانتظار (وهمي - تحتاج للتطبيق)
async function removePendingMessage(messageId) {
    // في التطبيق الحقيقي، ستحدث IndexedDB
    return Promise.resolve();
}

// حدث push - للإشعارات
self.addEventListener('push', (event) => {
    console.log('Service Worker: حدث push', event);
    
    if (!event.data) return;
    
    const data = event.data.json();
    const options = {
        body: data.body || 'إشعار جديد من المنصة التعليمية',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        },
        actions: [
            {
                action: 'open',
                title: 'فتح'
            },
            {
                action: 'close',
                title: 'إغلاق'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'المنصة التعليمية', options)
    );
});

// حدث notificationclick - عند النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: نقر على الإشعار', event);
    
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                // البحث عن نافذة مفتوحة
                for (const client of clientList) {
                    if (client.url === event.notification.data.url && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // فتح نافذة جديدة إذا لم تكن مفتوحة
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url);
                }
            })
        );
    }
});

// حدث message - للتواصل مع الصفحة
self.addEventListener('message', (event) => {
    console.log('Service Worker: رسالة من الصفحة', event.data);
    
    const { type, payload } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            event.ports[0].postMessage({
                version: '2.1.0',
                cacheName: CACHE_NAME
            });
            break;
            
        case 'CACHE_URLS':
            event.waitUntil(
                cacheUrls(payload.urls)
            );
            break;
            
        case 'CLEAR_CACHE':
            event.waitUntil(
                clearCache()
            );
            break;
    }
});

// تخزين روابط إضافية في الكاش
async function cacheUrls(urls) {
    const cache = await caches.open(CACHE_NAME);
    return Promise.all(
        urls.map(url => 
            fetch(url).then(response => {
                if (response.ok) {
                    return cache.put(url, response);
                }
            })
        )
    );
}

// مسح الكاش
async function clearCache() {
    const cacheNames = await caches.keys();
    return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
}

// ============ تسجيل Service Worker ============

console.log('Service Worker: تم تحميل ملف الخدمة بنجاح');

// تصدير الدوال للاختبار (في بيئة التطوير)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CACHE_NAME,
        STATIC_ASSETS,
        networkFirstStrategy,
        cacheFirstStrategy,
        networkFirstApiStrategy
    };
}
