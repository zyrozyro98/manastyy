const fs = require('fs');
const path = require('path');

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

    createBackup(filename) {
        try {
            if (fs.existsSync(filename)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupFile = path.join(this.backupDir, `${path.basename(filename)}.${timestamp}.backup`);
                
                fs.copyFileSync(filename, backupFile);
                console.log(`✅ تم إنشاء نسخة احتياطية: ${backupFile}`);
                return true;
            }
        } catch (error) {
            console.error('❌ خطأ في النسخ الاحتياطي:', error);
            return false;
        }
    }

    restoreBackup(backupFile, targetFile) {
        try {
            if (fs.existsSync(backupFile)) {
                fs.copyFileSync(backupFile, targetFile);
                console.log(`✅ تم استعادة النسخة الاحتياطية: ${targetFile}`);
                return true;
            }
        } catch (error) {
            console.error('❌ خطأ في استعادة النسخة:', error);
            return false;
        }
    }

    listBackups() {
        try {
            const files = fs.readdirSync(this.backupDir);
            const backups = files.filter(file => file.endsWith('.backup'));
            return backups.map(file => ({
                name: file,
                path: path.join(this.backupDir, file),
                size: fs.statSync(path.join(this.backupDir, file)).size,
                modified: fs.statSync(path.join(this.backupDir, file)).mtime
            }));
        } catch (error) {
            console.error('❌ خطأ في سرد النسخ:', error);
            return [];
        }
    }

    autoBackup() {
        const files = ['local-users.json', 'local-messages.json', 'local-images.json'];
        files.forEach(file => {
            if (fs.existsSync(file)) {
                this.createBackup(file);
            }
        });
    }
}

// تشغيل النسخ الاحتياطي إذا تم تنفيذ الملف مباشرة
if (require.main === module) {
    const backupManager = new BackupManager();
    console.log('🔄 بدء النسخ الاحتياطي التلقائي...');
    backupManager.autoBackup();
    console.log('✅ اكتمل النسخ الاحتياطي');
    
    const backups = backupManager.listBackups();
    console.log(`📊 عدد النسخ الاحتياطية: ${backups.length}`);
}

module.exports = BackupManager;
