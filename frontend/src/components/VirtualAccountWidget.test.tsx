import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VirtualAccountWidget from './VirtualAccountWidget';
import type { VirtualAccountState } from '../hooks/useVirtualAccount';

describe('VirtualAccountWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).navigator.clipboard = { writeText: vi.fn(() => Promise.resolve()) };
  });

  it('renders loading state', () => {
    const state: VirtualAccountState = { status: 'loading', summary: null, errorMessage: null };
    render(
      <VirtualAccountWidget state={state} onReveal={async () => null} onCopy={async () => {}} onRetry={async () => {}} variant="dashboard" />
    );
    expect(screen.getByText(/Loading virtual account/i)).toBeInTheDocument();
  });

  it('renders error state and calls retry', async () => {
    const onRetry = vi.fn(async () => {});
    const state: VirtualAccountState = { status: 'error', summary: null, errorMessage: 'Failed' };
    render(<VirtualAccountWidget state={state} onReveal={async () => null} onCopy={async () => {}} onRetry={onRetry} variant="dashboard" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders ready state, reveals and copies', async () => {
    const onReveal = vi.fn(async () => '6634530575');
    const onCopy = vi.fn(async () => {});
    const state: VirtualAccountState = {
      status: 'ready',
      summary: { hasVirtualAccount: true, bankName: 'PALMPAY', accountName: 'Alias User', accountNumberMasked: '******0575', last4: '0575' },
      errorMessage: null,
    };
    render(<VirtualAccountWidget state={state} onReveal={onReveal} onCopy={onCopy} onRetry={async () => {}} variant="dashboard" />);

    expect(screen.getByText('PALMPAY')).toBeInTheDocument();
    expect(screen.getByText('******0575')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Reveal'));
    expect(onReveal).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('6634530575')).toBeInTheDocument();

    const copyButton = screen.getByTitle('Copy Account Number');
    fireEvent.click(copyButton);

    await waitFor(() => expect((globalThis as any).navigator.clipboard.writeText).toHaveBeenCalledWith('6634530575'));
    await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
  });

  it('renders empty state message', () => {
    const state: VirtualAccountState = { status: 'empty', summary: { hasVirtualAccount: false, message: 'Not assigned' }, errorMessage: null };
    render(
      <VirtualAccountWidget state={state} onReveal={async () => null} onCopy={async () => {}} onRetry={async () => {}} variant="dashboard" />
    );
    expect(screen.getByText(/Not assigned/i)).toBeInTheDocument();
  });
});
