import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import crypto from 'crypto';
import path from 'path';
import { hashPassword, verifyPassword } from './db.js';
import { checkEmail, checkPassword } from './validation.js';

const ALLOWED = ['.txt', '.md', '.docx'];
const SESSION_DAYS = 30;
const RESET_MINUTES = 60;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Everything the editor can produce is allowed; everything else (scripts, event handlers, odd styles) is stripped.
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/i, /^inherit$/];
const SIZE = [/^\d+(\.\d+)?(px|pt|em|rem)$/];
const clean = (html) => sanitizeHtml(html, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'u', 's', 'sub', 'sup', 'mark', 'span', 'img', 'h1', 'h2', 'div', 'label', 'input',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  ]),
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    input: ['type', 'checked'],
    ul: ['data-type'], li: ['data-type', 'data-checked'],
    mark: ['data-color', 'style'],
    td: ['colspan', 'rowspan', 'data-colwidth', 'style'], th: ['colspan', 'rowspan', 'data-colwidth', 'style'],
    col: ['style'],
    '*': ['style'],
  },
  allowedStyles: {
    '*': {
      color: COLOR, 'background-color': COLOR,
      'text-align': [/^(left|right|center|justify)$/],
      'font-family': [/^[\w\s,'"-]+$/], 'font-size': SIZE,
      width: SIZE, 'min-width': SIZE,
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
  },
  exclusiveFilter: (f) =>
    (f.tag === 'input' && f.attribs.type !== 'checkbox')
    || (f.tag === 'img' && !/^(\/api\/images\/[\w-]+|https:\/\/)/.test(f.attribs.src || '')),
});

// recognise an image by its first bytes rather than trusting the file name or the browser's mime type
const sniffImage = (b) => {
  if (b.length > 12 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'image/gif';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const isConstraint = (e) => typeof e?.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT');
const snippet = (html) =>
  String(html || '').replace(/<\/(p|h[1-6]|li)>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim().slice(0, 180);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

// options.demoResetLinks: no email service is configured, so when true the forgot-password
// response carries the reset link for accounts that exist. Never enable this where real
// users sign up: anyone who knows an email address could take over the account.
export function createApp(db, options = {}) {
  const googleClientId = options.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? '';
  // verifies a Google ID token with Google and returns its claims; replaceable in tests
  const verifyGoogle = options.verifyGoogle ?? (async (credential) => {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) throw new Error('rejected by Google');
    return r.json();
  });
  const demoResetLinks = options.demoResetLinks ?? process.env.DEMO_RESET_LINKS === '1';
  const app = express();
  app.set('trust proxy', 1); // behind Render's proxy, so req.protocol is https
  app.use(express.json({ limit: '2mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

  // ---------- auth: email + password, opaque session tokens ----------
  const newSession = (userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
    return token;
  };

  app.post('/api/auth/signup', (req, res) => {
    const { name, email, password } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanName || cleanName.length > 60) return res.status(400).json({ error: 'Enter your name (up to 60 characters)' });
    const emailError = checkEmail(cleanEmail);
    if (emailError) return res.status(400).json({ error: emailError });
    const passwordError = checkPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    try {
      const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
        .run(cleanEmail, cleanName, hashPassword(password));
      // no session here: the person confirms the new account by logging in
      res.status(201).json({ user: { id: Number(r.lastInsertRowid), name: cleanName, email: cleanEmail } });
    } catch (e) {
      if (isConstraint(e)) return res.status(409).json({ error: 'An account with that email already exists' });
      throw e;
    }
  });

  // simple in-memory throttle: 10 failed logins per email per 15 minutes
  const failures = new Map();
  app.post('/api/auth/login', (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    const now = Date.now();
    const recent = (failures.get(email) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (recent.length >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      failures.set(email, [...recent, now]);
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    failures.delete(email);
    res.json({ token: newSession(user.id), user: publicUser(user) });
  });

  // images are served without a login header (an <img> tag cannot send one); the id is 128 random bits
  app.get('/api/images/:id', (req, res) => {
    const img = db.prepare('SELECT mime, data FROM images WHERE id = ?').get(req.params.id);
    if (!img) return res.status(404).json({ error: 'Image not found' });
    res.set({ 'Content-Type': img.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' });
    res.send(img.data);
  });

  // ---------- continue with Google ----------
  app.get('/api/auth/config', (_req, res) => res.json({ googleClientId }));

  app.post('/api/auth/google', async (req, res) => {
    if (!googleClientId) return res.status(503).json({ error: 'Google sign-in is not set up on this server yet' });
    const credential = (req.body || {}).credential;
    if (typeof credential !== 'string' || !credential) return res.status(400).json({ error: 'Missing Google credential' });
    let claims;
    try { claims = await verifyGoogle(credential); } catch { claims = null; }
    const email = String(claims?.email || '').toLowerCase();
    // the token must be issued for this app, and Google must have verified the address
    if (!claims || claims.aud !== googleClientId || !(claims.email_verified === true || claims.email_verified === 'true') || !email) {
      return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
    }
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const name = String(claims.name || email.split('@')[0]).trim().slice(0, 60);
      const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, NULL)').run(email, name);
      user = { id: Number(r.lastInsertRowid), email, name };
    }
    res.json({ token: newSession(user.id), user: publicUser(user) });
  });

  // ---------- password reset ----------
  // The reply to "forgot" is identical whether or not the account exists. Only a hash of the
  // token is stored, it works once, and it expires after an hour.
  const forgotLog = new Map();
  app.post('/api/auth/forgot', (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const emailError = checkEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });
    const now = Date.now();
    const recent = (forgotLog.get(email) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (recent.length >= 5) return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });
    forgotLog.set(email, [...recent, now]);

    const body = { ok: true, message: 'If an account exists for that email, a reset link has been prepared.' };
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
      db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .run(sha256(token), user.id, now + RESET_MINUTES * 60 * 1000);
      const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const link = `${base}/#/reset?token=${token}`;
      if (demoResetLinks) body.resetLink = link;
      else console.log(`[password reset] ${email}: ${link}`);
    }
    res.json(body);
  });

  app.post('/api/auth/reset', (req, res) => {
    const { token, password } = req.body || {};
    const passwordError = checkPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const row = typeof token === 'string' && db.prepare(
      'SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?').get(sha256(token), Date.now());
    if (!row) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(row.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // sign out every device
    res.json({ ok: true });
  });

  app.use('/api', (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.header('authorization') || '');
    const row = m && db.prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.created_at > datetime('now', ?)`).get(m[1], `-${SESSION_DAYS} days`);
    if (!row) return res.status(401).json({ error: 'Please sign in' });
    req.user = row;
    req.token = m[1];
    next();
  });

  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    res.json({ ok: true });
  });

  const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
  app.post('/api/images', uploadImage.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const mime = sniffImage(req.file.buffer);
    if (!mime) return res.status(400).json({ error: 'Unsupported image. Use PNG, JPG, GIF or WebP.' });
    const id = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO images (id, owner_id, mime, data) VALUES (?, ?, ?, ?)')
      .run(id, req.user.id, mime, req.file.buffer);
    res.status(201).json({ url: `/api/images/${id}` });
  });

  // ---------- access rules ----------
  const membership = (teamId, userId) =>
    teamId ? db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId) : null;

  // role is 'owner' | 'editor' | 'viewer' | null. The strongest of direct share and team share wins.
  function access(docId, userId) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return { doc: null, role: null };
    if (doc.owner_id === userId) return { doc, role: 'owner' };
    const direct = db.prepare('SELECT role FROM shares WHERE doc_id = ? AND user_id = ?').get(docId, userId);
    const viaTeam = doc.team_role && membership(doc.team_id, userId) ? doc.team_role : null;
    const roles = [direct?.role, viaTeam];
    return { doc, role: roles.includes('editor') ? 'editor' : roles.includes('viewer') ? 'viewer' : null };
  }

  // 404 (not 403) when there is no access, so a document's existence does not leak.
  // Trashed documents behave as missing unless allowTrashed is set (restore / delete forever).
  const load = (req, res, need = 'read', allowTrashed = false) => {
    const { doc, role } = access(Number(req.params.id), req.user.id);
    if (!doc || !role || (doc.deleted_at && !allowTrashed)) {
      res.status(404).json({ error: 'Document not found' }); return null;
    }
    if (need === 'write' && role === 'viewer') {
      res.status(403).json({ error: 'You have view-only access' }); return null;
    }
    if (need === 'owner' && role !== 'owner') {
      res.status(403).json({ error: 'Only the owner can do this' }); return null;
    }
    return { doc, role };
  };

  const ownCategory = (id, userId) =>
    db.prepare('SELECT id FROM categories WHERE id = ? AND owner_id = ?').get(Number(id), userId);

  // ---------- documents ----------
  app.get('/api/documents', (req, res) => {
    const uid = req.user.id;
    const withSnippet = ({ preview, ...d }) => ({ ...d, snippet: snippet(preview) });
    const owned = db.prepare(
      `SELECT d.id, d.title, d.updated_at, d.category_id, d.team_id, d.team_role, t.name AS team_name,
              'owner' AS role, u.name AS owner_name, substr(d.content, 1, 1500) AS preview,
              (SELECT COUNT(*) FROM shares s WHERE s.doc_id = d.id) AS share_count
       FROM documents d JOIN users u ON u.id = d.owner_id LEFT JOIN teams t ON t.id = d.team_id
       WHERE d.owner_id = @uid AND d.deleted_at IS NULL
       ORDER BY d.updated_at DESC, d.id DESC`).all({ uid }).map(withSnippet);
    const shared = db.prepare(
      `SELECT d.id, d.title, d.updated_at, u.name AS owner_name, substr(d.content, 1, 1500) AS preview,
              CASE WHEN s.role = 'editor' OR (tm.user_id IS NOT NULL AND d.team_role = 'editor')
                   THEN 'editor' ELSE 'viewer' END AS role,
              CASE WHEN tm.user_id IS NOT NULL AND d.team_role IS NOT NULL THEN d.team_id END AS team_id,
              CASE WHEN tm.user_id IS NOT NULL AND d.team_role IS NOT NULL THEN t.name END AS team_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       LEFT JOIN shares s ON s.doc_id = d.id AND s.user_id = @uid
       LEFT JOIN team_members tm ON tm.team_id = d.team_id AND tm.user_id = @uid
       LEFT JOIN teams t ON t.id = d.team_id
       WHERE d.owner_id != @uid AND d.deleted_at IS NULL
         AND (s.user_id IS NOT NULL OR (tm.user_id IS NOT NULL AND d.team_role IS NOT NULL))
       ORDER BY d.updated_at DESC, d.id DESC`).all({ uid }).map(withSnippet);
    const trash = db.prepare(
      `SELECT id, title, deleted_at FROM documents
       WHERE owner_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC`).all(uid);
    const categories = db.prepare(
      'SELECT id, name FROM categories WHERE owner_id = ? ORDER BY name COLLATE NOCASE').all(uid);
    const teams = db.prepare(
      `SELECT t.id, t.name, tm.role,
              (SELECT COUNT(*) FROM team_members x WHERE x.team_id = t.id) AS member_count
       FROM teams t JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = ? ORDER BY t.name COLLATE NOCASE`).all(uid);
    const invites = db.prepare(
      `SELECT i.id, t.name AS team_name, u.name AS invited_by
       FROM team_invites i JOIN teams t ON t.id = i.team_id JOIN users u ON u.id = i.invited_by
       WHERE i.email = ? ORDER BY i.id DESC`).all(req.user.email);
    res.json({ owned, shared, trash, categories, teams, invites });
  });

  app.post('/api/documents', (req, res) => {
    const body = req.body || {};
    const title = (body.title || 'Untitled document').toString().slice(0, 200);
    let categoryId = null;
    if (body.category_id !== undefined && body.category_id !== null) {
      const cat = ownCategory(body.category_id, req.user.id);
      if (!cat) return res.status(400).json({ error: 'Unknown category' });
      categoryId = cat.id;
    }
    let teamId = null;
    let teamRole = null;
    if (body.team_id !== undefined && body.team_id !== null) {
      if (!membership(Number(body.team_id), req.user.id)) {
        return res.status(400).json({ error: 'You are not a member of that team' });
      }
      teamId = Number(body.team_id);
      teamRole = 'editor';
    }
    const r = db.prepare(
      'INSERT INTO documents (owner_id, title, category_id, team_id, team_role) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, title, categoryId, teamId, teamRole);
    res.status(201).json({ id: r.lastInsertRowid });
  });

  // upload: .txt / .md / .docx becomes a new editable document
  app.post('/api/documents/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file provided' });
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!ALLOWED.includes(ext)) {
        return res.status(400).json({ error: `Unsupported file type. Use ${ALLOWED.join(', ')}` });
      }
      let html;
      if (ext === '.docx') html = (await mammoth.convertToHtml({ buffer: req.file.buffer })).value;
      else if (ext === '.md') html = marked.parse(req.file.buffer.toString('utf8'));
      else html = req.file.buffer.toString('utf8').split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');
      const title = path.basename(req.file.originalname, ext).slice(0, 200) || 'Imported document';
      const r = db.prepare('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)')
        .run(req.user.id, title, clean(html));
      res.status(201).json({ id: r.lastInsertRowid });
    } catch {
      res.status(422).json({ error: 'Could not read that file' });
    }
  });

  app.get('/api/documents/:id', (req, res) => {
    const a = load(req, res); if (!a) return;
    const shares = a.role === 'owner'
      ? db.prepare(`SELECT u.id, u.name, u.email, s.role FROM shares s
                    JOIN users u ON u.id = s.user_id WHERE s.doc_id = ?`).all(a.doc.id)
      : [];
    const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(a.doc.owner_id);
    const team = a.doc.team_id && (a.role === 'owner' || membership(a.doc.team_id, req.user.id))
      ? { id: a.doc.team_id, role: a.doc.team_role,
          name: db.prepare('SELECT name FROM teams WHERE id = ?').get(a.doc.team_id)?.name }
      : null;
    res.json({ ...a.doc, role: a.role, shares, owner_name: owner.name, team: a.doc.team_role ? team : null });
  });

  app.patch('/api/documents/:id', (req, res) => {
    const a = load(req, res, 'write'); if (!a) return;
    const { title, content, category_id: categoryId } = req.body || {};
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }
    if (content !== undefined && typeof content !== 'string') {
      return res.status(400).json({ error: 'Invalid content' });
    }
    if (categoryId !== undefined) {
      if (a.role !== 'owner') return res.status(403).json({ error: 'Only the owner can change the category' });
      if (categoryId !== null && !ownCategory(categoryId, req.user.id)) {
        return res.status(400).json({ error: 'Unknown category' });
      }
    }
    if (title !== undefined || content !== undefined) {
      db.prepare(`UPDATE documents SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(title !== undefined ? title.trim().slice(0, 200) : a.doc.title,
             content !== undefined ? clean(content) : a.doc.content, a.doc.id);
    }
    if (categoryId !== undefined) {
      db.prepare('UPDATE documents SET category_id = ? WHERE id = ?')
        .run(categoryId === null ? null : Number(categoryId), a.doc.id);
    }
    res.json({ ok: true });
  });

  // "Save a copy": anyone who can read a document can make their own copy of it
  app.post('/api/documents/:id/copy', (req, res) => {
    const a = load(req, res); if (!a) return;
    const title = `Copy of ${a.doc.title}`.slice(0, 200);
    const r = db.prepare('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)')
      .run(req.user.id, title, a.doc.content);
    res.status(201).json({ id: r.lastInsertRowid, title });
  });

  // "delete" moves the document to the trash (owner only); it can be restored
  app.delete('/api/documents/:id', (req, res) => {
    const a = load(req, res, 'owner'); if (!a) return;
    db.prepare(`UPDATE documents SET deleted_at = datetime('now') WHERE id = ?`).run(a.doc.id);
    res.json({ ok: true });
  });

  app.post('/api/documents/:id/restore', (req, res) => {
    const a = load(req, res, 'owner', true); if (!a) return;
    db.prepare('UPDATE documents SET deleted_at = NULL WHERE id = ?').run(a.doc.id);
    res.json({ ok: true });
  });

  // permanent deletion is only allowed for documents already in the trash
  app.delete('/api/documents/:id/permanent', (req, res) => {
    const a = load(req, res, 'owner', true); if (!a) return;
    if (!a.doc.deleted_at) return res.status(400).json({ error: 'Move the document to the trash first' });
    db.prepare('DELETE FROM documents WHERE id = ?').run(a.doc.id);
    res.json({ ok: true });
  });

  app.delete('/api/trash', (req, res) => {
    const r = db.prepare('DELETE FROM documents WHERE owner_id = ? AND deleted_at IS NOT NULL').run(req.user.id);
    res.json({ ok: true, removed: r.changes });
  });

  // ---------- sharing with a person ----------
  app.post('/api/documents/:id/share', (req, res) => {
    const a = load(req, res, 'owner'); if (!a) return;
    const { email, role = 'editor' } = req.body || {};
    if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const target = db.prepare('SELECT * FROM users WHERE email = ?')
      .get(String(email || '').toLowerCase().trim());
    if (!target) return res.status(404).json({ error: 'No user with that email' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'You already own this document' });
    db.prepare(`INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?)
                ON CONFLICT(doc_id, user_id) DO UPDATE SET role = excluded.role`)
      .run(a.doc.id, target.id, role);
    res.json({ ok: true });
  });

  app.delete('/api/documents/:id/share/:userId', (req, res) => {
    const a = load(req, res, 'owner'); if (!a) return;
    db.prepare('DELETE FROM shares WHERE doc_id = ? AND user_id = ?')
      .run(a.doc.id, Number(req.params.userId));
    res.json({ ok: true });
  });

  // ---------- sharing with a team (owner must be a member of the team) ----------
  app.put('/api/documents/:id/team', (req, res) => {
    const a = load(req, res, 'owner'); if (!a) return;
    const { team_id: teamId = null, role = 'editor' } = req.body || {};
    if (teamId === null) {
      db.prepare('UPDATE documents SET team_id = NULL, team_role = NULL WHERE id = ?').run(a.doc.id);
      return res.json({ ok: true });
    }
    if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (!membership(Number(teamId), req.user.id)) {
      return res.status(400).json({ error: 'You are not a member of that team' });
    }
    db.prepare('UPDATE documents SET team_id = ?, team_role = ? WHERE id = ?')
      .run(Number(teamId), role, a.doc.id);
    res.json({ ok: true });
  });

  // ---------- teams ----------
  const loadTeam = (req, res, ownerOnly = false) => {
    const id = Number(req.params.id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    const me = team && membership(id, req.user.id);
    if (!team || !me) { res.status(404).json({ error: 'Team not found' }); return null; }
    if (ownerOnly && me.role !== 'owner') {
      res.status(403).json({ error: 'Only the team owner can do this' }); return null;
    }
    return { team, role: me.role };
  };

  app.post('/api/teams', (req, res) => {
    const name = String((req.body || {}).name || '').trim();
    if (!name || name.length > 50) return res.status(400).json({ error: 'Team name must be 1 to 50 characters' });
    const r = db.prepare('INSERT INTO teams (name, owner_id) VALUES (?, ?)').run(name, req.user.id);
    db.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')")
      .run(r.lastInsertRowid, req.user.id);
    res.status(201).json({ id: r.lastInsertRowid, name });
  });

  app.get('/api/teams/:id', (req, res) => {
    const t = loadTeam(req, res); if (!t) return;
    const members = db.prepare(
      `SELECT u.id, u.name, u.email, tm.role FROM team_members tm JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ? ORDER BY (tm.role = 'owner') DESC, u.name COLLATE NOCASE`).all(t.team.id);
    const invites = t.role === 'owner'
      ? db.prepare('SELECT id, email FROM team_invites WHERE team_id = ? ORDER BY id').all(t.team.id)
      : [];
    res.json({ id: t.team.id, name: t.team.name, role: t.role, members, invites });
  });

  app.post('/api/teams/:id/invite', (req, res) => {
    const t = loadTeam(req, res, true); if (!t) return;
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const inviteError = checkEmail(email);
    if (inviteError) return res.status(400).json({ error: inviteError });
    const existing = db.prepare(
      `SELECT 1 FROM team_members tm JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ? AND u.email = ?`).get(t.team.id, email);
    if (existing) return res.status(409).json({ error: 'That person is already in the team' });
    try {
      db.prepare('INSERT INTO team_invites (team_id, email, invited_by) VALUES (?, ?, ?)')
        .run(t.team.id, email, req.user.id);
    } catch (e) {
      if (isConstraint(e)) return res.status(409).json({ error: 'That person has already been invited' });
      throw e;
    }
    const registered = !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    res.status(201).json({ ok: true, registered });
  });

  app.delete('/api/teams/:id/invites/:inviteId', (req, res) => {
    const t = loadTeam(req, res, true); if (!t) return;
    db.prepare('DELETE FROM team_invites WHERE id = ? AND team_id = ?')
      .run(Number(req.params.inviteId), t.team.id);
    res.json({ ok: true });
  });

  const myInvite = (req) =>
    db.prepare('SELECT * FROM team_invites WHERE id = ? AND email = ?').get(Number(req.params.id), req.user.email);

  app.post('/api/invites/:id/accept', (req, res) => {
    const inv = myInvite(req);
    if (!inv) return res.status(404).json({ error: 'Invitation not found' });
    db.prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')")
      .run(inv.team_id, req.user.id);
    db.prepare('DELETE FROM team_invites WHERE id = ?').run(inv.id);
    res.json({ ok: true, team_id: inv.team_id });
  });

  app.post('/api/invites/:id/decline', (req, res) => {
    const inv = myInvite(req);
    if (!inv) return res.status(404).json({ error: 'Invitation not found' });
    db.prepare('DELETE FROM team_invites WHERE id = ?').run(inv.id);
    res.json({ ok: true });
  });

  // the owner removes a member, or a member removes themselves (leaves)
  app.delete('/api/teams/:id/members/:userId', (req, res) => {
    const t = loadTeam(req, res); if (!t) return;
    const target = Number(req.params.userId);
    if (target !== req.user.id && t.role !== 'owner') {
      return res.status(403).json({ error: 'Only the team owner can remove other members' });
    }
    if (target === t.team.owner_id) {
      return res.status(400).json({ error: 'The owner cannot leave. Delete the team instead.' });
    }
    db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(t.team.id, target);
    // documents the leaver shared with the team are no longer team documents
    db.prepare('UPDATE documents SET team_id = NULL, team_role = NULL WHERE team_id = ? AND owner_id = ?')
      .run(t.team.id, target);
    res.json({ ok: true });
  });

  app.delete('/api/teams/:id', (req, res) => {
    const t = loadTeam(req, res, true); if (!t) return;
    db.prepare('UPDATE documents SET team_id = NULL, team_role = NULL WHERE team_id = ?').run(t.team.id);
    db.prepare('DELETE FROM teams WHERE id = ?').run(t.team.id);
    res.json({ ok: true });
  });

  // ---------- categories ----------
  app.post('/api/categories', (req, res) => {
    const name = String((req.body || {}).name || '').trim();
    if (!name || name.length > 40) {
      return res.status(400).json({ error: 'Category name must be 1 to 40 characters' });
    }
    try {
      const r = db.prepare('INSERT INTO categories (owner_id, name) VALUES (?, ?)').run(req.user.id, name);
      res.status(201).json({ id: r.lastInsertRowid, name });
    } catch (e) {
      if (isConstraint(e)) return res.status(409).json({ error: 'You already have a category with that name' });
      throw e;
    }
  });

  // deleting a category keeps its documents; they become uncategorized
  app.delete('/api/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!ownCategory(id, req.user.id)) return res.status(404).json({ error: 'Category not found' });
    db.prepare('UPDATE documents SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // unknown API routes and errors always answer with JSON
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (documents up to 2 MB, images up to 4 MB)' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Document is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });

  return app;
}
