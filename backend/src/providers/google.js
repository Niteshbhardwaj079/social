import { callProvider, failure } from './http.js';
import { authFailure, rejection } from './errors.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Trades the long-lived refresh token for a short-lived access token. Nothing is stored from this. */
export async function accessTokenFor({ clientId, clientSecret, refreshToken }) {
  const response = await callProvider(TOKEN_URL, {
    method: 'POST',
    form: { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' },
    label: 'Google',
  });
  if (response.ok && response.data?.access_token) return response.data.access_token;
  const code = response.data?.error;
  if (code === 'invalid_grant') throw authFailure('Google says this refresh token has expired or was revoked. Authorize again to get a new one.');
  if (code === 'invalid_client' || code === 'unauthorized_client') throw authFailure('Google did not accept this Client ID and Client Secret. Copy them again from the OAuth client.');
  throw failure(response, 'Google');
}

export async function verifyYouTube(credentials) {
  const token = await accessTokenFor(credentials);
  const response = await callProvider('https://www.googleapis.com/youtube/v3/channels', {
    headers: { authorization: `Bearer ${token}` },
    query: { part: 'snippet,statistics', mine: 'true' },
    label: 'YouTube',
  });
  if (!response.ok) throw failure(response, 'YouTube', 'Check that YouTube Data API v3 is enabled for the project.');
  const channel = response.data?.items?.[0];
  if (!channel) throw rejection('This Google account has no YouTube channel. Create one on YouTube first, then try again.');
  const subscribers = Number(channel.statistics?.subscriberCount);
  return {
    externalId: channel.id,
    accountName: channel.snippet?.title || 'YouTube channel',
    handle: channel.snippet?.customUrl || '',
    followers: channel.statistics?.hiddenSubscriberCount || !Number.isFinite(subscribers) ? null : subscribers,
  };
}

export async function verifyGoogleBusiness(credentials) {
  const locationId = credentials.locationId.replace(/^locations\//, '');
  if (!/^\d{5,25}$/.test(locationId)) throw rejection('The Location ID is the long number for your business, for example 1234567890123456789.');
  const token = await accessTokenFor(credentials);
  const response = await callProvider(`https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}`, {
    headers: { authorization: `Bearer ${token}` },
    query: { readMask: 'name,title' },
    label: 'Google Business Profile',
  });
  if (!response.ok) {
    throw failure(response, 'Google Business Profile', 'Check that the Business Profile APIs are enabled and this Google account manages that location.');
  }
  return { externalId: locationId, accountName: response.data?.title || 'Business location', handle: '', followers: null };
}
