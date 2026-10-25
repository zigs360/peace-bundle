#!/usr/bin/env node

/**
 * Diagnostic & Remediation Script for Gateway Refund References
 * 
 * Target Incident References:
 *   1. RFND-56EB282CC7824CF7927A04E2
 *   2. RFND-EA4CB49A3B914056F6A11383
 * 
 * Usage:
 *   # 1. Diagnose current status of the target references:
 *   node backend/scripts/diagnose_and_fix_refunds.js --diagnose
 * 
 *   # 2. Preview the fix in dry-run mode (safe preview):
 *   node backend/scripts/diagnose_and_fix_refunds.js --dry-run
 * 
 *   # 3. Apply the atomic live fix:
 *   node backend/scripts/diagnose_and_fix_refunds.js --fix
 * 
 *   # 4. Diagnose or fix an arbitrary reference:
 *   node backend/scripts/diagnose_and_fix_refunds.js --ref=RFND-... --fix
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Op } = require('sequelize');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction, DepositReconciliationAudit } = require('../models');
const refundEngine = require('../services/refundEngine');

const DEFAULT_TARGET_REFERENCES = [
  'RFND-56EB282CC7824CF7927A04E2',
  'RFND-EA4CB49A3B914056F6A11383'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'diagnose', // 'diagnose', 'dry-run', 'fix'
    references: [...DEFAULT_TARGET_REFERENCES]
  };

  for (const arg of args) {
    if (arg === '--diagnose') {
      options.mode = 'diagnose';
    } else if (arg === '--dry-run') {
      options.mode = 'dry-run';
    } else if (arg === '--fix') {
      options.mode = 'fix';
    } else if (arg.startsWith('--ref=')) {
      const customRef = arg.split('=')[1].trim();
      options.references = [customRef];
    }
  }

  return options;
}

async function inspectReference(ref) {
  // 1. Search in Transaction table by reference, refund_reference, or metadata
  const matchingTxns = await Transaction.findAll({
    where: {
      [Op.or]: [
        { reference: ref },
        { refund_reference: ref },
        Transaction.sequelize.literal(`metadata->>'refund_reference' = '${ref.replace(/'/g, "''")}'`),
        Transaction.sequelize.literal(`metadata->'integrity'->'refund'->>'refundReference' = '${ref.replace(/'/g, "''")}'`)
      ]
    }
  });

  // 2. Check if an actual credit ledger entry exists with reference = ref or source = 'refund'
  const refundCreditTxn = await Transaction.findOne({
    where: {
      reference: ref,
      type: 'credit',
      source: 'refund'
    }
  });

  // 3. Extract user info and wallet
  let user = null;
  let wallet = null;
  const primaryTxn = matchingTxns.find(t => t.refund_reference === ref) || matchingTxns[0] || null;

  if (primaryTxn?.userId) {
    user = await User.findByPk(primaryTxn.userId);
    wallet = await Wallet.findOne({ where: { userId: primaryTxn.userId } });
  }

  return {
    targetReference: ref,
    primaryTxn,
    allMatchingTxns: matchingTxns,
    refundCreditTxn,
    user,
    wallet,
    isCredited: Boolean(refundCreditTxn)
  };
}

async function main() {
  const { mode, references } = parseArgs();

  console.log('\n======================================================================');
  console.log('  REFUND INCIDENT INVESTIGATION & REMEDIATION UTILITY');
  console.log(`  Execution Mode: ${mode.toUpperCase()}`);
  console.log(`  Target References: ${references.join(', ')}`);
  console.log('======================================================================\n');

  try {
    console.log('[1/3] Connecting to database...');
    await connectDB();
    console.log('[1/3] Database connected successfully.\n');

    console.log('[2/3] Inspecting target references in database...');
    const findings = [];

    for (const ref of references) {
      const data = await inspectReference(ref);
      findings.push(data);
    }

    // Display Diagnostic Report
    console.log('\n======================================================================');
    console.log('  DIAGNOSTIC AUDIT REPORT');
    console.log('======================================================================');

    const tableRows = findings.map(f => {
      const txn = f.primaryTxn;
      const user = f.user;
      const wallet = f.wallet;

      return {
        'Refund Ref': f.targetReference,
        'User ID': user?.id || txn?.userId || 'NOT FOUND',
        'User Email': user?.email || 'N/A',
        'Amount': txn?.amount ? `₦${Number(txn.amount).toLocaleString()}` : 'UNKNOWN',
        'Txn Status': txn?.status || 'NOT FOUND',
        'Original Ref': txn?.reference || 'N/A',
        'Current Wallet': wallet?.balance !== undefined ? `₦${Number(wallet.balance).toLocaleString()}` : 'N/A',
        'Credited in Ledger?': f.isCredited ? 'YES (CREDITED)' : 'NO (MISSING CREDIT!)'
      };
    });

    console.table(tableRows);

    if (mode === 'diagnose') {
      console.log('\n[INFO] Diagnostic complete. To preview remediation, run with --dry-run. To execute, run with --fix.');
      process.exit(0);
    }

    // Execute Fix / Dry Run
    console.log(`\n[3/3] Executing ${mode === 'fix' ? 'LIVE ATOMIC SETTLEMENT' : 'DRY-RUN SIMULATION'}...`);

    for (const finding of findings) {
      const ref = finding.targetReference;
      const txn = finding.primaryTxn;
      const user = finding.user;
      const wallet = finding.wallet;

      if (finding.isCredited) {
        console.log(`- [SKIP] ${ref}: Already credited in transaction ${finding.refundCreditTxn.id}.`);
        continue;
      }

      if (!user || !txn) {
        console.error(`- [ERROR] ${ref}: Cannot fix because original transaction or user could not be located.`);
        continue;
      }

      const refundAmount = parseFloat(txn.amount);
      const currentBalance = parseFloat(wallet?.balance || 0);
      const projectedBalance = currentBalance + refundAmount;

      if (mode === 'dry-run') {
        console.log(`- [DRY-RUN MATCH] ${ref}:`);
        console.log(`    User: ${user.name} (${user.email}) [ID: ${user.id}]`);
        console.log(`    Refund Amount: ₦${refundAmount.toLocaleString()}`);
        console.log(`    Balance: ₦${currentBalance.toLocaleString()} -> ₦${projectedBalance.toLocaleString()}`);
        console.log(`    Action: Would credit wallet and insert refund transaction with reconciled_manually = true.`);
      } else if (mode === 'fix') {
        console.log(`- [REMEDIATING] ${ref} for user ${user.email}...`);

        const result = await refundEngine.executeRefund({
          transactionId: txn.id,
          originalReference: txn.reference,
          refundReference: ref,
          userId: user.id,
          amount: refundAmount,
          reason: `Manual remediation of uncredited gateway refund: ${ref}`,
          operator: 'incident_remediation',
          metadata: {
            reconciled_manually: true,
            incident_remediation_target: true,
            remediated_at: new Date().toISOString()
          }
        });

        if (result.ok) {
          console.log(`    [SUCCESS] Successfully credited ₦${refundAmount.toLocaleString()} to user ${user.email}.`);
          console.log(`    Old Balance: ₦${result.balanceBefore} | New Balance: ₦${result.balanceAfter}`);
          console.log(`    Ledger Transaction ID: ${result.refundTransaction?.id}`);
        } else {
          console.error(`    [FAILED] Refund failed: ${result.reason}`);
        }
      }
    }

    console.log('\n======================================================================');
    console.log(`  REMEDIATION COMPLETED (${mode.toUpperCase()})`);
    console.log('======================================================================\n');
    process.exit(0);

  } catch (error) {
    console.error('\n[FATAL ERROR] Script encountered an error:', error.message);
    if (process.env.DEBUG) console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
