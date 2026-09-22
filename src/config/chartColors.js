/**
 * Concrete hex values for chart strokes/fills. Recharts renders these as
 * literal SVG presentation attributes, which do not reliably resolve CSS
 * custom properties the way regular CSS does — so charts use fixed hex
 * values here instead, kept in sync with the palette in
 * styles/abstracts/_colors.scss. The brand/primary color is intentionally
 * NOT included here — it tracks the user's Appearance > Brand Color choice,
 * see hooks/useChartPrimaryColor.js.
 */
const chartColors = {
  secondary: '#0ea5e9',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  border: '#e6e8f0',
  textMuted: '#8b8fa3',
};

export default chartColors;
