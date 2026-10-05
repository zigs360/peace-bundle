const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connectDB, User } = require('../config/db');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Migration script to deprecate SafeHaven virtual accounts:
 * - Marks all SafeHaven virtual accounts as deprecated / inactive
 * - Archives existing SafeHaven account details in user.metadata.old_safehaven_account
 * - Clears virtual_account_number, bank, and name so users can get fresh 9PSB/PalmPay accounts
 * - Identifies users needing migration cleanly
 */
async function deprecateSafeHavenAccounts() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`--- SafeHaven Virtual Account Deprecation Process Started ${isDryRun ? '(DRY RUN)' : ''} ---`);

  try {
    await connectDB();
    console.log('Database connected successfully.');

    // Find all users with SafeHaven virtual accounts
    const isPostgres = sequelize.getDialect && sequelize.getDialect() === 'postgres';
    const whereConditions = [
      { virtual_account_bank: { [Op.like || Op.iLike]: '%safehaven%' } },
      { virtual_account_bank: { [Op.like || Op.iLike]: '%safe haven%' } },
    ];

    if (isPostgres) {
      whereConditions.push(sequelize.literal(`"metadata"->>'va_provider' = 'safehaven'`));
    }

    const safeHavenUsers = await User.findAll({
      where: {
        [Op.or]: whereConditions,
      },
      attributes: ['id', 'email', 'name', 'phone', 'virtual_account_number', 'virtual_account_bank', 'virtual_account_name', 'metadata'],
    });

    // Also check in-memory for SQLite/fallback metadata matches
    const allUsers = isPostgres ? safeHavenUsers : await User.findAll({ attributes: ['id', 'email', 'name', 'phone', 'virtual_account_number', 'virtual_account_bank', 'virtual_account_name', 'metadata'] });
    const targetUsers = allUsers.filter((u) => {
      const bank = String(u.virtual_account_bank || '').toLowerCase();
      const provider = String(u.metadata?.va_provider || '').toLowerCase();
      return bank.includes('safehaven') || bank.includes('safe haven') || provider === 'safehaven';
    });

    console.log(`Found ${targetUsers.length} users with active/unmigrated SafeHaven accounts.`);

    if (targetUsers.length === 0) {
      console.log('No SafeHaven users requiring deprecation. Process complete.');
      process.exit(0);
    }

    if (isDryRun) {
      console.log('Dry run complete. Sample users:');
      targetUsers.slice(0, 5).forEach((u) => {
        console.log(`- ${u.email}: ${u.virtual_account_number} (${u.virtual_account_bank})`);
      });
      process.exit(0);
    }

    let successCount = 0;
    let failedCount = 0;

    for (const user of targetUsers) {
      try {
        const meta = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
        const oldAccount = {
          accountNumber: user.virtual_account_number,
          bankName: user.virtual_account_bank,
          accountName: user.virtual_account_name,
          deprecatedAt: new Date().toISOString(),
          status: 'deprecated',
          is_active: false,
        };

        user.metadata = {
          ...meta,
          old_safehaven_account: oldAccount,
          va_status: 'deprecated',
          safehaven_deprecated: true,
          va_provider: null,
          needs_provider_migration_warning: false,
        };

        user.virtual_account_number = null;
        user.virtual_account_bank = null;
        user.virtual_account_name = null;

        await user.save();
        successCount++;
        console.log(`Deprecated SafeHaven for: ${user.email} (archived account: ${oldAccount.accountNumber})`);
      } catch (err) {
        failedCount++;
        console.error(`Failed to deprecate SafeHaven for user ${user.id} (${user.email}): ${err.message}`);
      }
    }

    console.log(`\n--- Deprecation Complete: ${successCount} deprecated, ${failedCount} failed ---`);
    process.exit(failedCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error during SafeHaven deprecation migration:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  deprecateSafeHavenAccounts();
}

module.exports = { deprecateSafeHavenAccounts };
