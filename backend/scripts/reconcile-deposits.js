#!/usr/bin/env node

/**
 * Enterprise Transaction Reconciliation & Synchronization CLI
 * 
 * Usage:
 *   node backend/scripts/reconcile-deposits.js [--dry-run | --live] [options]
 * 
 * Options:
 *   --dry-run             Preview reconciliation matches without modifying wallets (DEFAULT)
 *   --live                Execute live settlement, credit wallets, and generate audit records
 *   --provider=<name>     Filter by gateway provider (payvessel, billstack, all) [default: all]
 *   --days=<n>            Scan events created within the last N days [default: 3]
 *   --hours=<n>           Scan events created within the last N hours
 *   --limit=<n>           Maximum number of records to process [default: 100]
 *   --user=<email|id>     Reconcile a specific user's deposits on demand
 *   --import=<file.json>  Ingest external gateway transaction dump file
 *   --help, -h            Show this help manual
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connectDB, User } = require('../config/db');
const depositReconciliationEngine = require('../services/depositReconciliationEngine');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true,
    live: false,
    provider: 'all',
    hours: 72,
    limit: 100,
    user: null,
    importPath: null,
    help: false
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--live') {
      options.live = true;
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
      options.live = false;
    } else if (arg.startsWith('--provider=')) {
      options.provider = arg.split('=')[1].trim();
    } else if (arg.startsWith('--days=')) {
      const days = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(days) && days > 0) options.hours = Math.round(days * 24);
    } else if (arg.startsWith('--hours=')) {
      const hours = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(hours) && hours > 0) options.hours = Math.round(hours);
    } else if (arg.startsWith('--limit=')) {
      const limit = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(limit) && limit > 0) options.limit = limit;
    } else if (arg.startsWith('--user=')) {
      options.user = arg.split('=')[1].trim();
    } else if (arg.startsWith('--import=')) {
      options.importPath = arg.split('=')[1].trim();
    }
  }

  return options;
}

function printHelp() {
  console.log(`
======================================================================
  PeaceBundle Automated Deposit Reconciliation & Settlement Tool
======================================================================

USAGE:
  node backend/scripts/reconcile-deposits.js [COMMAND] [OPTIONS]

COMMANDS:
  --dry-run             Simulate matching & balance impact (DEFAULT - SAFE)
  --live                Commit live balance credits and generate audit logs

OPTIONS:
  --provider=<provider> Filter by gateway (payvessel, billstack, all) [default: all]
  --days=<number>       Scan records from the last N days [default: 3]
  --hours=<number>      Scan records from the last N hours
  --limit=<number>      Maximum number of events to process [default: 100]
  --user=<id|email>     Reconcile candidate deposits for a single user
  --import=<file.json>  Ingest external gateway JSON transaction dump
  -h, --help            Show this manual

EXAMPLES:
  # Safe preview of uncredited deposits across all gateways
  node backend/scripts/reconcile-deposits.js --dry-run --days=7

  # Live settlement of uncredited PayVessel deposits
  node backend/scripts/reconcile-deposits.js --live --provider=payvessel --limit=50

  # Reconcile a specific user's deposits
  node backend/scripts/reconcile-deposits.js --live --user=john@example.com

  # Import external gateway report JSON
  node backend/scripts/reconcile-deposits.js --import=/path/to/transactions.json --live
`);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('\n======================================================================');
  console.log('  TRANSACTION RECONCILIATION & RECOVERY ENGINE');
  console.log(`  Mode: ${options.live ? 'LIVE SETTLEMENT (MUTATING BALANCES)' : 'DRY-RUN (SAFE PREVIEW - NO BALANCE CHANGES)'}`);
  console.log(`  Provider Scope: ${options.provider.toUpperCase()}`);
  console.log(`  Time Window: Last ${options.hours} hours (${(options.hours / 24).toFixed(1)} days)`);
  console.log(`  Limit: ${options.limit}`);
  console.log('======================================================================\n');

  try {
    console.log('[1/3] Connecting to database...');
    await connectDB();
    console.log('[1/3] Database connected successfully.\n');

    let summary;

    if (options.importPath) {
      // Mode A: Import external JSON dump file
      console.log(`[2/3] Reading external dump file from: ${options.importPath}`);
      const resolvedPath = path.resolve(process.cwd(), options.importPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Import file not found: ${resolvedPath}`);
      }
      const rawContent = fs.readFileSync(resolvedPath, 'utf8');
      const records = JSON.parse(rawContent);
      console.log(`[2/3] Loaded ${records.length} records. Beginning processing...\n`);

      summary = await depositReconciliationEngine.reconcileExternalBatch({
        records,
        dryRun: options.dryRun,
        provider: options.provider !== 'all' ? options.provider : 'file_import',
        operator: 'cli_admin',
        reconciliationType: 'file_import'
      });
    } else if (options.user) {
      // Mode B: Reconcile single user
      console.log(`[2/3] Resolving user: ${options.user}...`);
      const { Op } = require('sequelize');
      const user = await User.findOne({
        where: {
          [Op.or]: [
            { id: options.user },
            { email: options.user.toLowerCase() }
          ]
        }
      });
      if (!user) throw new Error(`User not found: ${options.user}`);
      console.log(`[2/3] Found user: ${user.name} (${user.email}) [ID: ${user.id}]. Scanning deposits...\n`);

      const userResult = await depositReconciliationEngine.reconcileUserDeposits(user.id, {
        dryRun: options.dryRun,
        hours: options.hours,
        operator: 'cli_admin'
      });

      console.log('\n======================================================================');
      console.log('  USER RECONCILIATION SUMMARY');
      console.log('======================================================================');
      console.log(`User: ${user.name} (${user.email})`);
      console.log(`Scanned Candidate Events: ${userResult.scannedCandidateCount}`);
      console.log(`Recovered / Credited Deposits: ${userResult.newlyCreditedCount}`);
      console.log(`Total Amount Recovered: ₦${userResult.totalCreditedAmount.toLocaleString()}`);
      console.log(`Current/Projected Balance: ₦${userResult.currentBalance.toLocaleString()}`);
      if (userResult.newlyCredited.length > 0) {
        console.table(userResult.newlyCredited);
      }
      console.log('======================================================================\n');
      process.exit(0);
    } else {
      // Mode C: Standard batch scan over WebhookEvents
      console.log('[2/3] Scanning uncredited and unverified webhook logs across gateways...');
      summary = await depositReconciliationEngine.reconcileUncreditedWebhookEvents({
        limit: options.limit,
        hours: options.hours,
        provider: options.provider,
        dryRun: options.dryRun,
        operator: 'cli_admin'
      });
    }

    // Display formatted results
    console.log('[3/3] Reconciliation processing completed.\n');
    console.log('======================================================================');
    console.log('  RECONCILIATION EXECUTION TELEMETRY');
    console.log('======================================================================');
    console.log(`Total Events Scanned:             ${summary.scanned}`);
    console.log(`Eligible For Recovery (Matched):  ${summary.matchedCount || summary.settledCount}`);
    if (options.live) {
      console.log(`Successfully Settled & Credited:  ${summary.settledCount}`);
    }
    console.log(`Already Credited (Duplicates):    ${summary.duplicateCount}`);
    console.log(`Unresolved / Missing Users:       ${summary.unresolvedCount}`);
    console.log(`Total Recovered Volume:           ₦${summary.totalRecoveredAmount.toLocaleString()}`);
    console.log('======================================================================\n');

    if (summary.items && summary.items.length > 0) {
      const displayRows = summary.items.map(item => ({
        Reference: item.reference || 'N/A',
        Status: item.status,
        UserEmail: item.userEmail || 'N/A',
        Amount: item.amount ? `₦${Number(item.amount).toLocaleString()}` : 'N/A',
        Strategy: item.resolutionStrategy || 'N/A',
        BalanceBefore: item.walletBalanceBefore !== undefined ? `₦${item.walletBalanceBefore}` : (item.balanceBefore !== undefined ? `₦${item.balanceBefore}` : 'N/A'),
        BalanceAfter: item.walletBalanceAfter !== undefined ? `₦${item.walletBalanceAfter}` : (item.balanceAfter !== undefined ? `₦${item.balanceAfter}` : 'N/A')
      }));
      console.table(displayRows);
    } else {
      console.log('No actionable uncredited deposits found in the specified window.');
    }

    console.log('\n[Done] All reconciliation operations completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('\n[FATAL ERROR] Reconciliation script failed:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
