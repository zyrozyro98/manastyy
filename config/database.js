import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';

class DatabaseManager {
    constructor() {
        this.isConnected = false;
        this.connection = null;
    }

    async connect() {
        try {
            if (this.isConnected) {
                return this.connection;
            }

            console.log('🔗 جاري الاتصال بقاعدة البيانات...');

            const connection = await mongoose.connect(MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });

            this.isConnected = true;
            this.connection = connection;

            console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');

            // إعداد مستمعات الأحداث
            mongoose.connection.on('error', (error) => {
                console.error('❌ خطأ في قاعدة البيانات:', error);
                this.isConnected = false;
            });

            mongoose.connection.on('disconnected', () => {
                console.log('⚠️  تم فصل الاتصال بقاعدة البيانات');
                this.isConnected = false;
            });

            mongoose.connection.on('reconnected', () => {
                console.log('🔁 تم إعادة الاتصال بقاعدة البيانات');
                this.isConnected = true;
            });

            return connection;

        } catch (error) {
            console.error('❌ فشل في الاتصال بقاعدة البيانات:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.isConnected) {
                await mongoose.connection.close();
                this.isConnected = false;
                this.connection = null;
                console.log('✅ تم فصل الاتصال بقاعدة البيانات');
            }
        } catch (error) {
            console.error('❌ خطأ في فصل الاتصال:', error);
            throw error;
        }
    }

    async getDatabaseStats() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const adminDb = mongoose.connection.db.admin();
            const serverStatus = await adminDb.serverStatus();
            const dbStats = await mongoose.connection.db.stats();

            return {
                server: {
                    host: mongoose.connection.host,
                    port: mongoose.connection.port,
                    name: mongoose.connection.name,
                    version: serverStatus.version,
                    uptime: serverStatus.uptime,
                    connections: serverStatus.connections
                },
                database: {
                    collections: dbStats.collections,
                    objects: dbStats.objects,
                    avgObjSize: dbStats.avgObjSize,
                    dataSize: dbStats.dataSize,
                    storageSize: dbStats.storageSize,
                    indexSize: dbStats.indexSize,
                    fileSize: dbStats.fileSize
                },
                performance: {
                    operations: serverStatus.opcounters,
                    network: serverStatus.network,
                    memory: serverStatus.mem
                }
            };

        } catch (error) {
            console.error('❌ خطأ في جلب إحصائيات قاعدة البيانات:', error);
            return null;
        }
    }

    async checkCollections() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const collections = await mongoose.connection.db.listCollections().toArray();
            const collectionStats = [];

            for (const collection of collections) {
                const stats = await mongoose.connection.db.collection(collection.name).stats();
                collectionStats.push({
                    name: collection.name,
                    count: stats.count,
                    size: stats.size,
                    storageSize: stats.storageSize,
                    avgObjSize: stats.avgObjSize,
                    indexes: stats.nindexes,
                    totalIndexSize: stats.totalIndexSize
                });
            }

            return collectionStats;

        } catch (error) {
            console.error('❌ خطأ في فحص المجموعات:', error);
            return [];
        }
    }

    async backupIndexes() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const collections = await mongoose.connection.db.listCollections().toArray();
            const indexesBackup = {};
            const backupDir = path.join(__dirname, '../backups/indexes');

            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            for (const collection of collections) {
                const indexes = await mongoose.connection.db.collection(collection.name).getIndexes();
                indexesBackup[collection.name] = indexes;
            }

            const backupFile = path.join(backupDir, `indexes-backup-${Date.now()}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(indexesBackup, null, 2));

            console.log('✅ تم نسخ الفهارس احتياطياً');
            return backupFile;

        } catch (error) {
            console.error('❌ خطأ في نسخ الفهارس احتياطياً:', error);
            return null;
        }
    }

    async optimizeDatabase() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            console.log('⚡ جاري تحسين قاعدة البيانات...');

            // إعادة بناء الفهارس
            const collections = await mongoose.connection.db.listCollections().toArray();
            
            for (const collection of collections) {
                console.log(`🔧 جاري تحسين مجموعة: ${collection.name}`);
                await mongoose.connection.db.collection(collection.name).reIndex();
            }

            // تشغيل أمر الصيانة
            await mongoose.connection.db.command({ compact: 'users' });
            await mongoose.connection.db.command({ compact: 'messages' });
            await mongoose.connection.db.command({ compact: 'stories' });

            console.log('✅ تم تحسين قاعدة البيانات بنجاح');
            return true;

        } catch (error) {
            console.error('❌ خطأ في تحسين قاعدة البيانات:', error);
            return false;
        }
    }

    async validateData() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            console.log('🔍 جاري التحقق من سلامة البيانات...');

            const issues = [];
            const collections = ['users', 'messages', 'stories', 'channels'];

            for (const collectionName of collections) {
                const collection = mongoose.connection.db.collection(collectionName);
                
                // التحقق من الوثائق التالفة
                const corruptDocs = await collection.find({ _id: { $type: 'missing' } }).toArray();
                if (corruptDocs.length > 0) {
                    issues.push({
                        collection: collectionName,
                        issue: 'وثائق تالفة',
                        count: corruptDocs.length
                    });
                }

                // التحقق من المراجع
                if (collectionName === 'messages') {
                    const invalidRefs = await collection.aggregate([
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'senderId',
                                foreignField: '_id',
                                as: 'sender'
                            }
                        },
                        {
                            $match: {
                                sender: { $size: 0 }
                            }
                        }
                    ]).toArray();

                    if (invalidRefs.length > 0) {
                        issues.push({
                            collection: collectionName,
                            issue: 'مراجع غير صالحة',
                            count: invalidRefs.length
                        });
                    }
                }
            }

            if (issues.length === 0) {
                console.log('✅ جميع البيانات سليمة');
            } else {
                console.log('⚠️  تم اكتشاف بعض المشاكل:');
                issues.forEach(issue => {
                    console.log(`   ❌ ${issue.collection}: ${issue.issue} (${issue.count})`);
                });
            }

            return issues;

        } catch (error) {
            console.error('❌ خطأ في التحقق من البيانات:', error);
            return [];
        }
    }
}

// إنشاء نسخة وحيدة من مدير قاعدة البيانات
const databaseManager = new DatabaseManager();

export default databaseManager;
