const { connectDB } = require('../config/db');
const { Sim, User } = require('../models');
const eventBus = require('../events/eventBus');
const SimBalanceLow = require('../events/simBalanceLow');

async function run() {
    await connectDB();

    console.log('Fetching first active SIM...');
    const sim = await Sim.findOne({ 
        where: { status: 'active' },
        include: [{ model: User, required: false }] // Include user if possible
    });

    if (sim) {
        console.log(`Found SIM: ${sim.phoneNumber} (ID: ${sim.id})`);
        
        // Ensure user is attached for the notification to work
        if (!sim.userId) {
             console.log('SIM has no user attached. Attaching to first Admin/User for testing...');
             const user = await User.findOne();
             if (user) {
                 sim.user = user; // Manually attach for event
                 sim.userId = user.id; // In case logic re-fetches
                 console.log(`Attached to User: ${user.email}`);
             }
        } else if (!sim.user) {
             sim.user = await User.findByPk(sim.userId);
        }

        console.log('Firing SimBalanceLow event...');
        eventBus.dispatch(new SimBalanceLow(sim));
        console.log('Event fired.');
        
        // Keep process alive briefly to allow async listeners to complete
        setTimeout(() => {
            console.log('Exiting...');
            process.exit(0);
        }, 5000);
    } else {
        console.log('No active SIM found to test.');
        process.exit(1);
    }
}

run();
