import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationProvider, useNotifications } from './NotificationContext';
import api from '../services/api';

type HandlerMap = Record<string, ((...args: any[]) => void)[]>;

let handlers: HandlerMap = {};

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(() => {
      return {
        on: (event: string, cb: (...args: any[]) => void) => {
          handlers[event] = handlers[event] || [];
          handlers[event].push(cb);
        },
        close: vi.fn(),
      };
    }),
  };
});

vi.mock('react-hot-toast', () => {
  const toastFn: any = vi.fn();
  toastFn.success = vi.fn();
  toastFn.error = vi.fn();
  toastFn.dismiss = vi.fn();
  return { default: toastFn };
});

function Probe() {
  const { walletBalance, walletVersion } = useNotifications();
  return (
    <div>
      <div data-testid="balance">{walletBalance === null ? 'null' : String(walletBalance)}</div>
      <div data-testid="version">{String(walletVersion)}</div>
    </div>
  );
}

describe('NotificationContext wallet_balance_updated', () => {
  beforeEach(() => {
    handlers = {};
    localStorage.setItem('token', 'test');
    localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));
    localStorage.removeItem('wallet_balance');
    vi.restoreAllMocks();
  });

  it('updates walletBalance and increments walletVersion on wallet_balance_updated', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: any) => {
      if (String(url).startsWith('/transactions/stats/')) {
        return { data: { balance: 2000 } } as any;
      }
      return { data: { success: true, data: [] } } as any;
    });

    vi.useFakeTimers();
    render(
      <NotificationProvider>
        <Probe />
      </NotificationProvider>
    );

    expect(screen.getByTestId('balance').textContent).toBe('null');
    expect(screen.getByTestId('version').textContent).toBe('0');

    const listeners = handlers['wallet_balance_updated'] || [];
    expect(listeners.length).toBeGreaterThan(0);
    await act(async () => {
      await listeners[0]({ reference: 'R1', amount: 500, balance: '1500.00', gateway: 'billstack' });
    });

    expect(screen.getByTestId('balance').textContent).toBe('1500');
    expect(screen.getByTestId('version').textContent).toBe('1');

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await vi.runAllTicks();
    });

    expect(screen.getByTestId('balance').textContent).toBe('2000');
    vi.useRealTimers();
  });
});
