import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { ToastProvider } from './components/common/ToastProvider';
import AppRoutes from './routes/AppRoutes';
import themeColors from './config/themeColors';
import useAppBootstrap from './hooks/useAppBootstrap';

function App() {
  const theme = useSelector((state) => state.ui.theme);
  const themeColorKey = useSelector((state) => state.ui.themeColorKey);

  useAppBootstrap();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // iOS Safari (and some other touch browsers) apply :hover styles on tap
  // and only clear them on the *next* tap elsewhere, so a button can look
  // permanently highlighted after a single tap. A no-op touchstart listener
  // makes these browsers treat elements as "active-able" instead, which
  // stops :hover from sticking — a standard, CSS-rule-count-independent fix.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);

  useEffect(() => {
    const selectedColor = themeColors.find((color) => color.key === themeColorKey) || themeColors[0];
    const primaryValue = theme === 'dark' ? selectedColor.dark : selectedColor.light;
    document.documentElement.style.setProperty('--color-primary', primaryValue);
  }, [theme, themeColorKey]);

  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}

export default App;
