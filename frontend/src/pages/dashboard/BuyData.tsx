import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { Wifi, Smartphone, CheckCircle, Search, Wallet, RefreshCw } from 'lucide-react';
import { FadeIn, HoverCard, SlideUp, StaggerContainer, StaggerItem } from '../../components/animations/MotionComponents';
import { useNotifications } from '../../context/NotificationContext';
import { useTranslation } from 'react-i18next';
import { useTransactionPinGate } from '../../hooks/useTransactionPinGate';

const NETWORK_KEYS = ['mtn', 'airtel', 'glo'] as const;
const NETWORK_LABELS = {
  mtn: 'MTN',
  airtel: 'Airtel',
  glo: 'GLO',
} as const;
const NETWORK_TOP_KEYS = {
  mtn: 'MTN',
  airtel: 'Airtel',
  glo: 'GLO',
} as const;
const PLAN_CACHE_KEY = 'buy_data_plan_catalog_v2';
const PLAN_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DUPLICATE_GUARD_MS = 45 * 1000;

type NetworkKey = typeof NETWORK_KEYS[number];
type NetworkTopKey = typeof NETWORK_TOP_KEYS[NetworkKey];
type Feedback = { type: 'success' | 'error'; text: string } | null;

interface PlanBadge {
  key: string;
  label: string;
  icon: string;
}

interface CatalogPlan {
  id: string;
  network_key: NetworkKey;
  network_label: string;
  category_key: string;
  category_label: string;
  plan: string;
  name: string;
  plan_id: string;
  validity: string;
  teleco_price: number;
  our_price: number;
  effective_price?: number;
  admin_price?: number;
  display_amount?: string | null;
  minutes_label?: string | null;
  display_title?: string | null;
  bonus_text?: string | null;
  is_voice_only?: boolean;
  is_free?: boolean;
  is_add_on?: boolean;
  badges: PlanBadge[];
}

type NestedCatalog = Record<NetworkTopKey, Record<string, CatalogPlan[]>>;

interface CachedPlanCatalog {
  fetchedAt: number;
  version: number;
  items: CatalogPlan[];
  catalog: NestedCatalog;
}

const PHONE_PREFIXES: Record<NetworkKey, string[]> = {
  mtn: ['0803', '0806', '0703', '0706', '0810', '0813', '0814', '0816'],
  airtel: ['0802', '0808', '0708', '0812', '0901', '0902', '0907', '0904'],
  glo: ['0805', '0807', '0705', '0811', '0905', '0915'],
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePhone(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`;
  if (digits.length === 10 && !digits.startsWith('0')) return `0${digits}`;
  return digits;
}

function getPhoneError(network: NetworkKey, phone: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const normalized = normalizePhone(phone);
  if (!/^\d{11}$/.test(normalized)) return t('buyDataPage.phoneDigitsError');
  const prefixes = PHONE_PREFIXES[network] || [];
  if (!prefixes.includes(normalized.slice(0, 4))) {
    return t('buyDataPage.phonePrefixError', { network: NETWORK_LABELS[network] || network });
  }
  return null;
}

function getDuplicateGuardKey(plan: CatalogPlan, phone: string) {
  return `buy_data_guard:${plan.network_key}:${String(plan.plan_id)}:${normalizePhone(phone)}`;
}

function normalizePlan(plan: any): CatalogPlan {
  return {
    ...plan,
    id: String(plan.id),
    network_key: String(plan.network_key || plan.provider || '').toLowerCase() as NetworkKey,
    network_label: String(plan.network_label || NETWORK_LABELS[String(plan.network_key || plan.provider || '').toLowerCase() as NetworkKey] || ''),
    category_key: String(plan.category_key || ''),
    category_label: String(plan.category_label || plan.category_key || ''),
    plan: String(plan.plan || plan.name || ''),
    name: String(plan.name || plan.plan || ''),
    plan_id: String(plan.plan_id || plan.id),
    validity: String(plan.validity || ''),
    teleco_price: toNumber(plan.teleco_price, 0),
    our_price: toNumber(plan.our_price ?? plan.effective_price ?? plan.admin_price, 0),
    effective_price: toNumber(plan.effective_price ?? plan.our_price ?? plan.admin_price, 0),
    admin_price: toNumber(plan.admin_price, 0),
    display_amount: plan.display_amount ? String(plan.display_amount) : null,
    minutes_label: plan.minutes_label ? String(plan.minutes_label) : null,
    display_title: plan.display_title ? String(plan.display_title) : null,
    bonus_text: plan.bonus_text ? String(plan.bonus_text) : null,
    is_voice_only: Boolean(plan.is_voice_only),
    is_free: Boolean(plan.is_free),
    is_add_on: Boolean(plan.is_add_on),
    badges: Array.isArray(plan.badges) ? plan.badges.map((badge: any): PlanBadge => ({
      key: String(badge.key || ''),
      label: String(badge.label || ''),
      icon: String(badge.icon || ''),
    })) : [],
  };
}

function normalizeCatalog(rawCatalog: any): NestedCatalog {
  const catalog = {} as NestedCatalog;
  for (const network of NETWORK_KEYS) {
    const topKey = NETWORK_TOP_KEYS[network];
    const source = rawCatalog?.[topKey] || {};
    catalog[topKey] = Object.fromEntries(
      Object.entries(source).map(([category, plans]) => [
        category,
        Array.isArray(plans) ? plans.map((plan) => normalizePlan(plan)) : [],
      ]),
    ) as Record<string, CatalogPlan[]>;
  }
  return catalog;
}

function readCachedCatalog(version: number) {
  const raw = localStorage.getItem(PLAN_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedPlanCatalog;
    if (!Array.isArray(parsed.items)) return null;
    if (!parsed.catalog) return null;
    if (parsed.version !== version) return null;
    if (Date.now() - parsed.fetchedAt > PLAN_CACHE_MAX_AGE_MS) return null;
    return {
      items: parsed.items.map((plan) => normalizePlan(plan)),
      catalog: normalizeCatalog(parsed.catalog),
    };
  } catch {
    return null;
  }
}

function writeCachedCatalog(items: CatalogPlan[], catalog: NestedCatalog, version: number) {
  const payload: CachedPlanCatalog = {
    fetchedAt: Date.now(),
    version,
    items,
    catalog,
  };
  localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(payload));
}

function formatPriceLabel(plan: CatalogPlan) {
  if (plan.is_free) return 'FREE / ADD-ON';
  return `₦${toNumber(plan.our_price).toLocaleString()}`;
}

function extractPriceRange(query: string) {
  const lower = query.toLowerCase();
  let min: number | null = null;
  let max: number | null = null;
  let cleaned = lower;

  const rangeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    min = Number(rangeMatch[1]);
    max = Number(rangeMatch[2]);
    cleaned = cleaned.replace(rangeMatch[0], ' ');
  }

  const underMatch = lower.match(/(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)/);
  if (underMatch) {
    max = Number(underMatch[1]);
    cleaned = cleaned.replace(underMatch[0], ' ');
  }

  const overMatch = lower.match(/(?:above|over|from|greater than|min)\s*(\d+(?:\.\d+)?)/);
  if (overMatch) {
    min = Number(overMatch[1]);
    cleaned = cleaned.replace(overMatch[0], ' ');
  }

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return { min, max, tokens };
}

function matchesSearch(plan: CatalogPlan, query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const { min, max, tokens } = extractPriceRange(trimmed);
  const price = toNumber(plan.our_price, 0);

  if (min !== null && price < min) return false;
  if (max !== null && price > max) return false;

  const haystack = [
    plan.name,
    plan.plan,
    plan.display_amount,
    plan.minutes_label,
    plan.validity,
    plan.category_key,
    plan.category_label,
    plan.network_label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

function getBadgeClasses(key: string) {
  switch (key) {
    case 'VOICE':
      return 'bg-violet-100 text-violet-700';
    case 'ROAMING':
      return 'bg-sky-100 text-sky-700';
    case 'ROUTER':
      return 'bg-indigo-100 text-indigo-700';
    case 'NIGHT':
      return 'bg-slate-100 text-slate-700';
    case 'SOCIAL':
      return 'bg-pink-100 text-pink-700';
    case 'SHARE':
      return 'bg-amber-100 text-amber-700';
    case 'CORPORATE':
      return 'bg-emerald-100 text-emerald-700';
    case 'BROADBAND':
      return 'bg-cyan-100 text-cyan-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function BuyData() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [catalog, setCatalog] = useState<NestedCatalog>({ MTN: {}, Airtel: {}, GLO: {} } as NestedCatalog);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [activeNetwork, setActiveNetwork] = useState<NetworkKey | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { pricingVersion, walletBalance, walletBalanceUpdatedAt } = useNotifications();
  const { ensureTransactionPin, prompt } = useTransactionPinGate('financial');

  const fetchPlans = useCallback(async (forceRefresh = false) => {
    setPlansLoading(true);
    setFeedback(null);
    try {
      if (!forceRefresh) {
        const cached = readCachedCatalog(pricingVersion);
        if (cached) {
          setPlans(cached.items);
          setCatalog(cached.catalog);
          return;
        }
      }

      const res = await api.get('/plans/catalog');
      const items = Array.isArray(res.data?.items) ? res.data.items.map((plan: any) => normalizePlan(plan)) : [];
      const mappedCatalog = normalizeCatalog(res.data?.catalog);

      setPlans(items);
      setCatalog(mappedCatalog);
      writeCachedCatalog(items, mappedCatalog, pricingVersion);
    } catch (err) {
      console.error('Failed to fetch plans', err);
      setPlans([]);
      setCatalog({ MTN: {}, Airtel: {}, GLO: {} } as NestedCatalog);
      setFeedback({ type: 'error', text: t('buyDataPage.loadFailed') });
    } finally {
      setPlansLoading(false);
    }
  }, [pricingVersion, t]);

  useEffect(() => {
    void fetchPlans(false);
  }, [fetchPlans]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === String(selectedPlanId)) || null,
    [plans, selectedPlanId],
  );

  const globalResults = useMemo(
    () => plans.filter((plan) => matchesSearch(plan, search)),
    [plans, search],
  );

  const networkCategories = useMemo(() => {
    if (!activeNetwork) return [];
    const topKey = NETWORK_TOP_KEYS[activeNetwork];
    return Object.entries(catalog[topKey] || {})
      .map(([categoryKey, categoryPlans]) => ({
        key: categoryKey,
        label: categoryPlans[0]?.category_label || categoryKey.replace(/_/g, ' '),
        count: categoryPlans.length,
      }))
      .filter((category) => category.count > 0);
  }, [activeNetwork, catalog]);

  useEffect(() => {
    if (!activeNetwork) return;
    if (networkCategories.some((category) => category.key === activeCategory)) return;
    setActiveCategory(networkCategories[0]?.key || '');
  }, [activeCategory, activeNetwork, networkCategories]);

  const visibleCategoryPlans = useMemo(() => {
    if (!activeNetwork || !activeCategory) return [];
    const topKey = NETWORK_TOP_KEYS[activeNetwork];
    return (catalog[topKey]?.[activeCategory] || []).filter((plan) => matchesSearch(plan, search));
  }, [activeCategory, activeNetwork, catalog, search]);

  const categoryViewKey = activeNetwork && activeCategory ? `${activeNetwork}:${activeCategory}` : '';
  const categoryVisibleCount = visibleCounts[categoryViewKey] || 5;
  const categoryPlansToRender = visibleCategoryPlans.slice(0, categoryVisibleCount);

  useEffect(() => {
    if (selectedPlan) return;
    const firstPlan = search.trim()
      ? globalResults[0]
      : categoryPlansToRender[0];
    if (firstPlan) {
      setSelectedPlanId(String(firstPlan.id));
      setActiveNetwork(firstPlan.network_key);
      setActiveCategory(firstPlan.category_key);
    }
  }, [categoryPlansToRender, globalResults, search, selectedPlan]);

  const liveWalletBalance = useMemo(() => {
    if (walletBalance !== null && walletBalanceUpdatedAt > 0) return walletBalance;
    return null;
  }, [walletBalance, walletBalanceUpdatedAt]);

  const estimatedRemainingBalance = selectedPlan && liveWalletBalance !== null
    ? Math.max(0, liveWalletBalance - toNumber(selectedPlan.our_price))
    : null;

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      setFeedback({ type: 'error', text: t('buyDataPage.selectPlanError') });
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    const phoneError = getPhoneError(selectedPlan.network_key, normalizedPhone, t);
    if (phoneError) {
      setFeedback({ type: 'error', text: phoneError });
      return;
    }

    const duplicateKey = getDuplicateGuardKey(selectedPlan, normalizedPhone);
    const previousAttemptAt = Number(sessionStorage.getItem(duplicateKey) || '0');
    if (Date.now() - previousAttemptAt < DUPLICATE_GUARD_MS) {
      setFeedback({ type: 'error', text: t('buyDataPage.duplicateRecentError') });
      return;
    }

    const confirmText = [
      t('buyDataPage.confirmTitle'),
      '',
      `${t('buyDataPage.networkLabel')}: ${selectedPlan.network_label}`,
      `${t('buyDataPage.planLabel')}: ${selectedPlan.name}`,
      `${t('buyDataPage.validityLabel')}: ${selectedPlan.validity}`,
      `${t('buyDataPage.phoneLabel')}: ${normalizedPhone}`,
      `${t('buyDataPage.chargeLabel')}: ${formatPriceLabel(selectedPlan)}`,
      `${t('buyDataPage.providerPlanIdLabel')}: ${selectedPlan.plan_id}`,
    ].join('\n');

    if (!window.confirm(confirmText)) return;

    await ensureTransactionPin(async () => {
      setLoading(true);
      setFeedback(null);
      const reference = `DATA-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      try {
        sessionStorage.setItem(duplicateKey, String(Date.now()));
        const res = await api.post('/transactions/data', {
          network: selectedPlan.network_key,
          planId: Number(selectedPlan.id),
          phone: normalizedPhone,
          amount: toNumber(selectedPlan.our_price),
          reference,
        }, {
          headers: {
            'Idempotency-Key': reference,
          },
        });

        const transactionRef = res.data?.transaction_ref || res.data?.transaction?.reference || reference;
        const chargedPrice = toNumber(res.data?.charged_price, toNumber(selectedPlan.our_price));
        setFeedback({
          type: 'success',
          text: t('buyDataPage.purchaseSuccess', {
            amount: chargedPrice.toLocaleString(),
            reference: transactionRef,
          }),
        });
        setPhone('');
      } catch (err: any) {
        sessionStorage.removeItem(duplicateKey);
        setFeedback({
          type: 'error',
          text: err.response?.data?.message || t('buyDataPage.purchaseFailed'),
        });
      } finally {
        setLoading(false);
      }
    }, {
      amountLabel: `data purchase of NGN ${toNumber(selectedPlan.our_price).toLocaleString()}`,
      actionLabel: 'Authorize data purchase'
    });
  };

  return (
    <div className="max-w-6xl mx-auto">
      {prompt}
      <FadeIn className="flex items-center mb-8">
        <div className="p-3 bg-primary-100 rounded-full mr-4">
          <Wifi className="w-8 h-8 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('buyDataPage.heroTitle')}</h1>
          <p className="text-gray-600">{t('buyDataPage.heroSubtitle')}</p>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-8">
        <SlideUp className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
          {feedback && (
            <div className={`p-4 mb-6 rounded-md ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {feedback.text}
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Search all plans by name, amount, price range, or category"
              />
            </div>
            <button
              type="button"
              onClick={() => void fetchPlans(true)}
              disabled={plansLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${plansLoading ? 'animate-spin' : ''}`} />
              {t('buyDataPage.refreshPlans')}
            </button>
          </div>

          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Step 1: Choose a network</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {NETWORK_KEYS.map((network) => {
                const topKey = NETWORK_TOP_KEYS[network];
                const count = Object.values(catalog[topKey] || {}).reduce((total, items) => total + items.length, 0);
                return (
                  <button
                    key={network}
                    type="button"
                    onClick={() => setActiveNetwork(network)}
                    className={`rounded-xl border px-4 py-4 text-left transition ${
                      activeNetwork === network
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-300'
                    }`}
                  >
                    <div className="font-bold text-gray-900">{NETWORK_LABELS[network]} {network === 'mtn' ? '(merged)' : ''}</div>
                    <div className="text-sm text-gray-500 mt-1">{count} plans available</div>
                  </button>
                );
              })}
            </div>
          </div>

          {activeNetwork && (
            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Step 2: Choose a category</div>
              <div className="flex flex-wrap gap-2">
                {networkCategories.map((category) => (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => setActiveCategory(category.key)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                      activeCategory === category.key
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category.label} ({category.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {plansLoading ? (
            <div className="text-center py-8 text-gray-500">{t('buyDataPage.loadingPlans')}</div>
          ) : search.trim() ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Search Results</h2>
                  <p className="text-sm text-gray-500">Showing matches across MTN, Airtel, and GLO.</p>
                </div>
                <div className="text-sm text-gray-500">{globalResults.length} matches</div>
              </div>

              {globalResults.length === 0 && (
                <div className="text-center py-8 text-gray-500">{t('buyDataPage.noSearchResults')}</div>
              )}

              <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {globalResults.slice(0, 20).map((plan) => {
                  const selected = String(selectedPlanId) === String(plan.id);
                  return (
                    <StaggerItem
                      key={plan.id}
                      onClick={() => {
                        setSelectedPlanId(String(plan.id));
                        setActiveNetwork(plan.network_key);
                        setActiveCategory(plan.category_key);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {plan.network_label} • {plan.category_label}
                          </div>
                          <div className="font-bold text-gray-900 mt-1">{plan.display_title || plan.name}</div>
                          <div className="text-sm text-gray-600 mt-1">{plan.validity}</div>
                          {plan.bonus_text && <div className="text-xs text-primary-700 mt-1">{plan.bonus_text}</div>}
                          <div className="flex flex-wrap gap-2 mt-3">
                            {plan.badges.map((badge: PlanBadge) => (
                              <span key={badge.key} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getBadgeClasses(badge.key)}`}>
                                <span>{badge.icon}</span>
                                <span>{badge.label}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-primary-700">{formatPriceLabel(plan)}</div>
                          {plan.teleco_price > plan.our_price && plan.teleco_price > 0 && !plan.is_free && (
                            <div className="text-xs text-gray-400 line-through">₦{toNumber(plan.teleco_price).toLocaleString()}</div>
                          )}
                          {selected && <CheckCircle className="w-4 h-4 text-primary-600 ml-auto mt-3" />}
                        </div>
                      </div>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            </div>
          ) : activeNetwork && activeCategory ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Step 3: Browse plans</div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {NETWORK_LABELS[activeNetwork]} {networkCategories.find((category) => category.key === activeCategory)?.label || activeCategory}
                  </h2>
                </div>
                <div className="text-sm text-gray-500">{visibleCategoryPlans.length} plans</div>
              </div>

              {visibleCategoryPlans.length === 0 && (
                <div className="text-center py-8 text-gray-500">{t('buyDataPage.noSearchResults')}</div>
              )}

              <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryPlansToRender.map((plan) => {
                  const selected = String(selectedPlanId) === String(plan.id);
                  return (
                    <StaggerItem
                      key={plan.id}
                      onClick={() => setSelectedPlanId(String(plan.id))}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900">{plan.display_title || plan.name}</div>
                          <div className="text-sm text-gray-600 mt-1">{plan.validity}</div>
                          <div className="text-xs text-gray-400 mt-1">{t('buyDataPage.providerPlanIdLabel')}: {plan.plan_id}</div>
                          {plan.bonus_text && <div className="text-xs text-primary-700 mt-2">{plan.bonus_text}</div>}
                          <div className="flex flex-wrap gap-2 mt-3">
                            {plan.badges.map((badge: PlanBadge) => (
                              <span key={badge.key} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getBadgeClasses(badge.key)}`}>
                                <span>{badge.icon}</span>
                                <span>{badge.label}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-primary-700">{formatPriceLabel(plan)}</div>
                          {plan.teleco_price > plan.our_price && plan.teleco_price > 0 && !plan.is_free && (
                            <div className="text-xs text-gray-400 line-through">₦{toNumber(plan.teleco_price).toLocaleString()}</div>
                          )}
                          {selected && <CheckCircle className="w-4 h-4 text-primary-600 ml-auto mt-3" />}
                        </div>
                      </div>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>

              {visibleCategoryPlans.length > categoryVisibleCount && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCounts((prev) => ({ ...prev, [categoryViewKey]: (prev[categoryViewKey] || 5) + 10 }))}
                    className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    View More Options
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500">
              Select a network to continue, or use the global search above.
            </div>
          )}
        </SlideUp>

        <SlideUp className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('buyDataPage.purchaseDetails')}</h2>

          <div className="space-y-3 mb-6">
            <div className="flex items-center text-sm text-gray-600">
              <Wallet className="w-4 h-4 mr-2 text-primary-600" />
              {t('buyDataPage.walletBalance')}:{' '}
              <span className="ml-1 font-semibold text-gray-900">
                {liveWalletBalance === null ? t('buyDataPage.unavailable') : `₦${liveWalletBalance.toLocaleString()}`}
              </span>
            </div>
            {selectedPlan && estimatedRemainingBalance !== null && (
              <div className="text-sm text-gray-600">
                {t('buyDataPage.remainingAfterPurchase')}: <span className="font-semibold text-gray-900">₦{estimatedRemainingBalance.toLocaleString()}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleBuy}>
            <div className="mb-5">
              <label className="block text-gray-700 font-bold mb-2">{t('buyDataPage.selectedPlan')}</label>
              <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 min-h-[140px]">
                {selectedPlan ? (
                  <>
                    <div className="font-bold text-gray-900">{selectedPlan.display_title || selectedPlan.name}</div>
                    <div className="text-sm text-gray-600 mt-1">{selectedPlan.network_label} • {selectedPlan.category_label}</div>
                    <div className="text-sm text-gray-600">{selectedPlan.validity}</div>
                    {selectedPlan.bonus_text && <div className="text-xs text-primary-700 mt-2">{selectedPlan.bonus_text}</div>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selectedPlan.badges.map((badge: PlanBadge) => (
                        <span key={badge.key} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getBadgeClasses(badge.key)}`}>
                          <span>{badge.icon}</span>
                          <span>{badge.label}</span>
                        </span>
                      ))}
                    </div>
                    <div className="text-lg font-bold text-primary-700 mt-3">{formatPriceLabel(selectedPlan)}</div>
                  </>
                ) : (
                  <div className="text-sm text-gray-500">{t('buyDataPage.selectPlanPrompt')}</div>
                )}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">{t('buyDataPage.phoneNumber')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Smartphone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder={t('buyDataPage.phonePlaceholder')}
                  required
                />
              </div>
              {selectedPlan && phone && (
                <p className={`text-xs mt-2 ${getPhoneError(selectedPlan.network_key, phone, t) ? 'text-red-600' : 'text-green-600'}`}>
                  {getPhoneError(selectedPlan.network_key, phone, t) || t('buyDataPage.phoneMatchesNetwork')}
                </p>
              )}
            </div>

            <HoverCard>
              <button
                type="submit"
                disabled={loading || plansLoading || !selectedPlan}
                className={`w-full py-3 px-4 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition duration-200 ${
                  loading || plansLoading || !selectedPlan ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {loading ? t('buyDataPage.processing') : t('buyDataPage.buySelectedPlan')}
              </button>
            </HoverCard>
          </form>
        </SlideUp>
      </div>
    </div>
  );
}
