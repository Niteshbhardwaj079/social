import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD, createClient, outboxFor, setupOwner, startServer, tokenFromEmail, waitFor } from './helpers.js';
import { query } from '../src/db/pool.js';

let server;
let owner;

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => server.close());

describe('language settings', () => {
  it('starts with every language on and English as the default', async () => {
    const response = await owner.get('/settings/languages');
    assert.equal(response.status, 200);
    assert.equal(response.body.enabledLanguages.length, 21);
    assert.equal(response.body.defaultLanguage, 'en');
    assert.equal(response.body.languages.find((language) => language.code === 'ar').dir, 'rtl');
  });

  it('validates what is saved', async () => {
    assert.equal((await owner.put('/settings/languages', { enabledLanguages: ['en', 'klingon'], defaultLanguage: 'en' })).status, 400);
    assert.equal((await owner.put('/settings/languages', { enabledLanguages: [], defaultLanguage: 'en' })).status, 400);
    const badDefault = await owner.put('/settings/languages', { enabledLanguages: ['en', 'hi'], defaultLanguage: 'ar' });
    assert.equal(badDefault.status, 400);
    assert.match(badDefault.body.error.message, /default language/i);
  });

  it('saves the list, and the sign-in screen (no login needed) sees it', async () => {
    const saved = await owner.put('/settings/languages', { enabledLanguages: ['hi', 'en', 'es'], defaultLanguage: 'hi' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.enabledLanguages, ['en', 'hi', 'es'], 'kept in the canonical order');
    const publicConfig = await createClient(server.baseUrl).get('/public/config');
    assert.deepEqual(publicConfig.body.languages, { enabledLanguages: ['en', 'hi', 'es'], defaultLanguage: 'hi' });
  });

  it('serves a person whose language was switched off in the default language instead', async () => {
    const created = await owner.post('/users', { name: 'Zed Chinese', email: 'zed@example.com', role: 'editor', language: 'zh' });
    assert.equal(created.body.user.language, 'hi', 'not offered any more, so they start in the workspace default');
    await owner.put('/settings/languages', { enabledLanguages: ['en', 'hi', 'es'], defaultLanguage: 'hi' });
    const mail = await waitFor(async () => (await outboxFor('zed@example.com')).find((row) => row.event_key === 'users.invited'));
    assert.equal(mail.language, 'hi');
  });

  it('only Super Admins and Admins may change it, but everyone can read it', async () => {
    const created = await owner.post('/users', { name: 'Con Tributor', email: 'con@example.com', role: 'contributor', language: 'en' });
    assert.equal(created.status, 201);
    const invite = await waitFor(async () => (await outboxFor('con@example.com')).find((row) => row.event_key === 'users.invited'));
    const contributor = createClient(server.baseUrl);
    const accepted = await contributor.post('/auth/accept-invite', { token: tokenFromEmail(invite.html, 'accept-invite'), password: PASSWORD });
    contributor.accessToken = accepted.body.accessToken;
    assert.equal((await contributor.get('/settings/languages')).status, 200);
    assert.equal((await contributor.put('/settings/languages', { enabledLanguages: ['en'], defaultLanguage: 'en' })).status, 403);
    assert.equal((await createClient(server.baseUrl).put('/settings/languages', { enabledLanguages: ['en'], defaultLanguage: 'en' })).status, 401);
    await owner.put('/settings/languages', { enabledLanguages: ['en', 'hi', 'ar', 'es'], defaultLanguage: 'en' });
  });

  it('keeps workspace details', async () => {
    assert.equal((await owner.put('/settings/workspace', { timezone: 'Mars/Olympus' })).status, 400);
    const saved = await owner.put('/settings/workspace', { name: 'Gowebkart', timezone: 'Asia/Kolkata' });
    assert.equal(saved.status, 200);
    assert.equal((await owner.get('/settings/workspace')).body.name, 'Gowebkart');
  });
});

describe('system emails: every language has its own copy', () => {
  it('lists all 13 emails in the language asked for', async () => {
    const hindi = await owner.get('/system-emails?lang=hi');
    assert.equal(hindi.body.emails.length, 13);
    const reset = hindi.body.emails.find((email) => email.id === 'auth-password-reset');
    assert.equal(reset.language, 'hi');
    assert.match(reset.subject, /पासवर्ड/);
    assert.deepEqual(reset.customisedLanguages, []);
    assert.equal(reset.subject, reset.defaultSubject);
    assert.equal((await owner.get('/system-emails?lang=klingon')).status, 400);
    assert.equal((await owner.get('/system-emails/does-not-exist')).status, 404);
  });

  it('editing one language never changes another', async () => {
    const id = 'auth-password-reset';
    const hi = (await owner.get(`/system-emails/${id}?lang=hi`)).body.email;
    const edited = await owner.put(`/system-emails/${id}/translations/hi`, { subject: 'हिन्दी विषय — बदला हुआ', html: hi.html.replace('पासवर्ड रीसेट करें', 'मेरा नया शीर्षक') });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.email.subject, 'हिन्दी विषय — बदला हुआ');
    assert.deepEqual(edited.body.email.customisedLanguages, ['hi']);

    const arabic = await owner.put(`/system-emails/${id}/translations/ar`, { subject: 'موضوع مخصص', html: '<p dir="rtl">مرحبا {{user_name}}</p>' });
    assert.equal(arabic.status, 200);
    assert.deepEqual(arabic.body.email.customisedLanguages, ['ar', 'hi']);

    const english = (await owner.get(`/system-emails/${id}?lang=en`)).body.email;
    assert.equal(english.subject, english.defaultSubject, 'English is untouched');
    assert.equal((await owner.get(`/system-emails/${id}?lang=hi`)).body.email.subject, 'हिन्दी विषय — बदला हुआ');
    assert.equal((await owner.get(`/system-emails/${id}?lang=ar`)).body.email.subject, 'موضوع مخصص');
  });

  it('resets only the language asked for', async () => {
    const id = 'auth-password-reset';
    const reset = await owner.delete(`/system-emails/${id}/translations/hi`);
    assert.equal(reset.status, 200);
    assert.equal(reset.body.email.subject, reset.body.email.defaultSubject);
    assert.deepEqual(reset.body.email.customisedLanguages, ['ar'], 'Arabic keeps its edit');
  });

  it('putting back the built-in wording removes the override instead of storing a duplicate', async () => {
    const id = 'auth-password-changed';
    const en = (await owner.get(`/system-emails/${id}?lang=en`)).body.email;
    const changed = await owner.put(`/system-emails/${id}/translations/en`, { subject: 'Changed', html: en.html });
    assert.deepEqual(changed.body.email.customisedLanguages, ['en']);
    const same = await owner.put(`/system-emails/${id}/translations/en`, { subject: en.defaultSubject, html: en.defaultHtml });
    assert.deepEqual(same.body.email.customisedLanguages, []);
    const rows = await query("SELECT count(*) AS n FROM system_email_translations WHERE email_id = $1 AND language = 'en'", [id]);
    assert.equal(rows.rows[0].n, 0);
  });

  it('accepts text in any script and keeps it byte for byte', async () => {
    const id = 'posts-failed';
    const html = '<p>日本語 · العربية · हिन्दी · ไทย · 한국어 · Русский · 😀</p>';
    await owner.put(`/system-emails/${id}/translations/ja`, { subject: '投稿の失敗 ✓', html });
    const back = (await owner.get(`/system-emails/${id}?lang=ja`)).body.email;
    assert.equal(back.subject, '投稿の失敗 ✓');
    assert.equal(back.html, html);
  });

  it('refuses HTML that could run code, and bad subjects', async () => {
    const id = 'posts-failed';
    const put = (subject, html) => owner.put(`/system-emails/${id}/translations/en`, { subject, html });
    assert.equal((await put('ok', '<p>hi</p><script>alert(1)</script>')).status, 400);
    assert.equal((await put('ok', '<img src=x onerror=alert(1)>')).status, 400);
    assert.equal((await put('ok', '<a href="javascript:alert(1)">x</a>')).status, 400);
    assert.equal((await put('two\nlines', '<p>hi</p>')).status, 400);
    assert.equal((await put('   ', '<p>hi</p>')).status, 400);
    assert.equal((await put('ok', '')).status, 400);
    assert.equal((await put('x'.repeat(401), '<p>hi</p>')).status, 400);
  });

  it('turns an email on and off for everyone', async () => {
    const off = await owner.patch('/system-emails/users-invited', { isEnabled: false });
    assert.equal(off.body.email.isEnabled, false);
    await owner.post('/users', { name: 'Quiet Person', email: 'quiet@example.com', role: 'analyst', language: 'en' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await outboxFor('quiet@example.com')).filter((row) => row.event_key === 'users.invited').length, 0, 'nothing is sent while it is off');
    await owner.patch('/system-emails/users-invited', { isEnabled: true });
  });

  it('sends a real email using the edited copy of the recipient\'s language', async () => {
    const subject = 'ARABIC INVITE — {{invited_by}} → {{user_name}}';
    const html = '<p dir="rtl">دعوة من {{invited_by}} إلى {{user_name}}: <a href="{{accept_link}}">قبول</a> {{role}}</p>';
    assert.equal((await owner.put('/system-emails/users-invited/translations/ar', { subject, html })).status, 200);
    await owner.post('/users', { name: 'Amal <b>Ali</b>', email: 'amal@example.com', role: 'editor', language: 'ar' });
    const mail = await waitFor(async () => (await outboxFor('amal@example.com')).find((row) => row.event_key === 'users.invited'));
    assert.equal(mail.language, 'ar');
    assert.equal(mail.subject, 'ARABIC INVITE — Nitesh Owner → Amal <b>Ali</b>', 'a subject is plain text');
    assert.ok(mail.html.includes('Amal &lt;b&gt;Ali&lt;/b&gt;'), 'HTML has user-supplied text escaped');
    assert.ok(mail.html.includes('المحرر') || mail.html.includes('محرر'), 'the role name is in Arabic');
    assert.ok(tokenFromEmail(mail.html, 'accept-invite'));
  });

  it('"Send test" works even when the email is off and goes to the person clicking', async () => {
    await owner.patch('/system-emails/posts-published', { isEnabled: false });
    const sent = await owner.post('/system-emails/posts-published/test', { language: 'de' });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.status, 'logged', 'no SMTP server is configured in tests, so it is recorded instead');
    assert.equal(sent.body.to, 'owner@example.com');
    const mail = (await outboxFor('owner@example.com')).find((row) => row.event_key === 'test:posts.published');
    assert.equal(mail.language, 'de');
    assert.match(mail.subject, /Beitrag/);
    assert.ok(!mail.html.includes('{{'));
  });

  it('records what happened', async () => {
    const log = await owner.get('/activity-logs?limit=200');
    assert.equal(log.status, 200);
    const actions = log.body.activity.map((entry) => entry.action);
    for (const expected of ['workspace.created', 'user.invited', 'settings.languages_updated', 'email.template_saved', 'email.template_reset']) {
      assert.ok(actions.includes(expected), `missing "${expected}"`);
    }
  });
});

describe('email images', () => {
  const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

  async function uploadImage(client, { type = 'image/png', filename = 'logo.png' } = {}) {
    const form = new FormData();
    form.append('file', new Blob([PNG_1X1], { type }), filename);
    form.append('width', '1');
    form.append('height', '1');
    const response = await fetch(`${server.baseUrl}/api/system-emails/users-invited/images`, {
      method: 'POST',
      headers: { authorization: `Bearer ${client.accessToken}` },
      body: form,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  it('needs Super Admin / Admin, and rejects a non-image file', async () => {
    await owner.post('/users', { name: 'Ed Itor', email: 'editor@example.com', role: 'editor', language: 'en' });
    await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = 'editor@example.com'");
    const editor = createClient(server.baseUrl);
    await editor.signIn('editor@example.com');
    const denied = await uploadImage(editor);
    assert.equal(denied.status, 403);

    const notImage = await uploadImage(owner, { type: 'text/plain', filename: 'notes.txt' });
    assert.equal(notImage.status, 400);
  });

  it('uploads through the Media Library, and the image is the same for every language of that email', async () => {
    const uploaded = await uploadImage(owner);
    assert.equal(uploaded.status, 201);
    const image = uploaded.body.image;
    assert.equal(image.width, 1);
    assert.ok(image.url, 'has a real public URL, not a data: URI');

    const inHindi = await owner.get('/system-emails/users-invited?lang=hi');
    const inArabic = await owner.get('/system-emails/users-invited?lang=ar');
    assert.deepEqual(inHindi.body.email.images, inArabic.body.email.images, 'shared across languages');
    assert.ok(inHindi.body.email.images.some((entry) => entry.id === image.id));

    const inLibrary = await owner.get('/media');
    assert.ok(inLibrary.body.items.some((item) => item.id === image.id && item.folder === 'System Emails'));

    const removed = await owner.delete(`/system-emails/users-invited/images/${image.id}`);
    assert.equal(removed.status, 200);
    const after = await owner.get('/system-emails/users-invited');
    assert.equal(after.body.email.images.length, 0);
    assert.equal((await query('SELECT 1 FROM media_items WHERE id = $1', [image.id])).rowCount, 0, 'removed from the Media Library too');
  });

  it('records the upload and the removal', async () => {
    const log = await owner.get('/activity-logs?limit=200');
    const actions = log.body.activity.map((entry) => entry.action);
    assert.ok(actions.includes('email.image_uploaded'));
    assert.ok(actions.includes('email.image_removed'));
  });
});
