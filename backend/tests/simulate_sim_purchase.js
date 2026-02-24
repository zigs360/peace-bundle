const { sequelize } = require('../config/db');
const { User, Wallet, DataPlan, Sim, Transaction } = require('../models');
const smeplugService = require('../services/smeplugService');
const transactionController = require('../controllers/transactionController');
const simManagementService = require('../services/simManagementService');

// Mock Request/Response
const req = {
    user: { id: null }, // Will be set dynamically
    body: {
        network: 'mtn',
        planId: 1, // Will be set dynamically
        phone: '08012345678',
        amount: 0, 
        planName: 'Test Plan'
    }
};

const res = {
    json: (data) => console.log('Response JSON:', JSON.stringify(data, null, 2)),
    status: (code) => {
        console.log('Response Status:', code);
        return { json: (data) => console.log('Response JSON:', JSON.stringify(data, null, 2)) };
    }
};

async function runTest() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Setup Data
        // Find existing admin user
        let user = await User.findOne({ where: { email: 'admin@peacebundlle.com' } });
        
        if (!user) {
             console.log('Admin user not found, creating test user...');
             user = await User.create({
                 name: 'Al-Amin',
                 email: `al-amin_${Date.now()}@example.com`,
                 password: 'hashedpassword',
                 phone: '08011111111',
                 role: 'admin'
             });
        }
        console.log(`Using User: ${user.id} (${user.email})`);
        req.user.id = user.id;

        // Ensure Wallet Balance
        let wallet = await Wallet.findOne({ where: { userId: user.id } });
        if (!wallet) {
            wallet = await Wallet.create({ userId: user.id, balance: 50000 });
        } else if (wallet.balance < 5000) {
            wallet.balance = 50000;
            await wallet.save();
        }
        console.log(`Wallet Balance: ${wallet.balance}`);

        // Ensure Plan
        let plan = await DataPlan.findOne({ where: { provider: 'mtn' } });
        if (!plan) {
            plan = await DataPlan.create({
                provider: 'mtn',
                category: 'sme',
                name: '1GB Test',
                size: '1GB',
                size_mb: 1024,
                validity: '30 Days',
                admin_price: 250,
                api_cost: 200,
                is_active: true,
                smeplug_plan_id: 'MTN_1GB'
            });
        }
        req.body.planId = plan.id;
        req.body.network = plan.provider;
        console.log(`Using Plan: ${plan.name} (ID: ${plan.id})`);

        // Ensure SIM
        let sim = await Sim.findOne({ where: { provider: 'mtn', type: 'device_based' } });
        if (!sim) {
            sim = await Sim.create({
                userId: user.id, 
                provider: 'mtn',
                phoneNumber: '08099999999',
                status: 'active',
                type: 'device_based',
                airtimeBalance: 5000
            });
        } else {
            // Ensure it's active and has balance
            sim.status = 'active';
            if (sim.airtimeBalance < 500) {
                sim.airtimeBalance = 5000;
            }
            await sim.save();
        }
        console.log(`Using SIM: ${sim.phoneNumber} (ID: ${sim.id})`);

        // 2. Mock SMEPlug Service
        // We overwrite the method on the exported instance
        smeplugService.purchaseData = async (payload) => {
            console.log('>>> MOCK SMEPlug purchaseData called with:', payload);
            return {
                success: true,
                data: {
                    reference: 'MOCK-REF-' + Date.now(),
                    status: 'success'
                }
            };
        };

        // 3. Execute Controller Action
        console.log('Executing buyData...');
        await transactionController.buyData(req, res);

        // 4. Verify Database State
        const transaction = await Transaction.findOne({
            order: [['createdAt', 'DESC']],
            where: { userId: user.id }
        });

        if (transaction) {
            console.log('Latest Transaction:', transaction.toJSON());
            
            if (transaction.smeplug_reference && transaction.smeplug_reference.startsWith('MOCK-REF')) {
                console.log('SUCCESS: Transaction used the Mock SMEPlug service via SIM routing!');
            } else {
                console.log('FAILURE: Transaction did not contain expected mock reference.');
            }
        } else {
            console.log('FAILURE: No transaction created.');
        }

        const updatedSim = await Sim.findByPk(sim.id);
        console.log(`SIM Dispenses: ${updatedSim.total_dispenses}`);

    } catch (error) {
        console.error('Test Failed:', error);
    }
}

runTest();