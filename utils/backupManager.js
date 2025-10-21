import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);

class BackupManager {
    constructor() {
        this.backupDir = path.join(__dirname, '../backups');
        this.autoBackupDir = path.join(this.backupDir, 'auto');
        this.manualBackupDir = path.join(this.backupDir, 'manual');
        
        this.initBackupDirs();
    }

    initBackupDirs() {
        [this.backupDir, this.autoBackupDir, this.manualBackupDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    async createBackup(data, type = 'manual', options = {}) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = type === 'auto' ? this.autoBackupDir : this.manualBackupDir;
            
            const backupData = {
                metadata: {
                    version: '2.0.0',
                    type,
                    timestamp: new Date().toISOString(),
                    createdBy: options.createdBy || 'system'
                },
                data,
                statistics: {
                    collections: Object.keys(data.collections || {}).length,
                    totalDocuments: this.countTotalDocuments(data),
                    size: JSON.stringify(data).length
                }
            };

            let filename, filePath;

            if (options.compressed) {
                filename = `backup-${timestamp}.json.gz`;
                filePath = path.join(backupDir, filename);
                const compressedData = await gzip(JSON.stringify(backupData));
                fs.writeFileSync(filePath, compressedData);
            } else {
                filename = `backup-${timestamp}.json`;
                filePath = path.join(backupDir, filename);
                fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
            }

            // تحديث سجل النسخ الاحتياطية
            await this.updateBackupRegistry({
                filename,
                type,
                path: filePath,
                size: fs.statSync(filePath).size,
                timestamp: new Date().toISOString(),
                compressed: options.compressed || false
            });

            // تنظيف النسخ القديمة
            if (options.autoCleanup !== false) {
                await this.cleanupOldBackups(type);
            }

            console.log(`✅ تم إنشاء نسخة احتياطية: ${filename}`);
            return {
                success: true,
                filename,
                path: filePath,
                size: fs.statSync(filePath).size,
                statistics: backupData.statistics
            };

        } catch (error) {
            console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async restoreBackup(backupFilename, options = {}) {
        try {
            let backupPath;
            
            // البحث عن الملف في المجلدات
            const possiblePaths = [
                path.join(this.manualBackupDir, backupFilename),
                path.join(this.autoBackupDir, backupFilename),
                path.join(this.backupDir, backupFilename)
            ];

            for (const possiblePath of possiblePaths) {
                if (fs.existsSync(possiblePath)) {
                    backupPath = possiblePath;
                    break;
                }
            }

            if (!backupPath) {
                throw new Error(`النسخة الاحتياطية "${backupFilename}" غير موجودة`);
            }

            console.log(`🔄 جاري استعادة النسخة الاحتياطية: ${backupFilename}`);

            let backupData;
            
            if (backupPath.endsWith('.gz')) {
                const compressedData = fs.readFileSync(backupPath);
                const decompressedData = await gunzip(compressedData);
                backupData = JSON.parse(decompressedData.toString());
            } else {
                backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            }

            // التحقق من صحة البيانات
            if (!this.validateBackupData(backupData)) {
                throw new Error('تنسيق النسخة الاحتياطية غير صالح');
            }

            const result = {
                success: true,
                data: backupData.data,
                metadata: backupData.metadata,
                statistics: backupData.statistics
            };

            console.log('✅ تم تحميل النسخة الاحتياطية بنجاح');
            return result;

        } catch (error) {
            console.error('❌ خطأ في استعادة النسخة الاحتياطية:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async listBackups(type = 'all') {
        try {
            const backups = [];
            const directories = [];

            if (type === 'all' || type === 'manual') {
                directories.push(this.manualBackupDir);
            }
            if (type === 'all' || type === 'auto') {
                directories.push(this.autoBackupDir);
            }

            for (const directory of directories) {
                if (fs.existsSync(directory)) {
                    const files = fs.readdirSync(directory)
                        .filter(file => file.endsWith('.json') || file.endsWith('.json.gz'))
                        .map(file => {
                            const filePath = path.join(directory, file);
                            const stats = fs.statSync(filePath);
                            return {
                                filename: file,
                                type: directory === this.autoBackupDir ? 'auto' : 'manual',
                                path: filePath,
                                size: stats.size,
                                created: stats.birthtime,
                                modified: stats.mtime,
                                compressed: file.endsWith('.gz')
                            };
                        });

                    backups.push(...files);
                }
            }

            // الترتيب حسب تاريخ الإنشاء (الأحدث أولاً)
            return backups.sort((a, b) => new Date(b.created) - new Date(a.created));

        } catch (error) {
            console.error('❌ خطأ في جلب قائمة النسخ الاحتياطية:', error);
            return [];
        }
    }

    async cleanupOldBackups(type = 'all', keepCount = 10) {
        try {
            const backups = await this.listBackups(type);
            const backupsToDelete = backups.slice(keepCount);

            let deletedCount = 0;
            for (const backup of backupsToDelete) {
                try {
                    fs.unlinkSync(backup.path);
                    deletedCount++;
                    console.log(`🗑️ تم حذف: ${backup.filename}`);
                } catch (error) {
                    console.error(`❌ خطأ في حذف ${backup.filename}:`, error);
                }
            }

            // تحديث السجل
            await this.cleanupBackupRegistry();

            console.log(`✅ تم حذف ${deletedCount} نسخة احتياطية قديمة`);
            return deletedCount;

        } catch (error) {
            console.error('❌ خطأ في تنظيف النسخ القديمة:', error);
            return 0;
        }
    }

    async getBackupStats() {
        try {
            const backups = await this.listBackups('all');
            const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
            const autoBackups = backups.filter(b => b.type === 'auto');
            const manualBackups = backups.filter(b => b.type === 'manual');

            return {
                total: backups.length,
                auto: autoBackups.length,
                manual: manualBackups.length,
                totalSize,
                autoSize: autoBackups.reduce((sum, b) => sum + b.size, 0),
                manualSize: manualBackups.reduce((sum, b) => sum + b.size, 0),
                oldest: backups.length > 0 ? backups[backups.length - 1].created : null,
                newest: backups.length > 0 ? backups[0].created : null
            };

        } catch (error) {
            console.error('❌ خطأ في جلب إحصائيات النسخ الاحتياطية:', error);
            return null;
        }
    }

    async updateBackupRegistry(backupInfo) {
        try {
            const registryFile = path.join(this.backupDir, 'backup-registry.json');
            let registry = { backups: [], lastUpdate: new Date().toISOString() };

            if (fs.existsSync(registryFile)) {
                registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
            }

            // إضافة النسخة الجديدة
            registry.backups.unshift(backupInfo);
            
            // الاحتفاظ بـ 50 سجل فقط
            if (registry.backups.length > 50) {
                registry.backups = registry.backups.slice(0, 50);
            }

            registry.lastUpdate = new Date().toISOString();
            fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));

        } catch (error) {
            console.error('❌ خطأ في تحديث سجل النسخ الاحتياطية:', error);
        }
    }

    async cleanupBackupRegistry() {
        try {
            const registryFile = path.join(this.backupDir, 'backup-registry.json');
            
            if (!fs.existsSync(registryFile)) {
                return;
            }

            const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
            
            // إزالة السجلات للنسخ المحذوفة
            registry.backups = registry.backups.filter(backup => {
                return fs.existsSync(backup.path);
            });

            fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));

        } catch (error) {
            console.error('❌ خطأ في تنظيف سجل النسخ الاحتياطية:', error);
        }
    }

    countTotalDocuments(data) {
        let total = 0;
        if (data.collections) {
            Object.values(data.collections).forEach(collection => {
                if (Array.isArray(collection)) {
                    total += collection.length;
                }
            });
        }
        return total;
    }

    validateBackupData(backupData) {
        return (
            backupData &&
            backupData.metadata &&
            backupData.metadata.version &&
            backupData.metadata.timestamp &&
            backupData.data
        );
    }

    // نسخ احتياطي تلقائي
    async startAutoBackup(intervalHours = 24, dataProvider) {
        console.log(`⏰ تم تفعيل النسخ الاحتياطي التلقائي كل ${intervalHours} ساعة`);

        const intervalMs = intervalHours * 60 * 60 * 1000;

        const performBackup = async () => {
            try {
                console.log('🔄 جاري النسخ الاحتياطي التلقائي...');
                
                const data = await dataProvider();
                const result = await this.createBackup(data, 'auto', {
                    compressed: true,
                    autoCleanup: true,
                    createdBy: 'auto-backup'
                });

                if (result.success) {
                    console.log('✅ تم النسخ الاحتياطي التلقائي بنجاح');
                } else {
                    console.error('❌ فشل النسخ الاحتياطي التلقائي:', result.error);
                }

            } catch (error) {
                console.error('❌ خطأ في النسخ الاحتياطي التلقائي:', error);
            }
        };

        // تنفيذ فوري لأول نسخ احتياطي
        await performBackup();

        // جدولة النسخ الاحتياطي الدوري
        setInterval(performBackup, intervalMs);
    }
}

// إنشاء نسخة وحيدة
const backupManager = new BackupManager();

export default backupManager;
