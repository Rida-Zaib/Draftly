import Database from 'better-sqlite3';
import crypto from 'crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function ensureColumn(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export const DEMO_PASSWORD = 'demo1234';

function seed(db) {
  const user = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)');
  const alice = user.run('alice@demo.com', 'Alice', hashPassword(DEMO_PASSWORD)).lastInsertRowid;
  const bob = user.run('bob@demo.com', 'Bob', hashPassword(DEMO_PASSWORD)).lastInsertRowid;
  user.run('carol@demo.com', 'Carol', hashPassword(DEMO_PASSWORD));

  const cat = db.prepare('INSERT INTO categories (owner_id, name) VALUES (?, ?)');
  const work = cat.run(alice, 'Work').lastInsertRowid;
  cat.run(alice, 'Personal');

  const doc = db.prepare(
    'INSERT INTO documents (owner_id, title, content, category_id, team_id, team_role) VALUES (?, ?, ?, ?, ?, ?)');
  const share = db.prepare('INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?)');

  const welcome = doc.run(
    alice,
    'Welcome to Draftly',
    '<h1>Welcome to Draftly</h1><p>Edit this document, then open <strong>Share</strong> to give someone access.</p><ul><li>Share with one person, or with a whole team.</li><li>Viewers can read but not edit.</li><li>Deleted documents go to Trash first, so you can restore them.</li></ul>',
    work, null, null
  ).lastInsertRowid;
  share.run(welcome, bob, 'viewer');

  const team = db.prepare('INSERT INTO teams (name, owner_id) VALUES (?, ?)').run('Product Squad', alice).lastInsertRowid;
  const member = db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)');
  member.run(team, alice, 'owner');
  member.run(team, bob, 'member');
  // Carol is invited but has not accepted yet, so the invite flow can be demonstrated
  db.prepare('INSERT INTO team_invites (team_id, email, invited_by) VALUES (?, ?, ?)')
    .run(team, 'carol@demo.com', alice);

  doc.run(
    alice,
    'Sprint planning',
    '<h2>Sprint goals</h2><ol><li>Ship the editor</li><li>Review the sharing rules</li><li>Prepare the demo</li></ol><p>Everyone on the team can edit this document.</p>',
    null, team, 'editor'
  );
  doc.run(
    bob,
    'Team notes',
    '<h2>Weekly sync</h2><ul><li>Ship the editor</li><li>Review the sharing rules</li></ul>',
    null, null, null
  ).lastInsertRowid;
  share.run(db.prepare("SELECT id FROM documents WHERE title = 'Team notes'").get().id, alice, 'editor');
}

export function createDb(file = 'data.db') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password_hash TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE (owner_id, name COLLATE NOCASE));
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner','member')),
      PRIMARY KEY (team_id, user_id));
    CREATE TABLE IF NOT EXISTS team_invites (
      id INTEGER PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (team_id, email));
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL DEFAULT 'Untitled document',
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      deleted_at TEXT);
    CREATE TABLE IF NOT EXISTS shares (
      doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
      PRIMARY KEY (doc_id, user_id));
  `);
  // upgrade databases created by earlier versions of the app
  ensureColumn(db, 'documents', 'category_id', 'INTEGER REFERENCES categories(id) ON DELETE SET NULL');
  ensureColumn(db, 'documents', 'deleted_at', 'TEXT');
  ensureColumn(db, 'documents', 'team_id', 'INTEGER REFERENCES teams(id) ON DELETE SET NULL');
  ensureColumn(db, 'documents', 'team_role', "TEXT CHECK (team_role IN ('editor','viewer'))");
  ensureColumn(db, 'users', 'password_hash', 'TEXT');
  ensureColumn(db, 'users', 'created_at', "TEXT NOT NULL DEFAULT '2026-01-01 00:00:00'");

  // demo accounts from the mocked-auth version get the demo password
  db.prepare("SELECT id FROM users WHERE password_hash IS NULL AND email LIKE '%@demo.com'").all()
    .forEach((u) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(DEMO_PASSWORD), u.id));

  if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) seed(db);
  return db;
}
