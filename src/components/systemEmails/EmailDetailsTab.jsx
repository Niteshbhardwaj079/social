import { useI18n } from '../../i18n/useI18n';
import Icon from '../common/Icon';

function EmailDetailsTab({ email, emailLang, onToggleEnabled, onSendTest, isSendingTest, onEditLanguage }) {
  const { t, enabledLanguages } = useI18n();
  return (
    <div>
      <dl className="activity-detail-list mb-5">
        <dt>{t('emails.eventKey')}</dt>
        <dd>
          <code>{email.eventKey}</code>
        </dd>
        <dt>{t('emails.whenSent')}</dt>
        <dd>{email.whenSent}</dd>
        <dt>{t('emails.whoReceives')}</dt>
        <dd>{email.whoReceives}</dd>
        <dt>{t('emails.groupLabel')}</dt>
        <dd>{t(`emails.group.${email.group}`)}</dd>
      </dl>

      <div className="panel-card mb-4">
        <div className="panel-card__body d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              <span className="fw-semibold">{t('emails.sendThis')}</span>
              <span className={`status-badge status-badge--${email.isEnabled ? 'connected' : 'disconnected'}`}>
                {email.isEnabled ? t('common.enabled') : t('common.disabled')}
              </span>
            </div>
            <p className="small text-muted-custom mb-0">
              {t('emails.sendHint')}
            </p>
          </div>
          <div className="form-check form-switch">
            <input
              type="checkbox"
              className="form-check-input"
              role="switch"
              checked={email.isEnabled}
              onChange={(event) => onToggleEnabled(event.target.checked)}
            />
          </div>
        </div>
      </div>

      <div className="panel-card mb-4">
        <div className="panel-card__body">
          <div className="fw-semibold mb-1">{t('emails.langsTitle')}</div>
          <p className="small text-muted-custom mb-0">{t('emails.langsHint')}</p>
        </div>
        <div className="panel-card__body panel-card__body--flush">
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('emails.colLanguage')}</th>
                  <th>{t('emails.colStatus')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {enabledLanguages.map((item) => {
                  const isCustom = email.customisedLanguages.includes(item.code);
                  return (
                    <tr key={item.code} className={item.code === emailLang ? 'is-selected' : ''}>
                      <td>
                        <span className="table-row-title" lang={item.htmlLang}>
                          {item.nativeName}
                        </span>{' '}
                        <span className="table-row-subtitle">{item.name}</span>
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${isCustom ? 'pending' : 'connected'}`}>
                          {isCustom ? t('emails.statusCustom') : t('emails.statusOriginal')}
                        </span>
                      </td>
                      <td className="text-end">
                        <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => onEditLanguage(item.code)}>
                          <Icon name="Edit3" size={14} /> {t('emails.editCopy')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card__body d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <div className="fw-semibold mb-1">{t('emails.sendTest')}</div>
            <p className="small text-muted-custom mb-0">
              {t('emails.testHint')}
            </p>
          </div>
          <button type="button" className="btn btn-outline-secondary-custom" onClick={onSendTest} disabled={isSendingTest}>
            {isSendingTest ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                {t('common.sending')}
              </>
            ) : (
              t('emails.sendTest')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmailDetailsTab;
