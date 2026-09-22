import { useDispatch, useSelector } from 'react-redux';
import Icon from '../../components/common/Icon';
import { setTheme, setThemeColorKey } from '../../store/slices/uiSlice';
import brand from '../../config/brand';
import themeColors from '../../config/themeColors';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'Sun' },
  { value: 'dark', label: 'Dark', icon: 'Moon' },
];

function AppearanceSettings() {
  const dispatch = useDispatch();
  const theme = useSelector((state) => state.ui.theme);
  const themeColorKey = useSelector((state) => state.ui.themeColorKey);

  return (
    <div className="d-flex flex-column gap-5">
      <div className="surface-card">
        <h3 className="h5 mb-2">Theme</h3>
        <p className="text-secondary-custom small mb-4">Choose how {brand.productName} looks on this device.</p>

        <div className="d-flex gap-3">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`theme-option ${theme === option.value ? 'is-active' : ''}`.trim()}
              onClick={() => dispatch(setTheme(option.value))}
            >
              <Icon name={option.icon} size={22} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card">
        <h3 className="h5 mb-2">Brand Color</h3>
        <p className="text-secondary-custom small mb-4">
          Pick the accent color used across buttons, links and highlights — including your own{' '}
          {brand.website} blue.
        </p>

        <div className="brand-color-grid">
          {themeColors.map((color) => {
            const swatchValue = theme === 'dark' ? color.dark : color.light;
            const isSelected = themeColorKey === color.key;

            return (
              <button
                key={color.key}
                type="button"
                className={`brand-color-swatch ${isSelected ? 'is-selected' : ''}`.trim()}
                onClick={() => dispatch(setThemeColorKey(color.key))}
                aria-label={color.label}
                aria-pressed={isSelected}
                title={color.label}
              >
                <span className="brand-color-swatch__dot" style={{ '--swatch-color': swatchValue }}>
                  {isSelected ? <Icon name="Check" size={16} /> : null}
                </span>
                <span className="brand-color-swatch__label">{color.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AppearanceSettings;
