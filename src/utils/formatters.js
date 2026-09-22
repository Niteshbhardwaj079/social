import brand from '../config/brand';

// Dates and relative times follow the language the app is shown in. Digits stay Latin
// (-u-nu-latn) so numbers line up with charts and tables in every language, and an
// unsupported locale quietly falls back to English rather than throwing.
let dateLocale = 'en-US';
let relativeFormatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'narrow' });

export function setFormatLocale(htmlLang) {
  // Hinglish is Hindi in Latin letters; Intl has no locale for that, so use Indian English.
  const wanted = htmlLang === 'hi-Latn' ? 'en-IN' : htmlLang;
  const candidate = `${wanted}-u-nu-latn`;
  try {
    dateLocale = Intl.DateTimeFormat.supportedLocalesOf([candidate]).length ? candidate : 'en-US';
    relativeFormatter = new Intl.RelativeTimeFormat(dateLocale, { numeric: 'auto', style: 'narrow' });
  } catch {
    dateLocale = 'en-US';
    relativeFormatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'narrow' });
  }
}

export function formatCompactNumber(value) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(isoString, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(dateLocale, options).format(new Date(isoString));
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(dateLocale, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRelativeTime(isoString) {
  if (!isoString) return '—';

  const elapsedMs = Date.now() - new Date(isoString).getTime();

  if (elapsedMs < MINUTE_MS) {
    return relativeFormatter.format(0, 'second');
  }
  if (elapsedMs < HOUR_MS) {
    return relativeFormatter.format(-Math.floor(elapsedMs / MINUTE_MS), 'minute');
  }
  if (elapsedMs < DAY_MS) {
    return relativeFormatter.format(-Math.floor(elapsedMs / HOUR_MS), 'hour');
  }
  return relativeFormatter.format(-Math.floor(elapsedMs / DAY_MS), 'day');
}

export function formatCurrency(value, { compact = false } = {}) {
  return new Intl.NumberFormat(brand.currencyLocale, {
    style: 'currency',
    currency: brand.currency,
    maximumFractionDigits: compact || Math.abs(value) >= 1000 ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(value || 0);
}

export function formatPercent(value, digits = 2) {
  return `${(value || 0).toFixed(digits)}%`;
}
