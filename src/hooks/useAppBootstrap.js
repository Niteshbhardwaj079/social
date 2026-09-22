import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { API_ENABLED } from '../config/runtime';
import { fetchPublicConfig } from '../services/api/authApi';
import { onSessionExpired } from '../services/api/axiosClient';
import { restoreSession, sessionExpired, setSetupRequired } from '../store/slices/authSlice';
import { saveWorkspaceLanguages } from '../store/slices/i18nSlice';

/**
 * API mode, once when the app opens: learn which languages the workspace offers (and whether
 * first-run setup is pending), then check for a saved session. Order matters: the languages come
 * first so a signed-in person's own language is judged against the right list.
 */
export default function useAppBootstrap() {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!API_ENABLED) return undefined;
    const stopListening = onSessionExpired(() => dispatch(sessionExpired()));
    (async () => {
      try {
        const config = await fetchPublicConfig();
        dispatch(saveWorkspaceLanguages(config.languages));
        dispatch(setSetupRequired(config.setupRequired));
      } catch {
        // Server unreachable: carry on with what this browser remembers.
      }
      dispatch(restoreSession());
    })();
    return stopListening;
  }, [dispatch]);
}
