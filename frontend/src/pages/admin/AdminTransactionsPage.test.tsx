import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminTransactionsPage from './AdminTransactionsPage';

vi.mock('../../services/api', () => {
  return {
    default: {
      get: vi.fn(),
    },
  };
});

describe('AdminTransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows credit in green and debit in red and displays customer name column', async () => {
    const api = (await import('../../services/api')).default as any;
    api.get.mockResolvedValue({
      data: {
        transactions: [
          {
            id: '1',
            userId: 'user-credit',
            type: 'credit',
            description: 'BillStack Funding',
            amount: 450,
            status: 'completed',
            createdAt: '2026-04-17T10:00:00.000Z',
            user: {
              id: 'user-credit',
              name: 'Amina Bello',
              email: 'amina@example.com',
            },
          },
          {
            id: '2',
            userId: 'user-debit',
            type: 'debit',
            description: 'Admin deduction: test',
            amount: 100,
            status: 'completed',
            createdAt: '2026-04-17T11:00:00.000Z',
            user: null,
          },
        ],
        total: 2,
        totalPages: 1,
        currentPage: 1,
      },
    });

    render(<AdminTransactionsPage />);

    await waitFor(() => expect(screen.getByText('BillStack Funding')).toBeInTheDocument());

    expect(screen.getByText('Customer Name')).toBeInTheDocument();
    expect(screen.getByText('Amina Bello')).toBeInTheDocument();
    expect(screen.getByText('amina@example.com')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();

    const creditType = screen.getByText('credit');
    const debitType = screen.getByText('debit');
    expect(creditType.className).toContain('text-green-700');
    expect(debitType.className).toContain('text-red-700');

    const creditAmount = screen.getByText('₦450');
    const debitAmount = screen.getByText('₦100');
    expect(creditAmount.closest('div')?.className || '').toContain('text-green-600');
    expect(debitAmount.closest('div')?.className || '').toContain('text-red-600');
  });

  it('supports pagination controls (Next/Previous and rows per page)', async () => {
    const api = (await import('../../services/api')).default as any;
    api.get
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              id: '1',
              userId: 'u1',
              type: 'credit',
              description: 'Page 1 Txn',
              amount: 500,
              status: 'completed',
              createdAt: '2026-04-17T10:00:00.000Z',
              user: { id: 'u1', name: 'First Customer' },
            },
          ],
          total: 25,
          totalPages: 2,
          currentPage: 1,
        },
      })
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              id: '2',
              userId: 'u2',
              type: 'debit',
              description: 'Page 2 Txn',
              amount: 200,
              status: 'completed',
              createdAt: '2026-04-17T09:00:00.000Z',
              user: { id: 'u2', name: 'Second Customer' },
            },
          ],
          total: 25,
          totalPages: 2,
          currentPage: 2,
        },
      });

    render(<AdminTransactionsPage />);

    await waitFor(() => expect(screen.getByText('First Customer')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith('/admin/transactions', { params: { page: 1, limit: 20 } });
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);

    await waitFor(() => expect(screen.getByText('Second Customer')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith('/admin/transactions', { params: { page: 2, limit: 20 } });
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });
});
