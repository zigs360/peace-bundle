const { parseValidityToDays, toFiniteNumber } = require('./dataPlanUtils');

const CATALOG_NETWORKS = ['mtn', 'airtel', 'glo', '9mobile'];
const NETWORK_LABELS = {
  mtn: 'MTN',
  airtel: 'Airtel',
  glo: 'GLO',
  '9mobile': '9mobile',
};

const NETWORK_CATEGORY_ORDER = {
  mtn: [
    'SME',
    'SME2',
    'AWOOF',
    'CORPORATE_GIFTING',
    'DATA_SHARE',
    'DATA_COUPONS',
    'GIFTING',
    'SOCIAL',
    'NIGHT',
    'BROADBAND',
    'UNLIMITED',
    'VOICE_COMBO',
    'GENERAL',
    'OTHER_PLANS',
  ],
  airtel: [
    'SME',
    'SME2',
    'AWOOF',
    'CORPORATE_GIFTING',
    'DATA_SHARE',
    'DATA_COUPONS',
    'GIFTING',
    'SOCIAL',
    'NIGHT',
    'ROUTER',
    'BROADBAND',
    'UNLIMITED',
    'ROAMING',
    'VOICE_COMBO',
    'BINGE',
    'GENERAL',
  ],
  glo: [
    'SME',
    'SME2',
    'AWOOF',
    'CORPORATE_GIFTING',
    'DATA_SHARE',
    'DATA_COUPONS',
    'GIFTING',
    'SOCIAL',
    'NIGHT',
    'VOICE_COMBO',
    'GENERAL',
  ],
  '9mobile': [
    'SME',
    'SME2',
    'AWOOF',
    'CORPORATE_GIFTING',
    'DATA_SHARE',
    'DATA_COUPONS',
    'GIFTING',
    'GENERAL',
  ],
};

const CATEGORY_LABELS = {
  SME: 'SME',
  SME2: 'SME2',
  AWOOF: 'Awoof',
  CORPORATE_GIFTING: 'Corporate Gifting',
  DATA_SHARE: 'Data Share',
  DATA_COUPONS: 'Data Coupons',
  GIFTING: 'Gifting',
  SOCIAL: 'Social',
  NIGHT: 'Night',
  BROADBAND: 'Broadband',
  ROUTER: 'Router',
  UNLIMITED: 'Unlimited',
  ROAMING: 'Roaming',
  VOICE_COMBO: 'Voice Combo',
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

function getRawCategory(planOrName, planCategory, planCategoryName) {
  let name = '';
  let category = '';
  let categoryName = '';

  if (planOrName && typeof planOrName === 'object') {
    name = planOrName.name || planOrName.plan || '';
    category = planOrName.category || planOrName.category_slug || '';
    categoryName = planOrName.category_name || planOrName.category_label || planOrName.planType || '';
  } else {
    name = planOrName || '';
    category = planCategory || '';
    categoryName = planCategoryName || '';
  }

  const nameText = normalizeText(name);
  const catNameText = normalizeText(categoryName);
  const catText = normalizeText(category);
  const combined = ` ${nameText} ${catNameText} ${catText} `;

  // 1. Check for specific tags & types first
  if (containsAny(combined, ['sme2', '[sme2]'])) return 'SME2';
  if (containsAny(combined, ['sme', 'thryve', 'sme_thryve', '[sme]'])) return 'SME';
  if (containsAny(combined, ['[awoof]', 'awoof', 'special'])) return 'AWOOF';
  if (containsAny(combined, ['[cg]', 'corporate gifting', 'corporate_gifting', '[corporate]', 'corporate', ' cg '])) return 'CORPORATE_GIFTING';
  if (containsAny(combined, ['[data_share]', 'data_share', 'data share', 'share', 'transfer'])) return 'DATA_SHARE';
  if (containsAny(combined, ['coupon', 'data coupon', 'data_coupon'])) return 'DATA_COUPONS';
  if (containsAny(combined, ['social', 'facebook', 'whatsapp', 'tiktok', 'instagram', 'youtube', 'ayoba', 'pulse', 'buffet'])) return 'SOCIAL';
  if (containsAny(combined, ['night', '* night', 'nightlife'])) return 'NIGHT';
  if (containsAny(combined, ['broadband', 'fibrex', 'hynetflex', 'router'])) return 'BROADBAND';
  if (containsAny(combined, ['unlimited'])) return 'UNLIMITED';
  if (containsAny(combined, ['roamlike', 'roamone', 'roamtheworld', 'roam'])) return 'ROAMING';
  if (containsAny(combined, ['talk more', 'talkmore', 'flexi', '6x', 'mins', 'minutes'])) return 'VOICE_COMBO';
  if (containsAny(combined, ['[gifting]', 'gifting', 'glomega', 'xtradata', 'direct'])) return 'GIFTING';

  return 'GIFTING';
}

function mapCategoryForNetwork(network, rawCategory) {
  return rawCategory;
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
  if (plan.category_key === 'ROUTER' || plan.category_key === 'BROADBAND') badges.push({ key: 'BROADBAND', label: 'Broadband', icon: '📡' });
  if (plan.category_key === 'NIGHT') badges.push({ key: 'NIGHT', label: 'Night', icon: '🌙' });
  if (plan.category_key === 'SOCIAL') badges.push({ key: 'SOCIAL', label: 'Social', icon: '📱' });
  if (plan.category_key === 'DATA_SHARE') badges.push({ key: 'SHARE', label: 'Share', icon: '🔄' });
  if (plan.category_key === 'CORPORATE_GIFTING') badges.push({ key: 'CORPORATE', label: 'Corporate', icon: '🏢' });
  if (plan.category_key === 'SME' || plan.category_key === 'SME2') badges.push({ key: 'SME', label: 'SME', icon: '⚡' });
  if (plan.category_key === 'AWOOF') badges.push({ key: 'AWOOF', label: 'Awoof', icon: '🔥' });
  return badges;
}

function getPrimaryPrice(plan) {
  const prices = [
    toFiniteNumber(plan.our_price, 0),
    toFiniteNumber(plan.your_price, 0),
    toFiniteNumber(plan.effective_price, 0),
    toFiniteNumber(plan.admin_price, 0),
    toFiniteNumber(plan.wallet_price, 0),
    toFiniteNumber(plan.api_cost, 0),
  ].filter((p) => p > 0);

  return prices.length > 0 ? prices[0] : 0;
}

function getTelecoPrice(plan) {
  const prices = [
    toFiniteNumber(plan.teleco_price, 0),
    toFiniteNumber(plan.original_price, 0),
    toFiniteNumber(plan.api_cost, 0),
  ].filter((p) => p > 0);

  return prices.length > 0 ? prices[0] : getPrimaryPrice(plan);
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
  const rawCategory = getRawCategory(plan.name || plan.plan, plan.category, plan.category_name);
  const categoryKey = rawCategory;
  const categoryLabel = CATEGORY_LABELS[categoryKey] || categoryKey.replace(/_/g, ' ');
  const dataAmount = extractDataAmount(plan);
  const minutesLabel = extractMinutes(plan.name || plan.plan);
  const isVoiceOnly = Boolean(minutesLabel) && !dataAmount;
  const yourPrice = getPrimaryPrice(plan);
  const telecoPrice = getTelecoPrice(plan);
  const isFree = yourPrice === 0 && telecoPrice === 0;
  const priceBadge = isFree ? 'FREE' : null;

  const enriched = {
    ...plan,
    your_price: yourPrice,
    our_price: yourPrice,
    effective_price: yourPrice,
    admin_price: toFiniteNumber(plan.admin_price, yourPrice) > 0 ? toFiniteNumber(plan.admin_price, yourPrice) : yourPrice,
    wallet_price: toFiniteNumber(plan.wallet_price, yourPrice) > 0 ? toFiniteNumber(plan.wallet_price, yourPrice) : yourPrice,
    network_key: networkKey,
    network_label: NETWORK_LABELS[networkKey] || String(networkKey || '').toUpperCase(),
    category_key: categoryKey,
    category_label: categoryLabel,
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
  const enrichedList = [];

  for (const rawPlan of plans) {
    const networkKey = normalizeText(rawPlan.provider || rawPlan.network);
    if (!CATALOG_NETWORKS.includes(networkKey)) continue;
    enrichedList.push(enrichCatalogPlan(rawPlan));
  }

  // Preserve all distinct plans created by Admin without dropping duplicates
  return enrichedList.sort(compareCatalogPlans);
}

function cleanCatalogPlan(plan) {
  const clean = { ...plan };
  delete clean.search_text;
  return clean;
}

function buildNestedCatalog(items) {
  const catalog = {
    MTN: {},
    Airtel: {},
    GLO: {},
    '9mobile': {},
  };

  for (const plan of items) {
    const networkLabel = NETWORK_LABELS[plan.network_key] || String(plan.network_key || '').toUpperCase();
    let topKey = 'MTN';
    if (networkLabel.toLowerCase().includes('airtel')) topKey = 'Airtel';
    else if (networkLabel.toLowerCase().includes('glo')) topKey = 'GLO';
    else if (networkLabel.toLowerCase().includes('9mobile')) topKey = '9mobile';

    const categoryKey = plan.category_key || 'GIFTING';
    if (!catalog[topKey]) catalog[topKey] = {};
    if (!catalog[topKey][categoryKey]) catalog[topKey][categoryKey] = [];
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
