import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Icon from '../../components/common/Icon';
import CalloutBanner from '../../components/common/CalloutBanner';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import { LANGUAGES, getLanguage } from '../../i18n/languages';
import { saveWorkspaceLanguages } from '../../store/slices/i18nSlice';
import brand from '../../config/brand';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { saveLanguageSettingsRequest } from '../../services/api/settingsApi';

/**
 * Two things live here:
 *  1. "My language" — what THIS person sees the app (and receives emails) in.
 *  2. The workspace's language list — which languages appear in the header menu,
 *     the user form and the System Emails editor, and which one is the default.
 */
function LanguageSettings() {
  const { t, language, enabledLanguages, setLanguage } = useI18n();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const savedDefault = useSelector((state) => state.i18n.defaultLanguage);

  const [enabled, setEnabled] = useState(() => enabledLanguages.map((item) => item.code));
  const [defaultCode, setDefaultCode] = useState(savedDefault);

  const savedEnabled = enabledLanguages.map((item) => item.code);
  const isDirty =
    defaultCode !== savedDefault || enabled.length !== savedEnabled.length || enabled.some((code) => !savedEnabled.includes(code));

  function toggleLanguage(code) {
    if (code === defaultCode) return; // the default can't be switched off
    setEnabled((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  function makeDefault(code) {
    setDefaultCode(code);
    setEnabled((current) => (current.includes(code) ? current : [...current, code]));
  }

  function applySaved(values) {
    dispatch(saveWorkspaceLanguages(values));
    showToast({ type: 'success', title: t('lang.saved') });
  }

  function handleSave() {
    const values = { enabledLanguages: enabled, defaultLanguage: defaultCode };
    if (!API_ENABLED) {
      applySaved(values);
      return;
    }
    // With a server the list belongs to the whole workspace, so it is saved there first.
    saveLanguageSettingsRequest(values)
      .then(applySaved)
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  const myLanguageChoices = LANGUAGES.filter((item) => savedEnabled.includes(item.code));

  return (
    <div className="d-flex flex-column gap-4">
      <CalloutBanner icon="Info">{t('lang.partial')}</CalloutBanner>

      <section className="surface-card">
        <h3 className="h5 mb-1">{t('lang.myLanguage')}</h3>
        <p className="form-hint mb-3">{t('lang.myLanguageHint', { product: brand.productName })}</p>
        <select
          id="my-language"
          className="form-select language-select"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label={t('lang.myLanguage')}
        >
          {myLanguageChoices.map((item) => (
            <option key={item.code} value={item.code} lang={item.htmlLang}>
              {item.nativeName} — {item.name}
            </option>
          ))}
        </select>
      </section>

      <section className="panel-card">
        <div className="panel-card__body">
          <h3 className="h5 mb-1">{t('lang.workspaceTitle')}</h3>
          <p className="form-hint mb-3">{t('lang.workspaceHint')}</p>
          <div className="language-settings__tools">
            <span className="language-settings__count">{t('lang.count', { count: enabled.length, total: LANGUAGES.length })}</span>
            <div className="d-flex gap-2 flex-wrap">
              <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => setEnabled(LANGUAGES.map((item) => item.code))}>
                {t('lang.selectAll')}
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => setEnabled([defaultCode])}>
                {t('lang.onlyDefault')}
              </button>
            </div>
          </div>
        </div>

        <div className="panel-card__body panel-card__body--flush">
          <div className="data-table-wrapper">
            <table className="data-table language-settings__table">
              <thead>
                <tr>
                  <th>{t('lang.colLanguage')}</th>
                  <th className="language-settings__col">{t('lang.colMenu')}</th>
                  <th className="language-settings__col">{t('lang.colDefault')}</th>
                </tr>
              </thead>
              <tbody>
                {LANGUAGES.map((item) => {
                  const isDefault = item.code === defaultCode;
                  const isOn = enabled.includes(item.code);
                  return (
                    <tr key={item.code}>
                      <td>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="table-row-title" lang={item.htmlLang}>
                            {item.nativeName}
                          </span>
                          <span className="table-row-subtitle">{item.name}</span>
                          {item.dir === 'rtl' ? <span className="status-badge status-badge--pending">RTL</span> : null}
                          {isDefault ? <span className="status-badge status-badge--connected">{t('lang.defaultBadge')}</span> : null}
                        </div>
                      </td>
                      <td className="language-settings__col">
                        <div className="form-check form-switch d-inline-block mb-0">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            role="switch"
                            checked={isOn}
                            disabled={isDefault}
                            onChange={() => toggleLanguage(item.code)}
                            aria-label={`${t('lang.colMenu')}: ${item.name}`}
                          />
                        </div>
                      </td>
                      <td className="language-settings__col">
                        <input
                          type="radio"
                          name="default-language"
                          className="form-check-input"
                          checked={isDefault}
                          onChange={() => makeDefault(item.code)}
                          aria-label={`${t('lang.colDefault')}: ${item.name}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-card__body">
          <p className="form-hint mb-3">
            {t('lang.defaultHint')} ({getLanguage(defaultCode).nativeName})
          </p>
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <Link to="/system-emails" className="d-inline-flex align-items-center gap-1 fw-semibold text-decoration-none small">
              <Icon name="MailCheck" size={14} /> {t('lang.openEmails')}
            </Link>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!isDirty}>
              {t('common.saveChanges')}
            </button>
          </div>
          <p className="form-hint mt-3 mb-0">{t('lang.emailsNote')}</p>
        </div>
      </section>
    </div>
  );
}

export default LanguageSettings;
