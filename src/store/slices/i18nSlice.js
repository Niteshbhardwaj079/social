import { createSlice, isAnyOf } from '@reduxjs/toolkit';
import { DEFAULT_LANGUAGE, LANGUAGES, isKnownLanguage } from '../../i18n/languages';
import { acceptInvite, registerOwner, restoreSession, signIn } from './authSlice';

// `language` is the language THIS person uses. `enabledLanguages` and
// `defaultLanguage` are workspace-level choices made in Settings → Language.
// Phase 1 keeps both in localStorage; Phase 2 moves the workspace part to the API.
const LANGUAGE_STORAGE_KEY = 'social-app-language';
const WORKSPACE_LANGUAGES_STORAGE_KEY = 'social-app-workspace-languages';

const ALL_CODES = LANGUAGES.map((language) => language.code);

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore write failures (private browsing, storage disabled, etc.)
  }
}

function getStoredWorkspaceLanguages() {
  try {
    const parsed = JSON.parse(readStorage(WORKSPACE_LANGUAGES_STORAGE_KEY));
    const enabled = (parsed?.enabledLanguages || []).filter(isKnownLanguage);
    if (enabled.length === 0) throw new Error('empty');
    const defaultLanguage = enabled.includes(parsed.defaultLanguage) ? parsed.defaultLanguage : enabled[0];
    return { enabledLanguages: enabled, defaultLanguage };
  } catch {
    return { enabledLanguages: ALL_CODES, defaultLanguage: DEFAULT_LANGUAGE };
  }
}

const workspace = getStoredWorkspaceLanguages();
const storedLanguage = readStorage(LANGUAGE_STORAGE_KEY);

const initialState = {
  ...workspace,
  language:
    storedLanguage && workspace.enabledLanguages.includes(storedLanguage) ? storedLanguage : workspace.defaultLanguage,
};

const i18nSlice = createSlice({
  name: 'i18n',
  initialState,
  reducers: {
    setLanguage(state, action) {
      if (!state.enabledLanguages.includes(action.payload)) return;
      state.language = action.payload;
      writeStorage(LANGUAGE_STORAGE_KEY, action.payload);
    },
    // payload: { enabledLanguages: string[], defaultLanguage: string }
    saveWorkspaceLanguages(state, action) {
      const enabled = ALL_CODES.filter((code) => action.payload.enabledLanguages.includes(code));
      if (enabled.length === 0) return;
      state.enabledLanguages = enabled;
      state.defaultLanguage = enabled.includes(action.payload.defaultLanguage) ? action.payload.defaultLanguage : enabled[0];
      // Someone whose language was just switched off falls back to the workspace default.
      if (!enabled.includes(state.language)) {
        state.language = state.defaultLanguage;
        writeStorage(LANGUAGE_STORAGE_KEY, state.language);
      }
      writeStorage(
        WORKSPACE_LANGUAGES_STORAGE_KEY,
        JSON.stringify({ enabledLanguages: state.enabledLanguages, defaultLanguage: state.defaultLanguage })
      );
    },
  },
  extraReducers: (builder) => {
    // When the API knows who is signed in, THEIR saved language wins over whatever this browser remembered.
    builder.addMatcher(isAnyOf(restoreSession.fulfilled, signIn.fulfilled, registerOwner.fulfilled, acceptInvite.fulfilled), (state, action) => {
      const saved = action.payload?.user?.language;
      if (saved && state.enabledLanguages.includes(saved)) {
        state.language = saved;
        writeStorage(LANGUAGE_STORAGE_KEY, saved);
      }
    });
  },
});

export const { setLanguage, saveWorkspaceLanguages } = i18nSlice.actions;
export default i18nSlice.reducer;
