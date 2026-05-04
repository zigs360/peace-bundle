const TALKMORE_GIFTING_BUNDLES = [
  { customerPrice: 100, shortCode: '50093', dealerCommission: 5, internalSequenceNumber: 1 },
  { customerPrice: 200, shortCode: '50094', dealerCommission: 10, internalSequenceNumber: 2 },
  { customerPrice: 300, shortCode: '50095', dealerCommission: 15, internalSequenceNumber: 3 },
  { customerPrice: 500, shortCode: '50096', dealerCommission: 25, internalSequenceNumber: 4 },
  { customerPrice: 1000, shortCode: '50097', dealerCommission: 50, internalSequenceNumber: 5 },
  { customerPrice: 1500, shortCode: '50098', dealerCommission: 75, internalSequenceNumber: 6 },
  { customerPrice: 2000, shortCode: '50099', dealerCommission: 100, internalSequenceNumber: 7 },
  { customerPrice: 2500, shortCode: '50100', dealerCommission: 125, internalSequenceNumber: 8 },
  { customerPrice: 3000, shortCode: '50101', dealerCommission: 150, internalSequenceNumber: 9 },
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
  const amountLabel = `N${Number(bundle.customerPrice).toLocaleString('en-NG')}`;
  return {
    name: `Airtel TalkMore Gifting ${amountLabel}`,
    provider: 'airtel',
    price: bundle.customerPrice,
    customerPrice: bundle.customerPrice,
    dealerCommission: bundle.dealerCommission,
    minutes: 0,
    validityDays: 30,
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
      denomination: bundle.customerPrice,
      ussdMapping: `*312*${bundle.shortCode}#`,
      validityEditable: false,
      lockedValidityDays: 30,
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
