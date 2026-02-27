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

        // 2. Test Connection
        console.log('\n--- Testing Connection ---');
        await simManagementService.connectSim(sim);
        await sim.reload();
        console.log(`SIM Connection Status: ${sim.connectionStatus}`);
        if (sim.connectionStatus === 'connected') {
            console.log('SUCCESS: SIM connected successfully.');
        } else {
            console.log('FAILURE: SIM connection status not updated.');
        }

        // 3. Test Duplicate Connection (Should fail)
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
