const { Sim } = require('../models');
const simManagementService = require('../services/simManagementService');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { job: 'CheckSimBalanceJob' },
  transports: [
    new winston.transports.File({ filename: 'jobs.log' })
  ]
});

class CheckSimBalanceJob {
  constructor(sim) {
    this.sim = sim;
  }

  async handle() {
    try {
      // Refresh model to ensure latest status if needed, but using passed instance is fine usually
      if (this.sim.status !== 'active') {
        return;
      }

      const balance = await simManagementService.checkBalance(this.sim);
      
      logger.info("SIM balance checked", {
        sim_id: this.sim.id,
        phone: this.sim.phoneNumber,
        balance: balance
      });
    } catch (error) {
      logger.error("Failed to check SIM balance", {
        sim_id: this.sim.id,
        error: error.message
      });
    }
  }

  static dispatch(sim) {
    const job = new CheckSimBalanceJob(sim);
    setImmediate(() => job.handle());
  }
}

module.exports = CheckSimBalanceJob;
