import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';

class DataImporter {
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

    async importFromJSON(filePath) {
        if (!this.connected) {
            await this.connect();
        }

        try {
            console.log(`📥 جاري استيراد البيانات من: ${filePath}`);

            if (!fs.existsSync(filePath)) {
                throw new Error('ملف الاستيراد غير موجود');
            }

            const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            // التحقق من صحة تنسيق الملف
            if (!importData.collections) {
                throw new Error('تنسيق ملف الاستيراد غير صالح');
            }

            let totalImported = 0;
            const results = {};

            // استيراد المستخدمين
            if (importData.collections.users && importData.collections.users.length > 0) {
                console.log(`👥 جاري استيراد ${importData.collections.users.length} مستخدم...`);
                
                // حذف المستخدمين الحاليين (اختياري)
                const deleteExisting = process.argv.includes('--replace');
                if (deleteExisting) {
                    await mongoose.connection.collection('users').deleteMany({});
                    console.log('🗑️ تم حذف المستخدمين الحاليين');
                }

                const usersToImport = importData.collections.users.map(user => ({
                    ...user,
                    _id: new mongoose.Types.ObjectId(user._id),
                    createdAt: new Date(user.createdAt),
                    updatedAt: new Date(user.updatedAt)
                }));

                await mongoose.connection.collection('users').insertMany(usersToImport);
                results.users = usersToImport.length;
                totalImported += usersToImport.length;
            }

            // استيراد الستوريات
            if (importData.collections.stories && importData.collections.stories.length > 0) {
                console.log(`📸 جاري استيراد ${importData.collections.stories.length} ستوري...`);
                
                if (process.argv.includes('--replace')) {
                    await mongoose.connection.collection('stories').deleteMany({});
                }

                const storiesToImport = importData.collections.stories.map(story => ({
                    ...story,
                    _id: new mongoose.Types.ObjectId(story._id),
                    userId: new mongoose.Types.ObjectId(story.userId),
                    createdAt: new Date(story.createdAt),
                    updatedAt: new Date(story.updatedAt),
                    expiresAt: new Date(story.expiresAt)
                }));

                await mongoose.connection.collection('stories').insertMany(storiesToImport);
                results.stories = storiesToImport.length;
                totalImported += storiesToImport.length;
            }

            // استيراد الرسائل
            if (importData.collections.messages && importData.collections.messages.length > 0) {
                console.log(`📝 جاري استيراد ${importData.collections.messages.length} رسالة...`);
                
                if (process.argv.includes('--replace')) {
                    await mongoose.connection.collection('messages').deleteMany({});
                }

                const messagesToImport = importData.collections.messages.map(message => ({
                    ...message,
                    _id: new mongoose.Types.ObjectId(message._id),
                    conversationId: new mongoose.Types.ObjectId(message.conversationId),
                    senderId: new mongoose.Types.ObjectId(message.senderId),
                    createdAt: new Date(message.createdAt),
                    updatedAt: new Date(message.updatedAt),
                    readBy: message.readBy ? message.readBy.map(read => ({
                        ...read,
                        userId: new mongoose.Types.ObjectId(read.userId),
                        readAt: new Date(read.readAt)
                    })) : []
                }));

                await mongoose.connection.collection('messages').insertMany(messagesToImport);
                results.messages = messagesToImport.length;
                totalImported += messagesToImport.length;
            }

            // استيراد القنوات
            if (importData.collections.channels && importData.collections.channels.length > 0) {
                console.log(`📢 جاري استيراد ${importData.collections.channels.length} قناة...`);
                
                if (process.argv.includes('--replace')) {
                    await mongoose.connection.collection('channels').deleteMany({});
                }

                const channelsToImport = importData.collections.channels.map(channel => ({
                    ...channel,
                    _id: new mongoose.Types.ObjectId(channel._id),
                    creatorId: new mongoose.Types.ObjectId(channel.creatorId),
                    members: channel.members.map(member => new mongoose.Types.ObjectId(member)),
                    admins: channel.admins.map(admin => new mongoose.Types.ObjectId(admin)),
                    createdAt: new Date(channel.createdAt),
                    updatedAt: new Date(channel.updatedAt)
                }));

                await mongoose.connection.collection('channels').insertMany(channelsToImport);
                results.channels = channelsToImport.length;
                totalImported += channelsToImport.length;
            }

            console.log('✅ تم استيراد البيانات بنجاح');
            console.log('📊 نتائج الاستيراد:');
            Object.entries(results).forEach(([collection, count]) => {
                console.log(`   📦 ${collection}: ${count} وثيقة`);
            });
            console.log(`🎯 الإجمالي: ${totalImported} وثيقة`);

            return results;

        } catch (error) {
            console.error('❌ خطأ في استيراد البيانات:', error);
            throw error;
        }
    }

    async importFromCSV(csvDir) {
        if (!this.connected) {
            await this.connect();
        }

        try {
            console.log(`📥 جاري استيراد البيانات من: ${csvDir}`);

            if (!fs.existsSync(csvDir)) {
                throw new Error('مجلد CSV غير موجود');
            }

            const results = {};
            let totalImported = 0;

            // استيراد المستخدمين من CSV
            const usersCsvPath = path.join(csvDir, 'users.csv');
            if (fs.existsSync(usersCsvPath)) {
                console.log('👥 جاري استيراد المستخدمين من CSV...');
                
                const usersCsv = fs.readFileSync(usersCsvPath, 'utf8');
                const users = this.parseCSV(usersCsv);
                
                if (process.argv.includes('--replace')) {
                    await mongoose.connection.collection('users').deleteMany({});
                }

                const usersToImport = users.map(user => ({
                    fullName: user['الاسم'],
                    phone: user['الهاتف'],
                    university: user['الجامعة'],
                    major: user['التخصص'],
                    batch: user['الدفعة'],
                    role: user['الدور'] || 'student',
                    email: user['البريد الإلكتروني'] || '',
                    studentId: user['رقم الطالب'] || '',
                    isActive: user['الحالة'] === 'نشط',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }));

                await mongoose.connection.collection('users').insertMany(usersToImport);
                results.users = usersToImport.length;
                totalImported += usersToImport.length;
            }

            // استيراد الرسائل من CSV
            const messagesCsvPath = path.join(csvDir, 'messages.csv');
            if (fs.existsSync(messagesCsvPath)) {
                console.log('📝 جاري استيراد الرسائل من CSV...');
                
                const messagesCsv = fs.readFileSync(messagesCsvPath, 'utf8');
                const messages = this.parseCSV(messagesCsv);
                
                if (process.argv.includes('--replace')) {
                    await mongoose.connection.collection('messages').deleteMany({});
                }

                const messagesToImport = messages.map(message => ({
                    conversationId: new mongoose.Types.ObjectId(),
                    senderId: new mongoose.Types.ObjectId(), // سيتم تعيينه لاحقاً
                    content: message['المحتوى'],
                    messageType: message['النوع'] || 'text',
                    createdAt: new Date(message['تاريخ الإرسال']),
                    updatedAt: new Date()
                }));

                await mongoose.connection.collection('messages').insertMany(messagesToImport);
                results.messages = messagesToImport.length;
                totalImported += messagesToImport.length;
            }

            console.log('✅ تم استيراد البيانات من CSV بنجاح');
            console.log('📊 نتائج الاستيراد:');
            Object.entries(results).forEach(([collection, count]) => {
                console.log(`   📦 ${collection}: ${count} وثيقة`);
            });
            console.log(`🎯 الإجمالي: ${totalImported} وثيقة`);

            return results;

        } catch (error) {
            console.error('❌ خطأ في استيراد البيانات من CSV:', error);
            throw error;
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        const headers = this.parseCSVLine(lines[0]);
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            data.push(row);
        }
        
        return data;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    async validateImportFile(filePath) {
        try {
            console.log(`🔍 جاري التحقق من ملف الاستيراد: ${filePath}`);

            if (!fs.existsSync(filePath)) {
                return { valid: false, error: 'الملف غير موجود' };
            }

            const fileContent = fs.readFileSync(filePath, 'utf8');
            const importData = JSON.parse(fileContent);

            const validation = {
                valid: true,
                issues: [],
                statistics: {}
            };

            // التحقق من الهيكل الأساسي
            if (!importData.collections) {
                validation.valid = false;
                validation.issues.push('الملف لا يحتوي على قسم collections');
            }

            // جمع الإحصائيات
            if (importData.collections) {
                Object.entries(importData.collections).forEach(([collection, data]) => {
                    validation.statistics[collection] = Array.isArray(data) ? data.length : 0;
                });
            }

            // التحقق من البيانات الأساسية
            if (importData.collections?.users) {
                const users = importData.collections.users;
                const usersWithoutPhone = users.filter(user => !user.phone);
                if (usersWithoutPhone.length > 0) {
                    validation.issues.push(`يوجد ${usersWithoutPhone.length} مستخدم بدون رقم هاتف`);
                }
            }

            console.log('✅ تم التحقق من ملف الاستيراد');
            console.log('📊 إحصائيات الملف:');
            Object.entries(validation.statistics).forEach(([collection, count]) => {
                console.log(`   📦 ${collection}: ${count} وثيقة`);
            });

            if (validation.issues.length > 0) {
                console.log('⚠️  مشاكل تم اكتشافها:');
                validation.issues.forEach(issue => console.log(`   ❌ ${issue}`));
            }

            return validation;

        } catch (error) {
            console.error('❌ خطأ في التحقق من ملف الاستيراد:', error);
            return { valid: false, error: error.message };
        }
    }
}

// التنفيذ الرئيسي
async function main() {
    const importer = new DataImporter();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'json':
                const jsonFile = process.argv[3];
                if (!jsonFile) {
                    console.error('❌ يرجى تحديد ملف JSON للاستيراد');
                    console.log('💡 الاستخدام: node scripts/import.js json <file-path> [--replace]');
                    process.exit(1);
                }
                await importer.importFromJSON(jsonFile);
                break;

            case 'csv':
                const csvDir = process.argv[3];
                if (!csvDir) {
                    console.error('❌ يرجى تحديد مجلد CSV للاستيراد');
                    console.log('💡 الاستخدام: node scripts/import.js csv <folder-path> [--replace]');
                    process.exit(1);
                }
                await importer.importFromCSV(csvDir);
                break;

            case 'validate':
                const validateFile = process.argv[3];
                if (!validateFile) {
                    console.error('❌ يرجى تحديد ملف للتحقق');
                    console.log('💡 الاستخدام: node scripts/import.js validate <file-path>');
                    process.exit(1);
                }
                await importer.validateImportFile(validateFile);
                break;

            default:
                console.log('🔧 أدوات استيراد البيانات');
                console.log('='.repeat(40));
                console.log('💡 الاستخدام:');
                console.log('  node scripts/import.js json <file>     - استيراد من ملف JSON');
                console.log('  node scripts/import.js csv <folder>    - استيراد من مجلد CSV');
                console.log('  node scripts/import.js validate <file> - التحقق من ملف الاستيراد');
                console.log('');
                console.log('⚡ الخيارات:');
                console.log('  --replace  - استبدال البيانات الحالية (حذف القديم قبل الاستيراد)');
                break;
        }
    } catch (error) {
        console.error('❌ حدث خطأ:', error);
        process.exit(1);
    } finally {
        if (importer.connected) {
            await mongoose.connection.close();
            console.log('👋 تم إغلاق الاتصال بقاعدة البيانات');
        }
    }
}

// تشغيل البرنامج
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default DataImporter;
