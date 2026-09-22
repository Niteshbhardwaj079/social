import { renderEmailPreview } from '../../config/systemEmailSampleValues';
import { useI18n } from '../../i18n/useI18n';

// Recipients read this in their own mail client, not in our dark theme — pin the
// frame to a light canvas so the preview looks the same in both app themes.
const LIGHT_CANVAS_HEAD = '<meta name="color-scheme" content="light"><style>html,body{margin:0;background:#fff;color-scheme:light}</style>';

function EmailPreviewTab({ email, title }) {
  const { t } = useI18n();
  const previewHtml = LIGHT_CANVAS_HEAD + renderEmailPreview(email.html);

  return (
    <div className="email-preview-frame">
      <iframe sandbox="" title={t('emails.previewTitle', { title })} srcDoc={previewHtml} className="email-preview-frame__iframe" />
    </div>
  );
}

export default EmailPreviewTab;
