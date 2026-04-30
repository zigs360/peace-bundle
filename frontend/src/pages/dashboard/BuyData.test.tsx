import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BuyData from './BuyData';

const apiGet = vi.fn();
const apiPost = vi.fn();
const mockT = (key: string, options?: Record<string, unknown>) => {
  if (key === 'buyDataPage.purchaseSuccess') {
    return `Purchase successful. Charged NGN ${options?.amount} with reference ${options?.reference}.`;
  }
  if (key === 'buyDataPage.phonePlaceholder') return '08012345678';
  return key;
};

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
    post: (...args: any[]) => apiPost(...args),
  },
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({
    pricingVersion: 1,
    walletBalance: 5000,
    walletBalanceUpdatedAt: Date.now(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}));

vi.mock('../../hooks/useTransactionPinGate', () => ({
  useTransactionPinGate: () => ({
    ensureTransactionPin: async (callback: () => Promise<void>) => callback(),
    prompt: null,
  }),
}));

describe('BuyData page', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiGet.mockReset();
    apiPost.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));

    apiGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 2,
            network_key: 'mtn',
            network_label: 'MTN',
            category_key: 'GIFTING',
            category_label: 'Gifting',
            plan: '110MB [GIFTING]',
            name: '110MB [GIFTING]',
            plan_id: '20001',
            validity: '1 Day',
            teleco_price: 100,
            our_price: 95,
            display_title: '110MB',
            display_amount: '110MB',
            badges: [],
          },
          {
            id: 1,
            network_key: 'mtn',
            network_label: 'MTN',
            category_key: 'GIFTING',
            category_label: 'Gifting',
            plan: '1GB [GIFTING]',
            name: '1GB [GIFTING]',
            plan_id: '20002',
            validity: '1 Day',
            teleco_price: 500,
            our_price: 475,
            display_title: '1GB',
            display_amount: '1GB',
            badges: [],
          },
          {
            id: 3,
            network_key: 'airtel',
            network_label: 'Airtel',
            category_key: 'SOCIAL',
            category_label: 'Social',
            plan: 'Airtel Social 2GB',
            name: 'Airtel Social 2GB',
            plan_id: '30002',
            validity: '7 Days',
            teleco_price: 900,
            our_price: 855,
            display_title: '2GB',
            display_amount: '2GB',
            badges: [{ key: 'SOCIAL', label: 'Social', icon: '📱' }],
          },
          {
            id: 4,
            network_key: 'glo',
            network_label: 'GLO',
            category_key: 'VOICE_COMBO',
            category_label: 'Voice Combo',
            plan: 'Talk More - 10MINS',
            name: 'Talk More - 10MINS',
            plan_id: '40002',
            validity: '3 Days',
            teleco_price: 100,
            our_price: 98,
            display_title: '10 MINS Voice',
            minutes_label: '10 MINS',
            is_voice_only: true,
            badges: [{ key: 'VOICE', label: 'Voice', icon: '🎙️' }],
          },
        ],
        catalog: {
          MTN: {
            GIFTING: [
              {
                id: 2,
                network_key: 'mtn',
                network_label: 'MTN',
                category_key: 'GIFTING',
                category_label: 'Gifting',
                plan: '110MB [GIFTING]',
                name: '110MB [GIFTING]',
                plan_id: '20001',
                validity: '1 Day',
                teleco_price: 100,
                our_price: 95,
                display_title: '110MB',
                display_amount: '110MB',
                badges: [],
              },
              {
                id: 1,
                network_key: 'mtn',
                network_label: 'MTN',
                category_key: 'GIFTING',
                category_label: 'Gifting',
                plan: '1GB [GIFTING]',
                name: '1GB [GIFTING]',
                plan_id: '20002',
                validity: '1 Day',
                teleco_price: 500,
                our_price: 475,
                display_title: '1GB',
                display_amount: '1GB',
                badges: [],
              },
            ],
            AWOOF: [],
            DATA_SHARE: [],
            SOCIAL: [],
            CORPORATE: [],
            BROADBAND: [],
            UNLIMITED: [],
            SME_THRYVE: [],
            NIGHT: [],
            VOICE_COMBO: [],
            GENERAL: [],
            OTHER_PLANS: [],
          },
          Airtel: {
            GIFTING: [],
            AWOOF: [],
            VOICE_COMBO: [],
            ROAMING: [],
            UNLIMITED: [],
            ROUTER: [],
            BINGE: [],
            SOCIAL: [
              {
                id: 3,
                network_key: 'airtel',
                network_label: 'Airtel',
                category_key: 'SOCIAL',
                category_label: 'Social',
                plan: 'Airtel Social 2GB',
                name: 'Airtel Social 2GB',
                plan_id: '30002',
                validity: '7 Days',
                teleco_price: 900,
                our_price: 855,
                display_title: '2GB',
                display_amount: '2GB',
                badges: [{ key: 'SOCIAL', label: 'Social', icon: '📱' }],
              },
            ],
            NIGHT: [],
            GENERAL: [],
          },
          GLO: {
            GIFTING: [],
            AWOOF: [],
            CORPORATE_GIFTING_CG: [],
            VOICE_COMBO: [
              {
                id: 4,
                network_key: 'glo',
                network_label: 'GLO',
                category_key: 'VOICE_COMBO',
                category_label: 'Voice Combo',
                plan: 'Talk More - 10MINS',
                name: 'Talk More - 10MINS',
                plan_id: '40002',
                validity: '3 Days',
                teleco_price: 100,
                our_price: 98,
                display_title: '10 MINS Voice',
                minutes_label: '10 MINS',
                is_voice_only: true,
                badges: [{ key: 'VOICE', label: 'Voice', icon: '🎙️' }],
              },
            ],
            NIGHT: [],
          },
        },
      },
    });

    apiPost.mockResolvedValue({
      data: {
        success: true,
        charged_price: 475,
        transaction_ref: 'DATA-REF-001',
        transaction: { reference: 'DATA-REF-001' },
      },
    });

    localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'user' }));
  });

  it('shows network and category flow, supports global search, and submits the selected plan purchase payload', async () => {
    render(<BuyData />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /MTN \(merged\)/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Airtel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GLO/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /MTN/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Gifting \(2\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Gifting \(2\)/i }));

    expect(screen.getAllByText('1GB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('110MB').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText(/search all plans/i), {
      target: { value: '1GB' },
    });

    expect(screen.getByText('Search Results')).toBeInTheDocument();
    expect(screen.getByText('1GB')).toBeInTheDocument();
    expect(screen.queryByText('10 MINS Voice')).not.toBeInTheDocument();
    expect(screen.queryByText(/buyDataPage\.providerPlanIdLabel/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('08012345678'), {
      target: { value: '08031234567' },
    });

    fireEvent.click(screen.getAllByText('1GB')[0]);

    fireEvent.click(screen.getByRole('button', { name: /buyDataPage\.buySelectedPlan/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1);
    });

    const [url, payload, config] = apiPost.mock.calls[0];
    expect(url).toBe('/transactions/data');
    expect(payload.network).toBe('mtn');
    expect(payload.planId).toBe(1);
    expect(payload.phone).toBe('08031234567');
    expect(payload.amount).toBe(475);
    expect(config.headers['Idempotency-Key']).toBe(payload.reference);

    await waitFor(() => {
      expect(screen.getByText(/purchase successful/i)).toBeInTheDocument();
    });
  });
});
