import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

vi.mock('../../services/api', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({
    treasuryBalance: 650,
    treasuryBalanceUpdatedAt: 1,
    treasurySnapshot: {
      balance: 650,
      currency: 'NGN',
      lastSyncAt: '2026-04-17T00:00:00.000Z',
      revenue: {
        totalRecognizedRevenue: 1720,
        feeRevenue: 420,
        dataProfit: 1300,
        syncEntries: 8,
      },
      withdrawals: {
        totalCompletedWithdrawals: 1070,
        totalPendingWithdrawals: 0,
        totalFailedWithdrawals: 0,
        totalReversals: 0,
        completedCount: 3,
        pendingCount: 0,
        failedCount: 0,
        reversalCount: 0,
      },
      reconciliation: {
        expectedAvailableBalance: 650,
        actualAvailableBalance: 650,
        difference: 0,
        isConsistent: true,
      },
    },
  }),
}));

describe('AdminDashboard treasury reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          app: 'frontend',
          commit: 'd36b0ef110d8061971272da439cf8a77c1f61527',
          time: '2026-04-17T00:00:00.000Z',
        }),
      }))
    );
  });

  it('shows recognized revenue separately from available treasury balance', async () => {
    const api = (await import('../../services/api')).default as any;
    api.get.mockImplementation(async (url: string) => {
      if (url === '/admin/stats') {
        return {
          data: {
            stats: {
              total_revenue: 1720,
              total_users: 20,
              total_transactions: 40,
              active_sims: 8,
              treasury_available_balance: 650,
              treasury_withdrawn_total: 1070,
              treasury_pending_withdrawals: 0,
              treasury_reconciliation_difference: 0,
            },
            recentTransactions: [],
            treasury: {
              balance: 650,
              currency: 'NGN',
              lastSyncAt: '2026-04-17T00:00:00.000Z',
              revenue: {
                totalRecognizedRevenue: 1720,
                feeRevenue: 420,
                dataProfit: 1300,
                syncEntries: 8,
              },
              withdrawals: {
                totalCompletedWithdrawals: 1070,
                totalPendingWithdrawals: 0,
                totalFailedWithdrawals: 0,
                totalReversals: 0,
                completedCount: 3,
                pendingCount: 0,
                failedCount: 0,
                reversalCount: 0,
              },
              reconciliation: {
                expectedAvailableBalance: 650,
                actualAvailableBalance: 650,
                difference: 0,
                isConsistent: true,
              },
            },
          },
        };
      }
      if (url === '/admin/treasury/balance') {
        return {
          data: {
            balance: 650,
            currency: 'NGN',
            lastSyncAt: '2026-04-17T00:00:00.000Z',
            revenue: {
              totalRecognizedRevenue: 1720,
              feeRevenue: 420,
              dataProfit: 1300,
              syncEntries: 8,
            },
            withdrawals: {
              totalCompletedWithdrawals: 1070,
              totalPendingWithdrawals: 0,
              totalFailedWithdrawals: 0,
              totalReversals: 0,
              completedCount: 3,
              pendingCount: 0,
              failedCount: 0,
              reversalCount: 0,
            },
            reconciliation: {
              expectedAvailableBalance: 650,
              actualAvailableBalance: 650,
              difference: 0,
              isConsistent: true,
            },
          },
        };
      }
      if (url === '/meta') {
        return {
          data: {
            success: true,
            commit: 'd36b0ef110d8061971272da439cf8a77c1f61527',
            time: '2026-04-17T00:00:00.000Z',
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('admin.recognizedRevenue').length).toBeGreaterThan(0));

    expect(screen.getAllByText(/1,720/).length).toBeGreaterThan(0);
    expect(screen.getByText('admin.availableBalance')).toBeInTheDocument();
    expect(screen.getAllByText(/650/).length).toBeGreaterThan(0);
    expect(screen.getByText('admin.withdrawnSettled')).toBeInTheDocument();
    expect(screen.getAllByText(/1,070/).length).toBeGreaterThan(0);
    expect(screen.getByText('admin.reconciliationHealthy')).toBeInTheDocument();
    expect(screen.getByText('admin.frontendBuild')).toBeInTheDocument();
    expect(screen.getByText('admin.backendBuild')).toBeInTheDocument();
    expect(screen.getAllByText('d36b0ef').length).toBeGreaterThanOrEqual(2);
  });
});
