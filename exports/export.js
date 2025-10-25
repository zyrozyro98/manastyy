import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';
const EXPORT_DIR = path.join(__dirname, '../exports');

// إنشاء مجلد التصدير إذا لم يكن موجوداً
if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

class DataExporter {
    constructor() {
        this.connected = false;
    }

    async connect() {
        try {
            await mongoose.connect(MONGODB_URI);
            this.connected = true;
            console.log('✅ تم الاتصال بقاعدة البيانات');
        } catch (error) {
            console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error);
            process.exit(1);
        }
    }

    async exportToJSON() {
        if (!this.connected) {
            await this.connect();
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportFile = path.join(EXPORT_DIR, `export-${timestamp}.json`);
            
            console.log('📤 جاري تصدير البيانات بصيغة JSON...');

            // جمع البيانات من جميع المجموعات
            const exportData = {
                exportInfo: {
                    timestamp: new Date().toISOString(),
                    format: 'json',
                    version: '2.0.0'
                },
                collections: {
                    users: await mongoose.connection.collection('users').find({}).toArray(),
                    stories: await mongoose.connection.collection('stories').find({}).toArray(),
                    messages: await mongoose.connection.collection('messages').find({}).toArray(),
                    channels: await mongoose.connection.collection('channels').find({}).toArray(),
                    notifications: await mongoose.connection.collection('notifications').find({}).toArray(),
                    reports: await mongoose.connection.collection('reports').find({}).toArray()
                },
                metadata: {
                    totalUsers: await mongoose.connection.collection('users').countDocuments(),
                    totalStories: await mongoose.connection.collection('stories').countDocuments(),
                    totalMessages: await mongoose.connection.collection('messages').countDocuments(),
                    totalChannels: await mongoose.connection.collection('channels').countDocuments()
                }
            };

            // إزالة كلمات المرور من بيانات المستخدمين
            exportData.collections.users = exportData.collections.users.map(user => {
                const { password, security, ...safeUser } = user;
                return safeUser;
            });

            // حفظ البيانات في ملف
            fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2));
            
            const fileSize = (fs.statSync(exportFile).size / 1024 / 1024).toFixed(2);
            
            console.log('✅ تم تصدير البيانات بنجاح');
            console.log(`📁 الملف: ${exportFile}`);
            console.log(`📏 الحجم: ${fileSize} MB`);
            console.log('📊 إحصائيات التصدير:');
            console.log(`   👥 المستخدمين: ${exportData.metadata.totalUsers}`);
            console.log(`   📝 الرسائل: ${exportData.metadata.totalMessages}`);
            console.log(`   📸 الستوريات: ${exportData.metadata.totalStories}`);
            console.log(`   📢 القنوات: ${exportData.metadata.totalChannels}`);

            return exportFile;

        } catch (error) {
            console.error('❌ خطأ في تصدير البيانات:', error);
            throw error;
        }
    }

    async exportToCSV() {
        if (!this.connected) {
            await this.connect();
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportDir = path.join(EXPORT_DIR, `csv-export-${timestamp}`);
            
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }

            console.log('📊 جاري تصدير البيانات بصيغة CSV...');

            // تصدير المستخدمين
            const users = await mongoose.connection.collection('users').find({}).toArray();
            let usersCSV = 'ID,الاسم,الهاتف,الجامعة,التخصص,الدفعة,الدور,البريد الإلكتروني,رقم الطالب,الحالة,تاريخ التسجيل\n';
            
            users.forEach(user => {
                usersCSV += `"${user._id}","${user.fullName || ''}","${user.phone || ''}","${user.university || ''}","${user.major || ''}","${user.batch || ''}","${user.role || ''}","${user.email || ''}","${user.studentId || ''}","${user.isActive ? 'نشط' : 'موقوف'}","${new Date(user.createdAt).toLocaleDateString('ar-EG')}"\n`;
            });

            fs.writeFileSync(path.join(exportDir, 'users.csv'), usersCSV);

            // تصدير الرسائل
            const messages = await mongoose.connection.collection('messages').find({}).toArray();
            let messagesCSV = 'ID,المحادثة,المرسل,المحتوى,النوع,تاريخ الإرسال,عدد القراءات\n';
            
            messages.forEach(message => {
                messagesCSV += `"${message._id}","${message.conversationId}","${message.senderId}","${(message.content || '').substring(0, 100).replace(/"/g, '""')}","${message.messageType || 'text'}","${new Date(message.createdAt).toLocaleString('ar-EG')}",${message.readBy ? message.readBy.length : 0}\n`;
            });

            fs.writeFileSync(path.join(exportDir, 'messages.csv'), messagesCSV);

            // تصدير الستوريات
            const stories = await mongoose.connection.collection('stories').find({}).toArray();
            let storiesCSV = 'ID,المستخدم,نوع الوسائط,الوصف,تاريخ النشر,تاريخ الانتهاء,المشاهدات,التفاعلات\n';
            
            stories.forEach(story => {
                storiesCSV += `"${story._id}","${story.userId}","${story.mediaType || 'image'}","${(story.caption || '').replace(/"/g, '""')}","${new Date(story.createdAt).toLocaleString('ar-EG')}","${new Date(story.expiresAt).toLocaleString('ar-EG')}",${story.views ? story.views.length : 0},${story.reactions ? story.reactions.length : 0}\n`;
            });

            fs.writeFileSync(path.join(exportDir, 'stories.csv'), storiesCSV);

            // تصدير القنوات
            const channels = await mongoose.connection.collection('channels').find({}).toArray();
            let channelsCSV = 'ID,الاسم,النوع,المنشئ,عدد الأعضاء,النوع,تاريخ الإنشاء\n';
            
            channels.forEach(channel => {
                channelsCSV += `"${channel._id}","${channel.name || ''}","${channel.type || ''}","${channel.creatorId}","${channel.members ? channel.members.length : 0}","${channel.isPublic ? 'عام' : 'خاص'}","${new Date(channel.createdAt).toLocaleString('ar-EG')}"\n`;
            });

            fs.writeFileSync(path.join(exportDir, 'channels.csv'), channelsCSV);

            // إنشاء ملف README
            const readmeContent = `# تصدير البيانات - المنصة التعليمية
تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}

## الملفات المتوفرة:
- users.csv: بيانات المستخدمين
- messages.csv: الرسائل والمحادثات
- stories.csv: الستوريات والقصص
- channels.csv: القنوات والمجموعات

## إحصائيات التصدير:
- عدد المستخدمين: ${users.length}
- عدد الرسائل: ${messages.length}
- عدد الستوريات: ${stories.length}
- عدد القنوات: ${channels.length}

## ملاحظات:
- تم إزالة كلمات المرور لأسباب أمنية
- التواريخ معروضة بالتوقيت المحلي
- المحتوى الطويل مختصر في بعض الحالات
`;

            fs.writeFileSync(path.join(exportDir, 'README.md'), readmeContent);

            console.log('✅ تم تصدير البيانات بصيغة CSV بنجاح');
            console.log(`📁 المجلد: ${exportDir}`);
            console.log('📄 الملفات المنشأة:');
            console.log('   👥 users.csv - بيانات المستخدمين');
            console.log('   📝 messages.csv - الرسائل');
            console.log('   📸 stories.csv - الستوريات');
            console.log('   📢 channels.csv - القنوات');
            console.log('   📋 README.md - معلومات التصدير');

            return exportDir;

        } catch (error) {
            console.error('❌ خطأ في تصدير البيانات بصيغة CSV:', error);
            throw error;
        }
    }

    async listExports() {
        try {
            const jsonExports = fs.readdirSync(EXPORT_DIR)
                .filter(file => file.startsWith('export-') && file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(EXPORT_DIR, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        type: 'JSON',
                        size: stats.size,
                        created: stats.birthtime
                    };
                });

            const csvExports = fs.readdirSync(EXPORT_DIR)
                .filter(file => file.startsWith('csv-export-') && fs.statSync(path.join(EXPORT_DIR, file)).isDirectory())
                .map(file => {
                    const filePath = path.join(EXPORT_DIR, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        type: 'CSV',
                        size: this.getFolderSize(filePath),
                        created: stats.birthtime
                    };
                });

            const allExports = [...jsonExports, ...csvExports]
                .sort((a, b) => new Date(b.created) - new Date(a.created));

            console.log('📋 قائمة عمليات التصدير:');
            allExports.forEach((exportItem, index) => {
                console.log(`${index + 1}. ${exportItem.filename}`);
                console.log(`   📁 النوع: ${exportItem.type}`);
                console.log(`   📏 الحجم: ${this.formatSize(exportItem.size)}`);
                console.log(`   🕐 الإنشاء: ${exportItem.created.toLocaleString('ar-EG')}`);
            });

            return allExports;

        } catch (error) {
            console.error('❌ خطأ في عرض قائمة عمليات التصدير:', error);
            return [];
        }
    }

    getFolderSize(folderPath) {
        let totalSize = 0;
        
        const files = fs.readdirSync(folderPath);
        files.forEach(file => {
            const filePath = path.join(folderPath, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
                totalSize += stats.size;
            }
        });

        return totalSize;
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    async cleanupOldExports(keepCount = 10) {
        try {
            const allExports = await this.listExports();
            
            if (allExports.length > keepCount) {
                const exportsToDelete = allExports.slice(keepCount);
                console.log(`🧹 جاري تنظيف ${exportsToDelete.length} عملية تصدير قديمة...`);

                for (const exportItem of exportsToDelete) {
                    const itemPath = path.join(EXPORT_DIR, exportItem.filename);
                    
                    if (exportItem.type === 'CSV') {
                        // حذف مجلد CSV
                        this.deleteFolderRecursive(itemPath);
                    } else {
                        // حذف ملف JSON
                        fs.unlinkSync(itemPath);
                    }
                    
                    console.log(`🗑️ تم حذف: ${exportItem.filename}`);
                }

                console.log('✅ تم الانتهاء من تنظيف عمليات التصدير القديمة');
            } else {
                console.log('✅ لا توجد عمليات تصدير قديمة تحتاج للتنظيف');
            }

        } catch (error) {
            console.error('❌ خطأ في تنظيف عمليات التصدير القديمة:', error);
        }
    }

    deleteFolderRecursive(folderPath) {
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach(file => {
                const curPath = path.join(folderPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this.deleteFolderRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(folderPath);
        }
    }
}

// التنفيذ الرئيسي
async function main() {
    const exporter = new DataExporter();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'json':
                await exporter.exportToJSON();
                break;

            case 'csv':
                await exporter.exportToCSV();
                break;

            case 'list':
                await exporter.listExports();
                break;

            case 'cleanup':
                await exporter.cleanupOldExports();
                break;

            default:
                console.log('🔧 أدوات تصدير البيانات');
                console.log('='.repeat(40));
                console.log('💡 الاستخدام:');
                console.log('  node scripts/export.js json     - تصدير البيانات بصيغة JSON');
                console.log('  node scripts/export.js csv      - تصدير البيانات بصيغة CSV');
                console.log('  node scripts/export.js list     - عرض قائمة عمليات التصدير');
                console.log('  node scripts/export.js cleanup  - تنظيف عمليات التصدير القديمة');
                break;
        }
    } catch (error) {
        console.error('❌ حدث خطأ:', error);
        process.exit(1);
    } finally {
        if (exporter.connected) {
            await mongoose.connection.close();
            console.log('👋 تم إغلاق الاتصال بقاعدة البيانات');
        }
    }
}

// تشغيل البرنامج
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default DataExporter;
