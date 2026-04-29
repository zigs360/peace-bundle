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

function mockApiForPinStatus(hasPin: boolean) {
  apiGet.mockImplementation((path: string) => {
    if (path === '/auth/transaction-pin') {
      return Promise.resolve({
        data: {
          data: {
            hasPin,
            failedAttemptsRemaining: 5,
            lockedUntil: null,
          },
        },
      });
    }

    if (path === '/auth/me') {
      return Promise.resolve({
        data: {
          id: 'user-1',
          fullName: 'Test User',
          phone: '08012345678',
          email: 'user@test.com',
          referralCode: 'REF123',
          kyc_status: 'none',
          hasTransactionPin: true,
        },
      });
    }

    return Promise.resolve({ data: {} });
  });
}

describe('Settings transaction PIN flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedStoredUser();
  });

  it('creates a transaction PIN from the settings page', async () => {
    mockApiForPinStatus(false);
    apiPost.mockResolvedValue({ data: { success: true } });

    render(<Settings />);

    await screen.findByText('Transaction PIN');

    fireEvent.change(screen.getByPlaceholderText('Account password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('New 4-digit PIN'), { target: { value: '12ab34' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Transaction PIN' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/transaction-pin', {
        password: 'password123',
        pin: '1234',
        confirmPin: '1234',
      });
    });

    expect(await screen.findByText('Transaction PIN created successfully')).toBeInTheDocument();
  });

  it('changes an existing transaction PIN from the settings page', async () => {
    mockApiForPinStatus(true);
    apiPut.mockResolvedValue({ data: { success: true } });

    render(<Settings />);

    await screen.findByText('Change PIN');

    fireEvent.change(screen.getByPlaceholderText('Current PIN'), { target: { value: '4826' } });
    fireEvent.change(screen.getAllByPlaceholderText('New PIN')[0], { target: { value: '5937' } });
    fireEvent.change(screen.getAllByPlaceholderText('Confirm new PIN')[0], { target: { value: '5937' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Transaction PIN' }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith('/auth/transaction-pin', {
        currentPin: '4826',
        newPin: '5937',
        confirmPin: '5937',
      });
    });

    expect(await screen.findByText('Transaction PIN changed successfully')).toBeInTheDocument();
  });

  it('requests a recovery OTP and submits PIN recovery with that OTP', async () => {
    mockApiForPinStatus(true);
    apiPost.mockImplementation((path: string) => {
      if (path === '/auth/transaction-pin/recovery/otp') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              expiresAt: '2026-04-29T12:00:00.000Z',
              deliveryChannels: [{ channel: 'email', destination: 'us***@test.com' }],
            },
          },
        });
      }

      if (path === '/auth/transaction-pin/recover') {
        return Promise.resolve({ data: { success: true } });
      }

      return Promise.resolve({ data: { success: true } });
    });

    render(<Settings />);

    await screen.findByText('Forgot PIN Recovery');

    fireEvent.click(screen.getByRole('button', { name: 'Send Recovery OTP' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/transaction-pin/recovery/otp');
    });

    expect(await screen.findByText(/Recovery code sent successfully/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Account password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('6-digit recovery OTP'), { target: { value: '654321' } });
    fireEvent.change(screen.getAllByPlaceholderText('New PIN')[1], { target: { value: '5937' } });
    fireEvent.change(screen.getAllByPlaceholderText('Confirm new PIN')[1], { target: { value: '5937' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recover Transaction PIN' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/transaction-pin/recover', {
        password: 'password123',
        otp: '654321',
        newPin: '5937',
        confirmPin: '5937',
      });
    });

    expect(await screen.findByText('Transaction PIN recovered successfully')).toBeInTheDocument();
  });
});
