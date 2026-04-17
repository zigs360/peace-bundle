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
      { code: 'ATM-120-10M', name: 'Airtel Call Sub 10 Minutes', provider: 'airtel', price: 120, minutes: 10, validityDays: 3 },
      { code: 'ATM-230-20M', name: 'Airtel Call Sub 20 Minutes', provider: 'airtel', price: 230, minutes: 20, validityDays: 7 },
      { code: 'ATM-330-30M', name: 'Airtel Call Sub 30 Minutes', provider: 'airtel', price: 330, minutes: 30, validityDays: 7 },
      { code: 'ATM-700-50M', name: 'Airtel Call Sub 50 Minutes', provider: 'airtel', price: 700, minutes: 50, validityDays: 14 },
      { code: 'ATM-2000-150M-30D', name: 'Airtel Call Sub 150 Minutes', provider: 'airtel', price: 2000, minutes: 150, validityDays: 30 },
    ],
    legacyValidityBundles: [
      {
        code: 'ATM-100-3D',
        name: 'Airtel Legacy Validity 3 Days',
        amount: 100,
        validityDays: 3,
        migrationMinutes: 10,
        migrateToCode: 'ATM-120-10M',
      },
      {
        code: 'ATM-200-7D',
        name: 'Airtel Legacy Validity 7 Days (₦200)',
        amount: 200,
        validityDays: 7,
        migrationMinutes: 20,
        migrateToCode: 'ATM-230-20M',
      },
      {
        code: 'ATM-330-7D',
        name: 'Airtel Legacy Validity 7 Days (₦330)',
        amount: 330,
        validityDays: 7,
        migrationMinutes: 30,
        migrateToCode: 'ATM-330-30M',
      },
      {
        code: 'ATM-700-14D',
        name: 'Airtel Legacy Validity 14 Days (₦700)',
        amount: 700,
        validityDays: 14,
        migrationMinutes: 50,
        migrateToCode: 'ATM-700-50M',
      },
      {
        code: 'ATM-1300-14D',
        name: 'Airtel Legacy Validity 14 Days (₦1300)',
        amount: 1300,
        validityDays: 14,
        migrationMinutes: 150,
        migrateToCode: 'ATM-2000-150M-30D',
      },
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
