const checkSimBalances = require('./console/commands/checkSimBalances');
const detectBannedSims = require('./console/commands/detectBannedSims');
const SyncSmeplugPlans = require('./jobs/syncSmeplugPlans');
const { connectDB } = require('./config/db');

console.log('Scheduler started... Press Ctrl+C to stop.');

// Helper to check time match (HH:MM)
const isTime = (date, hour, minute) => {
    return date.getHours() === hour && date.getMinutes() === minute;
};

// State to prevent double execution in the same minute
let lastRunMinute = -1;

// Start DB Connection
connectDB();

// Check every minute
setInterval(() => {
    const now = new Date();
    const currentMinute = now.getMinutes();

    if (currentMinute === lastRunMinute) return;
    lastRunMinute = currentMinute;

    // Daily Tasks
    
    // 02:00 - Detect Banned SIMs
    if (isTime(now, 2, 0)) {
        console.log('Running scheduled task: DetectBannedSims');
        detectBannedSims();
    }

    // 03:00 - Sync Smeplug Plans
    if (isTime(now, 3, 0)) {
        console.log('Running scheduled task: SyncSmeplugPlans');
        SyncSmeplugPlans.dispatch();
    }

    // Every 2 Hours - Check SIM Balances
    // Run if hour is even (0, 2, 4...) and minute is 0
    if (now.getHours() % 2 === 0 && now.getMinutes() === 0) {
        console.log('Running scheduled task: CheckSimBalances');
        checkSimBalances();
    }

}, 60000); // Check every minute

console.log(`Current server time: ${new Date().toISOString()}`);
