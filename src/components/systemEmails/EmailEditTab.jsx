import { useRef } from 'react';
import { BRAND_EMAIL_TOKENS } from '../../config/systemEmailSampleValues';
import { useI18n } from '../../i18n/useI18n';

const BRAND_VARIABLES = Object.keys(BRAND_EMAIL_TOKENS).map((key) => `{{${key}}}`);

function EmailEditTab({ email, language, draftSubject, draftHtml, onSubjectChange, onHtmlChange, onSave, onDiscard, isDirty, isSaving }) {
  const { t } = useI18n();
  const lastFocusedRef = useRef('subject');
  const subjectRef = useRef(null);
  const htmlRef = useRef(null);

  function insertVariable(token) {
    const field = lastFocusedRef.current;
    const el = field === 'subject' ? subjectRef.current : htmlRef.current;
    const value = field === 'subject' ? draftSubject : draftHtml;
    const setValue = field === 'subject' ? onSubjectChange : onHtmlChange;
    if (!el) {
      setValue(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${token}${value.slice(end)}`;
    setValue(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      const cursorPos = start + token.length;
      el.setSelectionRange(cursorPos, cursorPos);
    });
  }

  return (
    <div>
      <label htmlFor="emailSubject" className="form-label-custom">
        {t('emails.subject')}
      </label>
      <input
        id="emailSubject"
        ref={subjectRef}
        type="text"
        className="form-control mb-4"
        dir={language.dir}
        lang={language.htmlLang}
        value={draftSubject}
        onFocus={() => {
          lastFocusedRef.current = 'subject';
        }}
        onChange={(event) => onSubjectChange(event.target.value)}
      />

      <span className="form-label-custom d-block">{t('emails.variables')}</span>
      <div className="email-variable-chips mb-4">
        {[...new Set([...email.variables, ...BRAND_VARIABLES])].map((variable) => (
          <button key={variable} type="button" className="email-variable-chip" onClick={() => insertVariable(variable)}>
            {variable}
          </button>
        ))}
      </div>
      <p className="form-hint mb-4">
        {t('emails.variablesHint')}
      </p>

      <label htmlFor="emailHtml" className="form-label-custom">
        {t('emails.html')}
      </label>
      <textarea
        id="emailHtml"
        ref={htmlRef}
        className="form-control email-code-editor"
        rows={14}
        dir="ltr"
        lang={language.htmlLang}
        spellCheck={false}
        value={draftHtml}
        onFocus={() => {
          lastFocusedRef.current = 'html';
        }}
        onChange={(event) => onHtmlChange(event.target.value)}
      />

      <p className="form-hint mt-2">{t('emails.typeHint')}</p>

      <div className="d-flex justify-content-end gap-2 mt-4">
        <button type="button" className="btn btn-outline-secondary-custom" onClick={onDiscard} disabled={!isDirty || isSaving}>
          {t('emails.discard')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={!isDirty || isSaving}>
          {isSaving ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              {t('common.saving')}
            </>
          ) : (
            t('common.saveChanges')
          )}
        </button>
      </div>
    </div>
  );
}

export default EmailEditTab;
