import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import api from '../services/api';
import { useVirtualAccount } from './useVirtualAccount';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const TestComponent = () => {
  const { state, refresh } = useVirtualAccount();
  return (
    <div>
      <div data-testid="status">{state.status}</div>
      <div data-testid="message">{state.status === 'error' ? state.errorMessage : ''}</div>
      <button onClick={refresh}>refresh</button>
      <div data-testid="bank">{state.status === 'ready' ? state.summary.bankName : ''}</div>
      <div data-testid="empty">{state.status === 'empty' ? state.summary.message || '' : ''}</div>
    </div>
  );
};

describe('useVirtualAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets status=ready on successful retrieval', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        hasVirtualAccount: true,
        bankName: 'PALMPAY',
        accountName: 'Alias User',
        accountNumberMasked: '******1234',
        last4: '1234',
      },
    });

    render(<TestComponent />);
    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(screen.getByTestId('bank').textContent).toBe('PALMPAY');
  });

  it('sets status=empty when no virtual account exists', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        hasVirtualAccount: false,
        message: 'No virtual account assigned yet.',
      },
    });

    render(<TestComponent />);
    expect(await screen.findByText('empty')).toBeInTheDocument();
    expect(screen.getByTestId('empty').textContent).toBe('No virtual account assigned yet.');
  });

  it('sets status=error on fetch failure', async () => {
    (api.get as any).mockRejectedValue(new Error('Network Error'));
    render(<TestComponent />);
    expect(await screen.findByText('error')).toBeInTheDocument();
    expect(screen.getByTestId('message').textContent).toContain('Network Error');
  });
});

