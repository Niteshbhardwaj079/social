import { query } from '../db/pool.js';
import { forbidden, notFound } from '../utils/httpError.js';
import { canManageCampaigns } from './permissions.js';
import { recordActivity } from './auditService.js';

const CAMPAIGN_SELECT = 'SELECT c.*, u.name AS creator_name FROM campaigns c LEFT JOIN users u ON u.id = c.created_by';
const EMPTY_STATS = { total: 0, published: 0, scheduled: 0, failed: 0 };

function present(row, stats = EMPTY_STATS) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    objective: row.objective,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    platforms: row.platforms,
    owner: row.creator_name || 'Deleted user',
    ownerId: row.created_by,
    postsCount: stats.total,
    publishedCount: stats.published,
    scheduledCount: stats.scheduled,
    failedCount: stats.failed,
    // No analytics source exists yet (see the backend README's "not built yet" list) — honestly 0, never invented.
    engagement: 0,
    reach: 0,
    clicks: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function statsByCampaign(ids) {
  const map = new Map(ids.map((id) => [id, { ...EMPTY_STATS }]));
  if (!ids.length) return map;
  const rows = (
    await query('SELECT campaign_id, status, count(*)::int AS n FROM posts WHERE campaign_id = ANY($1) GROUP BY campaign_id, status', [ids])
  ).rows;
  for (const row of rows) {
    const bucket = map.get(row.campaign_id);
    bucket.total += row.n;
    if (row.status === 'published') bucket.published += row.n;
    else if (row.status === 'scheduled' || row.status === 'publishing') bucket.scheduled += row.n;
    else if (row.status === 'failed') bucket.failed += row.n;
  }
  return map;
}

async function getRow(id) {
  return (await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [id])).rows[0] ?? null;
}

/** For postService: refuses a post pointing at a campaign that does not exist. */
export async function campaignExists(id) {
  if (!id) return true;
  return Boolean((await query('SELECT 1 FROM campaigns WHERE id = $1', [id])).rows[0]);
}

export async function listCampaigns() {
  const rows = (await query(`${CAMPAIGN_SELECT} ORDER BY c.created_at DESC`)).rows;
  const stats = await statsByCampaign(rows.map((row) => row.id));
  return rows.map((row) => present(row, stats.get(row.id)));
}

export async function getCampaign(id) {
  const row = await getRow(id);
  if (!row) throw notFound('Campaign not found');
  const stats = await statsByCampaign([id]);
  return present(row, stats.get(id));
}

export async function createCampaign({ actor, input, ip, userAgent }) {
  if (!canManageCampaigns(actor)) throw forbidden('Your role cannot create campaigns.');
  const row = (
    await query(
      `INSERT INTO campaigns (name, description, objective, status, platforms, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [input.name, input.description ?? '', input.objective ?? '', input.status ?? 'scheduled', input.platforms ?? [], input.startDate ?? null, input.endDate ?? null, actor.id]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'campaign.created', entity: 'campaign', entityId: row.id, meta: { name: row.name }, ip, userAgent });
  return present({ ...row, creator_name: actor.name });
}

export async function updateCampaign({ id, actor, input, ip, userAgent }) {
  if (!canManageCampaigns(actor)) throw forbidden('Your role cannot change campaigns.');
  const existing = await getRow(id);
  if (!existing) throw notFound('Campaign not found');
  const row = (
    await query(
      `UPDATE campaigns SET
         name = $2, description = $3, objective = $4, status = $5, platforms = $6, start_date = $7, end_date = $8, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.objective ?? existing.objective,
        input.status ?? existing.status,
        input.platforms ?? existing.platforms,
        input.startDate !== undefined ? input.startDate : existing.start_date,
        input.endDate !== undefined ? input.endDate : existing.end_date,
      ]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'campaign.updated', entity: 'campaign', entityId: id, meta: { name: row.name }, ip, userAgent });
  const stats = await statsByCampaign([id]);
  return present({ ...row, creator_name: existing.creator_name }, stats.get(id));
}

export async function deleteCampaign({ id, actor, ip, userAgent }) {
  if (!canManageCampaigns(actor)) throw forbidden('Your role cannot delete campaigns.');
  const existing = await getRow(id);
  if (!existing) throw notFound('Campaign not found');
  await query('DELETE FROM campaigns WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'campaign.deleted', entity: 'campaign', entityId: id, meta: { name: existing.name }, ip, userAgent });
}
