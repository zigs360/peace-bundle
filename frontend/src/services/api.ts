import axios from 'axios';
import { toast } from 'react-hot-toast';

const apiBaseUrl = (import.meta as any).env.VITE_API_URL || '/api';

// Derive the server root URL from the API base URL
// If VITE_API_URL is 'https://www.peacebundle.com/api', this will be 'https://www.peacebundle.com'
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

// Add a request interceptor to inject the token
api.interceptors.request.use(
  (config: any) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized (Token expired or invalid)
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Prevent redirect loop if already on login
      if (window.location.pathname !== '/login') {
          window.location.href = '/login';
          toast.error('Session expired. Please login again.');
      }
    }

    // Return the error so specific components can handle it if needed
    return Promise.reject(error);
  }
);

export default api;
