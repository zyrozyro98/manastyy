import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GoogleSheetsService {
    constructor() {
        this.auth = null;
        this.sheets = null;
        this.initializeAuth();
    }

    initializeAuth() {
        try {
            // طريقة 1: استخدام Service Account (مفضلة)
            if (fs.existsSync(path.join(__dirname, 'service-account-key.json'))) {
                this.auth = new google.auth.GoogleAuth({
                    keyFile: path.join(__dirname, 'service-account-key.json'),
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            }
            // طريقة 2: استخدام API Key (بديل)
            else if (process.env.GOOGLE_API_KEY) {
                this.auth = process.env.GOOGLE_API_KEY;
            }
            // طريقة 3: استخدام OAuth2 (للتطوير)
            else {
                console.log('⚠️  لم يتم إعداد مصادقة Google Sheets - استخدام وضع المحاكاة');
                this.auth = null;
            }

            if (this.auth) {
                this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            }
        } catch (error) {
            console.error('❌ خطأ في إعداد مصادقة Google Sheets:', error);
            this.auth = null;
        }
    }

    // دالة عامة لحفظ البيانات
    async appendData(spreadsheetId, range, values) {
        try {
            if (!this.sheets) {
                console.log('📝 محاكاة حفظ البيانات في Sheets:', values[0]);
                return { success: true, simulated: true };
            }

            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: values,
                },
            });
            
            console.log('✅ تم حفظ البيانات في Google Sheets');
            return response.data;
        } catch (error) {
            console.error('❌ خطأ في حفظ البيانات:', error);
            throw error;
        }
    }

    // دالة لقراءة البيانات
    async readData(spreadsheetId, range) {
        try {
            if (!this.sheets) {
                console.log('📖 محاكاة قراءة البيانات من Sheets');
                return [['بيانات', 'محاكاة']];
            }

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
            
            return response.data.values || [];
        } catch (error) {
            console.error('❌ خطأ في قراءة البيانات:', error);
            throw error;
        }
    }

    // دالة لتحديث البيانات
    async updateData(spreadsheetId, range, values) {
        try {
            if (!this.sheets) {
                console.log('🔄 محاكاة تحديث البيانات في Sheets:', values[0]);
                return { success: true, simulated: true };
            }

            const response = await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: values,
                },
            });
            
            return response.data;
        } catch (error) {
            console.error('❌ خطأ في تحديث البيانات:', error);
            throw error;
        }
    }

    // دالة لمسح البيانات
    async clearData(spreadsheetId, range) {
        try {
            if (!this.sheets) {
                console.log('🧹 محاكاة مسح البيانات من Sheets');
                return { success: true, simulated: true };
            }

            const response = await this.sheets.spreadsheets.values.clear({
                spreadsheetId,
                range,
            });
            
            return response.data;
        } catch (error) {
            console.error('❌ خطأ في مسح البيانات:', error);
            throw error;
        }
    }

    // دالة لإنشاء تبويبات جديدة
    async createSheet(spreadsheetId, title) {
        try {
            if (!this.sheets) {
                console.log('📄 محاكاة إنشاء تبويب جديد:', title);
                return { success: true, simulated: true };
            }

            const response = await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: title
                            }
                        }
                    }]
                }
            });

            return response.data;
        } catch (error) {
            console.error('❌ خطأ في إنشاء التبويب:', error);
            throw error;
        }
    }
}

export default new GoogleSheetsService();
