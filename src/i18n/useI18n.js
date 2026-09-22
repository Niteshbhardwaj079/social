import { createContext, useContext } from 'react';

// The value is created by <I18nProvider>; components read it with useI18n().
// Kept in its own file so the provider file only exports a component (fast refresh).
export const I18nContext = createContext(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>');
  return context;
}
