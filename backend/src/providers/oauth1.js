import crypto from 'node:crypto';

/**
 * OAuth 1.0a request signing (RFC 5849), which X's user tokens use. Written out here (about 40 lines)
 * instead of pulling in a library for it.
 */
const percent = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

function compare([keyA, valueA], [keyB, valueB]) {
  if (keyA !== keyB) return keyA < keyB ? -1 : 1;
  return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
}

/** `url` has no query string; query and form parameters go in `params`. */
export function oauth1Signature({ method, url, params = {}, oauthParams, consumerSecret, tokenSecret }) {
  const pairs = Object.entries({ ...params, ...oauthParams }).map(([key, value]) => [percent(key), percent(value)]);
  const parameterString = pairs
    .sort(compare)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const base = [method.toUpperCase(), percent(url), percent(parameterString)].join('&');
  return crypto.createHmac('sha1', `${percent(consumerSecret)}&${percent(tokenSecret)}`).update(base).digest('base64');
}

export function oauth1Header({ method, url, params, consumerKey, consumerSecret, token, tokenSecret, nonce, timestamp }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce ?? crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const signature = oauth1Signature({ method, url, params, oauthParams, consumerSecret, tokenSecret });
  const fields = Object.entries({ ...oauthParams, oauth_signature: signature }).sort(compare);
  return `OAuth ${fields.map(([key, value]) => `${percent(key)}="${percent(value)}"`).join(', ')}`;
}
