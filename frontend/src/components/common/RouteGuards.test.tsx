import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminRoute from './AdminRoute';
import ProtectedRoute from './ProtectedRoute';
import api from '../../services/api';

vi.mock('../../services/api');

describe('Route Guards Verification', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('AdminRoute', () => {
    it('redirects unauthenticated users to /login', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminRoute><div>Admin Content</div></AdminRoute>} />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Login Page')).toBeInTheDocument();
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    });

    it('redirects regular users with role="user" to /dashboard', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ id: 1, role: 'user' }));

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminRoute><div>Admin Content</div></AdminRoute>} />
            <Route path="/dashboard" element={<div>User Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('User Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    });

    it('allows admin users with role="admin" to view Admin Content', async () => {
      localStorage.setItem('token', 'admin-token');
      localStorage.setItem('user', JSON.stringify({ id: 2, role: 'admin' }));
      (api.get as any).mockResolvedValueOnce({ data: { role: 'admin' } });

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminRoute><div>Admin Content</div></AdminRoute>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Admin Content')).toBeInTheDocument();
    });
  });

  describe('ProtectedRoute', () => {
    it('redirects unauthenticated users to /login', async () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><div>User Content</div></ProtectedRoute>} />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Login Page')).toBeInTheDocument();
      expect(screen.queryByText('User Content')).not.toBeInTheDocument();
    });

    it('allows authenticated users to view User Content', async () => {
      localStorage.setItem('token', 'user-token');
      localStorage.setItem('user', JSON.stringify({ id: 1, role: 'user' }));
      (api.get as any).mockResolvedValueOnce({ data: { id: 1 } });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><div>User Content</div></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('User Content')).toBeInTheDocument();
    });
  });
});
