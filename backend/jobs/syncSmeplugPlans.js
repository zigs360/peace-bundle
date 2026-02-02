const { DataPlan } = require('../models');
const smeplugService = require('../services/smeplugService');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { job: 'SyncSmeplugPlans' },
  transports: [
    new winston.transports.File({ filename: 'jobs.log' })
  ]
});

class SyncSmeplugPlans {
  async handle() {
    try {
      const result = await smeplugService.syncPlans();
      
      if (result.success) {
         for (const [provider, plans] of Object.entries(result.plans)) {
             for (const planData of plans) {
                 const criteria = {
                     provider: provider,
                     smeplug_plan_id: planData.id ? String(planData.id) : null
                 };
                 
                 // Skip if no smeplug_plan_id to match against
                 if (!criteria.smeplug_plan_id) continue;

                 const existingPlan = await DataPlan.findOne({ where: criteria });
                 
                 const planDetails = {
                     category: planData.category || 'sme',
                     name: planData.name,
                     size: planData.size || '0MB', 
                     size_mb: planData.size_mb || 0,
                     validity: planData.validity || '30 days',
                     api_cost: planData.price,
                     smeplug_metadata: planData
                 };
                 
                 if (existingPlan) {
                     await existingPlan.update(planDetails);
                 } else {
                     // Note: We might need to set admin_price initially. 
                     // We'll set it to api_cost * 1.2 or similar if not provided?
                     // Or just api_cost.
                     await DataPlan.create({
                         ...criteria,
                         ...planDetails,
                         admin_price: planData.price // Default admin price to api cost
                     });
                 }
             }
         }
         logger.info("Smeplug plans synced successfully");
      }
    } catch (error) {
      logger.error(`Failed to sync Smeplug plans: ${error.message}`);
    }
  }

  static dispatch() {
    const job = new SyncSmeplugPlans();
    setImmediate(() => job.handle());
  }
}

module.exports = SyncSmeplugPlans;
