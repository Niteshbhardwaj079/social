import axiosClient, { refreshAccessToken, setAccessToken } from './axiosClient';

/** Sign-in and account calls to the Social API (only used when API_ENABLED). */

// The real session is an httpOnly cookie we cannot see. This flag only remembers "this browser signed
// in before", so a first-time visitor is not sent to /auth/refresh just to be told 401.
const SESSION_HINT_KEY = 'social-app-has-session';
const setSessionHint = (on) => {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // storage unavailable: restoring the session simply always tries the server
  }
};
const hasSessionHint = () => {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) !== null;
  } catch {
    return true;
  }
};

function rememberSession(data) {
  setAccessToken(data.accessToken);
  setSessionHint(true);
  return { user: data.user };
}

export async function fetchPublicConfig() {
  const { data } = await axiosClient.get('/public/config');
  return data;
}

export async function loginRequest({ email, password }) {
  return rememberSession((await axiosClient.post('/auth/login', { email, password })).data);
}

export async function registerRequest(values) {
  return rememberSession((await axiosClient.post('/auth/register', values)).data);
}

export async function acceptInviteRequest(values) {
  return rememberSession((await axiosClient.post('/auth/accept-invite', values)).data);
}

/** Restores a session from the refresh cookie (used when the page loads). Shares one request if called twice at once. */
export async function restoreRequest() {
  if (!hasSessionHint()) throw new Error('No earlier session');
  try {
    return { user: (await refreshAccessToken()).user };
  } catch (error) {
    setSessionHint(false);
    throw error;
  }
}

export async function logoutRequest() {
  try {
    await axiosClient.post('/auth/logout');
  } finally {
    setAccessToken(null);
    setSessionHint(false);
  }
}

export const forgotPasswordRequest = (email) => axiosClient.post('/auth/forgot-password', { email });

export const resetPasswordRequest = ({ token, password }) => axiosClient.post('/auth/reset-password', { token, password });

export const saveMyLanguageRequest = (language) => axiosClient.patch('/auth/me', { language });

export const updateProfileRequest = (values) => axiosClient.patch('/auth/me', values).then((response) => response.data.user);

/** Password change also rotates the session (every other device is signed out) — same shape as login/register. */
export async function changePasswordRequest(values) {
  return rememberSession((await axiosClient.post('/auth/change-password', values)).data);
}

export const getSessionsRequest = () => axiosClient.get('/auth/sessions').then((response) => response.data.sessions);

export const revokeSessionRequest = (sessionId) => axiosClient.delete(`/auth/sessions/${sessionId}`);
