const providerCatalog = {
  airtel: {
    key: 'airtel',
    label: 'Airtel',
    description: 'Airtel call subscription bundles',
    apiPlanPrefix: 'ATM-',
    purchaseKind: 'airtel_call_sub',
    refundKind: 'airtel_call_sub_refund',
    smsLabel: 'Airtel',
    emailLabel: 'Airtel',
    bundles: [
      { code: 'ATM-120-10M', name: 'Airtel Talk More 10 Minutes', provider: 'airtel', price: 120, minutes: 10, validityDays: 30 },
      { code: 'ATM-230-20M', name: 'Airtel Talk More 20 Minutes', provider: 'airtel', price: 230, minutes: 20, validityDays: 30 },
      { code: 'ATM-700-50M', name: 'Airtel Talk More 50 Minutes', provider: 'airtel', price: 700, minutes: 50, validityDays: 30 },
      { code: 'ATM-100-3D', name: 'Airtel Talk More 3 Days', provider: 'airtel', price: 100, minutes: 0, validityDays: 3 },
      { code: 'ATM-200-7D', name: 'Airtel Talk More 7 Days (₦200)', provider: 'airtel', price: 200, minutes: 0, validityDays: 7 },
      { code: 'ATM-330-7D', name: 'Airtel Talk More 7 Days (₦330)', provider: 'airtel', price: 330, minutes: 0, validityDays: 7 },
      { code: 'ATM-700-14D', name: 'Airtel Talk More 14 Days (₦700)', provider: 'airtel', price: 700, minutes: 0, validityDays: 14 },
      { code: 'ATM-1300-14D', name: 'Airtel Talk More 14 Days (₦1300)', provider: 'airtel', price: 1300, minutes: 0, validityDays: 14 },
      { code: 'ATM-2000-150M-30D', name: 'Airtel Talk More 150 Minutes', provider: 'airtel', price: 2000, minutes: 150, validityDays: 30 },
    ],
  },
};

const listCallSubProviders = () =>
  Object.values(providerCatalog).map(({ key, label, description }) => ({
    key,
    label,
    description,
  }));

const getCallSubProvider = (providerKey) => providerCatalog[String(providerKey || '').toLowerCase()] || null;

const getAllCallSubProviders = () => providerCatalog;

module.exports = {
  getAllCallSubProviders,
  getCallSubProvider,
  listCallSubProviders,
};
