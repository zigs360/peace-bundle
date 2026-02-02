const SendNotificationJob = require('../jobs/sendNotificationJob');

class PauseBannedSim {
  async handle(event) {
    try {
        const sim = event.sim;
        const user = sim.user || await sim.getUser();
        
        // Ensure SIM is paused (banned)
        if (sim.status !== 'banned') {
            await sim.update({ status: 'banned' });
        }
        
        const data = {
            title: 'URGENT: SIM Banned/Restricted',
            message: `Your SIM ${sim.phoneNumber} (${sim.provider}) appears to be banned or restricted by the network. All transactions using this SIM have been paused. Please contact support or add a new SIM.`,
            sim_id: sim.id,
            phone: sim.phoneNumber,
            reason: sim.statusReason,
        };
        
        SendNotificationJob.dispatch(user, 'sim_banned', data);
    } catch (error) {
        console.error('PauseBannedSim Error:', error);
    }
  }
}

module.exports = new PauseBannedSim();
