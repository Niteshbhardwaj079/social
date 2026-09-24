import { query } from '../db/pool.js';
import { mediaForIds } from './mediaService.js';
import { canCreateTemplates, canDeleteTemplates, canEditTemplates } from './permissions.js';
import { forbidden, notFound } from '../utils/httpError.js';
import { recordActivity } from './auditService.js';

/**
 * Phase 5: Creative Library. A saved, reusable ad creative (headline/text/CTA/link/image) that exists
 * independently of any ad — never launched on its own, only picked from when building a real ad (or a
 * bulk variation, see adsService.js's Phase 4 work) to skip retyping. See migration
 * 019_ad_creative_templates.sql for why this is its own table rather than another `ad_creatives` row.
 */

function present(row, media) {
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    text: row.body_text,
    cta: row.cta,
    destinationUrl: row.destination_url,
    mediaId: row.media_id,
    mediaUrl: media?.public_url || null,
    createdAt: row.created_at,
  };
}

async function mediaMap(rows) {
  const ids = [...new Set(rows.map((row) => row.media_id).filter(Boolean))];
  const media = ids.length ? await mediaForIds(ids) : [];
  return new Map(media.map((item) => [item.id, item]));
}

export async function listTemplates() {
  const rows = (await query('SELECT * FROM ad_creative_templates ORDER BY created_at DESC')).rows;
  const media = await mediaMap(rows);
  return rows.map((row) => present(row, media.get(row.media_id)));
}

async function getTemplateRow(id) {
  return (await query('SELECT * FROM ad_creative_templates WHERE id = $1', [id])).rows[0] ?? null;
}

export async function createTemplate({ actor, input, ip, userAgent }) {
  if (!canCreateTemplates(actor)) throw forbidden('Your role cannot save creative templates.');
  const row = (
    await query(
      `INSERT INTO ad_creative_templates (name, headline, body_text, cta, destination_url, media_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.name, input.headline, input.text, input.cta, input.destinationUrl, input.mediaId || null, actor.id]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'ads.template_saved', entity: 'ad_creative_template', entityId: row.id, meta: { name: row.name }, ip, userAgent });
  const media = row.media_id ? (await mediaForIds([row.media_id]))[0] : null;
  return present(row, media);
}

export async function updateTemplate({ id, actor, input, ip, userAgent }) {
  if (!canEditTemplates(actor)) throw forbidden('Your role cannot edit creative templates.');
  const existing = await getTemplateRow(id);
  if (!existing) throw notFound('Template not found');
  const row = (
    await query(
      `UPDATE ad_creative_templates SET name = $2, headline = $3, body_text = $4, cta = $5, destination_url = $6, media_id = $7, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, input.name, input.headline, input.text, input.cta, input.destinationUrl, input.mediaId || null]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'ads.template_updated', entity: 'ad_creative_template', entityId: row.id, meta: { name: row.name }, ip, userAgent });
  const media = row.media_id ? (await mediaForIds([row.media_id]))[0] : null;
  return present(row, media);
}

export async function deleteTemplate({ id, actor, ip, userAgent }) {
  if (!canDeleteTemplates(actor)) throw forbidden('Your role cannot delete creative templates.');
  const existing = await getTemplateRow(id);
  if (!existing) throw notFound('Template not found');
  await query('DELETE FROM ad_creative_templates WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'ads.template_deleted', entity: 'ad_creative_template', entityId: id, meta: { name: existing.name }, ip, userAgent });
}
