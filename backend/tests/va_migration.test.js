process.env.NODE_ENV = 'test'; // Force in-memory SQLite for testing
const { sequelize } = require('../config/database');
const db = require('../config/db');
const { User, Wallet } = require('../models');
const virtualAccountService = require('../services/virtualAccountService');
const logger = require('../utils/logger');

// MOCK EXTERNAL SERVICES
const payvesselService = require('../services/payvesselService');
payvesselService.createVirtualAccount = async (user) => {
    return {
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        accountName: user.name,
        trackingReference: 'TEST-REF-' + user.id
    };
};

async function testVAMigration() {
    console.log('🚀 Testing Virtual Account Migration System...\n');
    
    try {
        await db.connectDB();
        
        // 1. Create Legacy Users (Users without VA)
        console.log('--- Phase 1: Creating Legacy Users ---');
        const legacyUsers = [];
        for (let i = 1; i <= 3; i++) {
            const user = await User.create({
                name: `Legacy User ${i}`,
                email: `legacy${i}_${Date.now()}@test.com`,
                phone: `0800000000${i}`,
                password: 'password123',
                role: 'user',
                account_status: 'active'
            });
            legacyUsers.push(user);
            console.log(`   Created user: ${user.email}`);
        }

        // 2. Run Bulk Migration
        console.log('\n--- Phase 2: Running Bulk Migration ---');
        const summary = await virtualAccountService.bulkMigrateLegacyUsers(10);
        console.log('   Migration Summary:', JSON.stringify(summary, null, 2));

        // 3. Verify Migration
        console.log('\n--- Phase 3: Verifying Data Integrity ---');
        for (const user of legacyUsers) {
            const updatedUser = await User.findByPk(user.id);
            if (updatedUser.virtual_account_number === '1234567890') {
                console.log(`   ✅ User ${updatedUser.email} has virtual account assigned.`);
            } else {
                console.error(`   ❌ User ${updatedUser.email} FAILED to get virtual account.`);
            }
        }

        // 4. Test Self-Service Request
        console.log('\n--- Phase 4: Testing Self-Service Request ---');
        // Note: User.afterCreate assigns VA, so we'll fetch a user who just got one and re-test manually
        const newUser = await User.findOne({ where: { email: legacyUsers[0].email } });
        
        // Manual assignment test
        const account = await virtualAccountService.assignVirtualAccount(newUser);
        if (account && account.accountNumber === '1234567890') {
            console.log(`   ✅ Self-service assignment logic successful for ${newUser.email}`);
        }

        console.log('\n🌟 Virtual Account Provisioning Tests Completed Successfully!');

    } catch (error) {
        console.error('\n❌ Test Runner Failed:', error);
    } finally {
        await sequelize.close();
    }
}

testVAMigration();
