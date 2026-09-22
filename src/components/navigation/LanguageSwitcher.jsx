import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DropdownMenu from '../common/DropdownMenu';
import Icon from '../common/Icon';
import { useI18n } from '../../i18n/useI18n';
import { getLanguage, getLanguageShortCode } from '../../i18n/languages';

// A menu list this long gets a search box.
const SEARCH_THRESHOLD = 8;

/**
 * Language picker. Lists only the languages the workspace has switched on
 * (Settings → Language). `variant="auth"` is the roomier pill used on the sign-in pages.
 */
function LanguageSwitcher({ variant = 'topbar' }) {
  const { t, language, enabledLanguages, setLanguage } = useI18n();
  const [query, setQuery] = useState('');
  const current = getLanguage(language);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return enabledLanguages;
    return enabledLanguages.filter(
      (item) => item.name.toLowerCase().includes(term) || item.nativeName.toLowerCase().includes(term) || item.code.includes(term)
    );
  }, [enabledLanguages, query]);

  function choose(item, close) {
    close();
    setQuery('');
    if (item.code === language) return;
    setLanguage(item.code);
  }

  const trigger =
    variant === 'auth' ? (
      <button type="button" className="language-pill" aria-label={t('top.language')} aria-haspopup="listbox">
        <Icon name="Languages" size={16} />
        <span>{current.nativeName}</span>
        <Icon name="ChevronDown" size={14} />
      </button>
    ) : (
      <button
        type="button"
        className="topbar-icon-btn topbar-lang-btn"
        aria-label={t('top.language')}
        aria-haspopup="listbox"
        data-tooltip={t('top.language')}
        data-tooltip-position="bottom"
      >
        <Icon name="Languages" size={20} />
        <span className="topbar-lang-btn__code">{getLanguageShortCode(language)}</span>
      </button>
    );

  return (
    <DropdownMenu trigger={trigger} className="language-menu p-0">
      {({ close }) => (
        <div className="language-menu__panel">
          {enabledLanguages.length > SEARCH_THRESHOLD ? (
            <div className="search-input language-menu__search">
              <Icon name="Search" size={14} />
              <input
                type="search"
                className="form-control"
                placeholder={t('lang.search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
            </div>
          ) : null}
          <ul className="language-menu__list" role="listbox" aria-label={t('top.language')}>
            {visible.length === 0 ? <li className="language-menu__empty">{t('lang.none')}</li> : null}
            {visible.map((item) => (
              <li key={item.code} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={item.code === language}
                  lang={item.htmlLang}
                  className={`language-option ${item.code === language ? 'is-active' : ''}`.trim()}
                  onClick={() => choose(item, close)}
                >
                  <span className="language-option__native">{item.nativeName}</span>
                  <span className="language-option__name">{item.name}</span>
                  {item.code === language ? <Icon name="Check" size={16} className="language-option__check" /> : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="language-menu__footer">
            <Link to="/settings/language" onClick={() => close()}>
              <Icon name="Settings" size={14} /> {t('lang.settings')}
            </Link>
          </div>
        </div>
      )}
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
