import { loadLocale } from './loadLocale';
import { getLanguage } from './languages';

/**
 * Builds the DEFAULT subject + HTML of a system email in any language from the
 * `mail` section of that language's locale file. Custom edits made in System
 * Emails are stored separately (per email, per language) and win over this.
 */

// Script-specific fallbacks so Devanagari, Thai, CJK, Arabic etc. render on every mail client.
const FONT_STACK =
  "Arial,Helvetica,'Segoe UI','Noto Sans','Nirmala UI','Microsoft YaHei','Yu Gothic','Malgun Gothic','Leelawadee UI',Tahoma,sans-serif";

const LINK_STYLE = 'color:#4f46e5';

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// "[text](url)" -> a link. Everything else is escaped as plain text.
function lineToHtml(line) {
  return escapeText(line).replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="${LINK_STYLE}">$1</a>`);
}

function buildHtml({ heading, body, help, auto, language }) {
  const rtl = language.dir === 'rtl';
  const align = rtl ? 'direction:rtl;text-align:right;' : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${language.dir}" lang="${language.htmlLang}" style="background:#f4f5fa;padding:24px 0;font-family:${FONT_STACK}">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden">
        <tr>
          <td align="center" style="background:#4f46e5;padding:20px">
            <span style="color:#ffffff;font-size:18px;font-weight:bold">{{app_name}}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;${align}">
            <h2 style="margin:0 0 16px">${escapeText(heading)}</h2>
            ${body.map((line) => `<p style="margin:0 0 12px;color:#5c6178">${lineToHtml(line)}</p>`).join('\n            ')}
          </td>
        </tr>
        <tr>
          <td align="center" style="background:#f8f9fc;border-top:1px solid #e6e8f0;padding:20px 32px;font-size:12px;line-height:18px;color:#8a90a6">
            <p style="margin:0 0 6px;font-weight:bold;color:#5c6178">{{company}}</p>
            <p style="margin:0 0 6px">${escapeText(help)} <a href="mailto:{{support_email}}" style="${LINK_STYLE}">{{support_email}}</a></p>
            <p style="margin:0 0 6px">${escapeText(auto)}</p>
            <p style="margin:0">&copy; {{year}} {{company}}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

// mailKey is a key of `mail` in the locale files, e.g. 'passwordReset'.
export async function getDefaultEmailContent(languageCode, mailKey) {
  const language = getLanguage(languageCode);
  const [locale, english] = await Promise.all([loadLocale(language.code), loadLocale('en')]);
  // A language that lacks this email yet falls back to the English wording.
  const text = locale.mail?.[mailKey] || english.mail[mailKey];
  const shared = { help: locale.mail?.help || english.mail.help, auto: locale.mail?.auto || english.mail.auto };
  return {
    subject: text.s,
    html: buildHtml({ heading: text.h, body: text.b, ...shared, language }),
  };
}
