/**
 * A small, dependency-free reading of a browser's User-Agent header — just enough to say "Chrome on
 * Windows" in a security email. Not exhaustive (nothing hand-written like this ever is), but it covers
 * the common cases without pulling in a UA-parsing library.
 */
export function describeDevice(userAgent) {
  if (!userAgent) return null;
  const ua = userAgent;

  let browser = 'A browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';

  let os = null;
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'a Mac';
  else if (/Linux/.test(ua)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}
