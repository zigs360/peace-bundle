import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminTransactionsPage from './AdminTransactionsPage';

vi.mock('../../services/api', () => {
  return {
    default: {
      get: vi.fn(),
    },
  };
});

describe('AdminTransactionsPage colors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows credit in green and debit in red', async () => {
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
          },
          {
            id: '2',
            userId: 'user-debit',
            type: 'debit',
            description: 'Admin deduction: test',
            amount: 100,
            status: 'completed',
            createdAt: '2026-04-17T11:00:00.000Z',
          },
        ],
      },
    });

    render(<AdminTransactionsPage />);

    await waitFor(() => expect(screen.getByText('BillStack Funding')).toBeInTheDocument());

    const creditType = screen.getByText('credit');
    const debitType = screen.getByText('debit');
    expect(creditType.className).toContain('text-green-700');
    expect(debitType.className).toContain('text-red-700');

    const creditAmount = screen.getByText('₦450');
    const debitAmount = screen.getByText('₦100');
    expect(creditAmount.closest('div')?.className || '').toContain('text-green-600');
    expect(debitAmount.closest('div')?.className || '').toContain('text-red-600');
  });
});
