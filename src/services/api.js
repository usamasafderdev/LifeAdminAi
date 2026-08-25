import axios from 'axios';
import { getToken } from '../utils/authStorage';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      window.dispatchEvent(new Event('lifeadmin:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error.response) return 'Unable to connect to LifeAdmin. Please try again.';
  return error.response.data?.message || fallback;
}

export default api;
