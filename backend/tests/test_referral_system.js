process.env.NODE_ENV = 'test';
const { sequelize } = require('../config/database');
require('../config/db'); // Load associations
const { User, Wallet, Transaction } = require('../models');
const referralService = require('../services/referralService');

async function runReferralTest() {
    try {
        await sequelize.sync({ force: true });
        console.log('Database synced (SQLite Memory).');

        // 1. Create Referrer
        const referrer = await User.create({
            name: 'Referrer User',
            email: 'referrer@example.com',
            phone: '08011111111',
            password: 'password123',
            role: 'user',
            referral_code: 'REF1234'
        });
        console.log(`Created Referrer: ${referrer.name} (Code: ${referrer.referral_code})`);

        // 2. Test Code Generation
        console.log('\n--- Testing Code Generation ---');
        const newCode = await referralService.generateUniqueCode('New User');
        console.log(`Generated Unique Code: ${newCode}`);
        if (newCode && newCode.length >= 7) {
            console.log('SUCCESS: Referral code generated correctly.');
        }

        // 3. Test Code Validation (Optional)
        console.log('\n--- Testing Code Validation ---');
        const validCodeUser = await referralService.validateCode('REF1234');
        const invalidCodeUser = await referralService.validateCode('INVALID');
        
        if (validCodeUser && validCodeUser.referral_code === 'REF1234') {
            console.log('SUCCESS: Valid code recognized.');
        }
        if (invalidCodeUser === null) {
            console.log('SUCCESS: Invalid code returns null (handled as optional).');
        }

        // 4. Test Referral Tracking and Rewards
        console.log('\n--- Testing Referral Rewards ---');
        const referredUser = await User.create({
            name: 'Referred User',
            email: 'referred@example.com',
            phone: '08022222222',
            password: 'password123',
            role: 'user',
            referred_by: 'REF1234'
        });

        await referralService.trackReferral(referrer, referredUser);
        
        // Verify Referrer's Wallet
        const updatedWallet = await Wallet.findOne({ where: { userId: referrer.id } });
        console.log(`Referrer Bonus Balance: ₦${updatedWallet.bonus_balance}`);
        
        if (parseFloat(updatedWallet.bonus_balance) === 100.00) {
            console.log('SUCCESS: Referrer credited with ₦100 bonus.');
        }

        // Verify Transaction Log
        const transaction = await Transaction.findOne({ where: { userId: referrer.id, source: 'bonus' } });
        if (transaction && transaction.amount === '100.00') {
            console.log('SUCCESS: Transaction log created for bonus.');
            console.log(`Transaction Ref: ${transaction.reference}`);
        }

        console.log('\nAll referral system tests completed.');
        process.exit(0);

    } catch (error) {
        console.error('Referral Test Failed:', error);
        process.exit(1);
    }
}

runReferralTest();
