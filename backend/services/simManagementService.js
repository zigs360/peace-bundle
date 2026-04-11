const { Sim, SystemSetting, User } = require('../models');
const sequelize = require('../config/database');
const ussdParserService = require('./ussdParserService');
const smeplugService = require('./smeplugService');
const ogdamsService = require('./ogdamsService');
const logger = require('../utils/logger');

class SimManagementService {
  /**
   * Sync SIMs from Smeplug API
   * @returns {Promise<Object>}
   */
  async syncSmeplugSims() {
    try {
      logger.info('Syncing SIMs from Smeplug API...');
      const result = await smeplugService.getLinkedDevices();

      if (!result.success || (result.data && result.data.status === 'error')) {
        const errorMsg = result.error || (result.data ? result.data.message : 'Failed to fetch devices from Smeplug');
        throw new Error(errorMsg);
      }

      // Handle different response structures from Smeplug
      let devices = [];
      if (Array.isArray(result.data)) {
        devices = result.data;
      } else if (result.data && Array.isArray(result.data.data)) {
        devices = result.data.data;
      } else if (result.data && Array.isArray(result.data.devices)) {
        devices = result.data.devices;
      } else if (result.data && result.data.data && Array.isArray(result.data.data.devices)) {
        devices = result.data.data.devices;
      }

      console.log(`Syncing ${devices.length} devices from Smeplug. Structure:`, JSON.stringify(result.data).substring(0, 200));

      const syncResults = {
        total: devices.length,
        created: 0,
        updated: 0,
        failed: 0,
        errors: []
      };

      // Find a default admin user to associate these SIMs with
      const adminUser = await User.findOne({ where: { role: 'admin' } });
      if (!adminUser) {
        throw new Error('No admin user found to associate Smeplug SIMs with');
      }

      for (const device of devices) {
        try {
          // Check for phone number in different fields
          const rawPhone = device.phone_number || device.phone || device.phoneNumber;
          if (!rawPhone) {
            throw new Error(`Device missing phone number field. Fields: ${Object.keys(device).join(', ')}`);
          }

          const phoneNumber = ussdParserService.formatPhoneNumber(rawPhone);
          const provider = ussdParserService.detectProvider(phoneNumber);

          // Find existing SIM by phone number
          let sim = await Sim.findOne({ where: { phoneNumber: phoneNumber } });

          if (sim) {
            // Update existing SIM
            await sim.update({
              provider: provider || sim.provider,
              airtimeBalance: device.airtime_balance || sim.airtimeBalance,
              dataBalanceMb: device.data_balance_mb || sim.dataBalanceMb,
              connectionStatus: device.status === 'online' ? 'connected' : 'disconnected',
              status: device.is_active ? 'active' : 'paused',
              lastConnectedAt: device.last_seen ? new Date(device.last_seen) : sim.lastConnectedAt,
              signalStrength: device.signal_strength || device.signal,
              networkInfo: device.network_type || device.network,
              deviceId: device.device_id || device.id,
              imei: device.imei,
              batteryLevel: device.battery_level || device.battery,
              type: 'sim_system', // Mark as Smeplug system SIM
              ogdamsLinked: false,
              lastBalanceCheck: new Date()
            });
            syncResults.updated++;
          } else {
            // Create new SIM
            await Sim.create({
              userId: adminUser.id,
              phoneNumber: phoneNumber,
              provider: provider || 'mtn', // Default to MTN if undetected
              type: 'sim_system',
              ogdamsLinked: false,
              airtimeBalance: device.airtime_balance || 0,
              dataBalanceMb: device.data_balance_mb || 0,
              connectionStatus: device.status === 'online' ? 'connected' : 'disconnected',
              status: device.is_active ? 'active' : 'paused',
              lastConnectedAt: device.last_seen ? new Date(device.last_seen) : null,
              signalStrength: device.signal_strength || device.signal,
              networkInfo: device.network_type || device.network,
              deviceId: device.device_id || device.id,
              imei: device.imei,
              batteryLevel: device.battery_level || device.battery,
              isVerified: true,
              verifiedAt: new Date(),
              lastBalanceCheck: new Date()
            });
            syncResults.created++;
          }
        } catch (deviceError) {
          syncResults.failed++;
          syncResults.errors.push({
            device: device.phone_number,
            error: deviceError.message
          });
          logger.error(`Failed to sync Smeplug device ${device.phone_number}: ${deviceError.message}`);
        }
      }

      logger.info(`Smeplug SIM sync completed: ${syncResults.created} created, ${syncResults.updated} updated`);
      return syncResults;

    } catch (error) {
      logger.error(`Smeplug SIM sync failed: ${error.message}`, { stack: error.stack });
      // Rethrow with more context if it's a known error
      if (error.message.includes('Smeplug')) {
        throw error;
      }
      throw new Error(`SIM Sync Error: ${error.message}`);
    }
  }

  /**
   * Add new SIM for user
   * @param {User} user
   * @param {object} data
   * @returns {Promise<Sim>}
   */
  async addSim(user, data) {
    logger.info(`Processing addSim request for user ${user.id}`, { phone: data.phone_number, provider: data.provider });
    
    // Validate phone number
    const phoneNumber = ussdParserService.formatPhoneNumber(data.phone_number);
    logger.debug(`Formatted phone number: ${phoneNumber}`);

    if (!ussdParserService.validatePhoneNumber(phoneNumber)) {
      logger.warn(`Invalid phone number format: ${phoneNumber}`);
      throw new Error('Invalid phone number format. Please use a valid Nigerian number.');
    }

    // Auto-detect provider if not specified
    let provider = data.provider;
    if (!provider || provider === '') {
        provider = ussdParserService.detectProvider(phoneNumber);
        logger.debug(`Detected provider: ${provider}`);
    }

    if (!provider) {
      logger.warn(`Could not detect network provider for: ${phoneNumber}`);
      throw new Error('Could not detect network provider. Please select it manually.');
    }

    // Check for duplicate
    const existingSim = await Sim.findOne({ where: { phoneNumber: phoneNumber } });
    if (existingSim) {
      logger.warn(`SIM number already registered: ${phoneNumber}`);
      throw new Error(`This SIM number (${phoneNumber}) is already registered in the system.`);
    }

    // Create SIM
    try {
        const sim = await Sim.create({
            userId: user.id,
            phoneNumber: phoneNumber,
            provider: provider,
            type: data.type || 'device_based',
            lowBalanceThreshold: data.low_balance_threshold || 200,
            notes: data.notes || null,
            status: 'active',
            connectionStatus: 'disconnected'
        });
        
        logger.info(`SIM successfully registered: ${sim.id} (${phoneNumber})`);

        // Auto-verify if enabled
        const setting = await SystemSetting.findOne({ where: { key: 'auto_verify_sim' } });
        const autoVerify = setting ? (setting.value === 'true' || setting.value === '1') : true;

        if (autoVerify) {
          await this.verifySim(sim);
        }

        return sim;
    } catch (createError) {
         if (createError.name === 'SequelizeUniqueConstraintError') {
             throw new Error(`The phone number ${phoneNumber} is already in use by another SIM.`);
         }
         logger.error('Database error creating SIM:', createError);
         throw new Error('Database error while saving SIM. Please contact support.');
     }
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
    const CACHE_MINUTES = 5;
    if (!force && sim.lastBalanceCheck) {
      const now = new Date();
      const lastCheck = new Date(sim.lastBalanceCheck);
      const diffMinutes = (now.getTime() - lastCheck.getTime()) / (1000 * 60);
      if (diffMinutes < CACHE_MINUTES) {
        logger.info(`Using cached balance for SIM ${sim.phoneNumber} (Checked ${Math.round(diffMinutes)} mins ago)`);
        return sim.airtimeBalance !== null ? parseFloat(String(sim.airtimeBalance)) : null;
      }
    }

    if (sim.type === 'sim_system') {
      let attempt = 0;
      let lastError = null;
      while (attempt < retries) {
        try {
          logger.info(`Checking SMEPlug device balance for SIM ${sim.phoneNumber} (Attempt ${attempt + 1}/${retries})`);
          const result = await smeplugService.getLinkedDevices();
          if (!result.success) throw new Error(result.error || 'Failed to fetch devices from SMEPlug');

          const data = result.data;
          let devices = [];
          if (Array.isArray(data)) devices = data;
          else if (data && Array.isArray(data.data)) devices = data.data;
          else if (data && Array.isArray(data.devices)) devices = data.devices;
          else if (data && data.data && Array.isArray(data.data.devices)) devices = data.data.devices;

          const formatted = ussdParserService.formatPhoneNumber(sim.phoneNumber);
          const device = devices.find((d) => {
            const raw = d.phone_number || d.phone || d.phoneNumber;
            if (!raw) return false;
            return ussdParserService.formatPhoneNumber(raw) === formatted;
          });
          if (!device) throw new Error('Device not found in SMEPlug device list');

          const balance = device.airtime_balance !== undefined ? parseFloat(String(device.airtime_balance)) : null;
          const dataMb = device.data_balance_mb !== undefined ? parseFloat(String(device.data_balance_mb)) : null;
          const conn = device.status === 'online' ? 'connected' : 'disconnected';
          const status = device.is_active ? 'active' : 'paused';

          await sim.update({
            airtimeBalance: Number.isFinite(balance) ? balance : sim.airtimeBalance,
            dataBalanceMb: Number.isFinite(dataMb) ? dataMb : sim.dataBalanceMb,
            connectionStatus: conn,
            status,
            lastConnectedAt: device.last_seen ? new Date(device.last_seen) : sim.lastConnectedAt,
            signalStrength: device.signal_strength || device.signal || sim.signalStrength,
            networkInfo: device.network_type || device.network || sim.networkInfo,
            deviceId: device.device_id || device.id || sim.deviceId,
            imei: device.imei || sim.imei,
            batteryLevel: device.battery_level || device.battery || sim.batteryLevel,
            lastBalanceCheck: new Date(),
          });

          const out = sim.airtimeBalance !== null ? parseFloat(String(sim.airtimeBalance)) : null;
          if (out !== null && sim.isLowBalance()) {
            logger.warn(`SIM ${sim.phoneNumber} balance is low: ₦${out}`);
          }
          return out;
        } catch (error) {
          attempt++;
          lastError = error;
          logger.error(`Balance check attempt ${attempt} failed for ${sim.phoneNumber}: ${error.message}`);
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
          }
        }
      }

      logger.error(`All ${retries} SMEPlug balance check attempts failed for ${sim.phoneNumber}. Final error: ${lastError.message}`);
      return null;
    }

    await sim.update({ lastBalanceCheck: new Date() });
    return sim.airtimeBalance !== null ? parseFloat(String(sim.airtimeBalance)) : null;
  }

  /**
   * Get optimal SIM for a transaction
   * @param {string} provider
   * @param {number} amount
   * @returns {Promise<Sim|null>}
   */
  async getOptimalSim(provider, amount) {
    const preference = String(process.env.SIM_POOL_PREFERENCE || 'smeplug_first').toLowerCase();
    // Find active SIMs for provider (prefer connected, but allow disconnected as fallback)
    const sims = await Sim.findAll({
      where: {
        provider: provider,
        status: 'active'
      },
      order: [
        ['ogdams_linked', preference === 'ogdams_first' ? 'DESC' : 'ASC'],
        ['connectionStatus', 'ASC'],
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

      // 2. Check if specific amount is covered (account for reserved)
      const airtimeBalance = sim.airtimeBalance !== null ? parseFloat(String(sim.airtimeBalance)) : null;
      const reserved = parseFloat(String(sim.reservedAirtime || 0));
      const available = airtimeBalance !== null && Number.isFinite(airtimeBalance) ? airtimeBalance - reserved : null;
      if (amount && available !== null && available < amount) {
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

  async getOptimalSimForData(plan) {
    const provider = String(plan?.provider || '').toLowerCase();
    const amount = plan?.api_cost || 0;
    const preference = String(process.env.SIM_POOL_PREFERENCE || 'smeplug_first').toLowerCase();
    const ogdamsEligible = !!plan?.ogdams_sku;

    const sims = await Sim.findAll({
      where: {
        provider,
        status: 'active',
      },
      order: [
        ['ogdams_linked', ogdamsEligible && preference === 'ogdams_first' ? 'DESC' : 'ASC'],
        ['connectionStatus', 'ASC'],
        ['dailyDispenses', 'ASC'],
        ['updatedAt', 'ASC'],
      ],
    });

    for (const sim of sims) {
      if (!ogdamsEligible && sim.ogdamsLinked) continue;
      if (sim.isLowBalance()) continue;
      const airtimeBalance = sim.airtimeBalance !== null ? parseFloat(String(sim.airtimeBalance)) : null;
      const reserved = parseFloat(String(sim.reservedAirtime || 0));
      const available = airtimeBalance !== null && Number.isFinite(airtimeBalance) ? airtimeBalance - reserved : null;
      if (amount && available !== null && available < amount) continue;
      if (sim.dailyDispenses >= 100) continue;
      return sim;
    }
    return null;
  }

  async reserveAmount(simId, amount, transaction = null) {
    let locked = null;
    const run = async (t) => {
      locked = await Sim.findByPk(simId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!locked) {
        const err = new Error('sim_not_found');
        err.code = 'sim_not_found';
        throw err;
      }
      const airtimeBalance = locked.airtimeBalance !== null ? parseFloat(String(locked.airtimeBalance)) : null;
      if (airtimeBalance === null || !Number.isFinite(airtimeBalance)) {
        const err = new Error('sim_balance_unknown');
        err.code = 'sim_balance_unknown';
        throw err;
      }
      const reserved = parseFloat(String(locked.reservedAirtime || 0));
      const available = airtimeBalance - reserved;
      if (available < amount) {
        const err = new Error('insufficient_sim_balance');
        err.code = 'insufficient_sim_balance';
        throw err;
      }
      locked.reservedAirtime = Math.max(0, reserved + amount);
      await locked.save({ transaction: t });
    };
    if (transaction) {
      await run(transaction);
    } else {
      await sequelize.transaction(async (t) => run(t));
    }
    return locked;
  }

  async finalizeReservation(simId, amount, success, transaction = null) {
    const run = async (t) => {
      const locked = await Sim.findByPk(simId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!locked) return;
      const reserved = parseFloat(String(locked.reservedAirtime || 0));
      locked.reservedAirtime = Math.max(0, reserved - amount);
      if (success) {
        const airtimeBalance = locked.airtimeBalance !== null ? parseFloat(String(locked.airtimeBalance)) : 0;
        locked.airtimeBalance = Math.max(0, airtimeBalance - amount);
      }
      await locked.save({ transaction: t });
    };
    if (transaction) {
      await run(transaction);
    } else {
      await sequelize.transaction(async (t) => run(t));
    }
  }

  async processTransactionWithReservation(sim, item, recipientPhone, reference = null, transaction = null) {
    try {
      if (!sim || !item || !recipientPhone) {
        throw new Error('Missing transaction details');
      }

      const isAirtime = !!item.amount;
      const costToSim = isAirtime ? parseFloat(String(item.amount)) : parseFloat(String(item.api_cost || 0));
      if (!Number.isFinite(costToSim) || costToSim <= 0) {
        throw new Error('Invalid cost');
      }

      if (!(await this.canDispense(sim))) {
        throw new Error('SIM daily limit reached or inactive');
      }

      await this.reserveAmount(sim.id, costToSim, transaction);

      const simNumber = ussdParserService.formatPhoneNumber(sim.phoneNumber);
      const provider = String(sim.provider || '').toLowerCase();
      const networkId = smeplugService.getNetworkId(provider);

      let platform = sim.ogdamsLinked ? 'ogdams' : 'smeplug';
      let providerResult = null;
      let providerReference = null;
      const purchaseRef = reference || `SIMPOOL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      if (platform === 'ogdams') {
        if (isAirtime) {
          providerResult = await ogdamsService.purchaseAirtime({
            networkId,
            amount: costToSim,
            phoneNumber: recipientPhone,
            reference: purchaseRef,
            sim_number: simNumber
          });
        } else {
          const planCode = item.ogdams_sku;
          if (!planCode) {
            throw new Error('Data plan not mapped for Ogdams');
          }
          providerResult = await ogdamsService.purchaseData({
            networkId,
            planCode: String(planCode),
            phoneNumber: recipientPhone,
            reference: purchaseRef,
            sim_number: simNumber
          });
        }
        providerReference = providerResult?.reference || providerResult?.data?.reference || null;
      } else {
        if (isAirtime) {
          const result = await smeplugService.purchaseVTU(provider, recipientPhone, costToSim, {
            mode: 'device_based',
            sim_number: sim.phoneNumber
          });
          if (!result.success) throw new Error(result.error || 'SMEPlug airtime purchase failed');
          providerResult = result.data;
          providerReference = result.data?.reference || result.data?.transaction_id || null;
        } else {
          const smeplugPlanId = item.smeplug_plan_id || item.id;
          const result = await smeplugService.purchaseData(provider, recipientPhone, smeplugPlanId, 'device_based', {
            sim_number: sim.phoneNumber
          });
          if (!result.success) throw new Error(result.error || 'SMEPlug data purchase failed');
          providerResult = result.data;
          providerReference = result.data?.reference || result.data?.transaction_id || null;
        }
      }

      await this.finalizeReservation(sim.id, costToSim, true, transaction);
      await this.incrementDispense(sim);

      return {
        success: true,
        reference: providerReference || purchaseRef,
        details: providerResult,
        platform
      };
    } catch (error) {
      const msg = error?.message || 'Transaction failed';
      try {
        const isAirtime = !!item?.amount;
        const costToSim = isAirtime ? parseFloat(String(item?.amount)) : parseFloat(String(item?.api_cost || 0));
        if (sim?.id && Number.isFinite(costToSim) && costToSim > 0) {
          await this.finalizeReservation(sim.id, costToSim, false, transaction);
        }
      } catch (e) {
        void e;
      }
      if (sim) {
        await sim.increment('failedDispenses');
      }
      logger.error(`Transaction processing failed for SIM ${sim?.phoneNumber || 'unknown'}: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Process transaction (Data or Airtime) via SIM
   * @param {Sim} sim
   * @param {Object} item - DataPlan object OR { provider, amount } for airtime
   * @param {string} recipientPhone
   * @returns {Promise<Object>}
   */
  async processTransaction(sim, item, recipientPhone) {
    const transaction = arguments.length >= 4 ? arguments[3] : null;
    return this.processTransactionWithReservation(sim, item, recipientPhone, null, transaction);
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
