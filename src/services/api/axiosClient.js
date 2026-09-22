import axios from 'axios';
import { API_BASE_URL } from '../../config/runtime';

/**
 * The one HTTP client for the Social API.
 *
 *  - The short-lived access token is kept only in memory (never in localStorage), so a script
 *    injected into the page cannot steal a long-lived credential.
 *  - The refresh token is an httpOnly cookie the browser sends by itself to /auth/refresh.
 *  - When a request comes back 401 we refresh once (all waiting requests share that one refresh)
 *    and retry; if the refresh fails the session is over and `onSessionExpired` listeners run.
 */
let accessToken = null;
const expiredListeners = new Set();

export const setAccessToken = (token) => {
  accessToken = token;
};
export const hasAccessToken = () => Boolean(accessToken);
export const onSessionExpired = (listener) => {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
};

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
});

axiosClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshInFlight = null;

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true, timeout: 15000 })
      .then((response) => {
        accessToken = response.data.accessToken;
        return response.data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthCall = config?.url?.startsWith('/auth/');
    if (response?.status === 401 && config && !config.retried && !isAuthCall) {
      config.retried = true;
      try {
        await refreshAccessToken();
        return axiosClient(config);
      } catch {
        accessToken = null;
        expiredListeners.forEach((listener) => listener());
      }
    }
    return Promise.reject(error);
  }
);

/** The server's message for an error (already worded for people), or a friendly fallback. */
export function apiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  if (error?.code === 'ECONNABORTED' || error?.message === 'Network Error') return 'Cannot reach the server. Check your connection and try again.';
  return fallback;
}

export default axiosClient;
