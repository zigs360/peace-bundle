import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings from './Settings';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
    post: (...args: any[]) => apiPost(...args),
    put: (...args: any[]) => apiPut(...args),
  },
  SERVER_ROOT_URL: '',
}));

function seedStoredUser() {
  localStorage.setItem('user', JSON.stringify({
    id: 'user-1',
    fullName: 'Test User',
    phone: '08012345678',
    email: 'user@test.com',
    referralCode: 'REF123',
    kyc_status: 'none',
    avatar: null,
  }));
}

describe('Settings account deletion flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedStoredUser();
    apiGet.mockImplementation((path: string) => {
      if (path === '/auth/transaction-pin') {
        return Promise.resolve({
          data: {
            data: {
              hasPin: false,
              failedAttemptsRemaining: 5,
              lockedUntil: null,
            },
          },
        });
      }
      if (path === '/users/account-deletion') {
        return Promise.resolve({
          data: {
            request: null,
            retentionPolicy: 'Minimal compliance audit logs are retained only as irreversible hashes.',
            minimumGracePeriodDays: 7,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('submits an account deletion request after email verification', async () => {
    apiPost.mockImplementation((path: string) => {
      if (path === '/users/account-deletion/verification') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              destination: 'us***@test.com',
              expiresAt: '2026-06-22T12:00:00.000Z',
              resendAvailableAt: '2026-06-22T11:46:00.000Z',
            },
          },
        });
      }

      if (path === '/users/account-deletion/request') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'req-1',
              status: 'pending',
              canCancel: true,
              reviewState: 'grace_period',
            },
          },
        });
      }

      return Promise.resolve({ data: { success: true } });
    });

    render(<Settings />);

    expect(await screen.findByText('Account Deletion')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send Email Verification Code' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/users/account-deletion/verification');
    });

    fireEvent.change(screen.getByPlaceholderText('Enter 6-digit code'), { target: { value: '654321' } });
    fireEvent.change(screen.getByPlaceholderText('Tell us why you want to delete this account'), { target: { value: 'Privacy request' } });
    fireEvent.click(screen.getByLabelText(/I understand that account deletion is permanent/i));
    fireEvent.click(screen.getByLabelText(/I acknowledge the data retention policy/i));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Account Deletion Request' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/users/account-deletion/request', {
        verificationCode: '654321',
        reason: 'Privacy request',
        confirmPermanentDeletion: true,
        acknowledgeRetentionPolicy: true,
      });
    });

    expect(await screen.findByText('Account deletion request submitted successfully')).toBeInTheDocument();
  });
});
