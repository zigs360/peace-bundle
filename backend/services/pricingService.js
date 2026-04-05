const PricingTier = require('../models/PricingTier');
const PricingRule = require('../models/PricingRule');
const SystemSetting = require('../models/SystemSetting');

class PricingService {
  constructor() {
    this.cache = {
      tiersByName: new Map(),
      settings: null,
      settingsAt: 0,
    };
  }

  async getSystemSettingMap() {
    const now = Date.now();
    if (this.cache.settings && now - this.cache.settingsAt < 10000) return this.cache.settings;

    const rows = await SystemSetting.findAll();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    this.cache.settings = map;
    this.cache.settingsAt = now;
    return map;
  }

  async getOrCreateTierByName(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) throw new Error('Tier name is required');
    if (this.cache.tiersByName.has(key)) return this.cache.tiersByName.get(key);

    const existing = await PricingTier.findOne({ where: { name: key } });
    if (existing) {
      this.cache.tiersByName.set(key, existing);
      return existing;
    }

    const created = await PricingTier.create({ name: key, is_active: true, priority: 100 });
    this.cache.tiersByName.set(key, created);
    return created;
  }

  async getTierForUser(user) {
    const role = String(user?.role || 'user').toLowerCase();
    const settings = await this.getSystemSettingMap();
    const tierKey =
      role === 'admin'
        ? settings.get('pricing_tier_admin')
        : role === 'reseller'
          ? settings.get('pricing_tier_reseller')
          : settings.get('pricing_tier_user');

    const tierName = String(tierKey || 'default').trim().toLowerCase();
    return this.getOrCreateTierByName(tierName);
  }

  ruleIsActiveForNow(rule, now = new Date()) {
    if (!rule?.is_active) return false;
    if (rule.starts_at && new Date(rule.starts_at) > now) return false;
    if (rule.ends_at && new Date(rule.ends_at) < now) return false;
    return true;
  }

  pickBestRule(rules, { provider, dataPlanId, subscriptionPlanId }) {
    const providerKey = provider ? String(provider).toLowerCase() : null;
    const now = new Date();
    const active = (rules || []).filter((r) => this.ruleIsActiveForNow(r, now));

    const bySpecificity = active.sort((a, b) => {
      const score = (r) => {
        let s = 0;
        if (dataPlanId && r.dataPlanId === dataPlanId) s += 1000;
        if (subscriptionPlanId && r.subscriptionPlanId === subscriptionPlanId) s += 1000;
        if (providerKey && r.provider === providerKey) s += 100;
        if (!r.provider && !r.dataPlanId && !r.subscriptionPlanId) s += 10;
        return s;
      };
      return score(b) - score(a);
    });

    return bySpecificity[0] || null;
  }

  computeFromRule({ rule, base, currency = 'NGN' }) {
    const toNumber = (v) => (v === null || v === undefined ? null : Number.parseFloat(String(v)));

    const fixed = toNumber(rule?.fixed_price);
    const baseOverride = toNumber(rule?.base_price);
    const markup = toNumber(rule?.markup_percent);
    const discount = toNumber(rule?.discount_percent);
    const minP = toNumber(rule?.min_price);
    const maxP = toNumber(rule?.max_price);

    const baseUsed = Number.isFinite(baseOverride) ? baseOverride : base;
    let price = Number.isFinite(fixed) ? fixed : baseUsed;

    if (!Number.isFinite(fixed) && Number.isFinite(markup)) {
      price = price * (1 + markup / 100);
    }
    if (!Number.isFinite(fixed) && Number.isFinite(discount)) {
      price = price * (1 - discount / 100);
    }

    if (Number.isFinite(minP)) price = Math.max(price, minP);
    if (Number.isFinite(maxP)) price = Math.min(price, maxP);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error('Invalid computed price');
    }

    const rounded = Math.round(price * 100) / 100;

    return {
      currency,
      amount: rounded,
      breakdown: {
        fixed_price: fixed,
        base_price: baseUsed,
        markup_percent: markup,
        discount_percent: discount,
        min_price: minP,
        max_price: maxP,
      },
    };
  }

  async quoteAirtime({ user, provider, faceValue }) {
    const tier = await this.getTierForUser(user);
    const rules = await PricingRule.findAll({
      where: { tierId: tier.id, product_type: 'airtime', is_active: true },
    });

    const rule = this.pickBestRule(rules, { provider });
    if (!rule) {
      return {
        tier: tier.name,
        charged_amount: Math.round(Number(faceValue) * 100) / 100,
        breakdown: { base_price: Number(faceValue) },
        ruleId: null,
      };
    }

    const { amount, breakdown } = this.computeFromRule({ rule, base: Number(faceValue) });
    return {
      tier: tier.name,
      charged_amount: amount,
      breakdown,
      ruleId: rule.id,
    };
  }

  async quoteDataPlan({ user, plan }) {
    const tier = await this.getTierForUser(user);
    const rules = await PricingRule.findAll({
      where: { tierId: tier.id, product_type: 'data', is_active: true },
    });

    const rule = this.pickBestRule(rules, { provider: plan.provider, dataPlanId: plan.id });
    if (!rule) {
      const fallback = Number.parseFloat(String(plan.admin_price ?? plan.api_cost ?? 0));
      return {
        tier: tier.name,
        charged_amount: Math.round(fallback * 100) / 100,
        breakdown: { base_price: fallback },
        ruleId: null,
      };
    }

    const base = Number.parseFloat(String(plan.api_cost ?? plan.admin_price ?? 0));
    const { amount, breakdown } = this.computeFromRule({ rule, base: Number.isFinite(base) && base > 0 ? base : 0 });
    return {
      tier: tier.name,
      charged_amount: amount,
      breakdown,
      ruleId: rule.id,
    };
  }

  async quoteSubscriptionPlan({ user, plan }) {
    const tier = await this.getTierForUser(user);
    const rules = await PricingRule.findAll({
      where: { tierId: tier.id, product_type: 'subscription', is_active: true },
    });

    const rule = this.pickBestRule(rules, { subscriptionPlanId: plan.id });
    if (!rule) {
      const fallback = Number.parseFloat(String(plan.price ?? 0));
      return {
        tier: tier.name,
        charged_amount: Math.round(fallback * 100) / 100,
        breakdown: { base_price: fallback },
        ruleId: null,
      };
    }

    const base = Number.parseFloat(String(plan.price ?? 0));
    const { amount, breakdown } = this.computeFromRule({ rule, base: Number.isFinite(base) && base > 0 ? base : 0 });
    return {
      tier: tier.name,
      charged_amount: amount,
      breakdown,
      ruleId: rule.id,
    };
  }

  invalidateCache() {
    this.cache.tiersByName.clear();
    this.cache.settings = null;
    this.cache.settingsAt = 0;
  }
}

module.exports = new PricingService();

