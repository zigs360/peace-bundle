export const NETWORK_PREFIXES: Record<string, string[]> = {
  airtel: ['0701', '0708', '0802', '0808', '0812', '0902', '0907'],
  mtn: ['0703', '0706', '0803', '0806', '0813', '0816', '0903'],
  glo: ['0705', '0805', '0815', '0811', '0905'],
  '9mobile': ['0809', '0817', '0818', '0909'],
};

export const detectNetwork = (phone: string): string | null => {
  if (phone.length < 4) return null;
  const prefix = phone.substring(0, 4);
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

export const recommendations: Record<string, { title: string, amount: number, type: string }[]> = {
  airtel: [
    { title: 'TalkMore 500 (Recommended)', amount: 500, type: 'talkmore' },
    { title: 'TalkMore 1000', amount: 1000, type: 'talkmore' },
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
