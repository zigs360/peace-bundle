const { Sim, SystemSetting, User } = require('../models');
const ussdParserService = require('./ussdParserService');
const smeplugService = require('./smeplugService');
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
   * Check SIM balance with retry mechanism, logging, and caching
   * @param {Sim} sim
   * @param {number} retries
   * @param {boolean} force - Force a fresh check even if cached
   * @returns {Promise<number|null>}
   */
  async checkBalance(sim, retries = 3, force = false) {
    // 1. Caching Mechanism: Skip if checked within the last 5 minutes
    const CACHE_MINUTES = 5;
    if (!force && sim.lastBalanceCheck) {
      const now = new Date();
      const lastCheck = new Date(sim.lastBalanceCheck);
      const diffMinutes = (now.getTime() - lastCheck.getTime()) / (1000 * 60);
      
      if (diffMinutes < CACHE_MINUTES) {
        logger.info(`Using cached balance for SIM ${sim.phoneNumber} (Checked ${Math.round(diffMinutes)} mins ago)`);
        return parseFloat(sim.airtimeBalance);
      }
    }

    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
      try {
        logger.info(`Checking balance for SIM ${sim.phoneNumber} (Attempt ${attempt + 1}/${retries})`);
        
        // In production, this would call a real USSD API or hardware bridge
        // For now, we simulate a network call that might fail
        if (process.env.NODE_ENV !== 'test' && Math.random() < 0.1) {
          throw new Error('Network timeout during USSD execution');
        }

        const mockResponse = `Your balance is NGN ${Math.floor(Math.random() * 5000) + 500}.50`;
        const balance = ussdParserService.parseBalance(sim.provider, mockResponse);

        if (balance !== null) {
          await sim.update({
            airtimeBalance: balance,
            lastBalanceCheck: new Date(),
          });

          logger.info(`Balance updated for SIM ${sim.phoneNumber}: ₦${balance}`);
          
          if (sim.isLowBalance()) {
            logger.warn(`SIM ${sim.phoneNumber} balance is low: ₦${balance}`);
          }

          return balance;
        }
        
        throw new Error('Could not parse balance from USSD response');
      } catch (error) {
        attempt++;
        lastError = error;
        logger.error(`Balance check attempt ${attempt} failed for ${sim.phoneNumber}: ${error.message}`);
        
        if (attempt < retries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
      }
    }

    logger.error(`All ${retries} balance check attempts failed for ${sim.phoneNumber}. Final error: ${lastError.message}`);
    return null;
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

        let success = false;
        let response = null;
        let reference = null;

        // 2. Determine execution method based on SIM type
        if (sim.type === 'sim_system' || sim.type === 'device_based') {
            // Use SMEPlug API for hosted SIMs
            // Map our plan to SMEPlug plan ID (use smeplug_plan_id or fallback to plan.id)
            const smeplugPlanId = plan.smeplug_plan_id || plan.id;
            const networkId = smeplugService.getNetworkId(plan.provider);

            logger.info(`Processing transaction via SMEPlug SIM ${sim.phoneNumber} for ${recipientPhone}`);

            const result = await smeplugService.purchaseData({
                network_id: networkId,
                plan_id: smeplugPlanId,
                phone: recipientPhone,
                mode: 'device_based', // Force device_based mode
                sim_number: sim.phoneNumber // Specify the SIM to use
            });

            if (result.success) {
                success = true;
                response = result.data;
                reference = result.data?.reference;
                
                // Update local balance estimate if possible
                // (Optional: depending on API response structure)
            } else {
                throw new Error(result.error || 'SMEPlug SIM transaction failed');
            }

        } else {
            // Legacy/Mock local USSD execution (for testing or direct hardware integration)
            // ... existing mock logic ...
            const ussdCode = `*123*${plan.size_mb}*${recipientPhone}#`; 
            logger.info(`Sending USSD ${ussdCode} via SIM ${sim.phoneNumber}`);
            
            // Mock Success
            success = true;
            reference = `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            response = { message: 'USSD Sent successfully (Mock)' };
        }
        
        if (success) {
            // Update SIM stats
            await this.incrementDispense(sim);
            
            // Decrement local balance estimate (optional, but good for "automatic deduction" tracking)
            if (plan.api_cost) {
                await sim.decrement('airtimeBalance', { by: plan.api_cost });
            }

            return {
                success: true,
                reference: reference,
                details: response
            };
        } else {
            throw new Error('Transaction failed');
        }

    } catch (error) {
        logger.error(`Transaction processing failed for SIM ${sim.phoneNumber}: ${error.message}`);
        
        // Record failure
        await sim.increment('failedDispenses');
        
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
   * Connect SIM and automatically trigger balance check
   * @param {Sim} sim
   * @returns {Promise<Sim>}
   */
  async connectSim(sim) {
    if (sim.connectionStatus === 'connected') {
      throw new Error('SIM is already connected');
    }

    // Real-time validation: Ensure it's active
    if (sim.status !== 'active') {
      throw new Error('Cannot connect an inactive or banned SIM');
    }

    await sim.update({
      connectionStatus: 'connected',
      lastConnectedAt: new Date(),
    });

    logger.info(`SIM ${sim.phoneNumber} connected. Triggering automatic balance check...`);
    
    // Trigger balance check asynchronously to not block the connection response
    // but ensure it's logged and handled
    this.checkBalance(sim).catch(err => {
      logger.error(`Automatic balance check failed after connection for SIM ${sim.phoneNumber}: ${err.message}`);
    });

    return sim;
  }

  /**
   * Disconnect SIM
   * @param {Sim} sim
   * @returns {Promise<Sim>}
   */
  async disconnectSim(sim) {
    if (sim.connectionStatus === 'disconnected') {
      throw new Error('SIM is already disconnected');
    }

    await sim.update({
      connectionStatus: 'disconnected',
    });

    logger.info(`SIM ${sim.phoneNumber} disconnected`);
    return sim;
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