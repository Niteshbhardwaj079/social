import axiosClient from './axiosClient';

/** Workspace settings on the Social API (only used when API_ENABLED). */
export async function saveLanguageSettingsRequest({ enabledLanguages, defaultLanguage }) {
  const { data } = await axiosClient.put('/settings/languages', { enabledLanguages, defaultLanguage });
  return { enabledLanguages: data.enabledLanguages, defaultLanguage: data.defaultLanguage };
}
