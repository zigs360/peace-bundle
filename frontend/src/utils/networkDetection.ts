/**
 * Comprehensive Nigerian phone number network prefix database.
 * Supports MTN, Airtel, Glo, and 9mobile (Etisalat).
 * Includes all NCC-allocated prefixes as of 2025.
 */
export const NETWORK_PREFIXES: Record<string, string[]> = {
  mtn: [
    '07025', '07026', '0702', '0703', '0704', '0706', '0707',
    '0803', '0806',
    '0810', '0813', '0814', '0816',
    '0903', '0906', '0913', '0916',
  ],
  airtel: [
    '0701', '0708',
    '0802', '0808',
    '0812',
    '0901', '0902', '0904', '0907',
    '0911', '0912',
  ],
  glo: [
    '0705',
    '0805', '0807',
    '0811', '0815',
    '0905', '0915',
  ],
  '9mobile': [
    '0809',
    '0817', '0818',
    '0908', '0909',
  ],
};

/**
 * Validates if a phone number is a valid Nigerian number.
 * Accepts 11-digit (0xxx) or 13-digit (234xxx) formats.
 */
export const isValidNigerianNumber = (phone: string): boolean => {
  if (!phone) return false;
  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) return true;
  if (cleanPhone.length === 13 && cleanPhone.startsWith('234')) return true;

  return false;
};

/**
 * Detects the network provider from a Nigerian phone number.
 * Supports 5-digit and 4-digit exact match with 3-digit prefix fallback
 * for partial typing (e.g. '091' → MTN).
 */
export const detectNetwork = (phone: string): string | null => {
  if (!phone) return null;

  let cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.startsWith('234')) {
    cleanPhone = '0' + cleanPhone.substring(3);
  }

  if (cleanPhone.length === 10 && !cleanPhone.startsWith('0')) {
    cleanPhone = '0' + cleanPhone;
  }

  if (cleanPhone.length < 3) return null;

  // Try exact 5-digit prefix match first (e.g. 07025, 07026)
  if (cleanPhone.length >= 5) {
    const prefix5 = cleanPhone.substring(0, 5);
    for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
      if (prefixes.includes(prefix5)) {
        return network;
      }
    }
  }

  // Try exact 4-digit prefix match
  if (cleanPhone.length >= 4) {
    const prefix4 = cleanPhone.substring(0, 4);
    for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
      if (prefixes.includes(prefix4)) {
        return network;
      }
    }
  }

  // Fallback: 3-digit prefix partial match (for typing in progress)
  const prefix3 = cleanPhone.substring(0, 3);
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
    if (prefixes.some((p) => p.startsWith(prefix3))) {
      return network;
    }
  }

  return null;
};

export const networkServices: Record<string, Record<string, boolean>> = {
  airtel: { airtime: true, data: true },
  mtn: { airtime: true, data: true },
  glo: { airtime: true, data: true },
  '9mobile': { airtime: true, data: true },
};

export const recommendations: Record<string, { title: string, amount: number, type: string, planId?: string }[]> = {
  airtel: [
    { title: 'Airtime 500 (Recommended)', amount: 500, type: 'airtime' },
    { title: 'Airtime 1000', amount: 1000, type: 'airtime' },
  ],
  mtn: [
    { title: '1GB Data (Recommended)', amount: 350, type: 'data' },
  ],
  glo: [
    { title: '1.25GB Data (Recommended)', amount: 500, type: 'data' },
  ],
  '9mobile': [
    { title: '1.5GB Data (Recommended)', amount: 1000, type: 'data' },
  ],
};
