import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PriceHistory from './PriceHistory';

const apiGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
  },
}));

describe('PriceHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 'h1',
            field_name: 'your_price',
            old_price: 475,
            new_price: 490,
            old_value: null,
            new_value: null,
            changed_by: 'admin@test.com',
            changed_at: '2026-04-23T12:00:00.000Z',
            reason: 'Vendor update',
            plan: {
              id: 1,
              name: '1GB [GIFTING]',
              provider: 'mtn',
              source: 'ogdams',
              plan_id: '20002',
              data_size: '1GB',
            },
          },
        ],
      },
    });
  });

  it('renders audit rows and refetches with filters', async () => {
    const { container } = render(<PriceHistory />);

    expect(await screen.findByText('Price History')).toBeInTheDocument();
    expect(await screen.findByText('1GB [GIFTING]')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    expect(screen.getByText('Vendor update')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Admin user'), { target: { value: 'admin@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Plan ID'), { target: { value: '1' } });
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0] as HTMLInputElement, { target: { value: '2026-04-20' } });
    fireEvent.change(dateInputs[1] as HTMLInputElement, { target: { value: '2026-04-23' } });
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(apiGet).toHaveBeenLastCalledWith('/admin/audit/price-history', {
        params: {
          adminUser: 'admin@test.com',
          planId: '1',
          date_from: '2026-04-20',
          date_to: '2026-04-23',
          limit: 200,
        },
      });
    });
  });
});
