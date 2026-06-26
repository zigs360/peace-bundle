import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Register from './Register';

const apiPost = vi.fn();
const navigateMock = vi.fn();

vi.mock('../services/api', () => ({
  default: {
    post: (...args: any[]) => apiPost(...args),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../components/ui/AuthShell', () => ({
  default: ({ title, subtitle, children }: any) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe('Register referral links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiPost.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          fullName: 'Referral User',
          email: 'referral@test.com',
          phone: '08012345678',
          referralCode: 'NEW1234',
        },
      },
    });
  });

  it('prefills the referral code from the shared ?ref= link and submits it', async () => {
    render(
      <MemoryRouter initialEntries={['/register?ref=REF1234']}>
        <Routes>
          <Route path="/register" element={<Register />} />
        </Routes>
      </MemoryRouter>,
    );

    const referralInput = screen.getByPlaceholderText('Referral Code') as HTMLInputElement;
    expect(referralInput.value).toBe('REF1234');

    fireEvent.change(screen.getByPlaceholderText('Al-Amin Aminu'), { target: { value: 'Referral User' } });
    fireEvent.change(screen.getByPlaceholderText('al-amin@example.com'), { target: { value: 'referral@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('08012345678'), { target: { value: '08012345678' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.createAccount' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
        referralCode: 'REF1234',
      }));
    });

    expect(localStorage.getItem('pendingReferralCode')).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('tracks a referral click and sends the click token on submit', async () => {
    apiPost.mockImplementation((url: string, data?: any) => {
      if (url === '/auth/referral/click') {
        return Promise.resolve({ data: { success: true, tracked: true } });
      }
      return Promise.resolve({
        data: {
          user: {
            id: 'user-1',
            fullName: 'Referral User',
            email: 'referral@test.com',
            phone: '08012345678',
            referralCode: 'NEW1234',
          },
        },
      });
    });

    render(
      <MemoryRouter initialEntries={['/register?ref=REF5678']}>
        <Routes>
          <Route path="/register" element={<Register />} />
        </Routes>
      </MemoryRouter>,
    );

    // Verify click tracking was called
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/referral/click', expect.objectContaining({
        referralCode: 'REF5678',
        clickToken: expect.stringMatching(/^clk_/),
      }));
    });

    // Check localStorage contains the token
    const token = localStorage.getItem('pendingReferralClickToken');
    expect(token).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Al-Amin Aminu'), { target: { value: 'Referral User' } });
    fireEvent.change(screen.getByPlaceholderText('al-amin@example.com'), { target: { value: 'referral@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('08012345678'), { target: { value: '08012345678' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.createAccount' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
        referralCode: 'REF5678',
        referralClickToken: token,
      }));
    });

    expect(localStorage.getItem('pendingReferralCode')).toBeNull();
    expect(localStorage.getItem('pendingReferralClickToken')).toBeNull();
  });
});

