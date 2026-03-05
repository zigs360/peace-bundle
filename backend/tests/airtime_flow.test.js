const { sequelize } = require('../config/database');
const { User, Wallet, Sim, Transaction } = require('../models');
const simManagementService = require('../services/simManagementService');
const walletService = require('../services/walletService');
const logger = require('../utils/logger');

/**
 * Integration Test for Airtime Purchase Flow
 * 
 * Scenarios:
 * 1. Success via Local SIM
 * 2. Fallback to API when SIM is unavailable
 * 3. Atomic failure (insufficient balance)
 */

async function runTests() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected for airtime flow testing.');

    // Setup Test User
    const [user] = await User.findOrCreate({
      where: { email: 'test_airtime@example.com' },
      defaults: {
        name: 'Test User',
        password: 'password123',
        phone: '08100000000',
        role: 'user'
      }
    });

    // Setup Wallet
    const [wallet] = await Wallet.findOrCreate({
      where: { userId: user.id },
      defaults: { balance: 1000 }
    });
    await wallet.update({ balance: 1000 });

    logger.info(`Test User ID: ${user.id}, Initial Balance: ${wallet.balance}`);

    // Scenario 1: Success via Local SIM
    logger.info('--- Scenario 1: Local SIM Success ---');
    const [sim] = await Sim.findOrCreate({
      where: { phoneNumber: '08111111111' },
      defaults: {
        userId: user.id,
        provider: 'mtn',
        status: 'active',
        type: 'device_based',
        airtimeBalance: 5000
      }
    });
    await sim.update({ status: 'active', airtimeBalance: 5000 });

    const amount = 100;
    const recipient = '08122222222';

    // Simulate the controller logic
    const t1 = await sequelize.transaction();
    try {
      // 1. Debit
      await walletService.debit(user, amount, 'airtime_purchase', 'Test Airtime', {}, t1);
      
      // 2. Process via SIM
      const optimalSim = await simManagementService.getOptimalSim('mtn', amount);
      if (!optimalSim || optimalSim.id !== sim.id) {
          throw new Error('SIM fallback failed: Optimal SIM not found');
      }

      const result = await simManagementService.processTransaction(optimalSim, { provider: 'mtn', amount }, recipient);
      if (!result.success) throw new Error(result.error);

      await t1.commit();
      logger.info('Scenario 1 Success: Wallet debited and SIM processed.');
    } catch (e) {
      await t1.rollback();
      logger.error('Scenario 1 Failed:', e.message);
    }

    // Scenario 2: Insufficient Balance (Atomic Rollback)
    logger.info('--- Scenario 2: Insufficient Balance ---');
    await wallet.update({ balance: 50 }); // Less than 100
    
    const t2 = await sequelize.transaction();
    try {
        await walletService.debit(user, 100, 'airtime_purchase', 'Test Airtime', {}, t2);
        await t2.commit();
        logger.error('Scenario 2 Failed: Debit should have failed');
    } catch (e) {
        await t2.rollback();
        logger.info('Scenario 2 Success: Transaction rolled back due to insufficient balance.');
    }

    // Final Cleanup (Optional)
    // await user.destroy(); 
    
    logger.info('Tests completed.');
  } catch (error) {
    logger.error('Test Runner Failed:', error);
  } finally {
    await sequelize.close();
  }
}

runTests();
