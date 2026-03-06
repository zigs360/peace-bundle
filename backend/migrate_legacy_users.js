
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { connectDB } = require('./config/db');
const VirtualAccountService = require('./services/virtualAccountService');
const logger = require('./utils/logger');

async function migrateLegacyUsers() {
    console.log("--- Starting Legacy User Virtual Account Migration ---");
    
    try {
        // 1. Connect to DB and load associations
        await connectDB();
        console.log("Connected to database and loaded associations.");

        // 2. Run Migration
        const limit = 100; // Process 100 users at a time
        console.log(`Searching for up to ${limit} users without virtual accounts...`);
        
        const summary = await VirtualAccountService.bulkMigrateLegacyUsers(limit);

        console.log("\nMigration Summary:");
        console.log("------------------");
        console.log(`Total Found: ${summary.total_found}`);
        console.log(`Successfully Assigned: ${summary.success}`);
        console.log(`Failed: ${summary.failed}`);

        if (summary.errors.length > 0) {
            console.log("\nErrors Encountered:");
            summary.errors.forEach(err => {
                console.log(`- User ${err.email}: ${err.error}`);
            });
        }

        console.log("\n--- Migration Complete ---");
        process.exit(0);

    } catch (err) {
        console.error("\nCRITICAL ERROR during migration:");
        console.error(err.message);
        process.exit(1);
    }
}

migrateLegacyUsers();
