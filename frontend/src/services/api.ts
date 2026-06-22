import axios from 'axios';
import { toast } from 'react-hot-toast';
import { clearTransactionPinSession, getStoredTransactionPinSession } from '../utils/transactionPin';

const apiBaseUrl = (import.meta as any).env.VITE_API_URL || '/api';

// Derive the server root URL from the API base URL
// If VITE_API_URL is 'https://www.peacebundlle.com/api', this will be 'https://www.peacebundlle.com'
// If it's '/api', this will be an empty string, which is fine for local dev.
export const SERVER_ROOT_URL = apiBaseUrl.endsWith('/api')
  ? apiBaseUrl.slice(0, -4)
  : apiBaseUrl;

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

type RetryableRequestConfig = {
  _retry?: boolean;
  headers?: Record<string, string>;
} & Record<string, any>;

const refreshClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
let refreshPromise: Promise<string | null> | null = null;

function isPublicPathname(pathname: string) {
  return publicPaths.some((path) => pathname.startsWith(path));
}

export function clearStoredAuth() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  clearTransactionPinSession('financial');
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/auth/refresh', {})
      .then((res) => {
        if (!res.data?.success) {
          clearStoredAuth();
          return null;
        }
        return 'cookie-session-refreshed';
      })
      .catch(() => {
        clearStoredAuth();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

// Add a request interceptor to inject the token
api.interceptors.request.use(
  (config: any) => {
    const pinSession = getStoredTransactionPinSession('financial');
    if (pinSession?.token) {
      config.headers = config.headers || {};
      config.headers['x-transaction-pin-token'] = pinSession.token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isPublicPath = isPublicPathname(window.location.pathname);
    const originalRequest = (error.config || {}) as RetryableRequestConfig;
    const requestUrl = String(originalRequest.url || '');
    const isAuthRefreshCall = requestUrl.includes('/auth/refresh');
    const isLoginCall = requestUrl.includes('/auth/login');
    const isLogoutCall = requestUrl.includes('/auth/logout');

    if (error.response && error.response.status === 401 && !isPublicPath && !originalRequest._retry && !isAuthRefreshCall && !isLoginCall && !isLogoutCall) {
      originalRequest._retry = true;
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return api(originalRequest);
      }
    }

    if (error.response && error.response.status === 401 && !isPublicPath && !isLoginCall) {
      clearStoredAuth();
      
      // Prevent redirect loop if already on login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
        toast.error('Session expired. Please login again.');
      }
    }

    if (error.response && error.response.data?.code === 'TRANSACTION_PIN_SESSION_INVALID') {
      clearTransactionPinSession('financial');
    }

    // Return the error so specific components can handle it if needed
    return Promise.reject(error);
  }
);

export async function logoutSession() {
  try {
    await refreshClient.post('/auth/logout', {});
  } catch {
    void 0;
  } finally {
    clearStoredAuth();
  }
}

export default api;
