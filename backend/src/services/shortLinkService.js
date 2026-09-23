import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { canWritePosts } from './permissions.js';
import { recordActivity } from './auditService.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';

const HISTORY_DAYS = 14;
const SLUG_RE = /^[a-z0-9-]{3,60}$/;
const RESERVED_SLUGS = new Set(['api', 'media', 'config.js', 'l']);

const toDateStr = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value);

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

/** A short, random, URL-safe slug — used when the person does not pick their own. */
function randomSlug() {
  return crypto.randomBytes(5).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 7) || 'link';
}

function last14Days() {
  const days = [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  for (let i = HISTORY_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - i);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

function present(row, totalClicks, historyRows) {
  const byDate = new Map(historyRows.map((entry) => [toDateStr(entry.date), entry.n]));
  return {
    id: row.id,
    slug: row.slug,
    destinationUrl: row.destination_url,
    label: row.label || row.destination_url,
    clicks: totalClicks,
    createdAt: row.created_at,
    createdBy: row.creator_name || 'Deleted user',
    clickHistory: last14Days().map((date) => ({ date, clicks: byDate.get(date) ?? 0 })),
  };
}

const LINK_SELECT = 'SELECT l.*, u.name AS creator_name FROM short_links l LEFT JOIN users u ON u.id = l.created_by';

export async function listLinks() {
  const [links, totals, history] = await Promise.all([
    query(`${LINK_SELECT} ORDER BY l.created_at DESC`),
    query('SELECT short_link_id, count(*)::int AS n FROM short_link_clicks GROUP BY short_link_id'),
    query(
      // Bucketed in UTC explicitly (not the DB session's ambient timezone) to match last14Days()'s own
      // UTC-based date list above — otherwise a click near midnight lands in the session-timezone's
      // "today" while the chart's own day list is a UTC "today", silently losing that click from every
      // day's bucket until the two clocks agree again. Host-agnostic on purpose: this app can run with
      // any PostgreSQL, on any host, in any default session timezone (see this backend's own portability
      // rules) — pinning both sides to UTC keeps the chart correct regardless of where it's deployed.
      `SELECT short_link_id, date_trunc('day', clicked_at AT TIME ZONE 'UTC')::date AS date, count(*)::int AS n
         FROM short_link_clicks WHERE clicked_at >= now() - interval '${HISTORY_DAYS} days'
        GROUP BY short_link_id, date`
    ),
  ]);
  const totalByLink = new Map(totals.rows.map((row) => [row.short_link_id, row.n]));
  const historyByLink = new Map();
  for (const row of history.rows) {
    if (!historyByLink.has(row.short_link_id)) historyByLink.set(row.short_link_id, []);
    historyByLink.get(row.short_link_id).push(row);
  }
  return links.rows.map((row) => present(row, totalByLink.get(row.id) ?? 0, historyByLink.get(row.id) ?? []));
}

async function getRow(id) {
  return (await query(`${LINK_SELECT} WHERE l.id = $1`, [id])).rows[0] ?? null;
}

export async function createLink({ actor, input, ip, userAgent }) {
  if (!canWritePosts(actor)) throw forbidden('Your role cannot create short links.');
  const destinationUrl = String(input.destinationUrl || '').trim();
  try {
    const url = new URL(destinationUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
  } catch {
    throw badRequest('Enter a full destination URL, starting with https://');
  }

  let slug = normalizeSlug(input.customSlug || input.label);
  if (slug && !SLUG_RE.test(slug)) throw badRequest('The short link can only use letters, numbers and hyphens (3-60 characters).');
  if (slug && RESERVED_SLUGS.has(slug)) throw badRequest('That short link is reserved. Choose another one.');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = slug || randomSlug();
    const saved = await query(
      `INSERT INTO short_links (slug, destination_url, label, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING RETURNING *`,
      [candidate, destinationUrl, (input.label || '').trim(), actor.id]
    );
    if (saved.rows[0]) {
      await recordActivity({ actorId: actor.id, action: 'link.created', entity: 'short_link', entityId: saved.rows[0].id, meta: { slug: candidate }, ip, userAgent });
      return present({ ...saved.rows[0], creator_name: actor.name }, 0, []);
    }
    if (slug) throw badRequest('That short link is already taken. Choose another one.');
    // No custom slug was given and the random one collided (rare) — try another random one.
  }
  throw badRequest('Could not find a free short link right now. Try a custom one.');
}

export async function deleteLink({ id, actor, ip, userAgent }) {
  if (!canWritePosts(actor)) throw forbidden('Your role cannot delete short links.');
  const existing = await getRow(id);
  if (!existing) throw notFound('Link not found');
  await query('DELETE FROM short_links WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'link.deleted', entity: 'short_link', entityId: id, meta: { slug: existing.slug }, ip, userAgent });
}

/** Deletes what it can; one already gone (or belonging to a role that cannot delete) is skipped, not fatal. */
export async function deleteLinks({ ids, actor, ip, userAgent }) {
  let deleted = 0;
  for (const id of ids) {
    try {
      await deleteLink({ id, actor, ip, userAgent });
      deleted += 1;
    } catch (error) {
      if (error.status !== 404 && error.status !== 403) throw error;
    }
  }
  return { success: true, deleted };
}

/** GET /l/:slug — records the visit and says where to send the browser, or null if this slug does not exist. */
export async function resolveAndRecordClick(slug) {
  const result = await query('SELECT id, destination_url FROM short_links WHERE slug = $1', [normalizeSlug(slug)]);
  const link = result.rows[0];
  if (!link) return null;
  await query('INSERT INTO short_link_clicks (short_link_id) VALUES ($1)', [link.id]);
  return link.destination_url;
}
