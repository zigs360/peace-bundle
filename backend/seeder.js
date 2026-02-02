const { sequelize, connectDB } = require('./config/db');
const User = require('./models/User');
const Role = require('./models/Role');
const Permission = require('./models/Permission');
const SystemSetting = require('./models/SystemSetting');
const DataPlan = require('./models/DataPlan'); // Assuming this model exists
const bcrypt = require('bcryptjs');

const seedDatabase = async () => {
    try {
        await connectDB();
        // await sequelize.authenticate(); // connectDB does this
        // console.log('Database connected...');
        // await sequelize.sync(); // connectDB does this

        // 1. Seed Admin User (Peace Bundle Default)
        const adminEmail = 'admin@peacebundle.com';
        const adminExists = await User.findOne({ where: { email: adminEmail } });

        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);
            
            await User.create({
                name: 'Super Admin',
                email: adminEmail,
                phone: '08000000000',
                password: hashedPassword,
                role: 'admin',
                email_verified_at: new Date(),
                phone_verified_at: new Date(),
                account_status: 'active'
            });
            console.log('Default Admin user seeded.');
        } else {
            console.log('Default Admin user already exists.');
        }

        // 1b. Seed Requested Test Admin (admin@vtuapp.com)
        const testAdminEmail = 'admin@vtuapp.com';
        const testAdminExists = await User.findOne({ where: { email: testAdminEmail } });

        if (!testAdminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('password123', salt);
            
            await User.create({
                name: 'Test Admin',
                email: testAdminEmail,
                phone: '08000000001',
                password: hashedPassword,
                role: 'admin',
                email_verified_at: new Date(),
                phone_verified_at: new Date(),
                account_status: 'active'
            });
            console.log('Test Admin user (vtuapp) seeded.');
        } else {
            console.log('Test Admin user (vtuapp) already exists.');
        }

        // 2. Seed System Settings
        const defaultSettings = [
            { key: 'site_name', value: 'Peace Bundle', type: 'string', group: 'general' },
            { key: 'currency_symbol', value: 'N', type: 'string', group: 'general' },
            { key: 'support_email', value: 'support@peacebundle.com', type: 'string', group: 'contact' },
            { key: 'support_phone', value: '+2348000000000', type: 'string', group: 'contact' },
            { key: 'paystack_secret_key', value: '', type: 'string', group: 'api' },
            { key: 'monnify_api_key', value: '', type: 'string', group: 'api' },
            { key: 'smeplug_api_key', value: '', type: 'string', group: 'api' },
        ];

        for (const setting of defaultSettings) {
            await SystemSetting.findOrCreate({
                where: { key: setting.key },
                defaults: setting
            });
        }
        console.log('System settings seeded.');

        // 3. Seed Data Plans (Sample)
        const samplePlans = [
            { network: 'MTN', plan_type: 'SME', name: '1GB SME', amount: 250, size: '1GB', validity: '30 Days', plan_id: 'MTN_1GB' },
            { network: 'AIRTEL', plan_type: 'CG', name: '1GB CG', amount: 260, size: '1GB', validity: '30 Days', plan_id: 'AIRTEL_1GB' },
            { network: 'GLO', plan_type: 'GIFTING', name: '1GB Gifting', amount: 270, size: '1GB', validity: '30 Days', plan_id: 'GLO_1GB' },
        ];

        // Check if DataPlan model exists before seeding
        if (DataPlan) {
            const planCount = await DataPlan.count();
            if (planCount === 0) {
                await DataPlan.bulkCreate(samplePlans);
                console.log('Sample data plans seeded.');
            } else {
                console.log('Data plans already exist.');
            }
        }

        // 4. Seed Roles and Permissions
        const roles = ['admin', 'reseller', 'user'];
        const permissions = [
            'manage users',
            'manage settings',
            'manage plans',
            'view dashboard',
            'manage transactions'
        ];

        // Create Permissions
        for (const permName of permissions) {
            await Permission.findOrCreate({ where: { name: permName } });
        }
        console.log('Permissions seeded.');

        // Create Roles and Assign Permissions
        for (const roleName of roles) {
            const [role] = await Role.findOrCreate({ where: { name: roleName } });
            
            if (roleName === 'admin') {
                const allPermissions = await Permission.findAll();
                await role.setPermissions(allPermissions);
            }
        }
        console.log('Roles seeded.');

        // Assign Admin Role to Admin Users
        const admins = [adminEmail, testAdminEmail];
        const adminRole = await Role.findOne({ where: { name: 'admin' } });
        
        if (adminRole) {
            for (const email of admins) {
                const user = await User.findOne({ where: { email } });
                if (user) {
                    const userRoles = await user.getRoles();
                    const hasRole = userRoles.some(r => r.name === 'admin');
                    if (!hasRole) {
                        await user.addRole(adminRole);
                        console.log(`Admin role assigned to ${email}.`);
                    }
                }
            }
        }

        console.log('Seeding completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seedDatabase();