import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionIntegrityAudit from './TransactionIntegrityAudit';

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
    post: (...args: any[]) => apiPost(...args),
  },
}));

describe('TransactionIntegrityAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('alert', vi.fn());

    apiGet.mockImplementation((url: string) => {
      if (url === '/admin/audit/transaction-integrity/summary') {
        return Promise.resolve({
          data: {
            success: true,
            audits: {
              total: 5,
              open: 2,
              resolved: 3,
              bySeverity: { critical: 2 },
              byStatus: { open: 2, resolved: 3 },
              byEventType: { duplicate_charge_detected: 1 },
            },
            transactions: {
              scanned: 10,
              flagged: 4,
              refunded: 2,
              failed: 1,
              pendingIntegrityReview: 3,
              byIntegrityStatus: { auto_refunded: 2, route_locked: 3 },
              byPaymentChannel: { ogdams_wallet: 3, connected_sim: 1 },
              byFulfillmentRoute: { ogdams_api: 2, sim_pool: 1 },
            },
            latestMonitor: {
              runAt: '2026-05-03T12:00:00.000Z',
              report: {
                duplicateRefunds: 1,
                failedRefundsRecovered: 2,
                staleTransactionsResolved: 3,
                scanned: 20,
              },
            },
          },
        });
      }

      return Promise.resolve({
        data: {
          success: true,
          count: 1,
          rows: [
            {
              id: 'audit-1',
              eventType: 'duplicate_charge_detected',
              severity: 'critical',
              status: 'open',
              createdAt: '2026-05-03T12:10:00.000Z',
              details: { keptReference: 'KEEP-001' },
              user: { id: 'user-1', email: 'user@test.com' },
              transaction: {
                id: 'txn-1',
                reference: 'TXN-001',
                source: 'airtime_purchase',
                status: 'refunded',
                payment_channel: 'ogdams_wallet',
                fulfillment_route: 'ogdams_api',
                integrity_status: 'auto_refunded',
                refund_reference: 'RFND-001',
                anomaly_flag: true,
              },
            },
          ],
        },
      });
    });

    apiPost.mockResolvedValue({
      data: {
        success: true,
        summary: {
          duplicateRefunds: 2,
          failedRefundsRecovered: 1,
          staleTransactionsResolved: 1,
          scanned: 8,
        },
      },
    });
  });

  it('renders summary cards and audit rows', async () => {
    render(<TransactionIntegrityAudit />);

    expect(await screen.findByText('Transaction Integrity Audit')).toBeInTheDocument();
    expect(await screen.findByText('TXN-001')).toBeInTheDocument();
    expect(screen.getByText('Open Audits')).toBeInTheDocument();
    expect(screen.getByText('Flagged Transactions')).toBeInTheDocument();
    expect(screen.getByText('Kept ref: KEEP-001')).toBeInTheDocument();
  });

  it('applies filters and triggers a repair pass', async () => {
    render(<TransactionIntegrityAudit />);

    await screen.findByText('TXN-001');

    fireEvent.change(screen.getByDisplayValue('Last 24 Hours'), { target: { value: '72' } });
    fireEvent.change(screen.getByDisplayValue('All Severities'), { target: { value: 'critical' } });
    fireEvent.change(screen.getByPlaceholderText('Search reference'), { target: { value: 'TXN-001' } });
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/admin/audit/transaction-integrity', {
        params: expect.objectContaining({
          sinceHours: 72,
          severity: 'critical',
          transactionReference: 'TXN-001',
          anomalyOnly: 'true',
          limit: 100,
        }),
      });
    });

    fireEvent.click(screen.getByText('Run Repair Pass'));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/admin/audit/transaction-integrity/repair', { limit: 250 });
    });
  });
});
