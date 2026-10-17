import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { createDb } from './db.js';
import { createApp } from './app.js';

const app = createApp(createDb(':memory:'));

// seeded demo users: 1 = Alice, 2 = Bob, 3 = Carol (all use the password demo1234)
const EMAILS = { 1: 'alice@demo.com', 2: 'bob@demo.com', 3: 'carol@demo.com' };
const tokens = {};
const as = (id) => ({ authorization: `Bearer ${tokens[id]}` });
beforeAll(async () => {
  for (const [id, email] of Object.entries(EMAILS)) {
    const r = await request(app).post('/api/auth/login').send({ email, password: 'demo1234' });
    tokens[id] = r.body.token;
  }
});

describe('accounts', () => {
  const PW = 'Longenough1!';
  const signup = (body) => request(app).post('/api/auth/signup').send({ name: 'Dan', ...body });

  it('signs up without logging in, then logs in', async () => {
    const ok = await signup({ email: 'Dan@X.com', password: PW });
    expect(ok.status).toBe(201);
    expect(ok.body.user.email).toBe('dan@x.com');
    expect(ok.body.token).toBeUndefined(); // signup does not open a session
    expect((await signup({ email: 'dan@x.com', password: PW })).status).toBe(409);
    expect((await request(app).post('/api/auth/login').send({ email: 'dan@x.com', password: 'wrong-password' })).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: 'dan@x.com', password: PW });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set({ authorization: `Bearer ${login.body.token}` });
    expect(me.body.user.name).toBe('Dan');
  });

  it('rejects invalid emails, including common typos', async () => {
    for (const email of ['nope', 'a@b', 'a..b@x.com', '', 'a b@x.com']) {
      expect((await signup({ email, password: PW })).status).toBe(400);
    }
    const typo = await signup({ email: 'eve@gmial.com', password: PW });
    expect(typo.status).toBe(400);
    expect(typo.body.error).toContain('eve@gmail.com');
  });

  it('rejects weak passwords', async () => {
    for (const password of ['Sh0rt!a', 'longenough', 'Longenough1', 'LONGENOUGH1!', 'demo1234']) {
      const r = await signup({ email: 'eve@x.com', password });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/strong password/i);
    }
  });

  it('logging out invalidates the token', async () => {
    const t = (await request(app).post('/api/auth/login').send({ email: 'dan@x.com', password: PW })).body.token;
    const h = { authorization: `Bearer ${t}` };
    expect((await request(app).post('/api/auth/logout').set(h)).status).toBe(200);
    expect((await request(app).get('/api/documents').set(h)).status).toBe(401);
  });
});

describe('continue with Google', () => {
  const CLIENT = 'test-client.apps.googleusercontent.com';
  const claimsFor = {
    good: { aud: CLIENT, email: 'Gina@Gmail.com', email_verified: 'true', name: 'Gina' },
    wrongApp: { aud: 'someone-else', email: 'gina@gmail.com', email_verified: 'true' },
    unverified: { aud: CLIENT, email: 'gina@gmail.com', email_verified: 'false' },
    existing: { aud: CLIENT, email: 'alice@demo.com', email_verified: 'true', name: 'Alice' },
  };
  const verifyGoogle = async (c) => { if (!claimsFor[c]) throw new Error('bad'); return claimsFor[c]; };
  const g = createApp(createDb(':memory:'), { googleClientId: CLIENT, verifyGoogle });
  const post = (a, credential) => request(a).post('/api/auth/google').send({ credential });

  it('creates an account on first use and signs in', async () => {
    const r = await post(g, 'good');
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe('gina@gmail.com');
    const me = await request(g).get('/api/auth/me').set({ authorization: `Bearer ${r.body.token}` });
    expect(me.body.user.name).toBe('Gina');
    const again = await post(g, 'good'); // second time reuses the same account
    expect(again.body.user.id).toBe(r.body.user.id);
  });

  it('signs in an existing account by email', async () => {
    expect((await post(g, 'existing')).body.user.name).toBe('Alice');
  });

  it('rejects bad, foreign or unverified tokens, and is off without a client id', async () => {
    expect((await post(g, 'garbage')).status).toBe(401);
    expect((await post(g, 'wrongApp')).status).toBe(401);
    expect((await post(g, 'unverified')).status).toBe(401);
    expect((await request(g).post('/api/auth/google').send({})).status).toBe(400);
    const off = createApp(createDb(':memory:'), { googleClientId: '', verifyGoogle });
    expect((await post(off, 'good')).status).toBe(503);
    expect((await request(g).get('/api/auth/config')).body.googleClientId).toBe(CLIENT);
  });
});

describe('password reset', () => {
  const demoApp = createApp(createDb(':memory:'), { demoResetLinks: true });
  const quietApp = createApp(createDb(':memory:'), { demoResetLinks: false });
  const tokenOf = (link) => new URL(link.replace('/#', '/')).searchParams.get('token');
  const login = (a, password) => request(a).post('/api/auth/login').send({ email: 'alice@demo.com', password });

  it('answers the same for unknown emails and never leaks a link without demo mode', async () => {
    const unknown = await request(demoApp).post('/api/auth/forgot').send({ email: 'ghost@demo.com' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.resetLink).toBeUndefined();
    const real = await request(quietApp).post('/api/auth/forgot').send({ email: 'alice@demo.com' });
    expect(real.body).toEqual(unknown.body);
    expect((await request(demoApp).post('/api/auth/forgot').send({ email: 'not-an-email' })).status).toBe(400);
  });

  it('resets once, enforces the password rule, and signs out old sessions', async () => {
    const oldSession = (await login(demoApp, 'demo1234')).body.token;
    const link = (await request(demoApp).post('/api/auth/forgot').send({ email: 'alice@demo.com' })).body.resetLink;
    const token = tokenOf(link);
    expect((await request(demoApp).post('/api/auth/reset').send({ token, password: 'weakpass' })).status).toBe(400);
    expect((await request(demoApp).post('/api/auth/reset').send({ token: 'bogus', password: 'Brand-new1' })).status).toBe(400);
    expect((await request(demoApp).post('/api/auth/reset').send({ token, password: 'Brand-new1' })).status).toBe(200);
    expect((await login(demoApp, 'demo1234')).status).toBe(401);
    expect((await login(demoApp, 'Brand-new1')).status).toBe(200);
    expect((await request(demoApp).get('/api/auth/me').set({ authorization: `Bearer ${oldSession}` })).status).toBe(401);
    // a used link does not work twice
    expect((await request(demoApp).post('/api/auth/reset').send({ token, password: 'Another-one2' })).status).toBe(400);
  });

  it('expired links are rejected', async () => {
    const db = createDb(':memory:');
    const a = createApp(db, { demoResetLinks: true });
    const link = (await request(a).post('/api/auth/forgot').send({ email: 'bob@demo.com' })).body.resetLink;
    db.prepare('UPDATE password_resets SET expires_at = ?').run(Date.now() - 1000);
    expect((await request(a).post('/api/auth/reset').send({ token: tokenOf(link), password: 'Brand-new1' })).status).toBe(400);
  });

  it('keeps the client and server validation rules identical', () => {
    const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    expect(read('../client/src/validation.js')).toBe(read('./validation.js'));
  });
});

describe('sharing and access', () => {
  let docId;

  it('rejects requests without a user', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
  });

  it('owner can create; other users cannot see it', async () => {
    docId = (await request(app).post('/api/documents').set(as(1)).send({})).body.id;
    expect((await request(app).get(`/api/documents/${docId}`).set(as(2))).status).toBe(404);
  });

  it('viewer can read but not edit; editor can edit', async () => {
    await request(app).post(`/api/documents/${docId}/share`).set(as(1)).send({ email: 'bob@demo.com', role: 'viewer' });
    expect((await request(app).get(`/api/documents/${docId}`).set(as(2))).body.role).toBe('viewer');
    expect((await request(app).patch(`/api/documents/${docId}`).set(as(2)).send({ title: 'x' })).status).toBe(403);
    await request(app).post(`/api/documents/${docId}/share`).set(as(1)).send({ email: 'bob@demo.com', role: 'editor' });
    expect((await request(app).patch(`/api/documents/${docId}`).set(as(2)).send({ title: 'x' })).status).toBe(200);
  });

  it('only the owner can share; scripts are stripped from content', async () => {
    expect((await request(app).post(`/api/documents/${docId}/share`).set(as(2)).send({ email: 'carol@demo.com' })).status).toBe(403);
    await request(app).patch(`/api/documents/${docId}`).set(as(1))
      .send({ content: '<p>hi</p><script>alert(1)</script>' });
    expect((await request(app).get(`/api/documents/${docId}`).set(as(1))).body.content).toBe('<p>hi</p>');
  });

  it('lists owned and shared documents separately', async () => {
    const list = (await request(app).get('/api/documents').set(as(2))).body;
    expect(list.owned.some((d) => d.id === docId)).toBe(false);
    expect(list.shared.some((d) => d.id === docId && d.role === 'editor')).toBe(true);
  });
});

describe('file import', () => {
  it('turns a .txt upload into a new editable document', async () => {
    const res = await request(app).post('/api/documents/import').set(as(1))
      .attach('file', Buffer.from('hello\n\nworld'), 'note.txt');
    expect(res.status).toBe(201);
    const doc = (await request(app).get(`/api/documents/${res.body.id}`).set(as(1))).body;
    expect(doc.title).toBe('note');
    expect(doc.content).toBe('<p>hello</p><p>world</p>');
  });

  it('rejects unsupported file types', async () => {
    const res = await request(app).post('/api/documents/import').set(as(1))
      .attach('file', Buffer.from('%PDF-1.4'), 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported/);
  });
});

describe('trash', () => {
  let id;

  it('moving to trash hides the document from the owner list and from shared users', async () => {
    id = (await request(app).post('/api/documents').set(as(1)).send({ title: 'Temp' })).body.id;
    await request(app).post(`/api/documents/${id}/share`).set(as(1)).send({ email: 'carol@demo.com', role: 'viewer' });
    expect((await request(app).delete(`/api/documents/${id}`).set(as(3))).status).toBe(403);
    expect((await request(app).delete(`/api/documents/${id}`).set(as(1))).status).toBe(200);

    const mine = (await request(app).get('/api/documents').set(as(1))).body;
    expect(mine.owned.some((d) => d.id === id)).toBe(false);
    expect(mine.trash.some((d) => d.id === id)).toBe(true);

    expect((await request(app).get(`/api/documents/${id}`).set(as(3))).status).toBe(404);
    const carol = (await request(app).get('/api/documents').set(as(3))).body;
    expect(carol.shared.some((d) => d.id === id)).toBe(false);
  });

  it('restoring brings the document back with its sharing intact', async () => {
    expect((await request(app).post(`/api/documents/${id}/restore`).set(as(3))).status).toBe(403);
    expect((await request(app).post(`/api/documents/${id}/restore`).set(as(1))).status).toBe(200);
    expect((await request(app).get(`/api/documents/${id}`).set(as(3))).body.role).toBe('viewer');
    const mine = (await request(app).get('/api/documents').set(as(1))).body;
    expect(mine.owned.some((d) => d.id === id)).toBe(true);
  });

  it('delete forever only works from the trash and only for the owner', async () => {
    expect((await request(app).delete(`/api/documents/${id}/permanent`).set(as(1))).status).toBe(400);
    await request(app).delete(`/api/documents/${id}`).set(as(1));
    expect((await request(app).delete(`/api/documents/${id}/permanent`).set(as(3))).status).toBe(403);
    expect((await request(app).delete(`/api/documents/${id}/permanent`).set(as(1))).status).toBe(200);
    const mine = (await request(app).get('/api/documents').set(as(1))).body;
    expect(mine.trash.some((d) => d.id === id)).toBe(false);
  });
});

describe('categories', () => {
  let catId;
  let docId;

  it('creates categories, rejects duplicates, and assigns them to own documents', async () => {
    const c = await request(app).post('/api/categories').set(as(1)).send({ name: 'Research' });
    expect(c.status).toBe(201);
    catId = c.body.id;
    expect((await request(app).post('/api/categories').set(as(1)).send({ name: 'research' })).status).toBe(409);
    expect((await request(app).post('/api/categories').set(as(1)).send({ name: '  ' })).status).toBe(400);

    docId = (await request(app).post('/api/documents').set(as(1)).send({ category_id: catId })).body.id;
    const list = (await request(app).get('/api/documents').set(as(1))).body;
    expect(list.owned.find((d) => d.id === docId).category_id).toBe(catId);
    expect(list.categories.some((x) => x.id === catId)).toBe(true);
  });

  it('only the owner can categorize, and only with their own categories', async () => {
    const other = (await request(app).post('/api/categories').set(as(2)).send({ name: 'Bobs' })).body.id;
    expect((await request(app).patch(`/api/documents/${docId}`).set(as(1)).send({ category_id: other })).status).toBe(400);
    await request(app).post(`/api/documents/${docId}/share`).set(as(1)).send({ email: 'bob@demo.com', role: 'editor' });
    expect((await request(app).patch(`/api/documents/${docId}`).set(as(2)).send({ category_id: null })).status).toBe(403);
  });

  it('deleting a category keeps its documents', async () => {
    expect((await request(app).delete(`/api/categories/${catId}`).set(as(2))).status).toBe(404);
    expect((await request(app).delete(`/api/categories/${catId}`).set(as(1))).status).toBe(200);
    const list = (await request(app).get('/api/documents').set(as(1))).body;
    expect(list.owned.find((d) => d.id === docId).category_id).toBeNull();
  });
});

describe('teams', () => {
  let teamId;
  let docId;

  it('creates a team, invites a person, and the invite shows up for them', async () => {
    const t = await request(app).post('/api/teams').set(as(2)).send({ name: 'Design Crew' });
    expect(t.status).toBe(201);
    teamId = t.body.id;
    expect((await request(app).post('/api/teams').set(as(2)).send({ name: ' ' })).status).toBe(400);
    expect((await request(app).post(`/api/teams/${teamId}/invite`).set(as(3)).send({ email: 'x@y.com' })).status).toBe(404);
    expect((await request(app).post(`/api/teams/${teamId}/invite`).set(as(2)).send({ email: 'bad' })).status).toBe(400);
    expect((await request(app).post(`/api/teams/${teamId}/invite`).set(as(2)).send({ email: 'carol@demo.com' })).status).toBe(201);
    expect((await request(app).post(`/api/teams/${teamId}/invite`).set(as(2)).send({ email: 'carol@demo.com' })).status).toBe(409);
    const inv = (await request(app).get('/api/documents').set(as(3))).body.invites;
    expect(inv.some((i) => i.team_name === 'Design Crew')).toBe(true);
  });

  it('team documents are visible only after the invite is accepted', async () => {
    docId = (await request(app).post('/api/documents').set(as(2)).send({ title: 'Brand ideas', team_id: teamId })).body.id;
    expect((await request(app).get(`/api/documents/${docId}`).set(as(3))).status).toBe(404);
    const inv = (await request(app).get('/api/documents').set(as(3))).body.invites.find((i) => i.team_name === 'Design Crew');
    expect((await request(app).post(`/api/invites/${inv.id}/accept`).set(as(1))).status).toBe(404);
    expect((await request(app).post(`/api/invites/${inv.id}/accept`).set(as(3))).status).toBe(200);
    const doc = (await request(app).get(`/api/documents/${docId}`).set(as(3))).body;
    expect(doc.role).toBe('editor');
    expect(doc.team.name).toBe('Design Crew');
    const list = (await request(app).get('/api/documents').set(as(3))).body;
    expect(list.shared.find((d) => d.id === docId).team_name).toBe('Design Crew');
    expect(list.teams.some((x) => x.id === teamId)).toBe(true);
  });

  it('team role can be viewer, and non-members of the team still have no access', async () => {
    expect((await request(app).put(`/api/documents/${docId}/team`).set(as(3)).send({ team_id: teamId })).status).toBe(403);
    expect((await request(app).put(`/api/documents/${docId}/team`).set(as(2)).send({ team_id: teamId, role: 'viewer' })).status).toBe(200);
    expect((await request(app).patch(`/api/documents/${docId}`).set(as(3)).send({ title: 'nope' })).status).toBe(403);
    expect((await request(app).get(`/api/documents/${docId}`).set(as(1))).status).toBe(404);
    // someone without access to the document cannot change its team
    expect((await request(app).put(`/api/documents/${docId}/team`).set(as(1)).send({ team_id: teamId })).status).toBe(404);
    // the owner cannot share with a team they do not belong to
    const other = (await request(app).post('/api/teams').set(as(1)).send({ name: 'Alice only' })).body.id;
    expect((await request(app).put(`/api/documents/${docId}/team`).set(as(2)).send({ team_id: other })).status).toBe(400);
  });

  it('removing a member revokes access, and members can leave', async () => {
    expect((await request(app).delete(`/api/teams/${teamId}/members/3`).set(as(3))).status).toBe(200);
    expect((await request(app).get(`/api/documents/${docId}`).set(as(3))).status).toBe(404);
    expect((await request(app).delete(`/api/teams/${teamId}/members/2`).set(as(2))).status).toBe(400);
  });

  it('deleting a team keeps the documents with their owner', async () => {
    expect((await request(app).delete(`/api/teams/${teamId}`).set(as(3))).status).toBe(404);
    expect((await request(app).delete(`/api/teams/${teamId}`).set(as(2))).status).toBe(200);
    const doc = (await request(app).get(`/api/documents/${docId}`).set(as(2))).body;
    expect(doc.team).toBeNull();
  });
});

describe('rich content, images and copies', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

  it('stores an image, serves it without a login header, and rejects non-images', async () => {
    expect((await request(app).post('/api/images').attach('image', png, 'a.png')).status).toBe(401);
    const up = await request(app).post('/api/images').set(as(1)).attach('image', png, 'a.png');
    expect(up.status).toBe(201);
    const got = await request(app).get(up.body.url);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    const fake = await request(app).post('/api/images').set(as(1)).attach('image', Buffer.from('<script>alert(1)</script>'), 'x.png');
    expect(fake.status).toBe(400);
    expect((await request(app).get('/api/images/doesnotexist')).status).toBe(404);
  });

  it('keeps editor formatting but strips anything unsafe', async () => {
    const id = (await request(app).post('/api/documents').set(as(1)).send({})).body.id;
    const html = '<p style="text-align: center; color: #B04A36; position: fixed">x</p>'
      + '<span style="font-size: 18px">big</span><mark data-color="#FFF3B0" style="background-color: #FFF3B0; color: inherit">m</mark>'
      + '<img src="/api/images/abc123" alt="ok"><img src="javascript:alert(1)"><img src="http://evil.test/x.png">'
      + '<a href="javascript:alert(1)">bad</a><a href="https://ok.test">good</a>'
      + '<table><tbody><tr><th colspan="1"><p>h</p></th></tr></tbody></table>'
      + '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>t</p></div></li></ul>'
      + '<p onclick="alert(1)">c</p>';
    await request(app).patch(`/api/documents/${id}`).set(as(1)).send({ content: html });
    const out = (await request(app).get(`/api/documents/${id}`).set(as(1))).body.content.replace(/(text-align|color|font-size):\s*/g, '$1: ');
    for (const keep of ['text-align: center', 'color: #B04A36', 'font-size: 18px', 'data-color', 'src="/api/images/abc123"',
      'href="https://ok.test"', 'rel="noopener noreferrer"', '<table>', 'data-type="taskList"', 'type="checkbox"']) {
      expect(out).toContain(keep);
    }
    for (const drop of ['position', 'javascript:', 'evil.test', 'onclick']) expect(out).not.toContain(drop);
  });

  it('"save a copy" works for anyone who can read the document', async () => {
    const id = (await request(app).post('/api/documents').set(as(1)).send({ title: 'Plan' })).body.id;
    await request(app).patch(`/api/documents/${id}`).set(as(1)).send({ content: '<p>keep me</p>' });
    expect((await request(app).post(`/api/documents/${id}/copy`).set(as(2))).status).toBe(404);
    await request(app).post(`/api/documents/${id}/share`).set(as(1)).send({ email: 'bob@demo.com', role: 'viewer' });
    const copy = await request(app).post(`/api/documents/${id}/copy`).set(as(2));
    expect(copy.status).toBe(201);
    expect(copy.body.title).toBe('Copy of Plan');
    const mine = (await request(app).get(`/api/documents/${copy.body.id}`).set(as(2))).body;
    expect(mine.role).toBe('owner');
    expect(mine.content).toBe('<p>keep me</p>');
  });
});
