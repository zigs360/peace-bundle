import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ForgotPassword from './ForgotPassword';

const post = vi.fn();

vi.mock('../services/api', () => ({
  default: {
    post,
  },
}));

describe('ForgotPassword Page', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('submits the registered email address and shows the generic success message', async () => {
    post.mockResolvedValue({
      data: {
        message: 'If an account exists for that email, a password reset link will be sent shortly.',
      },
    });

    render(
      <BrowserRouter>
        <ForgotPassword />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'reset-user@test.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }).closest('form')!);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/auth/password-reset/request', { email: 'reset-user@test.com' });
    });
    expect(await screen.findByText(/password reset link will be sent shortly/i)).toBeInTheDocument();
  });

  it('shows the development reset link when email delivery is not configured', async () => {
    post.mockResolvedValue({
      data: {
        message: 'Email delivery is not configured in this environment. Use the development reset link below. The link expires in 1 hour.',
        devResetLink: 'http://localhost:5173/reset-password?token=dev-token',
      },
    });

    render(
      <BrowserRouter>
        <ForgotPassword />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'reset-user@test.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }).closest('form')!);

    expect(await screen.findByText(/development reset link/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /http:\/\/localhost:5173\/reset-password\?token=dev-token/i })).toBeInTheDocument();
  });
});
