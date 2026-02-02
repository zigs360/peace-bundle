const { Sim } = require('../../models');
const CheckSimBalanceJob = require('../../jobs/checkSimBalanceJob');

async function run() {
    try {
        const sims = await Sim.findAll({ where: { status: 'active' } });
        console.log(`[${new Date().toISOString()}] Checking balances for ${sims.length} SIMs...`);
        
        for (const sim of sims) {
            CheckSimBalanceJob.dispatch(sim);
        }
        
        console.log("Balance check jobs dispatched!");
    } catch (error) {
        console.error("Error in checkSimBalances:", error);
    }
}

if (require.main === module) {
    const { connectDB } = require('../../../config/db');
    connectDB().then(run);
}

module.exports = run;
