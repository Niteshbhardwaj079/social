import { callProvider, failure } from './http.js';
import { oauth1Header } from './oauth1.js';
import { rejection } from './errors.js';

const ME_URL = 'https://api.x.com/2/users/me';

export async function verifyX({ apiKey, apiSecret, accessToken, accessTokenSecret }) {
  const params = { 'user.fields': 'public_metrics,username' };
  const authorization = oauth1Header({
    method: 'GET',
    url: ME_URL,
    params,
    consumerKey: apiKey,
    consumerSecret: apiSecret,
    token: accessToken,
    tokenSecret: accessTokenSecret,
  });
  const response = await callProvider(ME_URL, { headers: { authorization }, query: params, label: 'X' });
  if (!response.ok) {
    throw failure(response, 'X', 'Check that the app has Read and Write permission, and that the Access Token was generated after you set it.');
  }
  const user = response.data?.data;
  if (!user?.id) throw rejection('X did not return an account for these keys.');
  return {
    externalId: user.id,
    accountName: user.name || user.username,
    handle: user.username ? `@${user.username}` : '',
    followers: user.public_metrics?.followers_count ?? null,
  };
}
