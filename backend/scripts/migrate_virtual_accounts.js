
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');
const { User, sequelize } = db;
const virtualAccountService = require('../services/virtualAccountService');
const logger = require('../utils/logger');

/**
 * Script to migrate all existing users who don't have virtual accounts.
 * This process is designed to be idempotent and batch-oriented to respect API rate limits.
 */
async function migrateUsers() {
    // Check for dry-run flag
    const isDryRun = process.argv.includes('--dry-run');
    console.log(`--- Virtual Account Migration Process Started ${isDryRun ? '(DRY RUN)' : ''} ---`);
    
    try {
        console.log("Checking database connection...");
        await sequelize.authenticate();
        console.log("Database connected successfully.");

        // 1. Find all active users without virtual accounts
        const users = await User.findAll({
            where: {
                virtual_account_number: null,
                account_status: 'active'
            },
            attributes: ['id', 'email', 'name', 'phone', 'metadata']
        });

        const totalUsers = users.length;
        console.log(`Found ${totalUsers} users requiring virtual accounts.`);

        if (totalUsers === 0) {
            console.log("No users found requiring migration. Exiting.");
            process.exit(0);
        }

        const batchSize = 10; // Process 10 users at a time
        const delayBetweenBatches = 2000; // 2 seconds delay between batches
        
        const report = {
            total: totalUsers,
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        if (isDryRun) {
            console.log("Dry run: Found users to migrate. No changes will be made.");
            process.exit(0);
        }

        console.log(`Processing in batches of ${batchSize} with ${delayBetweenBatches}ms delay...`);

        for (let i = 0; i < totalUsers; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            console.log(`\nProcessing Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalUsers / batchSize)}...`);

            const batchPromises = batch.map(async (user) => {
                let retryAttempts = 0;
                const maxRetries = 2;
                
                while (retryAttempts <= maxRetries) {
                    try {
                        // Double check if user still needs an account (to avoid race conditions)
                        const freshUser = await User.findByPk(user.id);
                        if (freshUser.virtual_account_number) {
                            report.skipped++;
                            return;
                        }

                        // Attempt to assign virtual account
                        // assignVirtualAccount already handles PayVessel integration and saving to DB
                        const details = await virtualAccountService.assignVirtualAccount(freshUser);
                        
                        if (details) {
                            report.success++;
                            console.log(`✅ Success: ${user.email} -> ${details.accountNumber} (${details.bankName})`);
                            
                            // Notify user of their new account
                            try {
                                await virtualAccountService.notifyUserOfNewAccount(freshUser);
                            } catch (notifErr) {
                                logger.warn(`[Migration] Notification failed for ${user.email}: ${notifErr.message}`);
                            }
                        } else {
                            throw new Error("Service returned no details");
                        }
                        break; // Success, exit retry loop
                    } catch (err) {
                        retryAttempts++;
                        if (retryAttempts > maxRetries) {
                            report.failed++;
                            report.errors.push({ email: user.email, error: err.message });
                            console.error(`❌ Error for ${user.email} (Permanent): ${err.message}`);
                        } else {
                            console.warn(`⚠️  Retry ${retryAttempts}/${maxRetries} for ${user.email}: ${err.message}`);
                            // Wait a bit before retrying
                            await new Promise(resolve => setTimeout(resolve, 1000 * retryAttempts));
                        }
                    }
                }
            });

            await Promise.all(batchPromises);

            // Rate limiting delay
            if (i + batchSize < totalUsers) {
                console.log(`Waiting ${delayBetweenBatches}ms for next batch...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

        // 6. Generate Execution Report
        console.log("\n--- Final Migration Report ---");
        console.log(`Total Users Processed: ${report.total}`);
        console.log(`Successfully Assigned: ${report.success}`);
        console.log(`Failed Assignments:   ${report.failed}`);
        console.log(`Skipped (Already had): ${report.skipped}`);
        
        if (report.errors.length > 0) {
            console.log("\nDetailed Error Log:");
            report.errors.forEach((entry, idx) => {
                console.log(`${idx + 1}. ${entry.email}: ${entry.error}`);
            });
        }

        console.log("\n--- Migration Complete ---");
        process.exit(0);

    } catch (err) {
        console.error("\n--- Migration FAILED with critical error ---");
        console.error(err.message);
        process.exit(1);
    }
}

// Run the migration
migrateUsers();
