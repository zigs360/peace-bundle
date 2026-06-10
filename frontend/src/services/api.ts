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
  headers: {
    'Content-Type': 'application/json',
  },
});

const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
let refreshPromise: Promise<string | null> | null = null;

function isPublicPathname(pathname: string) {
  return publicPaths.some((path) => pathname.startsWith(path));
}

function clearStoredAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  clearTransactionPinSession('financial');
}

async function refreshAccessToken(): Promise<string | null> {
  const storedRefreshToken = localStorage.getItem('refreshToken');
  if (!storedRefreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/auth/refresh', { refreshToken: storedRefreshToken })
      .then((res) => {
        const nextToken = res.data?.token as string | undefined;
        const nextRefreshToken = (res.data?.refreshToken as string | undefined) || storedRefreshToken;
        if (!nextToken) {
          clearStoredAuth();
          return null;
        }
        localStorage.setItem('token', nextToken);
        localStorage.setItem('refreshToken', nextRefreshToken);
        return nextToken;
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
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    const pinSession = getStoredTransactionPinSession('financial');
    if (pinSession) {
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
    // Handle 401 Unauthorized (Token expired or invalid)
    const hasStoredToken = Boolean(localStorage.getItem('token'));
    const hasStoredRefreshToken = Boolean(localStorage.getItem('refreshToken'));
    const isPublicPath = isPublicPathname(window.location.pathname);
    const originalRequest = (error.config || {}) as RetryableRequestConfig;

    if (error.response && error.response.status === 401 && hasStoredToken && hasStoredRefreshToken && !isPublicPath && !originalRequest._retry) {
      originalRequest._retry = true;
      const nextToken = await refreshAccessToken();
      if (nextToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${nextToken}`;
        return api(originalRequest);
      }
    }

    if (error.response && error.response.status === 401 && hasStoredToken && !isPublicPath) {
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

export default api;
