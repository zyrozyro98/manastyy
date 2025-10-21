import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';
const BACKUP_DIR = path.join(__dirname, '../backups');

// إنشاء مجلد النسخ الاحتياطي إذا لم يكن موجوداً
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// نماذج MongoDB المبسطة (للاستخدام في النسخ الاحتياطي)
const userSchema = new mongoose.Schema({
    fullName: String,
    phone: String,
    university: String,
    major: String,
    batch: String,
    avatar: String,
    bio: String,
    role: String,
    isActive: Boolean,
    email: String,
    studentId: String,
    badges: [String],
    stats: Object,
    settings: Object,
    security: Object
}, { timestamps: true });

const storySchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    mediaUrl: String,
    mediaType: String,
    caption: String,
    views: [Object],
    reactions: [Object],
    replies: [Object],
    tags: [String],
    expiresAt: Date,
    metrics: Object
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
    conversationId: mongoose.Schema.Types.ObjectId,
    senderId: mongoose.Schema.Types.ObjectId,
    content: String,
    messageType: String,
    fileUrl: String,
    readBy: [Object],
    reactions: [Object],
    replyTo: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

const channelSchema = new mongoose.Schema({
    name: String,
    description: String,
    type: String,
    avatar: String,
    isPublic: Boolean,
    creatorId: mongoose.Schema.Types.ObjectId,
    members: [mongoose.Schema.Types.ObjectId],
    admins: [mongoose.Schema.Types.ObjectId],
    topics: [String],
    rules: [String],
    stats: Object
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Story = mongoose.model('Story', storySchema);
const Message = mongoose.model('Message', messageSchema);
const Channel = mongoose.model('Channel', channelSchema);

class BackupManager {
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

    async createBackup() {
        if (!this.connected) {
            await this.connect();
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `manual-backup-${timestamp}.json`);
            
            console.log('📦 جاري إنشاء نسخة احتياطية...');

            // جمع البيانات من جميع المجموعات
            const backupData = {
                timestamp: new Date().toISOString(),
                info: {
                    version: '2.0.0',
                    collections: ['users', 'stories', 'messages', 'channels']
                },
                collections: {
                    users: await User.find().select('-password').lean(),
                    stories: await Story.find().lean(),
                    messages: await Message.find().lean(),
                    channels: await Channel.find().lean()
                },
                statistics: {
                    users: await User.countDocuments(),
                    stories: await Story.countDocuments(),
                    messages: await Message.countDocuments(),
                    channels: await Channel.countDocuments(),
                    activeStories: await Story.countDocuments({ expiresAt: { $gt: new Date() } })
                }
            };

            // حفظ البيانات في ملف
            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
            
            console.log('✅ تم إنشاء النسخة الاحتياطية بنجاح');
            console.log(`📁 الملف: ${backupFile}`);
            console.log('📊 إحصائيات النسخة الاحتياطية:');
            console.log(`   👥 المستخدمين: ${backupData.statistics.users}`);
            console.log(`   📝 الرسائل: ${backupData.statistics.messages}`);
            console.log(`   📸 الستوريات: ${backupData.statistics.stories}`);
            console.log(`   📢 القنوات: ${backupData.statistics.channels}`);
            console.log(`   🔥 الستوريات النشطة: ${backupData.statistics.activeStories}`);

            return backupFile;

        } catch (error) {
            console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
            throw error;
        }
    }

    async listBackups() {
        try {
            const files = fs.readdirSync(BACKUP_DIR)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(BACKUP_DIR, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => new Date(b.created) - new Date(a.created));

            console.log('📋 قائمة النسخ الاحتياطية:');
            files.forEach((file, index) => {
                console.log(`${index + 1}. ${file.filename}`);
                console.log(`   📏 الحجم: ${(file.size / 1024).toFixed(2)} KB`);
                console.log(`   🕐 الإنشاء: ${file.created.toLocaleString('ar-EG')}`);
            });

            return files;
        } catch (error) {
            console.error('❌ خطأ في عرض قائمة النسخ الاحتياطية:', error);
            return [];
        }
    }

    async restoreBackup(backupFilename) {
        if (!this.connected) {
            await this.connect();
        }

        try {
            const backupFile = path.join(BACKUP_DIR, backupFilename);
            
            if (!fs.existsSync(backupFile)) {
                console.error('❌ ملف النسخة الاحتياطية غير موجود');
                return false;
            }

            console.log(`🔄 جاري استعادة النسخة الاحتياطية: ${backupFilename}`);

            const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

            // التحقق من صحة البيانات
            if (!backupData.collections) {
                console.error('❌ تنسيق ملف النسخة الاحتياطية غير صالح');
                return false;
            }

            // حذف البيانات الحالية
            console.log('🗑️ جاري حذف البيانات الحالية...');
            await User.deleteMany({});
            await Story.deleteMany({});
            await Message.deleteMany({});
            await Channel.deleteMany({});

            // استعادة البيانات
            console.log('📥 جاري استعادة البيانات...');

            if (backupData.collections.users && backupData.collections.users.length > 0) {
                console.log(`👥 جاري استعادة ${backupData.collections.users.length} مستخدم...`);
                await User.insertMany(backupData.collections.users);
            }

            if (backupData.collections.stories && backupData.collections.stories.length > 0) {
                console.log(`📸 جاري استعادة ${backupData.collections.stories.length} ستوري...`);
                await Story.insertMany(backupData.collections.stories);
            }

            if (backupData.collections.messages && backupData.collections.messages.length > 0) {
                console.log(`📝 جاري استعادة ${backupData.collections.messages.length} رسالة...`);
                await Message.insertMany(backupData.collections.messages);
            }

            if (backupData.collections.channels && backupData.collections.channels.length > 0) {
                console.log(`📢 جاري استعادة ${backupData.collections.channels.length} قناة...`);
                await Channel.insertMany(backupData.collections.channels);
            }

            console.log('✅ تم استعادة النسخة الاحتياطية بنجاح');
            console.log('📊 البيانات المستعادة:');
            console.log(`   👥 المستخدمين: ${await User.countDocuments()}`);
            console.log(`   📝 الرسائل: ${await Message.countDocuments()}`);
            console.log(`   📸 الستوريات: ${await Story.countDocuments()}`);
            console.log(`   📢 القنوات: ${await Channel.countDocuments()}`);

            return true;

        } catch (error) {
            console.error('❌ خطأ في استعادة النسخة الاحتياطية:', error);
            return false;
        }
    }

    async cleanupOldBackups(keepCount = 10) {
        try {
            const files = fs.readdirSync(BACKUP_DIR)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(BACKUP_DIR, file);
                    return {
                        filename: file,
                        path: filePath,
                        created: fs.statSync(filePath).birthtime
                    };
                })
                .sort((a, b) => new Date(b.created) - new Date(a.created));

            if (files.length > keepCount) {
                const filesToDelete = files.slice(keepCount);
                console.log(`🧹 جاري تنظيف ${filesToDelete.length} نسخة احتياطية قديمة...`);

                for (const file of filesToDelete) {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️ تم حذف: ${file.filename}`);
                }

                console.log('✅ تم الانتهاء من التنظيف');
            } else {
                console.log('✅ لا توجد نسخ احتياطية قديمة تحتاج للتنظيف');
            }

        } catch (error) {
            console.error('❌ خطأ في تنظيف النسخ الاحتياطية القديمة:', error);
        }
    }
}

// التنفيذ الرئيسي
async function main() {
    const backupManager = new BackupManager();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'create':
                await backupManager.createBackup();
                break;

            case 'list':
                await backupManager.listBackups();
                break;

            case 'restore':
                const filename = process.argv[3];
                if (!filename) {
                    console.error('❌ يرجى تحديد اسم ملف النسخة الاحتياطية');
                    console.log('💡 الاستخدام: node scripts/backup.js restore <filename>');
                    process.exit(1);
                }
                await backupManager.restoreBackup(filename);
                break;

            case 'cleanup':
                await backupManager.cleanupOldBackups();
                break;

            default:
                console.log('🔧 أدوات إدارة النسخ الاحتياطية');
                console.log('='.repeat(40));
                console.log('💡 الاستخدام:');
                console.log('  node scripts/backup.js create     - إنشاء نسخة احتياطية جديدة');
                console.log('  node scripts/backup.js list       - عرض قائمة النسخ الاحتياطية');
                console.log('  node scripts/backup.js restore <file> - استعادة نسخة احتياطية');
                console.log('  node scripts/backup.js cleanup    - تنظيف النسخ القديمة');
                break;
        }
    } catch (error) {
        console.error('❌ حدث خطأ:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('👋 تم إغلاق الاتصال بقاعدة البيانات');
    }
}

// تشغيل البرنامج
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default BackupManager;
