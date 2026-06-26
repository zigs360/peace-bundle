const TALKMORE_GIFTING_BUNDLES = [
  { name: 'Talk More N100 (Voice - 500 Naira) [GIFTING]', validityDays: 30, shortCode: '50093', price: 100, customerPrice: 97.50, dealerCommission: 4.87, internalSequenceNumber: 1 },
  { name: 'Talk More N150 (Voice - 750 Naira) [GIFTING]', validityDays: 30, shortCode: '50094', price: 150, customerPrice: 146.25, dealerCommission: 7.31, internalSequenceNumber: 2 },
  { name: 'Talk More N200 (Voice - 1000 Naira) [GIFTING]', validityDays: 30, shortCode: '50095', price: 200, customerPrice: 195.00, dealerCommission: 9.75, internalSequenceNumber: 3 },
  { name: 'Talk More N250 (Voice - 1250 Naira) [GIFTING]', validityDays: 30, shortCode: '50096', price: 250, customerPrice: 243.75, dealerCommission: 12.18, internalSequenceNumber: 4 },
  { name: 'Talk More N300 (Voice - 1500 Naira) [GIFTING]', validityDays: 30, shortCode: '50097', price: 300, customerPrice: 292.50, dealerCommission: 14.62, internalSequenceNumber: 5 },
  { name: 'Talk More N500 (Voice - 2500 Naira) [GIFTING]', validityDays: 30, shortCode: '50098', price: 500, customerPrice: 487.50, dealerCommission: 24.37, internalSequenceNumber: 6 },
  { name: 'Talk More N1000 (Voice - 5000 Naira) [GIFTING]', validityDays: 30, shortCode: '50099', price: 1000, customerPrice: 975.00, dealerCommission: 48.75, internalSequenceNumber: 7 },
  { name: 'Talk More N1500 (Voice - 7500 Naira) [GIFTING]', validityDays: 30, shortCode: '50100', price: 1500, customerPrice: 1462.50, dealerCommission: 73.12, internalSequenceNumber: 8 },
  { name: 'Talk More N3000 (Voice - 15000 Naira) [GIFTING]', validityDays: 30, shortCode: '50101', price: 3000, customerPrice: 2925.00, dealerCommission: 146.25, internalSequenceNumber: 9 },
  { name: 'Talkmore Plus (Data) N500 (Data - 750.0 MB, Voice - 1000 Naira) [GIFTING]', validityDays: 7, shortCode: '50103', price: 500, customerPrice: 487.50, dealerCommission: 24.37, internalSequenceNumber: 10 },
  { name: 'Talkmore Plus (Voice +) N500 (Voice - 2500 Naira) [GIFTING]', validityDays: 7, shortCode: '50104', price: 500, customerPrice: 487.50, dealerCommission: 24.37, internalSequenceNumber: 11 },
  { name: 'Talkmore Plus (Voice +) N1000 (Voice - 5000 Naira) [GIFTING]', validityDays: 14, shortCode: '50105', price: 1000, customerPrice: 975.00, dealerCommission: 48.75, internalSequenceNumber: 12 },
  { name: 'Talkmore Plus (Data) N2000 (Data - 4.5 GB, Voice - 4000 Naira) [GIFTING]', validityDays: 30, shortCode: '50106', price: 2000, customerPrice: 1950.00, dealerCommission: 97.50, internalSequenceNumber: 13 },
  { name: 'Talkmore Plus (Voice +) N2000 (Voice - 10000 Naira) [GIFTING]', validityDays: 30, shortCode: '50107', price: 2000, customerPrice: 1950.00, dealerCommission: 97.50, internalSequenceNumber: 14 },
  { name: 'Talkmore Plus (Data) N5000 (Data - 15.0 GB, Voice - 10000 Naira) [GIFTING]', validityDays: 30, shortCode: '50108', price: 5000, customerPrice: 4875.00, dealerCommission: 243.75, internalSequenceNumber: 15 },
  { name: 'Talkmore Plus (Voice +) N5000 (Voice - 25000 Naira) [GIFTING]', validityDays: 30, shortCode: '50109', price: 5000, customerPrice: 4875.00, dealerCommission: 243.75, internalSequenceNumber: 16 },
  { name: 'Talkmore Plus (Voice +) N10000 (Voice - 50000 Naira) [GIFTING]', validityDays: 30, shortCode: '50110', price: 10000, customerPrice: 9750.00, dealerCommission: 487.50, internalSequenceNumber: 17 },
  { name: 'Talkmore Plus (Voice +) N15000 (Voice - 75000 Naira) [GIFTING]', validityDays: 30, shortCode: '50111', price: 15000, customerPrice: 14625.00, dealerCommission: 731.25, internalSequenceNumber: 18 },
  { name: 'Talkmore Plus (Voice +) N20000 (Voice - 100000 Naira) [GIFTING]', validityDays: 30, shortCode: '50112', price: 20000, customerPrice: 19500.00, dealerCommission: 975.00, internalSequenceNumber: 19 },
  { name: 'Talkmore Plus (Data) N1000 (Data - 1.5 GB, Voice - 2000 Naira) [GIFTING]', validityDays: 14, shortCode: '50113', price: 1000, customerPrice: 975.00, dealerCommission: 48.75, internalSequenceNumber: 20 },
  { name: 'Talkmore Plus (Data) N10000 (Data - 30.0 GB, Voice - 20000 Naira) [GIFTING]', validityDays: 30, shortCode: '50114', price: 10000, customerPrice: 9750.00, dealerCommission: 487.50, internalSequenceNumber: 21 },
  { name: 'Talkmore Plus (Data+) N15000 (Data - 50.0 GB, Voice - 35000 Naira) [GIFTING]', validityDays: 90, shortCode: '50115', price: 15000, customerPrice: 14625.00, dealerCommission: 731.25, internalSequenceNumber: 22 },
  { name: 'Talkmore Plus (Data) N20000 (Data - 70.0 GB, Voice - 45000 Naira) [GIFTING]', validityDays: 30, shortCode: '50116', price: 20000, customerPrice: 19500.00, dealerCommission: 975.00, internalSequenceNumber: 23 },
];

function slugify(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function buildTalkMorePlanPayload(bundle) {
  const amountLabel = `N${Number(bundle.price).toLocaleString('en-NG')}`;
  return {
    name: bundle.name,
    provider: 'airtel',
    price: bundle.price,
    customerPrice: bundle.customerPrice,
    dealerCommission: bundle.dealerCommission,
    minutes: 0,
    validityDays: bundle.validityDays,
    status: 'active',
    type: 'voice',
    api_plan_id: bundle.shortCode,
    shortCode: bundle.shortCode,
    internalSequenceNumber: bundle.internalSequenceNumber,
    portfolio: 'talkmore',
    bundleClass: 'talkmore_gifting',
    serviceName: 'Call Subscriptions',
    serviceSlug: 'call-subscriptions',
    categoryName: 'TalkMore',
    categorySlug: 'talkmore',
    subcategoryName: 'Gifting Bundles',
    subcategorySlug: 'gifting-bundles',
    metadata: {
      denomination: bundle.price,
      ussdMapping: `*312*${bundle.shortCode}#`,
      validityEditable: false,
      lockedValidityDays: bundle.validityDays,
      portfolioCode: slugify(`talkmore-${amountLabel}`, bundle.shortCode),
    },
  };
}

async function syncTalkMorePortfolio(CallPlan, { transaction } = {}) {
  for (const bundle of TALKMORE_GIFTING_BUNDLES) {
    const payload = buildTalkMorePlanPayload(bundle);
    const existing = await CallPlan.findOne({
      where: {
        shortCode: bundle.shortCode,
      },
      transaction,
    });

    if (existing) {
      existing.set({
        ...payload,
        stockLimit: existing.stockLimit,
        stockRemaining: existing.stockLimit === null ? null : existing.stockRemaining,
      });
      await existing.save({ transaction });
      continue;
    }

    await CallPlan.create(payload, { transaction });
  }
}

module.exports = {
  TALKMORE_GIFTING_BUNDLES,
  buildTalkMorePlanPayload,
  syncTalkMorePortfolio,
};
