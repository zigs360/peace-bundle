const { parseValidityToDays, toFiniteNumber } = require('./dataPlanUtils');

const CATALOG_NETWORKS = ['mtn', 'airtel', 'glo'];
const NETWORK_LABELS = {
  mtn: 'MTN',
  airtel: 'Airtel',
  glo: 'GLO',
};

const NETWORK_CATEGORY_ORDER = {
  mtn: [
    'GIFTING',
    'AWOOF',
    'DATA_SHARE',
    'SOCIAL',
    'CORPORATE',
    'BROADBAND',
    'UNLIMITED',
    'SME_THRYVE',
    'NIGHT',
    'VOICE_COMBO',
    'GENERAL',
    'OTHER_PLANS',
  ],
  airtel: [
    'GIFTING',
    'AWOOF',
    'VOICE_COMBO',
    'ROAMING',
    'UNLIMITED',
    'ROUTER',
    'BINGE',
    'SOCIAL',
    'NIGHT',
    'GENERAL',
  ],
  glo: [
    'GIFTING',
    'AWOOF',
    'CORPORATE_GIFTING_CG',
    'VOICE_COMBO',
    'NIGHT',
  ],
};

const CATEGORY_LABELS = {
  GIFTING: 'Gifting',
  AWOOF: 'Awoof',
  DATA_SHARE: 'Data Share',
  SOCIAL: 'Social',
  CORPORATE: 'Corporate',
  CORPORATE_GIFTING_CG: 'Corporate Gifting CG',
  BROADBAND: 'Broadband',
  UNLIMITED: 'Unlimited',
  SME_THRYVE: 'SME Thryve',
  NIGHT: 'Night',
  VOICE_COMBO: 'Voice Combo',
  ROUTER: 'Router',
  ROAMING: 'Roaming',
  BINGE: 'Binge',
  GENERAL: 'General',
  OTHER_PLANS: 'Other Plans',
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function containsAny(text, parts) {
  return parts.some((part) => text.includes(String(part).toLowerCase()));
}

function getRawCategory(planName) {
  const text = normalizeText(planName);

  if (containsAny(text, ['share'])) return 'DATA_SHARE';
  if (containsAny(text, ['[data_share]'])) return 'DATA_SHARE';
  if (containsAny(text, ['[cg]'])) return 'CORPORATE_GIFTING_CG';
  if (containsAny(text, ['corporate'])) return 'CORPORATE';
  if (containsAny(text, ['broadband', 'fibrex', 'hynetflex'])) return 'BROADBAND';
  if (containsAny(text, ['unlimited'])) return 'UNLIMITED';
  if (containsAny(text, ['router'])) return 'ROUTER';
  if (containsAny(text, ['roamlike', 'roamone', 'roamtheworld', 'roam'])) return 'ROAMING';
  if (containsAny(text, ['thryvetalk', 'thryvedata'])) return 'SME_THRYVE';
  if (containsAny(text, ['[awoof]', 'awoof'])) return 'AWOOF';
  if (containsAny(text, ['[gifting]', 'gifting', 'special', 'glomega', 'xtradata'])) return 'GIFTING';
  if (containsAny(text, ['social', 'facebook', 'whatsapp', 'tiktok', 'instagram', 'youtube', 'ayoba', 'pulse', 'nightlife', 'buffet'])) return 'SOCIAL';
  if (containsAny(text, ['night', '* night', 'nightlife'])) return 'NIGHT';
  if (containsAny(text, ['talk more', 'talkmore', 'flexi', '6x', 'mins', 'minutes'])) return 'VOICE_COMBO';
  if (containsAny(text, ['binge'])) return 'BINGE';
  if (containsAny(text, ['monthly plan', 'weekly plan', 'daily plan', '2-day', 'daily'])) return 'GENERAL';
  return 'OTHER_PLANS';
}

function mapCategoryForNetwork(network, rawCategory) {
  const allowed = NETWORK_CATEGORY_ORDER[network] || [];
  if (allowed.includes(rawCategory)) return rawCategory;

  if (network === 'mtn') {
    if (rawCategory === 'ROUTER') return 'BROADBAND';
    if (rawCategory === 'CORPORATE_GIFTING_CG') return 'CORPORATE';
    if (rawCategory === 'BINGE' || rawCategory === 'ROAMING') return 'OTHER_PLANS';
    return rawCategory === 'OTHER_PLANS' ? 'OTHER_PLANS' : 'GIFTING';
  }

  if (network === 'airtel') {
    if (rawCategory === 'BROADBAND') return 'ROUTER';
    if (rawCategory === 'OTHER_PLANS') return 'GENERAL';
    return 'GIFTING';
  }

  if (network === 'glo') {
    if (rawCategory === 'OTHER_PLANS' || rawCategory === 'GENERAL') return 'GIFTING';
    if (rawCategory === 'SOCIAL' || rawCategory === 'UNLIMITED' || rawCategory === 'ROUTER' || rawCategory === 'ROAMING' || rawCategory === 'BINGE') return 'GIFTING';
    if (rawCategory === 'CORPORATE') return 'CORPORATE_GIFTING_CG';
  }

  return allowed[0] || rawCategory;
}

function extractDataAmount(plan) {
  const source = String(plan.name || plan.plan || plan.data_size || plan.size || '').toUpperCase();
  const match = source.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
  if (match) return `${match[1]}${match[2].toUpperCase()}`;

  const size = String(plan.data_size || plan.size || '').toUpperCase();
  if (size && /(GB|MB|TB)/i.test(size)) return size.replace(/\s+/g, '');
  if (plan.size_mb && Number.isFinite(Number(plan.size_mb))) {
    const value = Number(plan.size_mb);
    if (value >= 1024) {
      const gb = value / 1024;
      return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)}GB`;
    }
    return `${value}MB`;
  }
  return null;
}

function extractMinutes(planName) {
  const source = String(planName || '');
  const match = source.match(/(\d+(?:\.\d+)?)\s*(mins?|minutes?)/i);
  if (!match) return null;
  return `${match[1]} MINS`;
}

function extractBonusText(planName) {
  const source = String(planName || '');
  const bonusMatch = source.match(/(bonus\s*:?\s*[^,|]+)/i);
  if (bonusMatch) return bonusMatch[1].trim();

  const plusMatch = source.match(/(\+\s*\d+(?:\.\d+)?\s*(?:mins?|minutes?|gb|mb|tb))/i);
  if (plusMatch) return plusMatch[1].trim();
  return null;
}

function getPlanBadges(plan) {
  const badges = [];
  if (plan.is_voice_only) badges.push({ key: 'VOICE', label: 'Voice', icon: '🎙️' });
  if (plan.category_key === 'ROAMING') badges.push({ key: 'ROAMING', label: 'Roaming', icon: '🌍' });
  if (plan.category_key === 'ROUTER') badges.push({ key: 'ROUTER', label: 'Router', icon: '📡' });
  if (plan.category_key === 'NIGHT') badges.push({ key: 'NIGHT', label: 'Night', icon: '🌙' });
  if (plan.category_key === 'SOCIAL') badges.push({ key: 'SOCIAL', label: 'Social', icon: '📱' });
  if (plan.category_key === 'DATA_SHARE') badges.push({ key: 'SHARE', label: 'Share', icon: '🔄' });
  if (plan.category_key === 'CORPORATE' || plan.category_key === 'CORPORATE_GIFTING_CG') {
    badges.push({ key: 'CORPORATE', label: 'Corporate', icon: '🏢' });
  }
  if (plan.category_key === 'BROADBAND') badges.push({ key: 'BROADBAND', label: 'Broadband', icon: '📶' });
  return badges;
}

function getPrimaryPrice(plan) {
  return toFiniteNumber(plan.our_price ?? plan.effective_price ?? plan.admin_price, 0);
}

function getTelecoPrice(plan) {
  return toFiniteNumber(plan.teleco_price, 0);
}

function getApproximatePriceBucket(plan) {
  const nonZero = [getPrimaryPrice(plan), getTelecoPrice(plan)].find((value) => value > 0) || 0;
  return nonZero > 0 ? Math.round(nonZero / 5) * 5 : 0;
}

function buildDuplicateKey(plan) {
  return [
    plan.network_key,
    plan.category_key,
    plan.display_amount || plan.minutes_label || 'NA',
    String(plan.validity || '').toLowerCase(),
    getApproximatePriceBucket(plan),
  ].join('|');
}

function getFeatureScore(plan) {
  let score = 0;
  if (getPrimaryPrice(plan) > 0) score += 100;
  if (plan.bonus_text) score += 20;
  if (getTelecoPrice(plan) > 0) score += 10;
  score += (plan.badges || []).length * 5;
  score += String(plan.name || '').length / 100;
  if (plan.display_amount) score += 2;
  if (plan.minutes_label) score += 2;
  return score;
}

function pickPreferredDuplicate(current, candidate) {
  if (getPrimaryPrice(current) === 0 && getPrimaryPrice(candidate) > 0) return candidate;
  if (getPrimaryPrice(candidate) === 0 && getPrimaryPrice(current) > 0) return current;
  if (getFeatureScore(candidate) > getFeatureScore(current)) return candidate;
  return current;
}

function compareCatalogPlans(left, right) {
  const priceDiff = getPrimaryPrice(left) - getPrimaryPrice(right);
  if (Math.abs(priceDiff) > 0.0001) return priceDiff;

  const validityDiff = parseValidityToDays(left.validity) - parseValidityToDays(right.validity);
  if (Math.abs(validityDiff) > 0.0001) return validityDiff;

  return String(left.name || '').localeCompare(String(right.name || ''));
}

function enrichCatalogPlan(plan) {
  const networkKey = normalizeText(plan.provider || plan.network);
  const rawCategory = getRawCategory(plan.name || plan.plan);
  const categoryKey = mapCategoryForNetwork(networkKey, rawCategory);
  const dataAmount = extractDataAmount(plan);
  const minutesLabel = extractMinutes(plan.name || plan.plan);
  const isVoiceOnly = Boolean(minutesLabel) && !dataAmount;
  const yourPrice = getPrimaryPrice(plan);
  const telecoPrice = getTelecoPrice(plan);
  const isFree = yourPrice === 0 && telecoPrice === 0;
  const priceBadge = isFree ? 'FREE' : null;

  const enriched = {
    ...plan,
    network_key: networkKey,
    network_label: NETWORK_LABELS[networkKey] || String(networkKey || '').toUpperCase(),
    category_key: categoryKey,
    category_label: CATEGORY_LABELS[categoryKey] || categoryKey,
    display_amount: dataAmount,
    minutes_label: minutesLabel,
    display_title: isVoiceOnly ? `${minutesLabel} Voice` : (dataAmount || String(plan.name || '')),
    bonus_text: extractBonusText(plan.name || plan.plan),
    is_voice_only: isVoiceOnly,
    is_free: isFree,
    is_add_on: isFree,
    price_badge: priceBadge,
  };

  enriched.badges = getPlanBadges(enriched);
  enriched.search_text = [
    plan.name,
    plan.plan,
    plan.validity,
    enriched.display_amount,
    enriched.minutes_label,
    enriched.category_key,
    enriched.category_label,
    enriched.network_label,
    String(yourPrice),
    String(telecoPrice),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return enriched;
}

function mergeAndDeduplicatePlans(plans) {
  const flattened = [];

  for (const rawPlan of plans) {
    const networkKey = normalizeText(rawPlan.provider || rawPlan.network);
    if (!CATALOG_NETWORKS.includes(networkKey)) continue;
    flattened.push(enrichCatalogPlan(rawPlan));
  }

  const deduped = [];
  const mtnSeen = new Map();

  for (const plan of flattened) {
    if (plan.network_key !== 'mtn') {
      deduped.push(plan);
      continue;
    }

    const key = buildDuplicateKey(plan);
    if (!mtnSeen.has(key)) {
      mtnSeen.set(key, plan);
      continue;
    }
    mtnSeen.set(key, pickPreferredDuplicate(mtnSeen.get(key), plan));
  }

  deduped.push(...mtnSeen.values());
  return deduped.sort(compareCatalogPlans);
}

function cleanCatalogPlan(plan) {
  const clean = { ...plan };
  delete clean.search_text;
  return clean;
}

function buildNestedCatalog(items) {
  const catalog = {
    MTN: Object.fromEntries(NETWORK_CATEGORY_ORDER.mtn.map((key) => [key, []])),
    Airtel: Object.fromEntries(NETWORK_CATEGORY_ORDER.airtel.map((key) => [key, []])),
    GLO: Object.fromEntries(NETWORK_CATEGORY_ORDER.glo.map((key) => [key, []])),
  };

  for (const plan of items) {
    const networkLabel = NETWORK_LABELS[plan.network_key];
    if (!networkLabel) continue;
    const topKey = networkLabel === 'MTN' ? 'MTN' : networkLabel === 'Airtel' ? 'Airtel' : 'GLO';
    const categoryKey = plan.category_key;
    if (!catalog[topKey][categoryKey]) continue;
    catalog[topKey][categoryKey].push(cleanCatalogPlan(plan));
  }

  for (const topKey of Object.keys(catalog)) {
    for (const categoryKey of Object.keys(catalog[topKey])) {
      catalog[topKey][categoryKey].sort(compareCatalogPlans);
    }
  }

  return catalog;
}

module.exports = {
  CATALOG_NETWORKS,
  NETWORK_LABELS,
  NETWORK_CATEGORY_ORDER,
  CATEGORY_LABELS,
  getRawCategory,
  mapCategoryForNetwork,
  enrichCatalogPlan,
  mergeAndDeduplicatePlans,
  buildNestedCatalog,
  cleanCatalogPlan,
  compareCatalogPlans,
};
