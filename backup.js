const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { v4: uuidv4 } = require('uuid');

class BackupManager {
    constructor() {
        this.backupDir = 'backups';
        this.ensureBackupDir();
    }

    ensureBackupDir() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    async createBackup() {
        const backupId = uuidv4();
        const timestamp = new Date().toISOString();
        const backupPath = path.join(this.backupDir, `backup-${backupId}.zip`);
        
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                console.log(`✅ تم إنشاء النسخ الاحتياطي: ${backupPath}`);
                resolve({
                    id: backupId,
                    timestamp: timestamp,
                    size: archive.pointer(),
                    path: backupPath
                });
            });

            archive.on('error', reject);
            archive.pipe(output);

            // إضافة ملفات JSON
            const tables = ['users', 'messages', 'stories', 'groups', 'channels', 'settings'];
            tables.forEach(table => {
                const filePath = `${table}.json`;
                if (fs.existsSync(filePath)) {
                    archive.file(filePath, { name: `${table}.json` });
                }
            });

            // إضافة الوسائط
            const mediaDirs = ['uploads', 'stories', 'avatars', 'groups', 'channels'];
            mediaDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    archive.directory(dir, dir);
                }
            });

            archive.finalize();
        });
    }

    async restoreBackup(backupPath) {
        if (!fs.existsSync(backupPath)) {
            throw new Error('ملف النسخ الاحتياطي غير موجود');
        }

        // إنشاء مجلد مؤقت للاستعادة
        const tempDir = `temp/restore-${Date.now()}`;
        if (!fs.existsSync('temp')) {
            fs.mkdirSync('temp', { recursive: true });
        }
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        await fs.createReadStream(backupPath)
            .pipe(unzipper.Extract({ path: tempDir }))
            .promise();

        // نسخ الملفات المستعادة
        this.copyRecursiveSync(tempDir, '.');

        // تنظيف المجلد المؤقت
        fs.rmSync(tempDir, { recursive: true, force: true });

        console.log('✅ تم استعادة النسخ الاحتياطي بنجاح');
    }

    copyRecursiveSync(src, dest) {
        const exists = fs.existsSync(src);
        const stats = exists && fs.statSync(src);
        const isDirectory = exists && stats.isDirectory();
        
        if (isDirectory) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach(childItemName => {
                this.copyRecursiveSync(
                    path.join(src, childItemName),
                    path.join(dest, childItemName)
                );
            });
        } else {
            fs.copyFileSync(src, dest);
        }
    }

    listBackups() {
        if (!fs.existsSync(this.backupDir)) {
            return [];
        }

        return fs.readdirSync(this.backupDir)
            .filter(file => file.endsWith('.zip'))
            .map(file => {
                const stats = fs.statSync(path.join(this.backupDir, file));
                return {
                    name: file,
                    path: path.join(this.backupDir, file),
                    size: stats.size,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => b.created - a.created);
    }

    deleteBackup(backupName) {
        const backupPath = path.join(this.backupDir, backupName);
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
            console.log(`✅ تم حذف النسخ الاحتياطي: ${backupName}`);
            return true;
        }
        return false;
    }
}

module.exports = BackupManager;

// استخدام مباشر إذا تم تشغيل الملف مباشرة
if (require.main === module) {
    const backupManager = new BackupManager();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'create':
            backupManager.createBackup()
                .then(backup => {
                    console.log('✅ تم إنشاء النسخ الاحتياطي بنجاح:', backup);
                    process.exit(0);
                })
                .catch(error => {
                    console.error('❌ خطأ في إنشاء النسخ الاحتياطي:', error);
                    process.exit(1);
                });
            break;
            
        case 'list':
            const backups = backupManager.listBackups();
            console.log('📦 النسخ الاحتياطية المتاحة:');
            backups.forEach((backup, index) => {
                console.log(`${index + 1}. ${backup.name} (${(backup.size / 1024 / 1024).toFixed(2)} MB) - ${backup.created}`);
            });
            break;
            
        case 'restore':
            const backupName = process.argv[3];
            if (!backupName) {
                console.error('❌ يرجى تحديد اسم النسخ الاحتياطي');
                process.exit(1);
            }
            backupManager.restoreBackup(path.join('backups', backupName))
                .then(() => {
                    console.log('✅ تم استعادة النسخ الاحتياطي بنجاح');
                    process.exit(0);
                })
                .catch(error => {
                    console.error('❌ خطأ في استعادة النسخ الاحتياطي:', error);
                    process.exit(1);
                });
            break;
            
        default:
            console.log(`
استخدامات النسخ الاحتياطي:
  node backup.js create      - إنشاء نسخ احتياطي جديد
  node backup.js list        - عرض النسخ الاحتياطية المتاحة
  node backup.js restore <اسم_الملف> - استعادة نسخ احتياطي
            `);
            process.exit(0);
    }
}
