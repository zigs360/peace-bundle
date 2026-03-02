export const NETWORK_PREFIXES: Record<string, string[]> = {
  mtn: ['0702', '0703', '0704', '0706', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916'],
  airtel: ['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0911', '0912'],
  glo: ['0705', '0805', '0807', '0811', '0815', '0905', '0915'],
  '9mobile': ['0809', '0817', '0818', '0908', '0909'],
};

export const isValidNigerianNumber = (phone: string): boolean => {
  if (!phone) return false;
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) return true;
  if (cleanPhone.length === 13 && cleanPhone.startsWith('234')) return true;
  
  return false;
};

export const detectNetwork = (phone: string): string | null => {
  if (!phone) return null;
  
  let cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.startsWith('234')) {
    cleanPhone = '0' + cleanPhone.substring(3);
  }
  
  if (cleanPhone.length === 10 && !cleanPhone.startsWith('0')) {
    cleanPhone = '0' + cleanPhone;
  }

  if (cleanPhone.length < 4) return null;

  const prefix = cleanPhone.substring(0, 4);
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix)) {
      return network;
    }
  }
  return null;
};

export const networkServices: Record<string, Record<string, boolean>> = {
  airtel: { airtime: true, data: true, talkmore: true },
  mtn: { airtime: true, data: true, talkmore: false },
  glo: { airtime: true, data: true, talkmore: false },
  '9mobile': { airtime: true, data: true, talkmore: false },
};

export const recommendations: Record<string, { title: string, amount: number, type: string, planId?: string }[]> = {
  airtel: [
    { title: 'TalkMore 100', amount: 100, type: 'talkmore', planId: 'TM100' },
    { title: 'TalkMore 200', amount: 200, type: 'talkmore', planId: 'TM200' },
    { title: 'TalkMore 500 (Recommended)', amount: 500, type: 'talkmore', planId: 'TM500' },
    { title: 'TalkMore 1000', amount: 1000, type: 'talkmore', planId: 'TM1000' },
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
