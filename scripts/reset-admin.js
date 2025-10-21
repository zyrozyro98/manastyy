import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform';

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    fullName: String,
    phone: String,
    university: String,
    major: String,
    batch: String,
    password: String,
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

const User = mongoose.model('User', userSchema);

class AdminManager {
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

    async resetAdminPassword() {
        if (!this.connected) {
            await this.connect();
        }

        try {
            const phone = '500000000';
            const newPassword = '77007700';
            
            console.log('🔄 جاري إعادة تعيين كلمة مرور المدير...');
            console.log(`📱 رقم الهاتف: ${phone}`);
            console.log(`🔐 كلمة المرور الجديدة: ${newPassword}`);

            // البحث عن المستخدم
            const adminUser = await User.findOne({ phone });
            
            if (!adminUser) {
                console.log('❌ حساب المدير غير موجود، جاري إنشاء حساب جديد...');
                return await this.createAdminAccount();
            }

            // تحديث كلمة المرور
            const hashedPassword = await bcrypt.hash(newPassword, 12);
            await User.updateOne(
                { phone },
                { 
                    $set: { 
                        password: hashedPassword,
                        role: 'admin',
                        isActive: true,
                        'security.loginAttempts': 0,
                        'security.lockUntil': null
                    } 
                }
            );

            console.log('✅ تم إعادة تعيين كلمة مرور المدير بنجاح');
            console.log('📋 معلومات الحساب:');
            console.log(`   👤 الاسم: ${adminUser.fullName}`);
            console.log(`   📱 الهاتف: ${phone}`);
            console.log(`   🔐 كلمة المرور: ${newPassword}`);
            console.log(`   👑 الدور: مدير النظام`);
            console.log(`   🟢 الحالة: نشط`);

            return true;

        } catch (error) {
            console.error('❌ خطأ في إعادة تعيين كلمة مرور المدير:', error);
            return false;
        }
    }

    async createAdminAccount() {
        try {
            const hashedPassword = await bcrypt.hash('77007700', 12);
            
            const adminUser = new User({
                fullName: 'مدير النظام',
                phone: '500000000',
                university: 'المنصة التعليمية',
                major: 'إدارة النظام',
                batch: '2024',
                password: hashedPassword,
                role: 'admin',
                email: 'admin@platform.edu',
                studentId: 'ADMIN001',
                badges: ['👑 مدير النظام'],
                isActive: true,
                stats: {
                    messagesSent: 0,
                    storiesPosted: 0,
                    channelsJoined: 0,
                    totalLikes: 0
                },
                settings: {
                    privacy: {
                        hideOnlineStatus: false,
                        hideLastSeen: false,
                        hideStoryViews: false,
                        profileVisibility: 'public'
                    },
                    notificationSettings: {
                        messages: true,
                        stories: true,
                        channels: true,
                        system: true,
                        emailNotifications: false
                    },
                    appearance: {
                        theme: 'auto',
                        fontSize: 'medium',
                        background: 'default',
                        language: 'ar'
                    }
                },
                security: {
                    lastPasswordChange: new Date(),
                    loginAttempts: 0,
                    lockUntil: null,
                    twoFactorEnabled: false
                }
            });

            await adminUser.save();

            console.log('✅ تم إنشاء حساب المدير بنجاح');
            console.log('📋 معلومات الحساب الجديد:');
            console.log(`   👤 الاسم: ${adminUser.fullName}`);
            console.log(`   📱 الهاتف: ${adminUser.phone}`);
            console.log(`   🔐 كلمة المرور: 77007700`);
            console.log(`   👑 الدور: مدير النظام`);
            console.log(`   📧 البريد الإلكتروني: ${adminUser.email}`);
            console.log(`   🆔 رقم الطالب: ${adminUser.studentId}`);
            console.log(`   🟢 الحالة: نشط`);

            return true;

        } catch (error) {
            console.error('❌ خطأ في إنشاء حساب المدير:', error);
            return false;
        }
    }

    async listAdmins() {
        if (!this.connected) {
            await this.connect();
        }

        try {
            const adminUsers = await User.find({ role: 'admin' })
                .select('fullName phone email role isActive createdAt lastSeen')
                .sort({ createdAt: -1 });

            console.log('👑 قائمة مدراء النظام:');
            
            if (adminUsers.length === 0) {
                console.log('❌ لا توجد حسابات مدير في النظام');
                return [];
            }

            adminUsers.forEach((admin, index) => {
                console.log(`${index + 1}. ${admin.fullName}`);
                console.log(`   📱 الهاتف: ${admin.phone}`);
                console.log(`   📧 البريد: ${admin.email || 'غير محدد'}`);
                console.log(`   👑 الدور: ${admin.role}`);
                console.log(`   🟢 الحالة: ${admin.isActive ? 'نشط' : 'موقوف'}`);
                console.log(`   📅 التسجيل: ${new Date(admin.createdAt).toLocaleString('ar-EG')}`);
                console.log(`   👀 آخر ظهور: ${admin.lastSeen ? new Date(admin.lastSeen).toLocaleString('ar-EG') : 'غير متاح'}`);
                console.log('   ─────────────────────────');
            });

            return adminUsers;

        } catch (error) {
            console.error('❌ خطأ في جلب قائمة المدراء:', error);
            return [];
        }
    }

    async createModerator(phone, fullName, email = '') {
        if (!this.connected) {
            await this.connect();
        }

        try {
            // التحقق من وجود المستخدم
            const existingUser = await User.findOne({ phone });
            if (existingUser) {
                console.log('⚠️  المستخدم موجود بالفعل، جاري ترقيته إلى مشرف...');
                
                await User.updateOne(
                    { phone },
                    { 
                        $set: { 
                            role: 'moderator',
                            isActive: true
                        } 
                    }
                );

                console.log('✅ تم ترقية المستخدم إلى مشرف بنجاح');
                return true;
            }

            // إنشاء مستخدم جديد كمشرف
            const defaultPassword = '123456';
            const hashedPassword = await bcrypt.hash(defaultPassword, 12);
            
            const moderatorUser = new User({
                fullName: fullName || `مشرف ${phone}`,
                phone,
                university: 'المنصة التعليمية',
                major: 'إدارة المحتوى',
                batch: '2024',
                password: hashedPassword,
                role: 'moderator',
                email,
                isActive: true,
                stats: {
                    messagesSent: 0,
                    storiesPosted: 0,
                    channelsJoined: 0,
                    totalLikes: 0
                }
            });

            await moderatorUser.save();

            console.log('✅ تم إنشاء حساب المشرف بنجاح');
            console.log('📋 معلومات الحساب:');
            console.log(`   👤 الاسم: ${moderatorUser.fullName}`);
            console.log(`   📱 الهاتف: ${moderatorUser.phone}`);
            console.log(`   🔐 كلمة المرور: ${defaultPassword}`);
            console.log(`   🛡️ الدور: مشرف`);
            console.log(`   🟢 الحالة: نشط`);

            return true;

        } catch (error) {
            console.error('❌ خطأ في إنشاء حساب المشرف:', error);
            return false;
        }
    }
}

// التنفيذ الرئيسي
async function main() {
    const adminManager = new AdminManager();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'reset':
                await adminManager.resetAdminPassword();
                break;

            case 'create':
                await adminManager.createAdminAccount();
                break;

            case 'list':
                await adminManager.listAdmins();
                break;

            case 'moderator':
                const phone = process.argv[3];
                const name = process.argv[4];
                const email = process.argv[5] || '';
                
                if (!phone) {
                    console.error('❌ يرجى تحديد رقم الهاتف');
                    console.log('💡 الاستخدام: node scripts/reset-admin.js moderator <phone> "<name>" [email]');
                    process.exit(1);
                }
                
                await adminManager.createModerator(phone, name, email);
                break;

            default:
                console.log('🔧 أدوات إدارة حسابات المديرين');
                console.log('='.repeat(50));
                console.log('💡 الاستخدام:');
                console.log('  node scripts/reset-admin.js reset      - إعادة تعيين كلمة مرور المدير');
                console.log('  node scripts/reset-admin.js create     - إنشاء حساب مدير جديد');
                console.log('  node scripts/reset-admin.js list       - عرض قائمة المدراء');
                console.log('  node scripts/reset-admin.js moderator <phone> "<name>" [email] - إنشاء مشرف جديد');
                console.log('');
                console.log('🔐 بيانات المدير الافتراضية:');
                console.log('   📱 الهاتف: 500000000');
                console.log('   🔐 كلمة المرور: 77007700');
                break;
        }
    } catch (error) {
        console.error('❌ حدث خطأ:', error);
        process.exit(1);
    } finally {
        if (adminManager.connected) {
            await mongoose.connection.close();
            console.log('👋 تم إغلاق الاتصال بقاعدة البيانات');
        }
    }
}

// تشغيل البرنامج
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default AdminManager;
