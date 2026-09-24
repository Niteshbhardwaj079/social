import crypto from 'node:crypto';
import { query, transaction } from '../db/pool.js';
import * as storage from '../storage/index.js';
import { StorageError } from '../storage/index.js';
import { assertPublicOrigin } from '../providers/http.js';
import { HttpError, badRequest, forbidden, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './auditService.js';
import { canCreateMedia, canDeleteMedia, canEditMedia } from './permissions.js';
import * as storageService from './storageService.js';

const DEFAULT_FOLDER = 'Campaigns';
const LINK_FETCH_TIMEOUT_MS = 10_000;

function present(row, usedIn = []) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    folder: row.folder,
    tags: row.tags,
    sizeKb: Math.round(Number(row.size_bytes) / 1024),
    width: row.width,
    height: row.height,
    storage: row.storage,
    storageLabel: row.storage_label,
    contentType: row.content_type,
    publicUrl: row.public_url,
    // The web app's grid renders an image thumbnail from `url` (the mock's in-browser preview field);
    // re-crop ("Crop or compress") only shows up for a freshly-cropped `data:` one, never a stored image —
    // cropping an already-uploaded file would need fetching it back across origins first, which isn't built yet.
    url: row.type === 'image' ? row.public_url : null,
    uploadedBy: row.uploader_name || 'Deleted user',
    uploadedAt: row.created_at,
    usedIn,
  };
}

async function usedInByMedia(ids) {
  if (!ids.length) return new Map();
  const rows = (
    await query(
      `SELECT pm.media_id, p.status, left(p.content, 60) AS title
         FROM post_media pm JOIN posts p ON p.id = pm.post_id
        WHERE pm.media_id = ANY($1)`,
      [ids]
    )
  ).rows;
  const map = new Map(ids.map((id) => [id, []]));
  for (const row of rows) map.get(row.media_id).push({ kind: 'post', status: row.status, title: row.title });
  return map;
}

const MEDIA_SELECT = `SELECT m.*, u.name AS uploader_name FROM media_items m LEFT JOIN users u ON u.id = m.uploaded_by`;

export async function listMedia() {
  const rows = (await query(`${MEDIA_SELECT} ORDER BY m.created_at DESC LIMIT 500`)).rows;
  const usedIn = await usedInByMedia(rows.map((row) => row.id));
  return rows.map((row) => present(row, usedIn.get(row.id)));
}

export async function listFolders() {
  const rows = (await query('SELECT DISTINCT folder FROM media_items ORDER BY folder')).rows;
  const folders = rows.map((row) => row.folder);
  return ['All Media', ...(folders.length ? folders : [DEFAULT_FOLDER])];
}

async function getRow(id) {
  const row = (await query(`${MEDIA_SELECT} WHERE m.id = $1`, [id])).rows[0];
  if (!row) throw notFound('File not found');
  return row;
}

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
const newKey = (name) => `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${slugify(name)}`;

async function assertWithinLimit(extraBytes) {
  const limit = await storageService.currentLimitBytes();
  if (!limit) return;
  const used = (await query("SELECT COALESCE(SUM(size_bytes), 0) AS used FROM media_items WHERE storage <> 'linked'")).rows[0].used;
  if (Number(used) + extraBytes > limit) {
    throw badRequest('That would go over your storage limit. Free up space, or raise the limit in Settings → Storage, then try again.');
  }
}

/** A real upload: the bytes go to wherever Settings → Storage points uploads right now. */
export async function uploadMedia({ buffer, contentType, originalName, type, folder, width, height, actor, ip, userAgent }) {
  if (!canCreateMedia(actor)) throw forbidden('Your role cannot upload files.');
  await assertWithinLimit(buffer.length);
  const target = await storageService.resolveUploadTarget();
  if (!target.allowed) throw badRequest(target.reason);

  const key = newKey(originalName);
  let stored;
  try {
    stored = await storage.putObject(target.target, key, buffer, contentType);
  } catch (error) {
    if (error instanceof StorageError) throw badRequest(`Could not upload the file: ${error.message}`);
    throw error;
  }
  const publicUrl = storage.publicUrlFor(target.target, stored.key);

  const row = (
    await query(
      `INSERT INTO media_items (type, name, folder, size_bytes, width, height, storage, storage_label, storage_key, content_type, public_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [type, originalName, folder || DEFAULT_FOLDER, buffer.length, width ?? null, height ?? null, target.storage, target.label, stored.key, contentType, publicUrl, actor.id]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'media.uploaded', entity: 'media', entityId: row.id, meta: { name: originalName, storage: target.storage }, ip, userAgent });
  return present({ ...row, uploader_name: actor.name });
}

/** "Add an image that is already online": nothing is stored, the library just remembers the link. */
export async function addLinkedMedia({ url, name, width, height, actor, ip, userAgent }) {
  if (!canCreateMedia(actor)) throw forbidden('Your role cannot add files.');
  try {
    await assertPublicOrigin(url, { requireHttps: false });
  } catch (error) {
    throw badRequest(error.message);
  }

  let contentType = 'image/*';
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(LINK_FETCH_TIMEOUT_MS) });
    if (!head.ok) throw new Error('not ok');
    contentType = head.headers.get('content-type') || contentType;
  } catch {
    throw badRequest('Could not open that link. Check that it points straight at an image and is publicly reachable.');
  }
  if (!contentType.startsWith('image/')) throw badRequest('That link does not point at an image.');

  const row = (
    await query(
      `INSERT INTO media_items (type, name, folder, size_bytes, width, height, storage, storage_label, storage_key, content_type, public_url, uploaded_by)
       VALUES ('image', $1, $2, 0, $3, $4, 'linked', 'Linked', NULL, $5, $6, $7) RETURNING *`,
      [name || 'linked-image', DEFAULT_FOLDER, width ?? null, height ?? null, contentType, url, actor.id]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'media.linked', entity: 'media', entityId: row.id, meta: { name: row.name }, ip, userAgent });
  return present({ ...row, uploader_name: actor.name });
}

/** Re-cropping an existing image: new bytes replace the old ones, everything else about the row stays. */
export async function replaceMedia({ id, buffer, contentType, width, height, actor, ip, userAgent }) {
  if (!canEditMedia(actor)) throw forbidden('Your role cannot change files.');
  const row = await getRow(id);
  if (row.storage === 'linked') throw badRequest('A linked image cannot be re-cropped — it is not ours to change.');
  await assertWithinLimit(buffer.length - Number(row.size_bytes));

  const target = await storageService.targetForMedia(row);
  const key = newKey(row.name);
  const stored = await storage.putObject(target, key, buffer, contentType);
  const publicUrl = storage.publicUrlFor(target, stored.key);

  const updated = (
    await query(
      `UPDATE media_items SET storage_key = $2, public_url = $3, size_bytes = $4, width = $5, height = $6, content_type = $7
        WHERE id = $1 RETURNING *`,
      [id, stored.key, publicUrl, buffer.length, width ?? null, height ?? null, contentType]
    )
  ).rows[0];
  await storage.deleteObject(target, row.storage_key).catch((error) => logger.warn('Could not remove the replaced file', { id, error: error.message }));
  await recordActivity({ actorId: actor.id, action: 'media.replaced', entity: 'media', entityId: id, meta: { name: row.name }, ip, userAgent });
  return present({ ...updated, uploader_name: actor.name });
}

async function removeFile(row) {
  if (row.storage === 'linked') return;
  const target = await storageService.targetForMedia(row);
  await storage.deleteObject(target, row.storage_key);
}

export async function deleteMedia({ id, actor, ip, userAgent }) {
  if (!canDeleteMedia(actor)) throw forbidden('Your role cannot delete files.');
  const row = await getRow(id);
  await removeFile(row).catch((error) => logger.warn('Could not remove a deleted file from storage', { id, error: error.message }));
  await transaction(async (client) => {
    await client.query('DELETE FROM post_media WHERE media_id = $1', [id]);
    await client.query('DELETE FROM media_items WHERE id = $1', [id]);
  });
  await recordActivity({ actorId: actor.id, action: 'media.deleted', entity: 'media', entityId: id, meta: { name: row.name }, ip, userAgent });
}

/** Deletes what it can; a file already gone, or one this person cannot touch, is skipped rather than failing the whole batch. */
export async function bulkDeleteMedia({ ids, actor, ip, userAgent }) {
  let deleted = 0;
  for (const id of ids) {
    try {
      await deleteMedia({ id, actor, ip, userAgent });
      deleted += 1;
    } catch (error) {
      if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 403)) throw error;
    }
  }
  return { deleted, skipped: ids.length - deleted };
}

/** For the composer / publishers: the media rows for a post's attachments, in order. */
export async function mediaForIds(ids) {
  if (!ids?.length) return [];
  const rows = (await query(`${MEDIA_SELECT} WHERE m.id = ANY($1)`, [ids])).rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw badRequest('One of the attached files no longer exists.');
  return ids.map((id) => byId.get(id));
}

/** The actual bytes of a file — from wherever it really lives (our storage, or, for a linked one, its own URL). */
export async function readMediaBytes(row) {
  if (row.storage === 'linked') {
    const response = await fetch(row.public_url, { redirect: 'error', signal: AbortSignal.timeout(LINK_FETCH_TIMEOUT_MS) }).catch(() => null);
    if (!response?.ok) throw badRequest('Could not fetch the linked file right now.');
    return Buffer.from(await response.arrayBuffer());
  }
  const target = await storageService.targetForMedia(row);
  return storage.getObjectBytes(target, row.storage_key);
}

