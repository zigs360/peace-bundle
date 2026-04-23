const NETWORK_ORDER = ['mtn', 'airtel', 'glo', '9mobile'];

const NETWORK_PREFIXES = {
  mtn: ['0803', '0806', '0703', '0706', '0810', '0813', '0814', '0816'],
  airtel: ['0802', '0808', '0708', '0812', '0901', '0902', '0907', '0904'],
  glo: ['0805', '0807', '0705', '0811', '0905', '0915'],
  '9mobile': ['0809', '0817', '0818', '0908', '0909'],
};

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 10 && !digits.startsWith('0')) {
    return `0${digits}`;
  }
  return digits;
}

function isValidNetwork(network) {
  return NETWORK_ORDER.includes(String(network || '').toLowerCase());
}

function getPhoneValidationError(network, phone) {
  const cleanNetwork = String(network || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);

  if (!/^\d{11}$/.test(normalizedPhone)) {
    return 'Phone number must be 11 digits';
  }

  if (!normalizedPhone.startsWith('0')) {
    return 'Phone number must start with 0';
  }

  if (!isValidNetwork(cleanNetwork)) {
    return 'Unsupported network';
  }

  const prefixes = NETWORK_PREFIXES[cleanNetwork] || [];
  if (!prefixes.includes(normalizedPhone.slice(0, 4))) {
    return `Phone number prefix does not match ${cleanNetwork.toUpperCase()}`;
  }

  return null;
}

function parseValidityToDays(validity) {
  const raw = String(validity || '').trim().toLowerCase();
  if (!raw) return Number.MAX_SAFE_INTEGER;

  const matches = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months|year|years|hour|hours)/g)];
  if (!matches.length) return Number.MAX_SAFE_INTEGER;

  let totalDays = 0;
  for (const match of matches) {
    const amount = Number.parseFloat(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount)) continue;
    if (unit.startsWith('hour')) totalDays += amount / 24;
    else if (unit.startsWith('day')) totalDays += amount;
    else if (unit.startsWith('week')) totalDays += amount * 7;
    else if (unit.startsWith('month')) totalDays += amount * 30;
    else if (unit.startsWith('year')) totalDays += amount * 365;
  }

  return totalDays > 0 ? totalDays : Number.MAX_SAFE_INTEGER;
}

function extractPlanSearchTokens(plan) {
  const values = [
    plan?.name,
    plan?.size,
    plan?.validity,
    plan?.provider,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  return values.join(' ');
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function comparePlans(left, right) {
  const networkDiff =
    NETWORK_ORDER.indexOf(String(left?.provider || '').toLowerCase()) -
    NETWORK_ORDER.indexOf(String(right?.provider || '').toLowerCase());
  if (networkDiff !== 0) return networkDiff;

  const validityDiff = parseValidityToDays(left?.validity) - parseValidityToDays(right?.validity);
  if (Math.abs(validityDiff) > 0.0001) return validityDiff;

  const priceDiff = toFiniteNumber(left?.effective_price ?? left?.our_price ?? left?.admin_price) -
    toFiniteNumber(right?.effective_price ?? right?.our_price ?? right?.admin_price);
  if (Math.abs(priceDiff) > 0.0001) return priceDiff;

  return String(left?.name || '').localeCompare(String(right?.name || ''));
}

module.exports = {
  NETWORK_ORDER,
  NETWORK_PREFIXES,
  normalizePhone,
  isValidNetwork,
  getPhoneValidationError,
  parseValidityToDays,
  extractPlanSearchTokens,
  toFiniteNumber,
  comparePlans,
};
