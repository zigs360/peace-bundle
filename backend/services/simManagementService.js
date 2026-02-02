const { Sim, SystemSetting, User } = require('../models');
const ussdParserService = require('./ussdParserService');
const winston = require('winston');
const { sequelize } = require('../config/db');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'sim-management-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

class SimManagementService {
  /**
   * Add new SIM for user
   * @param {User} user
   * @param {object} data
   * @returns {Promise<Sim>}
   */
  async addSim(user, data) {
    // Validate phone number
    const phoneNumber = ussdParserService.formatPhoneNumber(data.phone_number);

    if (!ussdParserService.validatePhoneNumber(phoneNumber)) {
      throw new Error('Invalid phone number format');
    }

    // Auto-detect provider if not specified
    const provider = data.provider || ussdParserService.detectProvider(phoneNumber);

    if (!provider) {
      throw new Error('Could not detect network provider');
    }

    // Check for duplicate
    const existingSim = await Sim.findOne({ where: { phoneNumber: phoneNumber } });
    if (existingSim) {
      throw new Error('This SIM number is already registered');
    }

    // Create SIM
    const sim = await Sim.create({
      userId: user.id,
      phoneNumber: phoneNumber,
      provider: provider,
      type: data.type || 'device_based',
      lowBalanceThreshold: data.low_balance_threshold || 200,
      notes: data.notes || null,
      status: 'active',
    });

    // Auto-verify if enabled
    const setting = await SystemSetting.findOne({ where: { key: 'auto_verify_sim' } });
    const autoVerify = setting ? (setting.value === 'true' || setting.value === '1') : true;

    if (autoVerify) {
      await this.verifySim(sim);
    }

    return sim;
  }

  /**
   * Verify SIM (check if it's active)
   * @param {Sim} sim
   * @returns {Promise<boolean>}
   */
  async verifySim(sim) {
    try {
      // Here you would integrate with actual USSD checking
      // For now, we'll mark as verified
      await sim.update({
        isVerified: true,
        verifiedAt: new Date(),
      });

      // Check balance
      await this.checkBalance(sim);

      return true;
    } catch (error) {
      logger.error(`SIM verification failed for ${sim.phoneNumber}: ${error.message}`);
      return false;
    }
  }

  /**
   * Check SIM balance
   * @param {Sim} sim
   * @returns {Promise<number|null>}
   */
  async checkBalance(sim) {
    try {
      // Simulate USSD balance check
      // In production, this would connect to actual device/API
      const mockResponse = "Your balance is NGN 1,234.50";

      const balance = ussdParserService.parseBalance(sim.provider, mockResponse);

      if (balance !== null) {
        await sim.update({
          airtimeBalance: balance,
          lastBalanceCheck: new Date(),
        });

        // Check if low balance
        if (sim.isLowBalance()) {
          // In a real app, we might emit an event here
          logger.warn(`SIM ${sim.phoneNumber} balance is low: ${balance}`);
        }
      }

      return balance;
    } catch (error) {
      logger.error(`Balance check failed for ${sim.phoneNumber}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get optimal SIM for a transaction
   * @param {string} provider
   * @param {number} amount
   * @returns {Promise<Sim|null>}
   */
  async getOptimalSim(provider, amount) {
    // Find active SIMs for provider
    const sims = await Sim.findAll({
      where: {
        provider: provider,
        status: 'active'
      },
      order: [
        ['dailyDispenses', 'ASC'], // Load balancing
        ['updatedAt', 'ASC']
      ]
    });

    for (const sim of sims) {
      // Check limits
      // 1. Check if low balance
      if (sim.isLowBalance()) {
        continue;
      }

      // 2. Check if specific amount is covered
      if (amount && sim.airtimeBalance < amount) {
        continue;
      }

      // 3. Check daily limit (if any)
      // e.g., max 100 txns per day
      if (sim.dailyDispenses >= 100) { // Hardcoded limit for now, could be in settings
        continue;
      }
      
      return sim;
    }

    return null;
  }

  /**
   * Process data purchase transaction via SIM
   * @param {Sim} sim
   * @param {DataPlan} plan
   * @param {string} recipientPhone
   * @returns {Promise<Object>}
   */
  async processTransaction(sim, plan, recipientPhone) {
    try {
        if (!sim || !plan || !recipientPhone) {
            throw new Error('Missing transaction details');
        }

        // 1. Check if SIM can dispense
        if (!(await this.canDispense(sim))) {
            throw new Error('SIM daily limit reached or inactive');
        }

        // 2. Construct USSD code (Mock logic based on provider/plan)
        // In reality, this would be a lookup table or template
        // e.g. *131*...#
        // We'll simulate a successful USSD response
        const ussdCode = `*123*${plan.size_mb}*${recipientPhone}#`; 
        logger.info(`Sending USSD ${ussdCode} via SIM ${sim.phoneNumber}`);

        // 3. Simulate Network Delay
        // await new Promise(resolve => setTimeout(resolve, 500));

        // 4. Mock Success Response
        const success = true; 
        
        if (success) {
            // Update SIM stats
            await this.incrementDispense(sim);
            
            // Deduct balance from SIM (mock)
            // If plan has api_cost, we deduct it from sim balance to keep it in sync
            // Or assume USSD does it and we rely on periodic balance checks.
            // For better tracking, let's deduct.
            const cost = parseFloat(plan.api_cost || 0);
            if (cost > 0 && sim.airtimeBalance >= cost) {
                await sim.decrement('airtimeBalance', { by: cost });
            }

            return {
                success: true,
                reference: `SIM-${sim.id.substring(0,8)}-${Date.now()}`,
                message: 'Data sent successfully via SIM',
                sim_used: sim.phoneNumber
            };
        } else {
             throw new Error('Network failed to process request');
        }

    } catch (error) {
        logger.error(`SIM Transaction failed: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
  }

  /**
   * Update SIM balance from USSD response
   * @param {Sim} sim
   * @param {string} ussdResponse
   */
  async updateBalanceFromUSSD(sim, ussdResponse) {
    try {
      const balance = ussdParserService.parseBalance(sim.provider, ussdResponse);
      
      if (balance !== null) {
        await sim.update({
          airtimeBalance: balance,
          lastBalanceCheck: new Date()
        });
        
        // Check if low balance
        if (sim.isLowBalance()) {
           // Maybe notify admin?
           logger.warn(`SIM ${sim.phoneNumber} is low on balance: ${balance}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to update balance for SIM ${sim.phoneNumber}: ${error.message}`);
    }
  }

  /**
   * Increment SIM dispense count
   * @param {Sim} sim
   */
  async incrementDispense(sim) {
    await sim.incrementDispenses();
  }
  /**
   * Detect and handle banned SIM
   * @param {Sim} sim
   * @param {string} ussdResponse
   */
  async detectBannedSim(sim, ussdResponse) {
    if (ussdParserService.isBannedResponse(ussdResponse)) {
      await sim.update({
        status: 'banned',
        statusReason: 'Auto-detected: SIM appears to be banned by network',
      });
      
      // In a real app, emit event: event(new SimBanned(sim));
      logger.warn(`SIM ${sim.phoneNumber} detected as banned.`);
    }
  }

  /**
   * Bulk add SIMs from CSV/Array
   * @param {User} user
   * @param {Array} simsData
   * @returns {Promise<Object>}
   */
  async bulkAddSims(user, simsData) {
    const results = {
      success: 0,
      failed: 0,
      sims: [],
    };

    for (const simData of simsData) {
      try {
        const sim = await this.addSim(user, simData);
        results.success++;
        results.sims.push(sim);
      } catch (error) {
        results.failed++;
        results.sims.push({
          error: error.message,
          data: simData,
        });
      }
    }

    return results;
  }

  /**
   * Check if SIM can dispense (within daily limit)
   * @param {Sim} sim
   * @returns {Promise<boolean>}
   */
  async canDispense(sim) {
    await sim.resetDailyDispenses();

    // Get limit from settings or default to 100
    // In PHP: config('transaction_limits.reseller.sim_daily_limit', 100)
    // We'll use SystemSetting or default
    const setting = await SystemSetting.findOne({ where: { key: 'sim_daily_limit' } });
    const dailyLimit = setting ? parseInt(setting.value) : 100;

    return sim.dailyDispenses < dailyLimit && sim.status === 'active';
  }
}

module.exports = new SimManagementService();