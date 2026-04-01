import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FundingReviews from './FundingReviews';

vi.mock('../../services/api', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

vi.mock('react-hot-toast', () => {
  return {
    toast: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

describe('FundingReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).confirm = vi.fn(() => true);
  });

  it('renders transactions and approves one', async () => {
    const api = (await import('../../services/api')).default as any;
    api.get.mockResolvedValue({
      data: {
        success: true,
        transactions: [
          {
            id: 't1',
            reference: 'REF-1',
            amount: 2000,
            status: 'pending',
            createdAt: new Date().toISOString(),
            metadata: { review_status: 'pending_review', review_reason: 'mock_bvn_cap' },
            user: { id: 'u1', name: 'User One', email: 'u1@test.com' },
          },
        ],
        totalPages: 1,
        currentPage: 1,
      },
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <FundingReviews />
      </MemoryRouter>
    );

    expect(await screen.findByText('Pending Funding Reviews')).toBeInTheDocument();
    expect(await screen.findByText('User One')).toBeInTheDocument();
    expect(screen.getByText('REF-1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/funding/pending-review/t1/approve', {}));
  });
});

