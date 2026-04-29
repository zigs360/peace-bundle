import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionPinPrompt from './TransactionPinPrompt';

const apiPost = vi.fn();
const storeTransactionPinSession = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    post: (...args: any[]) => apiPost(...args),
  },
}));

vi.mock('../../utils/transactionPin', () => ({
  storeTransactionPinSession: (...args: any[]) => storeTransactionPinSession(...args),
}));

describe('TransactionPinPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects incomplete PIN input before calling the API', async () => {
    render(
      <TransactionPinPrompt
        open
        onClose={vi.fn()}
        onVerified={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('0000'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }));

    expect(await screen.findByText('Enter your 4-digit transaction PIN')).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('verifies the PIN, sanitizes input, and stores the session', async () => {
    const onClose = vi.fn();
    const onVerified = vi.fn();

    apiPost.mockResolvedValue({
      data: {
        data: {
          token: 'pin-token',
          expiresAt: 123456789,
          timeoutMs: 300000,
        },
      },
    });

    render(
      <TransactionPinPrompt
        open
        onClose={onClose}
        onVerified={onVerified}
        amountLabel="wallet funding of NGN 5,000"
      />
    );

    const input = screen.getByPlaceholderText('0000') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12ab34' } });
    expect(input.value).toBe('1234');

    fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/transaction-pin/session', {
        pin: '1234',
        scope: 'financial',
      });
    });

    expect(storeTransactionPinSession).toHaveBeenCalledWith(
      {
        token: 'pin-token',
        expiresAt: 123456789,
        timeoutMs: 300000,
        scope: 'financial',
      },
      'financial'
    );
    expect(onVerified).toHaveBeenCalledWith({
      token: 'pin-token',
      expiresAt: 123456789,
      timeoutMs: 300000,
      scope: 'financial',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
