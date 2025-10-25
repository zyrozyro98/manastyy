// setup.js - ملف تهيئة النظام
import { createDefaultAdmin, createSampleData } from './server.js';

async function setupPlatform() {
    console.log('🚀 بدء تهيئة المنصة التعليمية...\n');
    
    try {
        // إنشاء حساب المدير
        await createDefaultAdmin();
        
        // إنشاء بيانات تجريبية
        await createSampleData();
        
        console.log('\n✅ تم الانتهاء من التهيئة بنجاح!');
        console.log('\n📋 معلومات الدخول:');
        console.log('   👤 المدير: admin@platform.edu');
        console.log('   🔑 كلمة المرور: 77007700');
        console.log('\n🚀 يمكنك الآن تشغيل الخادم باستخدام: npm start');
        
    } catch (error) {
        console.error('❌ خطأ في التهيئة:', error);
        process.exit(1);
    }
}

setupPlatform();
