// Coach password + login sessions. The password is never stored: only a salted scrypt hash,
// kept in the local database (data/ropeworks.db), which is not part of the repository.
import crypto from 'node:crypto';

const COOKIE = 'rw_session';
const SESSION_DAYS = 365; // stay signed in on the coach's own iPad / PC
const MIN_LENGTH = 6;

const fail = (status, message) => Object.assign(new Error(message), { status });

export function initAuth(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
  const set = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
  const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const clearSessions = () => db.prepare('DELETE FROM sessions').run();

  function hashPassword(pw) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(pw, salt, 64);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
  }
  function verify(pw) {
    const stored = get('password_hash');
    if (!stored || typeof pw !== 'string') return false;
    const [, saltHex, keyHex] = stored.split('$');
    const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
    return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
  }
  function checkNew(pw) {
    if (typeof pw !== 'string' || pw.length < MIN_LENGTH) throw fail(400, `Password must be at least ${MIN_LENGTH} characters`);
  }
  // Over https (when hosted online) the cookie is marked Secure so it's never sent unencrypted.
  const secure = (res) => (res.req?.secure ? '; Secure' : '');
  function newSession(res) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (token_hash) VALUES (?)').run(sha(token));
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure(res)}`);
  }
  function tokenFrom(req) {
    const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
    return m ? m[1] : null;
  }
  function isAuthed(req) {
    const t = tokenFrom(req);
    if (!t) return false;
    return !!db.prepare("SELECT 1 FROM sessions WHERE token_hash = ? AND created_at > datetime('now', ?)")
      .get(sha(t), `-${SESSION_DAYS} days`);
  }

  // Brute-force guard: 10 failed attempts per IP per 15 minutes.
  const fails = new Map();
  function recentFails(ip) {
    const now = Date.now();
    const f = (fails.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    fails.set(ip, f);
    return f;
  }

  return {
    hasPassword: () => !!get('password_hash'),
    isAuthed,
    setup(req, res, pw) {
      if (get('password_hash')) throw fail(409, 'A password is already set');
      checkNew(pw);
      set('password_hash', hashPassword(pw));
      newSession(res);
    },
    login(req, res, pw) {
      const ip = req.socket.remoteAddress || '?';
      const f = recentFails(ip);
      if (f.length >= 10) throw fail(429, 'Too many attempts. Wait 15 minutes and try again.');
      if (!verify(pw)) { f.push(Date.now()); throw fail(401, 'Wrong password'); }
      fails.delete(ip);
      newSession(res);
    },
    logout(req, res) {
      const t = tokenFrom(req);
      if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    },
    change(req, res, current, next) {
      if (!verify(current)) throw fail(401, 'Current password is wrong');
      checkNew(next);
      set('password_hash', hashPassword(next));
      clearSessions(); // signs out every other device
      newSession(res);
    },
    reset() {
      db.prepare("DELETE FROM settings WHERE key = 'password_hash'").run();
      clearSessions();
    },
  };
}
