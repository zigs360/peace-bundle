const DEFAULT_PRICE_FIELDS = ['our_price', 'effective_price', 'admin_price', 'teleco_price'] as const;

export type PlanPriceStatus = 'valid' | 'missing' | 'invalid';

export interface PlanPriceInfo {
  value: number | null;
  status: PlanPriceStatus;
  sourceField: string | null;
}

function normalizeRawPrice(value: unknown): { value: number | null; missing: boolean } {
  if (value === null || value === undefined) {
    return { value: null, missing: true };
  }

  if (typeof value === 'number') {
    return { value: Number.isFinite(value) ? value : null, missing: false };
  }

  const text = String(value).trim();
  if (!text) {
    return { value: null, missing: true };
  }

  const cleaned = text.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return { value: null, missing: false };
  }

  const parsed = Number(cleaned);
  return { value: Number.isFinite(parsed) ? parsed : null, missing: false };
}

export function getPlanPriceInfo<T extends object>(
  plan: T,
  priceFields: readonly string[] = DEFAULT_PRICE_FIELDS,
): PlanPriceInfo {
  let sawInvalid = false;

  for (const field of priceFields) {
    const { value, missing } = normalizeRawPrice((plan as Record<string, unknown> | null)?.[field]);
    if (value !== null) {
      return {
        value,
        status: 'valid',
        sourceField: field,
      };
    }

    if (!missing) {
      sawInvalid = true;
    }
  }

  return {
    value: null,
    status: sawInvalid ? 'invalid' : 'missing',
    sourceField: null,
  };
}

export function sortPlansByAscendingPrice<T extends object>(
  plans: T[],
  priceFields: readonly string[] = DEFAULT_PRICE_FIELDS,
): T[] {
  if (!Array.isArray(plans) || plans.length <= 1) {
    return Array.isArray(plans) ? [...plans] : [];
  }

  return plans
    .map((plan, index) => ({
      plan,
      index,
      price: getPlanPriceInfo(plan, priceFields),
    }))
    .sort((left, right) => {
      const leftValid = left.price.status === 'valid';
      const rightValid = right.price.status === 'valid';

      if (leftValid && rightValid) {
        const diff = (left.price.value as number) - (right.price.value as number);
        if (Math.abs(diff) > 0.000001) return diff;
        return left.index - right.index;
      }

      if (leftValid) return -1;
      if (rightValid) return 1;

      if (left.price.status !== right.price.status) {
        return left.price.status === 'missing' ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.plan);
}

export function getLowestValidPlanPrice<T extends object>(
  plans: T[],
  priceFields: readonly string[] = DEFAULT_PRICE_FIELDS,
): number | null {
  for (const plan of sortPlansByAscendingPrice(plans, priceFields)) {
    const price = getPlanPriceInfo(plan, priceFields);
    if (price.status === 'valid') {
      return price.value;
    }
  }

  return null;
}

export function formatPlanCurrency(value: unknown): string {
  const { value: parsed } = normalizeRawPrice(value);
  const amount = parsed ?? 0;

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
