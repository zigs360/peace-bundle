import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PinSecurityAudit from './PinSecurityAudit';

const apiGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
  },
}));

describe('PinSecurityAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockResolvedValue({
      data: {
        rows: [
          {
            id: 'evt-1',
            eventType: 'pin_recovery_otp_requested',
            status: 'success',
            createdAt: '2026-04-29T12:00:00.000Z',
            ip: '127.0.0.1',
            metadata: {
              deliveryChannels: [{ channel: 'email', destination: 'us***@test.com' }],
            },
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
  });

  it('renders PIN security events and refetches with filters', async () => {
    render(<PinSecurityAudit />);

    expect(await screen.findByText('PIN Security Audit')).toBeInTheDocument();
    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(screen.getAllByText('Recovery OTP Requested').length).toBeGreaterThan(0);
    expect(screen.getByText('success')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search user name, email, or phone'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByDisplayValue('All event types'), {
      target: { value: 'pin_locked' },
    });
    fireEvent.change(screen.getByDisplayValue('All statuses'), {
      target: { value: 'failure' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

    await waitFor(() => {
      expect(apiGet).toHaveBeenLastCalledWith('/admin/audit/transaction-pin-events', {
        params: {
          search: 'user@test.com',
          eventType: 'pin_locked',
          status: 'failure',
          limit: 100,
        },
      });
    });
  });
});
