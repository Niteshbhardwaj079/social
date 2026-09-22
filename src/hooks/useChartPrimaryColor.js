import { useSelector } from 'react-redux';
import themeColors from '../config/themeColors';

/**
 * Recharts renders stroke/fill as literal SVG attributes, so chart series
 * can't just reference var(--color-primary) (see chartColors.js). This
 * resolves the same brand color the Appearance > Brand Color picker set,
 * so charts stay in sync with the rest of the themed UI.
 */
export default function useChartPrimaryColor() {
  const theme = useSelector((state) => state.ui.theme);
  const themeColorKey = useSelector((state) => state.ui.themeColorKey);
  const selectedColor = themeColors.find((color) => color.key === themeColorKey) || themeColors[0];
  return theme === 'dark' ? selectedColor.dark : selectedColor.light;
}
