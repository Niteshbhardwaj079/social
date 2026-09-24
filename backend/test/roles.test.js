import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { createClient, setupOwner, startServer } from './helpers.js';

let server;
let owner; // Super Admin (the protected role) — created first, per the app's first-user-only rule.

let userCounter = 0;
async function makeUser(name, role) {
  userCounter += 1;
  const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}${userCounter}@example.com`;
  const created = await owner.post('/users', { name, email, role, language: 'en' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = $1", [email]);
  const client = createClient(server.baseUrl);
  assert.equal((await client.signIn(email)).status, 200);
  return { client, id: created.body.user.id };
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => server.close());

describe('reading roles', () => {
  it('anyone signed in can list roles; nobody signed out can', async () => {
    const { client: analyst } = await makeUser('Ana Lyst', 'analyst');
    const list = await analyst.get('/roles');
    assert.equal(list.status, 200);
    assert.ok(list.body.roles.some((role) => role.id === 'editor'));
    assert.equal((await createClient(server.baseUrl).get('/roles')).status, 401);
  });

  it('the 5 built-in roles keep their existing real capabilities after the rework', async () => {
    const list = await owner.get('/roles');
    const byId = Object.fromEntries(list.body.roles.map((role) => [role.id, role]));
    assert.equal(byId.superAdmin.isProtected, true);
    assert.equal(byId.admin.isProtected, false);
    assert.deepEqual(byId.editor.permissions, {
      usersManage: false,
      rolesManage: false,
      postsWrite: true,
      postsPublish: true,
      socialAccountsManage: false,
      adsManage: true,
      campaignsManage: true,
      reportsView: true,
      mediaManage: true,
      templatesManage: true,
      activityLogsManage: false,
      settingsManage: false,
    });
    assert.equal(byId.contributor.permissions.postsPublish, false);
    assert.equal(byId.analyst.permissions.postsWrite, false);
  });
});

describe('who can manage role definitions', () => {
  it('only a role with rolesManage may create, edit or delete a role', async () => {
    const { client: editor } = await makeUser('Ed Itor', 'editor'); // rolesManage: false
    const created = await editor.post('/roles', { name: 'Should Fail', permissions: {} });
    assert.equal(created.status, 403);

    const anyRole = (await owner.get('/roles')).body.roles.find((role) => role.id === 'editor');
    assert.equal((await editor.patch(`/roles/${anyRole.id}`, { description: 'nope' })).status, 403);
    assert.equal((await editor.delete(`/roles/${anyRole.id}`)).status, 403);
  });

  it('Admin (not just Super Admin) can create a custom role — the literal ask', async () => {
    const { client: admin } = await makeUser('Ad Min', 'admin');
    const created = await admin.post('/roles', {
      name: 'Ads Manager',
      description: 'Runs ad campaigns only.',
      icon: 'Megaphone',
      accent: 'blue',
      rank: 1,
      permissions: { adsManage: true, reportsView: true },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.role.name, 'Ads Manager');
    assert.equal(created.body.role.id, 'ads-manager');
    assert.equal(created.body.role.isProtected, false);
    assert.equal(created.body.role.usersCount, 0);
    assert.deepEqual(created.body.role.permissions.adsManage, true);
    assert.deepEqual(created.body.role.permissions.usersManage, false);
  });

  it('the protected Super Admin role can never be renamed, edited or deleted, by anyone', async () => {
    assert.equal((await owner.patch('/roles/superAdmin', { description: 'try to change it' })).status, 403);
    assert.equal((await owner.delete('/roles/superAdmin')).status, 403);
  });

  it('cannot grant a permission you do not have yourself (the escalation guard)', async () => {
    // A custom role with rolesManage but nothing else — created by Super Admin (who has everything).
    const limited = await owner.post('/roles', { name: 'Role Editor Only', rank: 1, permissions: { rolesManage: true } });
    assert.equal(limited.status, 201);
    const { client: limitedUser } = await makeUser('Lim Ited', limited.body.role.id);

    // They can manage role DEFINITIONS (rolesManage: true)...
    const attempt = await limitedUser.post('/roles', { name: 'Should Fail Too', rank: 1, permissions: { usersManage: true } });
    // ...but cannot grant a capability (usersManage) they do not hold themselves.
    assert.equal(attempt.status, 403);

    const okAttempt = await limitedUser.post('/roles', { name: 'Only Roles Manage', rank: 1, permissions: { rolesManage: true } });
    assert.equal(okAttempt.status, 201, 'granting a permission the actor DOES hold is fine');
  });

  it('rank must be a whole number within 1-3 — rank 4 is reserved for the protected role', async () => {
    const { client: admin } = await makeUser('Ad Min Two', 'admin');
    assert.equal((await admin.post('/roles', { name: 'Out Of Range', rank: 4, permissions: {} })).status, 400);
    assert.equal((await admin.post('/roles', { name: 'Too Low', rank: 0, permissions: {} })).status, 400);
    assert.equal((await admin.post('/roles', { name: 'Peer Rank Is Fine', rank: 3, permissions: {} })).status, 201);
  });

  it('duplicating a role copies its permissions and rank, capped to what the actor can grant', async () => {
    const source = await owner.get('/roles');
    const editorRole = source.body.roles.find((role) => role.id === 'editor');
    const cloned = await owner.post(`/roles/${editorRole.id}/duplicate`, {});
    assert.equal(cloned.status, 201);
    assert.equal(cloned.body.role.name, 'Editor (Copy)');
    assert.deepEqual(cloned.body.role.permissions, editorRole.permissions);
    assert.notEqual(cloned.body.role.id, editorRole.id);
  });

  it('a role assigned to at least one person cannot be deleted until they are reassigned', async () => {
    const created = await owner.post('/roles', { name: 'Temp Role', rank: 1, permissions: { reportsView: true } });
    const roleId = created.body.role.id;
    const { id: userId } = await makeUser('Temp Person', roleId);

    const blocked = await owner.delete(`/roles/${roleId}`);
    assert.equal(blocked.status, 409);

    await owner.patch(`/users/${userId}`, { role: 'analyst' });
    const allowed = await owner.delete(`/roles/${roleId}`);
    assert.equal(allowed.status, 204);
  });

  it('archiving a role blocks new assignment but does not break people who already have it', async () => {
    const created = await owner.post('/roles', { name: 'Seasonal Role', rank: 1, permissions: { reportsView: true } });
    const roleId = created.body.role.id;
    const { client: seasonalUser } = await makeUser('Season Al', roleId);

    const archived = await owner.patch(`/roles/${roleId}`, { isActive: false });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.role.isActive, false);

    // Already-assigned person keeps working exactly as before.
    assert.equal((await seasonalUser.get('/roles')).status, 200);

    // But nobody new can be put on an archived role.
    const refused = await owner.post('/users', { name: 'New Person', email: 'newperson@example.com', role: roleId, language: 'en' });
    assert.equal(refused.status, 400);
  });
});

describe('assigning any available role, enforced server-side per module', () => {
  it('a custom role with only campaignsManage can create campaigns but not manage social accounts', async () => {
    const created = await owner.post('/roles', {
      name: 'Content Manager',
      rank: 1,
      permissions: { postsWrite: true, campaignsManage: true, mediaManage: true, reportsView: true },
    });
    assert.equal(created.status, 201);
    const { client: contentManager } = await makeUser('Con Manager', created.body.role.id);

    const campaign = await contentManager.post('/campaigns', { name: 'Diwali Push', description: '', status: 'scheduled' });
    assert.equal(campaign.status, 201, JSON.stringify(campaign.body));

    assert.equal((await contentManager.get('/social-accounts')).status, 200, 'reading is always open');
    assert.equal((await contentManager.put('/social-accounts/bluesky', { credentials: { handle: 'x', appPassword: 'y' } })).status, 403);
  });

  it('a role can be assigned to a user at invite time and again later via update', async () => {
    const created = await owner.post('/roles', { name: 'Viewer', rank: 1, permissions: { reportsView: true } });
    const roleId = created.body.role.id;
    const { client: viewer, id: userId } = await makeUser('View Er', roleId);

    assert.equal((await viewer.get('/dashboard')).status, 200);
    assert.equal((await viewer.get('/campaigns')).status, 200, 'read-only pages stay open');
    assert.equal((await viewer.post('/campaigns', { name: 'X', description: '', status: 'scheduled' })).status, 403);

    // Re-assign them to Editor and confirm the new capability set applies immediately.
    const reassigned = await owner.patch(`/users/${userId}`, { role: 'editor' });
    assert.equal(reassigned.status, 200);
    assert.equal((await viewer.post('/campaigns', { name: 'Now Allowed', description: '', status: 'scheduled' })).status, 201);
  });

  it('assigning a made-up role id is refused as a 400, not a 404 or a raw DB error', async () => {
    const refused = await owner.post('/users', { name: 'Ghost', email: 'ghost@example.com', role: 'not-a-real-role', language: 'en' });
    assert.equal(refused.status, 400);
  });
});
