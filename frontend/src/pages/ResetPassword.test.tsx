import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPassword from './ResetPassword';

const get = vi.fn();
const post = vi.fn();

vi.mock('../services/api', () => ({
  default: {
    get,
    post,
  },
}));

describe('ResetPassword Page', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('validates the token and shows live password rule feedback', async () => {
    get.mockResolvedValue({
      data: {
        message: 'Password reset token is valid.',
      },
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=test-token']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/password reset link is valid/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'Weakpass' } });

    expect(screen.getByText(/at least one number/i)).toBeInTheDocument();
    expect(screen.getByText(/at least one special character/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'Str0ng!Pass' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'Str0ng!Pass' } });
    post.mockResolvedValue({
      data: {
        message: 'Your password has been reset successfully. You can now sign in.',
      },
    });

    fireEvent.submit(screen.getByRole('button', { name: /update password/i }).closest('form')!);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/auth/password-reset/complete', {
        token: 'test-token',
        newPassword: 'Str0ng!Pass',
        confirmPassword: 'Str0ng!Pass',
      });
    });
    expect(await screen.findByText(/password has been reset successfully/i)).toBeInTheDocument();
  });
});
