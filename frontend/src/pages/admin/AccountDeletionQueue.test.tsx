import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountDeletionQueue from './AccountDeletionQueue';

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

describe('AccountDeletionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockImplementation((url: string) => {
      if (url === '/admin/account-deletion/requests') {
        return Promise.resolve({
          data: {
            rows: [
              {
                id: 'req-1',
                status: 'pending',
                requestedAt: '2026-06-10T12:00:00.000Z',
                graceEndsAt: '2026-06-18T12:00:00.000Z',
                reviewState: 'ready_for_review',
                isReadyForReview: true,
                user: {
                  id: 'user-1',
                  name: 'Test User',
                  email: 'user@test.com',
                  phone: '08012345678',
                },
              },
            ],
          },
        });
      }

      if (url === '/admin/account-deletion/requests/req-1') {
        return Promise.resolve({
          data: {
            request: {
              id: 'req-1',
              status: 'pending',
              requestedAt: '2026-06-10T12:00:00.000Z',
              graceEndsAt: '2026-06-18T12:00:00.000Z',
              reviewState: 'ready_for_review',
              isReadyForReview: true,
              requestReason: 'Privacy request',
              user: {
                id: 'user-1',
                name: 'Test User',
                email: 'user@test.com',
                phone: '08012345678',
              },
              associatedData: {
                createdAt: '2026-01-01T12:00:00.000Z',
                lastActivityAt: '2026-06-12T12:00:00.000Z',
                wallet: {
                  balance: 4500,
                  bonusBalance: 0,
                  commissionBalance: 0,
                  currency: 'NGN',
                },
                counts: {
                  transactions: 3,
                  beneficiaries: 1,
                },
                recentTransactions: [
                  {
                    id: 'txn-1',
                    reference: 'TXN-1',
                    source: 'data_purchase',
                    amount: 500,
                    status: 'completed',
                    createdAt: '2026-06-12T12:00:00.000Z',
                  },
                ],
              },
              audits: [
                {
                  id: 'audit-1',
                  actorType: 'user',
                  eventType: 'request_submitted',
                  status: 'success',
                  createdAt: '2026-06-10T12:00:00.000Z',
                },
              ],
            },
          },
        });
      }

      return Promise.resolve({ data: {} });
    });
    apiPost.mockResolvedValue({ data: { success: true } });
  });

  it('loads request detail and approves a pending ready request', async () => {
    render(<AccountDeletionQueue />);

    expect(await screen.findByText('Account Deletion Queue')).toBeInTheDocument();
    expect(await screen.findByText('Test User')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /View/i }));

    expect(await screen.findByText('Request Detail')).toBeInTheDocument();
    expect(await screen.findByText('Privacy request')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Record the business and compliance reason for this action'), {
      target: { value: 'Verified request after grace period' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/admin/account-deletion/requests/req-1/approve', {
        reason: 'Verified request after grace period',
      });
    });
  });
});
