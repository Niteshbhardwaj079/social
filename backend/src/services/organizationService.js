import { query, runAsSystem, runWithOrganization } from '../db/pool.js';
import { EMAIL_CATALOG } from '../emails/catalog.js';
import { PERMISSION_COLUMNS } from './permissionColumns.js';
import { logger } from '../utils/logger.js';

/**
 * Organizations = the SaaS customers (companies). Each one has its own users, roles, posts,
 * settings... kept apart by row-level security (see migration 028 and db/pool.js).
 */

// ---------------------------------------------------------------- built-in roles every new organization starts with
// `grants` lists the permissions that are ON; everything else is OFF.
const VIEW_ONLY = ['roles_view', 'posts_view', 'social_accounts_view', 'ads_view', 'campaigns_view', 'media_view', 'templates_view', 'reports_view'];

const DEFAULT_ROLES = [
  {
    id: 'superAdmin',
    name: 'Super Admin',
    description: 'Full access to every module. Cannot be renamed, edited or deleted.',
    icon: 'ShieldCheck',
    accent: 'rose',
    rank: 4,
    isProtected: true,
    grants: PERMISSION_COLUMNS,
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Manage users, content and settings.',
    icon: 'Settings2',
    accent: 'purple',
    rank: 3,
    isProtected: false,
    grants: PERMISSION_COLUMNS,
  },
  {
    id: 'editor',
    name: 'Editor',
    description: 'Create, edit and publish content across all connected accounts.',
    icon: 'PenSquare',
    accent: 'blue',
    rank: 2,
    isProtected: false,
    grants: [
      ...VIEW_ONLY,
      'posts_write', 'posts_publish', 'posts_delete',
      'ads_create', 'ads_edit', 'ads_delete',
      'campaigns_create', 'campaigns_edit', 'campaigns_delete',
      'media_create', 'media_edit', 'media_delete',
      'templates_create', 'templates_edit', 'templates_delete',
      'ai_use', 'ai_autopilot',
    ],
  },
  {
    id: 'contributor',
    name: 'Contributor',
    description: 'Draft and submit content for approval; cannot publish directly.',
    icon: 'Users',
    accent: 'teal',
    rank: 1,
    isProtected: false,
    grants: [...VIEW_ONLY, 'posts_write', 'media_create', 'media_edit', 'media_delete', 'ai_use'],
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Read-only access to analytics and reporting.',
    icon: 'BarChart3',
    accent: 'slate',
    rank: 1,
    isProtected: false,
    grants: VIEW_ONLY,
  },
];

async function insertDefaultRoles(client, organizationId) {
  const columns = ['organization_id', 'id', 'name', 'description', 'icon', 'accent', 'rank', 'is_protected', ...PERMISSION_COLUMNS];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  for (const role of DEFAULT_ROLES) {
    const permissionValues = PERMISSION_COLUMNS.map((column) => role.grants.includes(column));
    await client.query(`INSERT INTO roles (${columns.join(', ')}) VALUES (${placeholders})`, [
      organizationId,
      role.id,
      role.name,
      role.description,
      role.icon,
      role.accent,
      role.rank,
      role.isProtected,
      ...permissionValues,
    ]);
  }
}

/**
 * Creates an organization with everything a brand-new workspace needs (roles, storage/email
 * settings, system emails). Runs on the caller's transaction `client`, so a failed sign-up
 * leaves nothing half-made behind. The caller must be in a system context (runAsSystem).
 */
export async function createOrganization(client, { name }) {
  const organization = (
    await client.query('INSERT INTO organizations (name, billing_name) VALUES ($1, $1) RETURNING *', [name])
  ).rows[0];
  const id = organization.id;

  await insertDefaultRoles(client, id);
  await client.query('INSERT INTO storage_settings (organization_id) VALUES ($1)', [id]);
  await client.query('INSERT INTO email_settings (organization_id) VALUES ($1)', [id]);
  await client.query('INSERT INTO ai_settings (organization_id) VALUES ($1)', [id]);
  await client.query("INSERT INTO settings (organization_id, key, value) VALUES ($1, 'workspace', $2)", [
    id,
    JSON.stringify({ name, website: '', timezone: 'UTC' }),
  ]);
  for (const email of EMAIL_CATALOG) {
    await client.query('INSERT INTO system_emails (organization_id, id, is_enabled) VALUES ($1, $2, $3)', [id, email.id, email.defaultEnabled]);
  }
  return organization;
}

/** The organization a user belongs to (looked up across all organizations), or null. */
export async function organizationIdOfUser(userId) {
  const result = await runAsSystem(() => query('SELECT organization_id FROM users WHERE id = $1', [userId]));
  return result.rows[0]?.organization_id ?? null;
}

/** The organization of the account with this email (emails are unique platform-wide), or null. */
export async function organizationIdOfEmail(email) {
  const result = await runAsSystem(() => query('SELECT organization_id FROM users WHERE lower(email) = lower($1)', [email]));
  return result.rows[0]?.organization_id ?? null;
}

/**
 * Sign-in, password reset, invitations... arrive before we know the organization. These helpers find
 * it first and then run `work` inside it. Unknown user → `work` still runs, with no organization, so
 * it simply finds nothing (and answers exactly as it would for any wrong email/token).
 */
export async function inOrganizationOfEmail(email, work) {
  const organizationId = await organizationIdOfEmail(email);
  return organizationId ? runWithOrganization(organizationId, work) : work();
}

export async function inOrganizationOfUser(userId, work) {
  const organizationId = userId ? await organizationIdOfUser(userId) : null;
  return organizationId ? runWithOrganization(organizationId, work) : work();
}

const runningJobs = new Set();

/**
 * Runs a background job once per active organization, one after another.
 *   - One organization's error is logged and skipped — it never stops the job for everyone else.
 *   - If the previous round of the same job is still going, this round is skipped (no pile-up).
 */
export async function forEachOrganization(jobName, work) {
  if (runningJobs.has(jobName)) return;
  runningJobs.add(jobName);
  try {
    const organizations = await runAsSystem(() => query("SELECT id FROM organizations WHERE status = 'active' ORDER BY created_at"));
    for (const { id } of organizations.rows) {
      try {
        await runWithOrganization(id, work);
      } catch (error) {
        logger.error(`${jobName} failed for one organization`, error, { organizationId: id });
      }
    }
  } finally {
    runningJobs.delete(jobName);
  }
}
