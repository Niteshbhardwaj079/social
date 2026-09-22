import { createSlice } from '@reduxjs/toolkit';

const THEME_STORAGE_KEY = 'social-app-theme';
const THEME_COLOR_STORAGE_KEY = 'social-app-theme-color';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'social-app-sidebar-collapsed';
const DEFAULT_THEME_COLOR_KEY = 'indigo';

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  } catch {
    return 'light';
  }
}

function getStoredSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getStoredThemeColor() {
  try {
    return localStorage.getItem(THEME_COLOR_STORAGE_KEY) || DEFAULT_THEME_COLOR_KEY;
  } catch {
    return DEFAULT_THEME_COLOR_KEY;
  }
}

const initialState = {
  isSidebarOpen: false,
  isSidebarCollapsed: getStoredSidebarCollapsed(),
  theme: getStoredTheme(),
  themeColorKey: getStoredThemeColor(),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openSidebar(state) {
      state.isSidebarOpen = true;
    },
    closeSidebar(state) {
      state.isSidebarOpen = false;
    },
    toggleSidebar(state) {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    toggleSidebarCollapsed(state) {
      state.isSidebarCollapsed = !state.isSidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(state.isSidebarCollapsed));
      } catch {
        // Ignore write failures (private browsing, storage disabled, etc.)
      }
    },
    setTheme(state, action) {
      state.theme = action.payload;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      } catch {
        // Ignore write failures (private browsing, storage disabled, etc.)
      }
    },
    setThemeColorKey(state, action) {
      state.themeColorKey = action.payload;
      try {
        localStorage.setItem(THEME_COLOR_STORAGE_KEY, action.payload);
      } catch {
        // Ignore write failures (private browsing, storage disabled, etc.)
      }
    },
  },
});

export const { openSidebar, closeSidebar, toggleSidebar, toggleSidebarCollapsed, setTheme, setThemeColorKey } =
  uiSlice.actions;
export default uiSlice.reducer;
