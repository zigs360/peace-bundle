import { describe, expect, it } from 'vitest';
import { formatPlanCurrency, getLowestValidPlanPrice, getPlanPriceInfo, sortPlansByAscendingPrice } from './planPriceSort';

describe('planPriceSort', () => {
  it('sorts mixed positive prices in ascending order while preserving structure', () => {
    const plans = [
      { id: 'c', our_price: 300, label: '300' },
      { id: 'a', our_price: 100, label: '100' },
      { id: 'b', our_price: 200, label: '200' },
    ];

    const sorted = sortPlansByAscendingPrice(plans);

    expect(sorted.map((plan) => plan.id)).toEqual(['a', 'b', 'c']);
    expect(sorted[0]).toEqual(plans[1]);
  });

  it('maintains stable order for identical prices', () => {
    const plans = [
      { id: 'first', our_price: 500 },
      { id: 'second', our_price: 500 },
      { id: 'third', our_price: 500 },
    ];

    const sorted = sortPlansByAscendingPrice(plans);
    expect(sorted.map((plan) => plan.id)).toEqual(['first', 'second', 'third']);
  });

  it('handles boundary values including zero, negative, and very large prices', () => {
    const plans = [
      { id: 'huge', our_price: 999_999_999 },
      { id: 'zero', our_price: 0 },
      { id: 'negative', our_price: -5 },
      { id: 'tiny', our_price: 0.25 },
    ];

    const sorted = sortPlansByAscendingPrice(plans);
    expect(sorted.map((plan) => plan.id)).toEqual(['negative', 'zero', 'tiny', 'huge']);
    expect(getLowestValidPlanPrice(plans)).toBe(-5);
  });

  it('pushes missing and invalid prices to the end', () => {
    const plans = [
      { id: 'missing', our_price: null },
      { id: 'invalid', our_price: 'abc' },
      { id: 'valid', our_price: '150.50' },
      { id: 'undefined', our_price: undefined },
    ];

    const sorted = sortPlansByAscendingPrice(plans);
    expect(sorted.map((plan) => plan.id)).toEqual(['valid', 'missing', 'undefined', 'invalid']);
  });

  it('returns empty arrays safely', () => {
    expect(sortPlansByAscendingPrice([])).toEqual([]);
  });

  it('extracts price info from numeric and currency-formatted values', () => {
    expect(getPlanPriceInfo({ our_price: '₦1,250.75' })).toEqual({
      value: 1250.75,
      status: 'valid',
      sourceField: 'our_price',
    });
    expect(getPlanPriceInfo({ our_price: null })).toEqual({
      value: null,
      status: 'missing',
      sourceField: null,
    });
    expect(getPlanPriceInfo({ our_price: 'not-a-number' })).toEqual({
      value: null,
      status: 'invalid',
      sourceField: null,
    });
  });

  it('formats prices as NGN currency with consistent decimals', () => {
    expect(formatPlanCurrency(1000)).toMatch(/NGN|₦/);
    expect(formatPlanCurrency('999999999')).toContain('999');
  });
});
