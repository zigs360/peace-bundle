import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { Wifi, Smartphone, CheckCircle, Search, Wallet, RefreshCw } from 'lucide-react';
import { FadeIn, HoverCard, SlideUp, StaggerContainer, StaggerItem } from '../../components/animations/MotionComponents';
import { useNotifications } from '../../context/NotificationContext';
import { useTranslation } from 'react-i18next';

const NETWORKS = ['mtn', 'airtel', 'glo'] as const;
const PLAN_CACHE_KEY = 'buy_data_plan_catalog_v1';
const PLAN_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DUPLICATE_GUARD_MS = 45 * 1000;

type NetworkName = typeof NETWORKS[number];

type Feedback = { type: 'success' | 'error'; text: string } | null;

interface DataPlan {
  id: string;
  network: NetworkName | string;
  provider: string;
  network_display_name?: string;
  plan: string;
  name: string;
  plan_id: string;
  validity: string;
  validity_days?: number;
  teleco_price: number;
  our_price: number;
  effective_price?: number;
  admin_price?: number;
  size?: string;
  size_mb?: number;
  service_name?: string;
  category_name?: string;
  subcategory_name?: string;
}

interface CatalogSubcategory {
  name: string;
  slug: string;
  plans: DataPlan[];
}

interface CatalogCategory {
  name: string;
  slug: string;
  subcategories: CatalogSubcategory[];
}

interface CatalogService {
  name: string;
  slug: string;
  categories: CatalogCategory[];
}

interface CatalogNetwork {
  code: NetworkName | string;
  name: string;
  icon?: string;
  color?: string;
  services: CatalogService[];
}

interface CachedPlanCatalog {
  fetchedAt: number;
  version: number;
  plans: DataPlan[];
}

const NETWORK_LABELS: Record<string, string> = {
  mtn: 'MTN',
  airtel: 'Airtel',
  glo: 'Glo',
};

const PHONE_PREFIXES: Record<string, string[]> = {
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

function getPhoneError(network: string, phone: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const normalized = normalizePhone(phone);
  if (!/^\d{11}$/.test(normalized)) return t('buyDataPage.phoneDigitsError');
  const prefixes = PHONE_PREFIXES[network] || [];
  if (!prefixes.includes(normalized.slice(0, 4))) {
    return t('buyDataPage.phonePrefixError', { network: NETWORK_LABELS[network] || network });
  }
  return null;
}

function extractPlanSize(plan: DataPlan) {
  const text = String(plan.plan || plan.name || '').toUpperCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/);
  if (match) return `${match[1]}${match[2]}`;
  if (plan.size) return String(plan.size).toUpperCase();
  if (plan.size_mb && plan.size_mb >= 1024) return `${(plan.size_mb / 1024).toFixed(plan.size_mb % 1024 === 0 ? 0 : 1)}GB`;
  if (plan.size_mb) return `${plan.size_mb}MB`;
  return text;
}

function getDuplicateGuardKey(plan: DataPlan, phone: string) {
  return `buy_data_guard:${String(plan.network)}:${String(plan.plan_id)}:${normalizePhone(phone)}`;
}

function readCachedPlans(version: number) {
  const raw = localStorage.getItem(PLAN_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedPlanCatalog;
    if (!Array.isArray(parsed.plans)) return null;
    if (parsed.version !== version) return null;
    if (Date.now() - parsed.fetchedAt > PLAN_CACHE_MAX_AGE_MS) return null;
    return parsed.plans;
  } catch {
    return null;
  }
}

function writeCachedPlans(plans: DataPlan[], version: number) {
  const payload: CachedPlanCatalog = {
    fetchedAt: Date.now(),
    version,
    plans,
  };
  localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(payload));
}

function mapPlan(plan: any): DataPlan {
  return {
    ...plan,
    id: String(plan.id),
    network: String(plan.network || plan.provider || '').toLowerCase(),
    provider: String(plan.provider || plan.network || '').toLowerCase(),
    network_display_name: plan.network_display_name ? String(plan.network_display_name) : undefined,
    plan: String(plan.plan || plan.name || ''),
    name: String(plan.name || plan.plan || ''),
    plan_id: String(plan.plan_id || plan.smeplug_plan_id || plan.id),
    validity: String(plan.validity || ''),
    teleco_price: toNumber(plan.teleco_price, NaN),
    our_price: toNumber(plan.our_price ?? plan.effective_price ?? plan.admin_price, 0),
    effective_price: toNumber(plan.effective_price ?? plan.our_price ?? plan.admin_price, 0),
    admin_price: toNumber(plan.admin_price, 0),
    size: plan.size ? String(plan.size) : undefined,
    size_mb: plan.size_mb ? toNumber(plan.size_mb) : undefined,
    service_name: plan.service_name ? String(plan.service_name) : undefined,
    category_name: plan.category_name ? String(plan.category_name) : undefined,
    subcategory_name: plan.subcategory_name ? String(plan.subcategory_name) : undefined,
  };
}

function flattenCatalog(networks: CatalogNetwork[]) {
  return networks.flatMap((network) =>
    (network.services || []).flatMap((service) =>
      (service.categories || []).flatMap((category) =>
        (category.subcategories || []).flatMap((subcategory) =>
          (subcategory.plans || []).map((plan) => mapPlan(plan)),
        ),
      ),
    ),
  );
}

function buildCatalogFromPlans(plans: DataPlan[]): CatalogNetwork[] {
  const networksMap = new Map<string, CatalogNetwork & { servicesMap: Map<string, CatalogService & { categoriesMap: Map<string, CatalogCategory & { subcategoriesMap: Map<string, CatalogSubcategory> }> }> }>();

  plans.forEach((plan) => {
    const networkCode = String(plan.network || plan.provider || '').toLowerCase();
    if (!networkCode) return;

    if (!networksMap.has(networkCode)) {
      networksMap.set(networkCode, {
        code: networkCode,
        name: plan.network_display_name || NETWORK_LABELS[networkCode] || networkCode.toUpperCase(),
        icon: '📡',
        color: undefined,
        services: [],
        servicesMap: new Map(),
      });
    }

    const network = networksMap.get(networkCode)!;
    const serviceSlug = String(plan.service_name || 'Data Plans').toLowerCase().replace(/\s+/g, '-');
    const categorySlug = String(plan.category_name || 'General Plans').toLowerCase().replace(/\s+/g, '-');
    const subcategorySlug = String(plan.subcategory_name || 'All Plans').toLowerCase().replace(/\s+/g, '-');

    if (!network.servicesMap.has(serviceSlug)) {
      network.servicesMap.set(serviceSlug, {
        name: plan.service_name || 'Data Plans',
        slug: serviceSlug,
        categories: [],
        categoriesMap: new Map(),
      });
    }

    const service = network.servicesMap.get(serviceSlug)!;
    if (!service.categoriesMap.has(categorySlug)) {
      service.categoriesMap.set(categorySlug, {
        name: plan.category_name || 'General Plans',
        slug: categorySlug,
        subcategories: [],
        subcategoriesMap: new Map(),
      });
    }

    const category = service.categoriesMap.get(categorySlug)!;
    if (!category.subcategoriesMap.has(subcategorySlug)) {
      category.subcategoriesMap.set(subcategorySlug, {
        name: plan.subcategory_name || 'All Plans',
        slug: subcategorySlug,
        plans: [],
      });
    }

    category.subcategoriesMap.get(subcategorySlug)!.plans.push(plan);
  });

  return NETWORKS
    .filter((network) => networksMap.has(network))
    .map((network) => {
      const networkNode = networksMap.get(network)!;
      return {
        code: networkNode.code,
        name: networkNode.name,
        icon: networkNode.icon,
        color: networkNode.color,
        services: Array.from(networkNode.servicesMap.values()).map((service) => ({
          name: service.name,
          slug: service.slug,
          categories: Array.from(service.categoriesMap.values()).map((category) => ({
            name: category.name,
            slug: category.slug,
            subcategories: Array.from(category.subcategoriesMap.values()),
          })),
        })),
      };
    });
}

export default function BuyData() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [catalogNetworks, setCatalogNetworks] = useState<CatalogNetwork[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [activeNetwork, setActiveNetwork] = useState<NetworkName>('mtn');
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { pricingVersion, walletBalance, walletBalanceUpdatedAt } = useNotifications();

  const fetchPlans = useCallback(async (forceRefresh = false) => {
    setPlansLoading(true);
    setFeedback(null);
    try {
      if (!forceRefresh) {
        const cached = readCachedPlans(pricingVersion);
        if (cached) {
          setPlans(cached);
          setCatalogNetworks(buildCatalogFromPlans(cached));
          return;
        }
      }

      const res = await api.get('/plans/catalog');
      const rawNetworks = Array.isArray(res.data?.networks) ? res.data.networks : [];
      const mappedNetworks = rawNetworks as CatalogNetwork[];
      const mappedPlans = flattenCatalog(mappedNetworks);

      setCatalogNetworks(mappedNetworks);
      setPlans(mappedPlans);
      writeCachedPlans(mappedPlans, pricingVersion);
    } catch (err) {
      console.error('Failed to fetch plans', err);
      setCatalogNetworks([]);
      setPlans([]);
      setFeedback({ type: 'error', text: t('buyDataPage.loadFailed') });
    } finally {
      setPlansLoading(false);
    }
  }, [pricingVersion, t]);

  useEffect(() => {
    void fetchPlans(false);
  }, [fetchPlans]);

  const filteredPlans = useMemo(() => {
    const query = search.trim().toLowerCase();
    return plans.filter((plan) => {
      if (!NETWORKS.includes(plan.network as NetworkName)) return false;
      if (!(toNumber(plan.teleco_price, NaN) > 0)) return false;
      if (!query) return true;
      const haystack = `${plan.plan} ${plan.name} ${extractPlanSize(plan)} ${plan.validity}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [plans, search]);

  const filteredCatalog = useMemo(() => {
    const filteredIds = new Set(filteredPlans.map((plan) => String(plan.id)));
    return catalogNetworks
      .map((network) => ({
        ...network,
        services: (network.services || [])
          .map((service) => ({
            ...service,
            categories: (service.categories || [])
              .map((category) => ({
                ...category,
                subcategories: (category.subcategories || [])
                  .map((subcategory) => ({
                    ...subcategory,
                    plans: (subcategory.plans || [])
                      .map((plan) => mapPlan(plan))
                      .filter((plan) => filteredIds.has(String(plan.id))),
                  }))
                  .filter((subcategory) => subcategory.plans.length > 0),
              }))
              .filter((category) => category.subcategories.length > 0),
          }))
          .filter((service) => service.categories.length > 0),
      }))
      .filter((network) => network.services.length > 0);
  }, [catalogNetworks, filteredPlans]);

  const groupedPlans = useMemo(() => {
    return NETWORKS.reduce((acc, network) => {
      acc[network] = filteredPlans.filter((plan) => plan.network === network);
      return acc;
    }, {} as Record<NetworkName, DataPlan[]>);
  }, [filteredPlans]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === String(selectedPlanId)) || null,
    [plans, selectedPlanId],
  );

  useEffect(() => {
    if (selectedPlan) return;
    const firstAvailable = NETWORKS.flatMap((network) => groupedPlans[network]).find(Boolean);
    if (firstAvailable) {
      setSelectedPlanId(String(firstAvailable.id));
      setActiveNetwork(firstAvailable.network as NetworkName);
    }
  }, [groupedPlans, selectedPlan]);

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
    const phoneError = getPhoneError(selectedPlan.network, normalizedPhone, t);
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
      ``,
      `${t('buyDataPage.networkLabel')}: ${NETWORK_LABELS[selectedPlan.network] || selectedPlan.network}`,
      `${t('buyDataPage.planLabel')}: ${selectedPlan.plan}`,
      `${t('buyDataPage.validityLabel')}: ${selectedPlan.validity}`,
      `${t('buyDataPage.phoneLabel')}: ${normalizedPhone}`,
      `${t('buyDataPage.chargeLabel')}: ₦${toNumber(selectedPlan.our_price).toLocaleString()}`,
      `${t('buyDataPage.providerPlanIdLabel')}: ${selectedPlan.plan_id}`,
    ].join('\n');

    if (!window.confirm(confirmText)) return;

    setLoading(true);
    setFeedback(null);
    const reference = `DATA-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

    try {
      sessionStorage.setItem(duplicateKey, String(Date.now()));
      const res = await api.post('/transactions/data', {
        network: selectedPlan.network,
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
  };

  return (
    <div className="max-w-5xl mx-auto">
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
                placeholder={t('buyDataPage.searchPlaceholder')}
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

          <div className="flex flex-wrap gap-2 mb-6">
            {NETWORKS.map((network) => (
              <button
                key={network}
                type="button"
                onClick={() => setActiveNetwork(network)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  activeNetwork === network
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {NETWORK_LABELS[network]} ({groupedPlans[network].length})
              </button>
            ))}
          </div>

          {plansLoading ? (
            <div className="text-center py-8 text-gray-500">{t('buyDataPage.loadingPlans')}</div>
          ) : (
            <div className="space-y-8">
              {NETWORKS.map((network) => {
                const networkCatalog = filteredCatalog.find((item) => item.code === network);
                if (!networkCatalog) return null;
                return (
                  <section key={network} className={activeNetwork === network ? '' : 'opacity-70'}>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-gray-900">{networkCatalog.name || NETWORK_LABELS[network]}</h2>
                      <span className="text-xs text-gray-500">{t('buyDataPage.groupedHint')}</span>
                    </div>
                    <div className="space-y-6">
                      {networkCatalog.services.map((service) => (
                        <div key={`${network}-${service.slug}`} className="space-y-4">
                          <div className="text-sm font-semibold text-primary-700">{service.name}</div>
                          {service.categories.map((category) => (
                            <div key={`${service.slug}-${category.slug}`} className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-gray-900">{category.name}</h3>
                              </div>
                              {category.subcategories.map((subcategory) => (
                                <div key={`${category.slug}-${subcategory.slug}`} className="space-y-3">
                                  <div className="text-sm font-medium text-gray-600">{subcategory.name}</div>
                                  <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {subcategory.plans.map((plan) => {
                                      const selected = String(selectedPlanId) === String(plan.id);
                                      return (
                                        <StaggerItem
                                          key={plan.id}
                                          onClick={() => {
                                            setSelectedPlanId(String(plan.id));
                                            setActiveNetwork(network);
                                          }}
                                          className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                            selected
                                              ? 'border-primary-500 bg-primary-50'
                                              : 'border-gray-200 hover:border-primary-200'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="font-bold text-gray-800">{plan.plan}</div>
                                              <div className="text-sm text-gray-500">{plan.validity}</div>
                                              <div className="text-xs text-gray-400 mt-1">{t('buyDataPage.providerPlanIdLabel')}: {plan.plan_id}</div>
                                            </div>
                                            <div className="text-right">
                                              <div className="font-bold text-primary-700">₦{toNumber(plan.our_price).toLocaleString()}</div>
                                              <div className="text-xs text-gray-500">{extractPlanSize(plan)}</div>
                                              {selected && <CheckCircle className="w-4 h-4 text-primary-600 ml-auto mt-2" />}
                                            </div>
                                          </div>
                                        </StaggerItem>
                                      );
                                    })}
                                  </StaggerContainer>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
              {filteredPlans.length === 0 && (
                <div className="text-center py-8 text-gray-500">{t('buyDataPage.noSearchResults')}</div>
              )}
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
              <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 min-h-[110px]">
                {selectedPlan ? (
                  <>
                    <div className="font-bold text-gray-900">{selectedPlan.plan}</div>
                    <div className="text-sm text-gray-600 mt-1">{NETWORK_LABELS[selectedPlan.network] || selectedPlan.network}</div>
                    <div className="text-sm text-gray-600">{selectedPlan.validity}</div>
                    <div className="text-lg font-bold text-primary-700 mt-2">₦{toNumber(selectedPlan.our_price).toLocaleString()}</div>
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
                <p className={`text-xs mt-2 ${getPhoneError(selectedPlan.network, phone, t) ? 'text-red-600' : 'text-green-600'}`}>
                  {getPhoneError(selectedPlan.network, phone, t) || t('buyDataPage.phoneMatchesNetwork')}
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
