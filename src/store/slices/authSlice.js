import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { USER_ROLES } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import * as authApi from '../../services/api/authApi';

const AUTH_STORAGE_KEY = 'social-app-auth';

// ---------------------------------------------------------------- demo mode (no server)
function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeAuth(user) {
  try {
    if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore write failures (private browsing, storage disabled, etc.)
  }
}

const mockCurrentUser = {
  id: 'user-1',
  name: 'Nitesh Bhardwaj',
  email: 'nitesh@gowebkart.in',
  role: USER_ROLES.SUPER_ADMIN,
  // Matches the real Super Admin role's rank/protection (see rolesMock.js) — without these, a
  // rank-based UI check (e.g. "can I manage this person's row?") would see undefined and refuse
  // everyone in demo mode, unlike a real Super Admin's real account.
  roleRank: 4,
  roleIsProtected: true,
  avatarUrl: null,
};

// ---------------------------------------------------------------- API mode
// Thunks reject with the server's own message so a form can show it as it is.
const asThunk = (name, request) =>
  createAsyncThunk(`auth/${name}`, async (values, { rejectWithValue }) => {
    try {
      return await request(values);
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error));
    }
  });

/** Runs once when the page loads: is there a valid session cookie? */
export const restoreSession = createAsyncThunk('auth/restoreSession', async (_, { rejectWithValue }) => {
  try {
    return await authApi.restoreRequest();
  } catch {
    return rejectWithValue(null); // simply "not signed in"
  }
});
export const signIn = asThunk('signIn', authApi.loginRequest);
export const verifyTwoFactorLogin = asThunk('verifyTwoFactorLogin', authApi.verifyTwoFactorLoginRequest);
export const registerOwner = asThunk('registerOwner', authApi.registerRequest);
export const acceptInvite = asThunk('acceptInvite', authApi.acceptInviteRequest);
export const signOut = createAsyncThunk('auth/signOut', async () => {
  if (API_ENABLED) await authApi.logoutRequest().catch(() => {});
});

const initialState = API_ENABLED
  ? // The session lives in an httpOnly cookie, so we cannot know yet: wait for restoreSession.
    { isAuthenticated: false, currentUser: null, isBootstrapping: true, setupRequired: false }
  : { isAuthenticated: Boolean(getStoredAuth()), currentUser: getStoredAuth() || null, isBootstrapping: false, setupRequired: false };

const signedIn = (state, action) => {
  if (action.payload.requires2fa) return; // password was right, but the 2FA code step isn't done yet
  state.isAuthenticated = true;
  state.currentUser = action.payload.user;
  state.setupRequired = false;
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Demo mode only.
    login(state) {
      state.isAuthenticated = true;
      state.currentUser = mockCurrentUser;
      storeAuth(mockCurrentUser);
    },
    // Pass a data URL to set the profile photo, or null to go back to initials.
    updateProfilePhoto(state, action) {
      if (!state.currentUser) return;
      state.currentUser.avatarUrl = action.payload;
      if (!API_ENABLED) storeAuth(state.currentUser);
    },
    // API mode: the server's own fresh copy of the signed-in person, after a real profile/password save.
    setCurrentUser(state, action) {
      state.currentUser = action.payload;
    },
    logout(state) {
      state.isAuthenticated = false;
      state.currentUser = null;
      storeAuth(null);
    },
    // The refresh token was rejected: the session is over, show the sign-in page.
    sessionExpired(state) {
      state.isAuthenticated = false;
      state.currentUser = null;
    },
    setSetupRequired(state, action) {
      state.setupRequired = action.payload;
    },
    // The person's own language changed (e.g. from the header): keep the profile in step.
    setCurrentUserLanguage(state, action) {
      if (state.currentUser) state.currentUser.language = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.fulfilled, (state, action) => {
        signedIn(state, action);
        state.isBootstrapping = false;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.isBootstrapping = false;
      })
      .addCase(signIn.fulfilled, signedIn)
      .addCase(verifyTwoFactorLogin.fulfilled, signedIn)
      .addCase(registerOwner.fulfilled, signedIn)
      .addCase(acceptInvite.fulfilled, signedIn)
      // Optimistic: the person is signed out on screen at once, whatever the network does.
      .addCase(signOut.pending, (state) => {
        state.isAuthenticated = false;
        state.currentUser = null;
        storeAuth(null);
      });
  },
});

export const { login, logout, updateProfilePhoto, setCurrentUser, sessionExpired, setSetupRequired, setCurrentUserLanguage } = authSlice.actions;
export default authSlice.reducer;
