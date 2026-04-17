import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Airtel from './Airtel';

const apiGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
    post: vi.fn(),
  },
}));

vi.mock('../../../context/NotificationContext', () => ({
  useNotifications: () => ({
    walletBalance: null,
    walletBalanceUpdatedAt: 0,
  }),
}));

vi.mock('../../../utils/storage', () => ({
  getStoredUser: () => null,
}));

describe('Airtel Call Sub page', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { id: 'user-1' } });
      if (url === '/callplans/call-sub/airtel/bundles') {
        return Promise.resolve({
          data: {
            data: [
              { id: 'b1', name: 'Airtel Call Sub 10 Minutes', provider: 'airtel', price: 120, minutes: 10, validityDays: 3 },
              { id: 'b2', name: 'Airtel Call Sub 30 Minutes', provider: 'airtel', price: 330, minutes: 30, validityDays: 7 },
            ],
          },
        });
      }
      if (url === '/callplans/call-sub/airtel/history') {
        return Promise.resolve({
          data: {
            rows: [
              {
                reference: 'REF-1',
                status: 'completed',
                recipientPhoneNumber: '08081234567',
                amountCharged: 120,
                minutes: 10,
                validityDays: 3,
                expiresAt: '2026-04-21T00:00:00.000Z',
                createdAt: '2026-04-18T00:00:00.000Z',
              },
            ],
          },
        });
      }
      if (url === '/transactions/stats/user-1') {
        return Promise.resolve({ data: { balance: 5000 } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('renders only unified minute bundles and hides legacy validity selection', async () => {
    render(<Airtel />);

    await waitFor(() => {
      expect(screen.getByText('Available Bundles')).toBeInTheDocument();
    });

    expect(screen.getAllByText('10 mins').length).toBeGreaterThan(0);
    expect(screen.getByText('30 mins')).toBeInTheDocument();
    expect(screen.getByText('3 days validity')).toBeInTheDocument();
    expect(screen.getByText('7 days validity')).toBeInTheDocument();
    expect(screen.queryByText(/Validity Bundles/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Call bundle validity package/i)).not.toBeInTheDocument();
  });
});
