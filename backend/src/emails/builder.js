import fs from 'node:fs';
import { config } from '../config/env.js';
import { escapeHtml, singleLine } from '../utils/security.js';

/**
 * Builds the built-in subject + HTML of a system email in any language, and fills in
 * {{variables}}. Same layout and rules as the front-end preview (src/i18n/emailContent.js).
 */

const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));

export const LANGUAGES = read('./defaults/languages.json');
const LANGUAGE_BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));
export const DEFAULT_LANGUAGE = 'en';

export const isValidLanguage = (code) => LANGUAGE_BY_CODE.has(code);
export const getLanguage = (code) => LANGUAGE_BY_CODE.get(code) || LANGUAGE_BY_CODE.get(DEFAULT_LANGUAGE);

const defaultsCache = new Map();
function loadDefaults(code) {
  if (!defaultsCache.has(code)) defaultsCache.set(code, read(`./defaults/${code}.json`));
  return defaultsCache.get(code);
}

// Script-specific fallbacks so Devanagari, Thai, CJK, Arabic etc. render in every mail client.
const FONT_STACK =
  "Arial,Helvetica,'Segoe UI','Noto Sans','Nirmala UI','Microsoft YaHei','Yu Gothic','Malgun Gothic','Leelawadee UI',Tahoma,sans-serif";
const LINK_STYLE = 'color:#4f46e5';

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// "[text](url)" becomes a link; everything else is escaped as plain text.
const lineToHtml = (line) => escapeText(line).replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="${LINK_STYLE}">$1</a>`);

function buildHtml({ heading, body, help, auto, language }) {
  const align = language.dir === 'rtl' ? 'direction:rtl;text-align:right;' : '';
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

/** Built-in { subject, html } of one email in one language (English wording if that language lacks it). */
export function buildDefaultContent(languageCode, mailKey) {
  const language = getLanguage(languageCode);
  const local = loadDefaults(language.code).mail;
  const english = loadDefaults(DEFAULT_LANGUAGE).mail;
  const text = local[mailKey] || english[mailKey];
  return {
    subject: text.s,
    html: buildHtml({ heading: text.h, body: text.b, help: local.help || english.help, auto: local.auto || english.auto, language }),
  };
}

/** A role's name ("Super Admin") in the given language. */
export function roleLabel(languageCode, role) {
  const language = getLanguage(languageCode);
  return loadDefaults(language.code).roles?.[role] || loadDefaults(DEFAULT_LANGUAGE).roles[role] || role;
}

// ---- Values that are shown to people: dates, durations, in THEIR language (Latin digits).
function localeOf(languageCode) {
  const tag = getLanguage(languageCode).htmlLang;
  return `${tag === 'hi-Latn' ? 'en-IN' : tag}-u-nu-latn`;
}

export function formatDateTime(languageCode, date = new Date()) {
  try {
    return new Intl.DateTimeFormat(localeOf(languageCode), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatDuration(languageCode, amount, unit) {
  try {
    return new Intl.NumberFormat(localeOf(languageCode), { style: 'unit', unit, unitDisplay: 'long' }).format(amount);
  } catch {
    return `${amount} ${unit}`;
  }
}

/** Values that come from brand settings, so they read the same in every email. */
export function brandVariables() {
  return {
    app_name: config.brand.appName,
    company: config.brand.company,
    support_email: config.brand.supportEmail,
    website: config.brand.websiteUrl,
    year: String(new Date().getFullYear()),
  };
}

const TOKEN = /\{\{(\w+)\}\}/g;

/** Fills {{variables}}. HTML gets every value escaped; a subject is kept to one line. A missing value becomes empty. */
export function fillTemplate(template, variables, { html }) {
  return template.replace(TOKEN, (match, key) => {
    const value = variables[key];
    if (value === undefined || value === null) return '';
    return html ? escapeHtml(value) : singleLine(value);
  });
}
