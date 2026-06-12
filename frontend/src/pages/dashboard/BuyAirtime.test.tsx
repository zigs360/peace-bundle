import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BuyAirtime from './BuyAirtime';

const apiGet = vi.fn();
const apiPost = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
    post: (...args: any[]) => apiPost(...args),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: (...args: any[]) => toastSuccess(...args),
    error: (...args: any[]) => toastError(...args),
  },
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({
    pricingVersion: 1,
    walletBalance: 5000,
    walletBalanceUpdatedAt: Date.now(),
  }),
}));

vi.mock('../../hooks/useTransactionPinGate', () => ({
  useTransactionPinGate: () => ({
    ensureTransactionPin: async (callback: () => Promise<void>) => callback(),
    prompt: null,
  }),
}));

describe('BuyAirtime page', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();

    apiGet.mockResolvedValue({ data: [] });
    apiPost.mockResolvedValue({
      data: {
        success: true,
        message: 'Airtime purchase successful',
        balance: 4900,
        transaction: {
          reference: 'AIR-12345',
          status: 'completed',
          provider: 'mtn',
          recipient_phone: '08031234567',
          amount: 100,
          metadata: {
            vend_amount: 100,
            service_provider: 'ogdams',
          },
        },
      },
    });
  });

  it('submits airtime purchases to the dedicated airtime endpoint and renders the result card', async () => {
    render(<BuyAirtime />);

    fireEvent.change(screen.getByPlaceholderText('08012345678 or +234...'), {
      target: { value: '08031234567' },
    });

    await waitFor(() => {
      expect(screen.getByText('Select Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Min 50'), {
      target: { value: '100' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Purchase Airtime' }).closest('form')!);

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/transactions/airtime', {
        phone: '08031234567',
        serviceType: 'airtime',
        network: 'mtn',
        amount: 100,
      });
    });

    expect(await screen.findByText('Purchase Successful')).toBeInTheDocument();
    expect(screen.getByText('AIR-12345')).toBeInTheDocument();
    expect(screen.getByText('ogdams')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('Airtime purchase successful');
  });

  it('shows refunded airtime result details and stores the updated balance when the request fails after auto-reversal', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        data: {
          success: false,
          message: 'Provider failed. Transaction was automatically reversed',
          balance: 5000,
          transaction: {
            reference: 'AIR-REFUND-123',
            status: 'refunded',
            provider: 'mtn',
            recipient_phone: '08031234567',
            amount: 100,
            metadata: {
              vend_amount: 100,
              service_provider: 'smeplug',
            },
          },
        },
      },
    });

    render(<BuyAirtime />);

    fireEvent.change(screen.getByPlaceholderText('08012345678 or +234...'), {
      target: { value: '08031234567' },
    });

    await waitFor(() => {
      expect(screen.getByText('Select Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Min 50'), {
      target: { value: '100' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Purchase Airtime' }).closest('form')!);

    expect(await screen.findByText('Purchase Reversed')).toBeInTheDocument();
    expect(screen.getByText('AIR-REFUND-123')).toBeInTheDocument();
    expect(screen.getByText('smeplug')).toBeInTheDocument();
    expect(screen.getByText('₦5,000')).toBeInTheDocument();
    expect(localStorage.getItem('wallet_balance')).toBe('5000');
    expect(toastError).toHaveBeenCalledWith('Provider failed. Transaction was automatically reversed');
  });
});
