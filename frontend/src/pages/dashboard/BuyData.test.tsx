import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BuyData from './BuyData';

const apiGet = vi.fn();
const apiPost = vi.fn();

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

describe('BuyData page', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiGet.mockReset();
    apiPost.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));

    apiGet.mockResolvedValue({
      data: [
        {
          id: 2,
          network: 'mtn',
          provider: 'mtn',
          plan: '110MB [GIFTING]',
          name: '110MB [GIFTING]',
          plan_id: '20001',
          validity: '1 Day',
          teleco_price: 100,
          our_price: 95,
          size: '110MB',
          size_mb: 110,
        },
        {
          id: 1,
          network: 'mtn',
          provider: 'mtn',
          plan: '1GB [GIFTING]',
          name: '1GB [GIFTING]',
          plan_id: '20002',
          validity: '1 Day',
          teleco_price: 500,
          our_price: 475,
          size: '1GB',
          size_mb: 1024,
        },
        {
          id: 3,
          network: 'airtel',
          provider: 'airtel',
          plan: '2GB [GIFTING]',
          name: '2GB [GIFTING]',
          plan_id: '30002',
          validity: '7 Days',
          teleco_price: 900,
          our_price: 855,
          size: '2GB',
          size_mb: 2048,
        },
        {
          id: 4,
          network: 'glo',
          provider: 'glo',
          plan: '10GB [GIFTING]',
          name: '10GB [GIFTING]',
          plan_id: '40002',
          validity: '30 Days',
          teleco_price: 4200,
          our_price: 3990,
          size: '10GB',
          size_mb: 10240,
        },
      ],
    });

    apiPost.mockResolvedValue({
      data: {
        success: true,
        charged_price: 475,
        transaction_ref: 'DATA-REF-001',
        transaction: { reference: 'DATA-REF-001' },
      },
    });
  });

  it('groups plans by network, filters by size, and submits the selected plan purchase payload', async () => {
    render(<BuyData />);

    await waitFor(() => {
      expect(screen.getByText('MTN')).toBeInTheDocument();
    });

    expect(screen.getByText('Airtel')).toBeInTheDocument();
    expect(screen.getByText('Glo')).toBeInTheDocument();
    expect(screen.getByText('1GB [GIFTING]')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search by size/i), {
      target: { value: '1GB' },
    });

    expect(screen.getByText('1GB [GIFTING]')).toBeInTheDocument();
    expect(screen.queryByText('10GB [GIFTING]')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('08012345678'), {
      target: { value: '08031234567' },
    });

    fireEvent.click(screen.getByText('1GB [GIFTING]'));

    fireEvent.click(screen.getByRole('button', { name: /buy selected plan/i }));

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
