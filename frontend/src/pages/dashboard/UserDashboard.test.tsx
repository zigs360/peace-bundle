import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import UserDashboard from './UserDashboard';

const apiGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
  },
}));

vi.mock('../../hooks/useVirtualAccount', () => ({
  useVirtualAccount: () => ({
    state: {},
    refresh: vi.fn(),
    reveal: vi.fn(),
    auditCopy: vi.fn(),
    request: vi.fn(),
  }),
}));

vi.mock('../../components/VirtualAccountWidget', () => ({
  default: () => <div>Virtual Account Widget</div>,
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({
    walletVersion: 0,
    walletBalance: null,
    walletBalanceUpdatedAt: 0,
    isConnected: false,
  }),
}));

vi.mock('../../utils/storage', () => ({
  getStoredUser: () => null,
}));

describe('UserDashboard stats cleanup', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { id: 'user-1', name: 'Test User' } });
      if (url === '/transactions/stats/user-1') {
        return Promise.resolve({
          data: {
            balance: 1200,
            transactionsCount: 4,
            recentTransactions: [
              {
                id: 'tx-1',
                type: 'debit',
                description: 'Bundle purchase',
                amount: 120,
                createdAt: '2026-04-18T00:00:00.000Z',
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('removes total spent and total funded cards while preserving the simplified layout', async () => {
    render(
      <BrowserRouter>
        <UserDashboard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Wallet Balance')).toBeInTheDocument();
    expect(screen.getAllByText('Recent Transactions').length).toBeGreaterThan(0);
    expect(screen.queryByText('Total Spent')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Funded')).not.toBeInTheDocument();
  });
});
