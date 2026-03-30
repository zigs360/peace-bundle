import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from './api';
import { fetchVirtualAccountSummary, parseVirtualAccountSummary, revealVirtualAccountNumber } from './virtualAccount';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('virtualAccount service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid hasVirtualAccount=true response', () => {
    const result = parseVirtualAccountSummary({
      hasVirtualAccount: true,
      bankName: 'PALMPAY',
      accountName: 'Alias User',
      accountNumberMasked: '******1234',
      last4: '1234',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasVirtualAccount).toBe(true);
      if (result.data.hasVirtualAccount) {
        expect(result.data.bankName).toBe('PALMPAY');
      }
    }
  });

  it('parses a valid hasVirtualAccount=false response', () => {
    const result = parseVirtualAccountSummary({ hasVirtualAccount: false, message: 'Not assigned' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasVirtualAccount).toBe(false);
      if (!result.data.hasVirtualAccount) {
        expect(result.data.message).toBe('Not assigned');
      }
    }
  });

  it('rejects invalid response payloads', () => {
    const result = parseVirtualAccountSummary({ ok: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorType).toBe('invalid_response');
    }
  });

  it('fetchVirtualAccountSummary returns ok=true on success', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        hasVirtualAccount: true,
        bankName: 'PALMPAY',
        accountName: 'Alias User',
        accountNumberMasked: '******1234',
        last4: '1234',
      },
    });

    const result = await fetchVirtualAccountSummary();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasVirtualAccount).toBe(true);
      if (result.data.hasVirtualAccount) {
        expect(result.data.last4).toBe('1234');
      }
    }
  });

  it('fetchVirtualAccountSummary returns network error on network failure', async () => {
    (api.get as any).mockRejectedValue(new Error('Network Error'));
    const result = await fetchVirtualAccountSummary();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorType).toBe('network');
    }
  });

  it('fetchVirtualAccountSummary returns server message when available', async () => {
    (api.get as any).mockRejectedValue({
      response: { status: 500, data: { message: 'Internal error' } },
      message: 'Request failed',
    });
    const result = await fetchVirtualAccountSummary();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorType).toBe('server');
      expect(result.message).toBe('Internal error');
    }
  });

  it('revealVirtualAccountNumber returns ok=true for valid accountNumber', async () => {
    (api.post as any).mockResolvedValue({ data: { accountNumber: '6634530575' } });
    const result = await revealVirtualAccountNumber();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accountNumber).toBe('6634530575');
    }
  });

  it('revealVirtualAccountNumber returns ok=false for invalid responses', async () => {
    (api.post as any).mockResolvedValue({ data: { accountNumber: null } });
    const result = await revealVirtualAccountNumber();
    expect(result.ok).toBe(false);
  });
});
