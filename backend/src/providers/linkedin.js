import { callProvider, failure } from './http.js';
import { rejection } from './errors.js';

const API = 'https://api.linkedin.com/v2';

const bearer = (token) => ({ authorization: `Bearer ${token}`, 'x-restli-protocol-version': '2.0.0' });

export async function verifyLinkedIn({ accessToken }) {
  const response = await callProvider(`${API}/userinfo`, { headers: bearer(accessToken), label: 'LinkedIn' });
  if (!response.ok) {
    throw failure(response, 'LinkedIn', 'Make sure the token was generated with Sign In with LinkedIn (openid, profile) and w_member_social.');
  }
  const person = response.data;
  if (!person?.sub) throw rejection('LinkedIn did not return a profile for this token.');
  return { externalId: person.sub, accountName: person.name || [person.given_name, person.family_name].filter(Boolean).join(' '), handle: '', followers: null };
}

export async function verifyLinkedInCompany({ accessToken, organizationId }) {
  if (!/^\d{1,20}$/.test(organizationId)) throw rejection('The Organization ID is the number in your Page admin address, for example 12345678.');
  const response = await callProvider(`${API}/organizations/${organizationId}`, { headers: bearer(accessToken), label: 'LinkedIn' });
  if (!response.ok) {
    throw failure(response, 'LinkedIn', 'You need to be an admin of that Page, and the app needs the Community Management API.');
  }
  const organization = response.data;
  if (!organization?.id) throw rejection('LinkedIn did not return that Page.');

  // Follower count is a nice extra; the connection works without it.
  let followers = null;
  try {
    const sizes = await callProvider(`${API}/networkSizes/urn:li:organization:${organizationId}`, {
      headers: bearer(accessToken),
      query: { edgeType: 'CompanyFollowedByMember' },
      label: 'LinkedIn',
    });
    if (sizes.ok && Number.isFinite(sizes.data?.firstDegreeSize)) followers = sizes.data.firstDegreeSize;
  } catch {
    // followers stay unknown
  }
  return { externalId: String(organization.id), accountName: organization.localizedName, handle: organization.vanityName || '', followers };
}
