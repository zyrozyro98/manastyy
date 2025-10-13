const fs = require('fs');
const path = require('path');

function createBackup() {
    const files = ['users.json', 'messages.json', 'images.json'];
    const backupDir = 'backups';
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    files.forEach(file => {
        if (fs.existsSync(file)) {
            const backupFile = path.join(backupDir, `${file}.${timestamp}.backup`);
            fs.copyFileSync(file, backupFile);
        }
    });
    
    console.log('✅ تم إنشاء نسخة احتياطية');
}

createBackup();
