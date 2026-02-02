const { Sim } = require('../../models');

async function run() {
    try {
        const sims = await Sim.findAll({ 
            where: { 
                status: 'active'
            } 
        });
        
        let bannedCount = 0;
        const MIN_DISPENSES = 10;
        const FAILURE_THRESHOLD = 50; // 50%

        for (const sim of sims) {
             if (sim.totalDispenses > MIN_DISPENSES) {
                 const failureRate = (sim.failedDispenses / sim.totalDispenses) * 100;
                 
                 if (failureRate > FAILURE_THRESHOLD) {
                     await sim.update({
                         status: 'banned',
                         statusReason: 'Auto-detected: High failure rate'
                     });
                     
                     console.warn(`SIM ${sim.phoneNumber} marked as banned. Rate: ${failureRate.toFixed(2)}%`);
                     bannedCount++;
                 }
             }
        }
        
        console.log(`[${new Date().toISOString()}] Detection complete! Banned ${bannedCount} SIMs.`);
    } catch (error) {
        console.error("Error in detectBannedSims:", error);
    }
}

if (require.main === module) {
    const { connectDB } = require('../../../config/db');
    connectDB().then(run);
}

module.exports = run;
