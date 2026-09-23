import axiosClient from './axiosClient';

/** Workspace settings on the Social API (only used when API_ENABLED). */
export async function saveLanguageSettingsRequest({ enabledLanguages, defaultLanguage }) {
  const { data } = await axiosClient.put('/settings/languages', { enabledLanguages, defaultLanguage });
  return { enabledLanguages: data.enabledLanguages, defaultLanguage: data.defaultLanguage };
}

export const getWorkspaceSettingsRequest = () => axiosClient.get('/settings/workspace').then((response) => response.data);

export const saveWorkspaceSettingsRequest = (values) => axiosClient.put('/settings/workspace', values).then((response) => response.data);
