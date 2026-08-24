const providerCatalog = {
  airtel: {
    key: 'airtel',
    label: 'Airtel',
    description: 'Airtel call subscription bundles',
    apiPlanPrefix: 'ATM-',
    supportedPrefixes: ['ATM-'],
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
  mtn: {
    key: 'mtn',
    label: 'MTN',
    description: 'MTN call subscription & voice bundles',
    apiPlanPrefix: 'MTN-',
    supportedPrefixes: ['MTN-'],
    purchaseKind: 'mtn_call_sub',
    refundKind: 'mtn_call_sub_refund',
    smsLabel: 'MTN',
    emailLabel: 'MTN',
    bundles: [
      { code: 'MTN-100-10M', name: 'MTN ExtraTime 10 Mins', provider: 'mtn', price: 100, minutes: 10, validityDays: 3 },
      { code: 'MTN-200-25M', name: 'MTN ExtraTime 25 Mins', provider: 'mtn', price: 200, minutes: 25, validityDays: 7 },
      { code: 'MTN-500-60M', name: 'MTN ExtraTime 60 Mins', provider: 'mtn', price: 500, minutes: 60, validityDays: 14 },
      { code: 'MTN-1000-150M', name: 'MTN ExtraTime 150 Mins', provider: 'mtn', price: 1000, minutes: 150, validityDays: 30 },
      { code: 'MTN-2000-350M', name: 'MTN ExtraTime 350 Mins', provider: 'mtn', price: 2000, minutes: 350, validityDays: 30 },
    ],
    legacyValidityBundles: [],
  },
  glo: {
    key: 'glo',
    label: 'Glo',
    description: 'Glo voice & call subscription bundles',
    apiPlanPrefix: 'GLO-',
    supportedPrefixes: ['GLO-'],
    purchaseKind: 'glo_call_sub',
    refundKind: 'glo_call_sub_refund',
    smsLabel: 'Glo',
    emailLabel: 'Glo',
    bundles: [
      { code: 'GLO-100-15M', name: 'Glo TalkMore 15 Mins', provider: 'glo', price: 100, minutes: 15, validityDays: 3 },
      { code: 'GLO-200-35M', name: 'Glo TalkMore 35 Mins', provider: 'glo', price: 200, minutes: 35, validityDays: 7 },
      { code: 'GLO-500-90M', name: 'Glo TalkMore 90 Mins', provider: 'glo', price: 500, minutes: 90, validityDays: 14 },
      { code: 'GLO-1000-200M', name: 'Glo TalkMore 200 Mins', provider: 'glo', price: 1000, minutes: 200, validityDays: 30 },
    ],
    legacyValidityBundles: [],
  },
  '9mobile': {
    key: '9mobile',
    label: '9mobile (T2)',
    description: '9mobile call subscription bundles',
    apiPlanPrefix: '9MOB-',
    supportedPrefixes: ['9MOB-'],
    purchaseKind: '9mobile_call_sub',
    refundKind: '9mobile_call_sub_refund',
    smsLabel: '9mobile',
    emailLabel: '9mobile',
    bundles: [
      { code: '9MOB-100-12M', name: '9mobile Voice 12 Mins', provider: '9mobile', price: 100, minutes: 12, validityDays: 3 },
      { code: '9MOB-200-30M', name: '9mobile Voice 30 Mins', provider: '9mobile', price: 200, minutes: 30, validityDays: 7 },
      { code: '9MOB-500-75M', name: '9mobile Voice 75 Mins', provider: '9mobile', price: 500, minutes: 75, validityDays: 14 },
      { code: '9MOB-1000-160M', name: '9mobile Voice 160 Mins', provider: '9mobile', price: 1000, minutes: 160, validityDays: 30 },
    ],
    legacyValidityBundles: [],
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
