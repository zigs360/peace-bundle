const SendNotificationJob = require('../jobs/sendNotificationJob');

class AlertSimOwner {
  async handle(event) {
    try {
        const sim = event.sim;
        // Assuming sim.user is populated or we fetch it
        const user = sim.user || await sim.getUser();
        
        const data = {
            title: 'Low SIM Balance Alert',
            message: `Your SIM ${sim.phoneNumber} (${sim.provider}) has low balance: NGN ${sim.airtimeBalance}. Please recharge to continue automated dispensing.`,
            sim_id: sim.id,
            phone: sim.phoneNumber,
            balance: sim.airtimeBalance,
            threshold: sim.lowBalanceThreshold,
        };
        
        SendNotificationJob.dispatch(user, 'sim_low_balance', data);
    } catch (error) {
        console.error('AlertSimOwner Error:', error);
    }
  }
}

module.exports = new AlertSimOwner();
