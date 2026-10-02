const { WebhookEvent, User } = require('../models');
const { processBillstackFunding } = require('../controllers/webhookController');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  console.log('================================================================');
  console.log('       Peace Bundle - Replay Failed BillStack Webhooks         ');
  console.log('================================================================');

  const failedEvents = await WebhookEvent.findAll({
    where: {
      provider: 'billstack',
      status: ['failed', 'rejected', 'received']
    },
    order: [['createdAt', 'ASC']]
  });

  if (!failedEvents.length) {
    console.log('No failed or pending BillStack webhook events found to replay.');
    process.exit(0);
  }

  console.log(`Found ${failedEvents.length} BillStack webhook event(s) to process.\n`);

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const event of failedEvents) {
    console.log(`Processing Event ${event.id}:`);
    console.log(`  Reference: ${event.reference}`);
    console.log(`  Amount:    ₦${event.amount}`);
    console.log(`  Logged At: ${event.createdAt}`);

    try {
      const payload = event.payload || {};
      const data = payload?.data || payload;
      const billstackReference = data?.reference || payload?.reference || data?.id || payload?.id || null;
      const wiaxyRef = data?.wiaxy_ref || data?.transaction_ref || data?.transactionRef || data?.transactionReference || data?.tx_ref || payload?.wiaxy_ref || payload?.transaction_ref || null;
      const providerReference = String(wiaxyRef || billstackReference || event.reference || '').trim();
      const amountRaw = data?.amount || data?.amount_paid || data?.total_amount || data?.settlement_amount || payload?.amount || payload?.amount_paid || event.amount;
      const amount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw || '0').replace(/,/g, ''));
      const accountNumber = data?.account?.account_number || data?.account_number || data?.accountNumber || data?.account?.accountNumber || data?.virtual_account_number || payload?.virtual_account_number || payload?.account_number || payload?.account?.account_number || payload?.accountNumber;

      if (!accountNumber) {
        console.warn(`  ⚠️ Skipped: No account number in payload for event ${event.id}`);
        skipped++;
        continue;
      }

      const result = await processBillstackFunding({
        webhookEventId: event.id,
        payload,
        data,
        providerReference,
        amount,
        accountNumber,
        billstackReference
      });

      if (result && result.ok) {
        if (result.duplicate) {
          console.log(`  ℹ️ Already credited earlier (Duplicate ignored).`);
          skipped++;
        } else {
          console.log(`  ✅ Successfully credited user (${result.userId}) with ₦${amount}! New balance: ₦${result.balance}`);
          succeeded++;
        }
      } else {
        console.error(`  ❌ Failed to process: ${result?.reason || 'Unknown reason'}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ Error processing event ${event.id}:`, err.message);
      failed++;
    }
    console.log('----------------------------------------------------------------');
  }

  console.log(`\nReplay Summary:`);
  console.log(`  ✅ Successfully Credited: ${succeeded}`);
  console.log(`  ℹ️ Skipped / Duplicate:   ${skipped}`);
  console.log(`  ❌ Failed:                ${failed}`);
  console.log('================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal replay error:', err);
  process.exit(1);
});
