import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';

class SystemTester {
    constructor() {
        this.connection = null;
        this.testResults = [];
    }

    async testDatabaseConnection() {
        console.log('🧪 جاري اختبار اتصال قاعدة البيانات...');
        
        const startTime = Date.now();
        try {
            this.connection = await mongoose.connect(MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 10000,
            });
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            this.recordTest('اتصال قاعدة البيانات', true, `تم الاتصال بنجاح خلال ${responseTime}ms`);
            
            // اختبار العمليات الأساسية
            await this.testBasicOperations();
            await this.testCollections();
            await this.testPerformance();
            
        } catch (error) {
            this.recordTest('اتصال قاعدة البيانات', false, `فشل في الاتصال: ${error.message}`);
        }
    }

    async testBasicOperations() {
        try {
            // اختبار إنشاء مستخدم
            const testUser = {
                fullName: 'مستخدم اختبار',
                phone: `test_${Date.now()}`,
                university: 'جامعة الاختبار',
                major: 'تخصص الاختبار',
                batch: '2024',
                password: 'testpassword',
                role: 'student'
            };

            const User = mongoose.model('User', new mongoose.Schema({
                fullName: String,
                phone: String,
                university: String,
                major: String,
                batch: String,
                password: String,
                role: String
            }));

            // اختبار الإدراج
            const insertStart = Date.now();
            const user = new User(testUser);
            await user.save();
            const insertTime = Date.now() - insertStart;
            
            this.recordTest('عملية الإدراج', true, `تم إدراج مستخدم خلال ${insertTime}ms`);

            // اختبار القراءة
            const readStart = Date.now();
            const foundUser = await User.findById(user._id);
            const readTime = Date.now() - readStart;
            
            this.recordTest('عملية القراءة', true, `تم قراءة مستخدم خلال ${readTime}ms`);

            // اختبار التحديث
            const updateStart = Date.now();
            await User.findByIdAndUpdate(user._id, { fullName: 'مستخدم محدث' });
            const updateTime = Date.now() - updateStart;
            
            this.recordTest('عملية التحديث', true, `تم تحديث مستخدم خلال ${updateTime}ms`);

            // اختبار الحذف
            const deleteStart = Date.now();
            await User.findByIdAndDelete(user._id);
            const deleteTime = Date.now() - deleteStart;
            
            this.recordTest('عملية الحذف', true, `تم حذف مستخدم خلال ${deleteTime}ms`);

        } catch (error) {
            this.recordTest('العمليات الأساسية', false, `فشل في العمليات: ${error.message}`);
        }
    }

    async testCollections() {
        try {
            const collections = await mongoose.connection.db.listCollections().toArray();
            const requiredCollections = ['users', 'stories', 'messages', 'channels'];
            
            const missingCollections = requiredCollections.filter(reqCol => 
                !collections.find(col => col.name === reqCol)
            );

            if (missingCollections.length === 0) {
                this.recordTest('المجموعات المطلوبة', true, `جميع المجموعات موجودة (${collections.length} مجموعة)`);
            } else {
                this.recordTest('المجموعات المطلوبة', false, `مجموعات مفقودة: ${missingCollections.join(', ')}`);
            }

            // اختبار عدد الوثائق في كل مجموعة
            for (const collection of collections) {
                const count = await mongoose.connection.db.collection(collection.name).countDocuments();
                this.recordTest(
                    `مجموعة ${collection.name}`,
                    true,
                    `تحتوي على ${count} وثيقة`
                );
            }

        } catch (error) {
            this.recordTest('فحص المجموعات', false, `فشل في فحص المجموعات: ${error.message}`);
        }
    }

    async testPerformance() {
        try {
            console.log('⚡ جاري اختبار الأداء...');

            // اختبار وقت الاستجابة للاستعلامات
            const queryTests = [
                { name: 'استعلام بسيط', query: {} },
                { name: 'استعلام مع فرز', query: {}, sort: { createdAt: -1 } },
                { name: 'استعلام مع حد', query: {}, limit: 10 }
            ];

            for (const test of queryTests) {
                const startTime = Date.now();
                await mongoose.connection.db.collection('users').find(test.query)
                    .sort(test.sort || {})
                    .limit(test.limit || 0)
                    .toArray();
                const responseTime = Date.now() - startTime;
                
                const status = responseTime < 1000; // أقل من ثانية
                this.recordTest(
                    `أداء - ${test.name}`,
                    status,
                    `${responseTime}ms ${status ? '✅' : '⚠️'}`
                );
            }

            // اختبار الإدراج الجماعي
            const bulkInsertStart = Date.now();
            const testData = Array.from({ length: 100 }, (_, i) => ({
                fullName: `مستخدم أداء ${i}`,
                phone: `perf_${Date.now()}_${i}`,
                university: 'جامعة الأداء',
                major: 'تخصص الأداء',
                batch: '2024',
                role: 'student',
                createdAt: new Date()
            }));

            await mongoose.connection.db.collection('performance_test').insertMany(testData);
            const bulkInsertTime = Date.now() - bulkInsertStart;
            
            this.recordTest(
                'إدراج جماعي (100 وثيقة)',
                bulkInsertTime < 5000, // أقل من 5 ثواني
                `${bulkInsertTime}ms`
            );

            // تنظيف بيانات الاختبار
            await mongoose.connection.db.collection('performance_test').deleteMany({});

        } catch (error) {
            this.recordTest('اختبار الأداء', false, `فشل في اختبار الأداء: ${error.message}`);
        }
    }

    async testFileSystem() {
        console.log('💾 جاري اختبار نظام الملفات...');
        
        const testDirs = [
            'uploads',
            'uploads/profiles',
            'uploads/stories', 
            'uploads/channels',
            'uploads/files',
            'backups',
            'exports'
        ];

        for (const dir of testDirs) {
            const dirPath = path.join(__dirname, '../', dir);
            try {
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                    this.recordTest(`المجلد ${dir}`, true, 'تم إنشاء المجلد');
                } else {
                    // اختبار صلاحيات الكتابة
                    const testFile = path.join(dirPath, `test_${Date.now()}.txt`);
                    fs.writeFileSync(testFile, 'test');
                    fs.unlinkSync(testFile);
                    this.recordTest(`المجلد ${dir}`, true, 'صلاحيات الكتابة سليمة');
                }
            } catch (error) {
                this.recordTest(`المجلد ${dir}`, false, `مشكلة في الصلاحيات: ${error.message}`);
            }
        }
    }

    async testBackupSystem() {
        console.log('📦 جاري اختبار نظام النسخ الاحتياطي...');
        
        try {
            const backupDir = path.join(__dirname, '../backups');
            const testBackupFile = path.join(backupDir, `test_backup_${Date.now()}.json`);
            
            const testData = {
                timestamp: new Date().toISOString(),
                test: true,
                data: {
                    users: [{ name: 'test', phone: 'test' }],
                    messages: [{ content: 'test message' }]
                }
            };
            
            fs.writeFileSync(testBackupFile, JSON.stringify(testData, null, 2));
            
            // التحقق من أن الملف مكتوب بشكل صحيح
            const readData = JSON.parse(fs.readFileSync(testBackupFile, 'utf8'));
            
            if (readData.test && readData.timestamp) {
                this.recordTest('نظام النسخ الاحتياطي', true, 'القراءة والكتابة سليمة');
            } else {
                this.recordTest('نظام النسخ الاحتياطي', false, 'مشكلة في قراءة البيانات');
            }
            
            // تنظيف ملف الاختبار
            fs.unlinkSync(testBackupFile);
            
        } catch (error) {
            this.recordTest('نظام النسخ الاحتياطي', false, `فشل في الاختبار: ${error.message}`);
        }
    }

    recordTest(name, success, message) {
        const result = {
            name,
            success,
            message,
            timestamp: new Date().toLocaleString('ar-EG')
        };
        
        this.testResults.push(result);
        
        const icon = success ? '✅' : '❌';
        console.log(`   ${icon} ${name}: ${message}`);
    }

    generateReport() {
        console.log('\n📊 تقرير اختبار النظام');
        console.log('='.repeat(50));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(test => test.success).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`🎯 إجمالي الاختبارات: ${totalTests}`);
        console.log(`✅ الاختبارات الناجحة: ${passedTests}`);
        console.log(`❌ الاختبارات الفاشلة: ${failedTests}`);
        console.log(`📈 نسبة النجاح: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        if (failedTests > 0) {
            console.log('\n⚠️  الاختبارات الفاشلة:');
            this.testResults
                .filter(test => !test.success)
                .forEach(test => {
                    console.log(`   ❌ ${test.name}: ${test.message}`);
                });
        }
        
        // حفظ التقرير في ملف
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests,
                passedTests,
                failedTests,
                successRate: (passedTests / totalTests) * 100
            },
            details: this.testResults
        };
        
        const reportsDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        const reportFile = path.join(reportsDir, `system_test_${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        
        console.log(`\n📄 تم حفظ التقرير في: ${reportFile}`);
        
        return report;
    }
}

// التنفيذ الرئيسي
async function main() {
    const tester = new SystemTester();
    
    console.log('🔬 بدء اختبار النظام الشامل...\n');
    
    try {
        await tester.testDatabaseConnection();
        await tester.testFileSystem();
        await tester.testBackupSystem();
        
        const report = tester.generateReport();
        
        // تقييم عام للنظام
        const successRate = report.summary.successRate;
        if (successRate >= 90) {
            console.log('\n🎉 حالة النظام: ممتازة ✅');
        } else if (successRate >= 70) {
            console.log('\n⚠️  حالة النظام: جيدة 🔶');
        } else {
            console.log('\n🚨 حالة النظام: تحتاج تحسين ❌');
        }
        
    } catch (error) {
        console.error('❌ فشل في اختبار النظام:', error);
    } finally {
        if (tester.connection) {
            await mongoose.connection.close();
            console.log('\n👋 تم إغلاق الاتصال بقاعدة البيانات');
        }
    }
}

// تشغيل البرنامج
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default SystemTester;
