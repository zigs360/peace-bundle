process.env.NODE_ENV = 'test';
const { sequelize } = require('../config/database');
const { User, Sim } = require('../models');
const simManagementService = require('../services/simManagementService');

async function runTest() {
    try {
        await sequelize.sync({ force: true });
        console.log('Database synced (SQLite Memory).');

        // 1. Setup Test Data
        let user = await User.findOne({ where: { role: 'admin' } });
        if (!user) {
            user = await User.create({
                name: 'Test Admin',
                email: `test_admin_${Date.now()}@example.com`,
                password: 'password123',
                phone: '08011111111',
                role: 'admin'
            });
        }
        console.log(`Using User: ${user.id} (${user.email})`);

        let sim = await Sim.findOne({ where: { phoneNumber: '08000000001' } });
        if (!sim) {
            sim = await Sim.create({
                userId: user.id,
                phoneNumber: '08000000001',
                provider: 'mtn',
                status: 'active',
                connectionStatus: 'disconnected'
            });
        } else {
            sim.status = 'active';
            sim.connectionStatus = 'disconnected';
            await sim.save();
        }
        console.log(`Using SIM: ${sim.phoneNumber} (ID: ${sim.id})`);

        // 2. Test Connection and Auto Balance Check
        console.log('\n--- Testing Connection & Auto Balance ---');
        await simManagementService.connectSim(sim);
        await sim.reload();
        console.log(`SIM Connection Status: ${sim.connectionStatus}`);
        
        // Wait briefly for the async balance check to complete
        console.log('Waiting for automatic balance check...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await sim.reload();
        
        console.log(`SIM Airtime Balance: ₦${sim.airtimeBalance}`);
        console.log(`Last Balance Check: ${sim.lastBalanceCheck}`);

        if (sim.connectionStatus === 'connected' && sim.lastBalanceCheck) {
            console.log('SUCCESS: SIM connected and balance retrieved automatically.');
        } else {
            console.log('FAILURE: SIM connection or auto-balance failed.');
        }

        // 3. Test Caching (Should use existing balance without network call)
        console.log('\n--- Testing Balance Caching ---');
        const firstCheck = sim.lastBalanceCheck;
        await simManagementService.checkBalance(sim);
        await sim.reload();
        if (sim.lastBalanceCheck.getTime() === firstCheck.getTime()) {
            console.log('SUCCESS: Caching mechanism prevented redundant USSD call.');
        } else {
            console.log('FAILURE: Caching mechanism failed.');
        }

        // 4. Test Force Refresh (Should update balance)
        console.log('\n--- Testing Force Refresh ---');
        await simManagementService.checkBalance(sim, 3, true);
        await sim.reload();
        if (sim.lastBalanceCheck.getTime() > firstCheck.getTime()) {
            console.log('SUCCESS: Force refresh bypassed cache successfully.');
        } else {
            console.log('FAILURE: Force refresh did not update balance.');
        }

        // 5. Test Duplicate Connection (Should fail)
        console.log('\n--- Testing Duplicate Connection ---');
        try {
            await simManagementService.connectSim(sim);
            console.log('FAILURE: Duplicate connection did not throw error.');
        } catch (error) {
            console.log(`SUCCESS: Caught expected error: ${error.message}`);
        }

        // 4. Test Disconnection
        console.log('\n--- Testing Disconnection ---');
        await simManagementService.disconnectSim(sim);
        await sim.reload();
        console.log(`SIM Connection Status: ${sim.connectionStatus}`);
        if (sim.connectionStatus === 'disconnected') {
            console.log('SUCCESS: SIM disconnected successfully.');
        } else {
            console.log('FAILURE: SIM disconnection status not updated.');
        }

        // 5. Test Inactive SIM Connection (Should fail)
        console.log('\n--- Testing Inactive SIM Connection ---');
        sim.status = 'paused';
        await sim.save();
        try {
            await simManagementService.connectSim(sim);
            console.log('FAILURE: Connection of inactive SIM did not throw error.');
        } catch (error) {
            console.log(`SUCCESS: Caught expected error: ${error.message}`);
        }

        console.log('\nAll SIM connection tests completed.');
        process.exit(0);

    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
}

runTest();
