import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmailPreviewTab from '../../components/systemEmails/EmailPreviewTab';
import EmailEditTab from '../../components/systemEmails/EmailEditTab';
import EmailImagesTab from '../../components/systemEmails/EmailImagesTab';
import EmailDetailsTab from '../../components/systemEmails/EmailDetailsTab';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import {
  getSystemEmails,
  updateSystemEmail,
  resetSystemEmail,
  toggleSystemEmailEnabled,
  addSystemEmailImage,
  removeSystemEmailImage,
  sendTestSystemEmail,
} from '../../services/api/systemEmailsApi';
import { REQUEST_STATUS } from '../../config/constants';
import brand from '../../config/brand';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getLanguage } from '../../i18n/languages';

const TABS = [
  { key: 'preview', labelKey: 'emails.tabPreview' },
  { key: 'edit', labelKey: 'emails.tabEdit' },
  { key: 'images', labelKey: 'emails.tabImages' },
  { key: 'details', labelKey: 'emails.tabDetails' },
];

function SystemEmails() {
  const { t, language, enabledLanguages, defaultLanguage } = useI18n();
  const { showToast } = useToast();
  const [emails, setEmails] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  // The language whose copy of every email is being previewed and edited. It starts as
  // the person's own language, but it is independent of the language the app is shown in.
  const [emailLang, setEmailLang] = useState(() => (enabledLanguages.some((item) => item.code === language) ? language : defaultLanguage));
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const latestRequest = useRef(0);

  const emailLanguage = getLanguage(emailLang);

  // Loads every email in one language. `showPageLoader` is false when only the language
  // changes, so the language picker itself never disappears while its copy loads.
  function loadEmails({ selectId, lang = emailLang, showPageLoader = true } = {}) {
    const requestId = ++latestRequest.current;
    if (showPageLoader) setRequestStatus(REQUEST_STATUS.LOADING);
    getSystemEmails(lang)
      .then((data) => {
        if (requestId !== latestRequest.current) return;
        setEmails(data);
        const toSelect = data.find((email) => email.id === selectId) || data[0];
        setSelectedEmailId(toSelect?.id || null);
        setDraftSubject(toSelect?.subject || '');
        setDraftHtml(toSelect?.html || '');
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => {
        if (requestId === latestRequest.current) setRequestStatus(REQUEST_STATUS.FAILED);
      });
  }

  useEffect(() => {
    loadEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailTitle = (email) => t(`emails.items.${email.mailKey}.t`);
  const emailDescription = (email) => t(`emails.items.${email.mailKey}.d`);

  const groups = useMemo(() => ['all', ...new Set(emails.map((email) => email.group))], [emails]);

  const filteredEmails = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return emails.filter((email) => {
      const matchesSearch =
        !term ||
        emailTitle(email).toLowerCase().includes(term) ||
        email.eventKey.toLowerCase().includes(term) ||
        emailDescription(email).toLowerCase().includes(term);
      const matchesGroup = groupFilter === 'all' || email.group === groupFilter;
      return matchesSearch && matchesGroup;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, searchTerm, groupFilter, t]);

  const selectedEmail = emails.find((email) => email.id === selectedEmailId) || null;
  const isDirty = Boolean(selectedEmail) && (draftSubject !== selectedEmail.subject || draftHtml !== selectedEmail.html);
  const isModifiedFromDefault =
    Boolean(selectedEmail) &&
    (selectedEmail.subject !== selectedEmail.defaultSubject || selectedEmail.html !== selectedEmail.defaultHtml);

  function confirmDiscard() {
    return !isDirty || window.confirm(t('emails.unsaved'));
  }

  function handleSelectEmail(email) {
    if (!confirmDiscard()) return;
    setSelectedEmailId(email.id);
    setDraftSubject(email.subject);
    setDraftHtml(email.html);
    setActiveTab('preview');
  }

  function handleLanguageChange(nextLang, { openEditor = false } = {}) {
    if (nextLang === emailLang) {
      if (openEditor) setActiveTab('edit');
      return;
    }
    if (!confirmDiscard()) return;
    setEmailLang(nextLang);
    loadEmails({ selectId: selectedEmailId, lang: nextLang, showPageLoader: false });
    setActiveTab(openEditor ? 'edit' : activeTab);
  }

  function showError(error) {
    showToast({ type: 'error', title: apiErrorMessage(error) });
  }

  function replaceEmail(updated) {
    setEmails((current) => current.map((email) => (email.id === updated.id ? updated : email)));
  }

  function handleSaveEdit() {
    if (!selectedEmail) return;
    setIsSaving(true);
    updateSystemEmail(selectedEmail.id, emailLang, { subject: draftSubject, html: draftHtml })
      .then((updated) => {
        replaceEmail(updated);
        showToast({ type: 'success', title: t('emails.saved') });
      })
      .catch(showError)
      .finally(() => setIsSaving(false));
  }

  function handleDiscardEdit() {
    if (!selectedEmail) return;
    setDraftSubject(selectedEmail.subject);
    setDraftHtml(selectedEmail.html);
  }

  function handleResetConfirmed() {
    if (!selectedEmail) return;
    resetSystemEmail(selectedEmail.id, emailLang)
      .then((updated) => {
        replaceEmail(updated);
        setDraftSubject(updated.subject);
        setDraftHtml(updated.html);
        setIsResetConfirmOpen(false);
        showToast({ type: 'success', title: t('emails.restored') });
      })
      .catch(showError);
  }

  function handleToggleEnabled(isEnabled) {
    if (!selectedEmail) return;
    toggleSystemEmailEnabled(selectedEmail.id, isEnabled, emailLang)
      .then((updated) => {
        replaceEmail(updated);
        showToast({ type: 'info', title: isEnabled ? t('emails.turnedOn') : t('emails.turnedOffToast') });
      })
      .catch(showError);
  }

  function handleSendTest() {
    if (!selectedEmail) return;
    setIsSendingTest(true);
    sendTestSystemEmail(selectedEmail.id, emailLang)
      .then((result) => {
        if (result.status === 'failed') {
          showToast({ type: 'error', title: result.error || 'The mail server refused the message' });
        } else if (result.status === 'logged') {
          // The server has no SMTP settings yet, so it only recorded the message (see .env.example).
          showToast({ type: 'info', title: t('emails.testSent'), message: 'No mail server (SMTP) is set up on the server yet, so this test was recorded but not delivered.' });
        } else {
          showToast({ type: 'success', title: t('emails.testSent'), message: t('emails.testSentBody', { language: emailLanguage.nativeName }) });
        }
      })
      .catch(showError)
      .finally(() => setIsSendingTest(false));
  }

  function handleAddImage(image, blob) {
    if (!selectedEmail) return;
    addSystemEmailImage(selectedEmail.id, image, blob).then((newImage) => {
      setEmails((current) =>
        current.map((email) => (email.id === selectedEmail.id ? { ...email, images: [newImage, ...email.images] } : email))
      );
      showToast({ type: 'success', title: t('emails.imageUploaded') });
    }, showError);
  }

  function handleRemoveImage(imageId) {
    if (!selectedEmail) return;
    removeSystemEmailImage(selectedEmail.id, imageId).then(() => {
      setEmails((current) =>
        current.map((email) =>
          email.id === selectedEmail.id ? { ...email, images: email.images.filter((image) => image.id !== imageId) } : email
        )
      );
    }, showError);
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.systemEmails')} subtitle={t('common.loading')} />
        <SkeletonKpiRow />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.systemEmails')} />
        <ErrorState onRetry={() => loadEmails()} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.systemEmails')}
        subtitle={t('pages.systemEmails', { product: brand.productName })}
        guideChapterId="system-emails"
      />

      {/* One language at a time: everything below (list, preview, editor) is that language's copy. */}
      <div className="email-language-bar">
        <span className="email-language-bar__icon">
          <Icon name="Languages" size={18} />
        </span>
        <div className="email-language-bar__text">
          <label htmlFor="email-language" className="email-language-bar__label">
            {t('emails.langLabel')}
          </label>
          <span className="email-language-bar__hint">{t('emails.langHint')}</span>
        </div>
        <select
          id="email-language"
          className="form-select email-language-bar__select"
          value={emailLang}
          onChange={(event) => handleLanguageChange(event.target.value)}
        >
          {enabledLanguages.map((item) => (
            <option key={item.code} value={item.code} lang={item.htmlLang}>
              {item.nativeName} — {item.name}
            </option>
          ))}
        </select>
      </div>

      <StatCardGrid
        cards={[
          { key: 'total', label: t('emails.total'), value: emails.length, icon: 'MailCheck', tone: 'primary' },
          { key: 'enabled', label: t('emails.enabled'), value: emails.filter((email) => email.isEnabled).length, icon: 'Send', tone: 'green' },
          { key: 'disabled', label: t('emails.turnedOff'), value: emails.filter((email) => !email.isEnabled).length, icon: 'MailX', tone: 'slate' },
          {
            key: 'custom',
            label: t('emails.customised'),
            value: emails.filter((email) => email.subject !== email.defaultSubject || email.html !== email.defaultHtml).length,
            icon: 'PenLine',
            tone: 'amber',
          },
        ]}
      />

      <div className="system-emails-layout">
        <div className="panel-card system-emails-list">
          <div className="panel-card__body filter-bar">
            <div className="search-input filter-bar__search">
              <Icon name="Search" size={16} />
              <input
                type="search"
                className="form-control"
                placeholder={t('emails.search')}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="filter-bar__field">
              <select className="form-select" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group === 'all' ? t('emails.allGroups') : t(`emails.group.${group}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="system-emails-list__items">
            {filteredEmails.map((email) => (
              <button
                key={email.id}
                type="button"
                className={`system-emails-list__item ${email.id === selectedEmailId ? 'is-active' : ''}`.trim()}
                onClick={() => handleSelectEmail(email)}
              >
                <Icon name="Mail" size={18} />
                <div className="flex-grow-1 overflow-hidden">
                  <div className="system-emails-list__title">{emailTitle(email)}</div>
                  <div className="system-emails-list__description">{emailDescription(email)}</div>
                  <div className="system-emails-list__key">{email.eventKey}</div>
                </div>
                {!email.isEnabled ? <span className="status-badge status-badge--disconnected">{t('common.off')}</span> : null}
              </button>
            ))}
          </div>
        </div>

        {selectedEmail ? (
          <div className="panel-card system-emails-detail">
            <div className="system-emails-detail__header">
              <div>
                <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                  <h3 className="panel-card__title mb-0">{emailTitle(selectedEmail)}</h3>
                  <span className={`status-badge status-badge--${selectedEmail.isEnabled ? 'connected' : 'disconnected'}`}>
                    {selectedEmail.isEnabled ? t('common.enabled') : t('common.disabled')}
                  </span>
                  <span className="status-badge status-badge--pending" lang={emailLanguage.htmlLang}>
                    {emailLanguage.nativeName}
                  </span>
                </div>
                <p className="permissions-panel__subtitle mb-0">{emailDescription(selectedEmail)}</p>
              </div>
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <div className="form-check form-switch mb-0">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    role="switch"
                    checked={selectedEmail.isEnabled}
                    onChange={(event) => handleToggleEnabled(event.target.checked)}
                    aria-label={t('emails.sendThis')}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary-custom"
                  onClick={() => setIsResetConfirmOpen(true)}
                  disabled={!isModifiedFromDefault}
                  data-tooltip={isModifiedFromDefault ? t('emails.resetTip') : t('emails.nothingToReset')}
                >
                  <Icon name="RotateCcw" size={16} />
                  {t('emails.resetDefault')}
                </button>
              </div>
            </div>

            <div className="tab-strip system-emails-detail__tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`tab-strip__item ${activeTab === tab.key ? 'is-active' : ''}`.trim()}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>

            <div className="panel-card__body">
              {activeTab === 'preview' ? <EmailPreviewTab email={selectedEmail} title={emailTitle(selectedEmail)} /> : null}
              {activeTab === 'edit' ? (
                <EmailEditTab
                  email={selectedEmail}
                  language={emailLanguage}
                  draftSubject={draftSubject}
                  draftHtml={draftHtml}
                  onSubjectChange={setDraftSubject}
                  onHtmlChange={setDraftHtml}
                  onSave={handleSaveEdit}
                  onDiscard={handleDiscardEdit}
                  isDirty={isDirty}
                  isSaving={isSaving}
                />
              ) : null}
              {activeTab === 'images' ? (
                <EmailImagesTab email={selectedEmail} onAddImage={handleAddImage} onRemoveImage={handleRemoveImage} />
              ) : null}
              {activeTab === 'details' ? (
                <EmailDetailsTab
                  email={selectedEmail}
                  emailLang={emailLang}
                  onToggleEnabled={handleToggleEnabled}
                  onSendTest={handleSendTest}
                  isSendingTest={isSendingTest}
                  onEditLanguage={(code) => handleLanguageChange(code, { openEditor: true })}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={handleResetConfirmed}
        title={t('emails.resetTitle')}
        message={t('emails.resetText', { language: emailLanguage.nativeName })}
        confirmLabel={t('emails.reset')}
        isDanger
      />
    </div>
  );
}

export default SystemEmails;
