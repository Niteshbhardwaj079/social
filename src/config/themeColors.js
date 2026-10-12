/**
 * Brand color presets for Settings > Appearance. Picking one overrides
 * --color-primary at runtime (see App.jsx) — every button, link, active nav
 * state and focus ring re-colors from that single CSS custom property.
 * Each preset carries a light- and dark-mode value tuned for contrast
 * against that theme's background.
 */
const themeColors = [
  // The default (matches the sign-in design).
  { key: 'blue', label: 'Blue', labelKey: 'settings.appearance.colors.blue', light: '#2563eb', dark: '#3b82f6' },
  { key: 'indigo', label: 'Indigo', labelKey: 'settings.appearance.colors.indigo', light: '#4f46e5', dark: '#6366f1' },
  { key: 'gowebkartBlue', label: 'Gowebkart Blue', labelKey: 'settings.appearance.colors.gowebkartBlue', light: '#0ea5e9', dark: '#38bdf8' },
  { key: 'emerald', label: 'Emerald', labelKey: 'settings.appearance.colors.emerald', light: '#059669', dark: '#34d399' },
  { key: 'rose', label: 'Rose', labelKey: 'settings.appearance.colors.rose', light: '#e11d48', dark: '#fb7185' },
  { key: 'amber', label: 'Amber', labelKey: 'settings.appearance.colors.amber', light: '#d97706', dark: '#fbbf24' },
  { key: 'violet', label: 'Violet', labelKey: 'settings.appearance.colors.violet', light: '#7c3aed', dark: '#a78bfa' },
  { key: 'slate', label: 'Slate', labelKey: 'settings.appearance.colors.slate', light: '#334155', dark: '#94a3b8' },
];

export default themeColors;
