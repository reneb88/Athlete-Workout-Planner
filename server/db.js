// Ropeworks Training Studio — SQLite persistence layer (uses Node's built-in node:sqlite).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const CATEGORIES = ['Manipulation', 'Multiples', 'Power'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL DEFAULT '',
  family TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT '',
  sequence REAL NOT NULL DEFAULT 0,
  target TEXT NOT NULL DEFAULT '',
  prerequisites TEXT NOT NULL DEFAULT '[]',
  related TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  teaching_notes TEXT NOT NULL DEFAULT '',
  common_mistakes TEXT NOT NULL DEFAULT '',
  source_page TEXT NOT NULL DEFAULT '',
  review_notes TEXT NOT NULL DEFAULT '',
  leads_to TEXT NOT NULL DEFAULT '',
  required_elements TEXT NOT NULL DEFAULT '',
  film_status TEXT NOT NULL DEFAULT '',
  film_assignee TEXT NOT NULL DEFAULT '',
  film_note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS athletes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_notes TEXT NOT NULL DEFAULT '',
  age TEXT NOT NULL DEFAULT '',
  view_style TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'combo',
  video_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  film_status TEXT NOT NULL DEFAULT '',
  film_assignee TEXT NOT NULL DEFAULT '',
  film_note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS combo_after (
  combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  after_combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  PRIMARY KEY (combo_id, after_combo_id)
);
CREATE TABLE IF NOT EXISTS combo_checkpoints (
  combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (combo_id, skill_id)
);
CREATE TABLE IF NOT EXISTS skill_assignments (
  athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (athlete_id, skill_id)
);
CREATE TABLE IF NOT EXISTS combo_assignments (
  athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (athlete_id, combo_id)
);
CREATE TABLE IF NOT EXISTS combo_dismissals (
  athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  PRIMARY KEY (athlete_id, combo_id)
);
CREATE TABLE IF NOT EXISTS progress (
  athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('skill','combo')),
  item_id TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (athlete_id, item_type, item_id)
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  skill_ids TEXT NOT NULL DEFAULT '[]',
  combo_ids TEXT NOT NULL DEFAULT '[]',
  dismissed_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SKILL_FIELDS = ['category', 'subcategory', 'family', 'name', 'level', 'sequence', 'target',
  'prerequisites', 'related', 'video_url', 'teaching_notes', 'common_mistakes', 'source_page',
  'review_notes', 'leads_to', 'required_elements', 'film_status', 'film_assignee', 'film_note', 'sort_order'];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

/** Official required-element categories (competition rules), separate from the teaching categories. */
export const REQUIRED_ELEMENTS = ['Multiples', 'Power & Gymnastics', 'Manipulation'];
/** Accepts an array or text like "multiples, power" and returns e.g. "Multiples, Power & Gymnastics". */
/** How an athlete's page looks: '' = automatic by age, 'checklist', or 'videos' (video board). */
export const viewStyle = (v) => (['checklist', 'videos'].includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : '');

/** Filming punch list: '' (to film) | 'filmed' (needs link) | 'skip' (no video needed). Having a video = done. */
export function normalizeFilm(v) {
  const t = String(v ?? '').toLowerCase();
  if (/skip|no video|not needed/.test(t)) return 'skip';
  if (/filmed|uploaded|needs link|edit/.test(t)) return 'filmed';
  return '';
}
export function normalizeRequired(v) {
  const tokens = Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]+/);
  const out = new Set();
  for (const t of tokens.map((x) => String(x).toLowerCase())) {
    if (/multi/.test(t)) out.add('Multiples');
    if (/power|gym/.test(t)) out.add('Power & Gymnastics');
    if (/manip|wrap|release/.test(t)) out.add('Manipulation');
  }
  return REQUIRED_ELEMENTS.filter((r) => out.has(r)).join(', ');
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Migration: databases created before "Leads to" existed get the new column.
  if (!db.prepare('PRAGMA table_info(skills)').all().some((c) => c.name === 'leads_to')) {
    db.exec("ALTER TABLE skills ADD COLUMN leads_to TEXT NOT NULL DEFAULT ''");
  }
  // Migrations: add columns that newer versions use.
  for (const [table, col] of [['skills', 'required_elements'], ['skills', 'film_status'], ['skills', 'film_assignee'], ['skills', 'film_note'],
    ['combos', 'film_status'], ['combos', 'film_assignee'], ['combos', 'film_note'], ['athletes', 'view_style']]) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
  const store = new Store(db);
  // One time: link existing "Try …" steps to the family they lead to.
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'autolink_try_v1'").get()) {
    store.autoLinkTry();
    db.prepare("INSERT INTO settings (key, value) VALUES ('autolink_try_v1', '1')").run();
  }
  // One time: a skill family is one progression across categories (same family name = same family).
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'family_v2'").get()) {
    store.migrateFamiliesV2();
    db.prepare("INSERT INTO settings (key, value) VALUES ('family_v2', '1')").run();
  }
  return store;
}

const normName = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
/** Family identity: the family name, case-insensitive, regardless of category. */
const famKey = (name) => String(name || '').trim().toLowerCase();
const lastPart = (ref) => String(ref || '').split(/[|›]/).pop().trim();

function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function nextId(db, table, prefix, width) {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE id LIKE ?`).all(prefix + '%');
  let max = 0;
  for (const { id } of rows) {
    const n = parseInt(String(id).slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(width, '0');
}

function parseSkill(row) {
  if (!row) return row;
  return { ...row, prerequisites: JSON.parse(row.prerequisites || '[]') };
}

export function normalizeSkill(input) {
  const s = {};
  for (const f of SKILL_FIELDS) if (f in input) s[f] = input[f];
  for (const f of ['category', 'subcategory', 'family', 'name', 'level', 'target', 'related', 'video_url',
    'teaching_notes', 'common_mistakes', 'source_page', 'review_notes', 'leads_to']) if (f in s) s[f] = str(s[f]);
  if ('sequence' in s) s.sequence = Number(s.sequence) || 0;
  if ('sort_order' in s) s.sort_order = Number(s.sort_order) || 0;
  if ('required_elements' in s) s.required_elements = normalizeRequired(s.required_elements);
  if ('film_status' in s) s.film_status = normalizeFilm(s.film_status);
  if ('prerequisites' in s) {
    let p = s.prerequisites;
    if (typeof p === 'string') p = p.split(/[,;\s]+/);
    s.prerequisites = JSON.stringify([...new Set((p || []).map(str).filter(Boolean))]);
  }
  return s;
}

class Store {
  constructor(db) { this.db = db; }

  close() { this.db.close(); }

  isEmpty() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM skills').get().n === 0;
  }

  // ---------- Full state snapshot (the client keeps a live copy) ----------
  snapshot() {
    const d = this.db;
    return {
      skills: d.prepare('SELECT * FROM skills ORDER BY sort_order, id').all().map(parseSkill),
      athletes: d.prepare('SELECT * FROM athletes ORDER BY sort_order, name').all(),
      combos: this.listCombos(),
      settings: this.getSettings(),
      templates: d.prepare('SELECT * FROM templates ORDER BY name').all().map((t) => ({
        ...t,
        skill_ids: JSON.parse(t.skill_ids),
        combo_ids: JSON.parse(t.combo_ids),
        dismissed_ids: JSON.parse(t.dismissed_ids),
      })),
      // how many athletes have each skill — used to prioritise filming
      skillUse: Object.fromEntries(d.prepare('SELECT skill_id, COUNT(*) AS n FROM skill_assignments GROUP BY skill_id').all()
        .map((r) => [r.skill_id, r.n])),
      assignmentCounts: Object.fromEntries(d.prepare(
        'SELECT athlete_id, COUNT(*) AS n FROM skill_assignments GROUP BY athlete_id').all()
        .map((r) => [r.athlete_id, r.n])),
    };
  }

  // ---------- Skills ----------
  getSkill(id) { return parseSkill(this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id)); }

  createSkill(input) {
    const s = normalizeSkill(input);
    if (!s.name) throw httpError(400, 'Challenge name is required');
    if (!s.category) throw httpError(400, 'Master category is required');
    const id = str(input.id) || nextId(this.db, 'skills', 'S', 3);
    if (this.getSkill(id)) throw httpError(409, `Skill ${id} already exists`);
    if (s.leads_to) s.leads_to = this.resolveFamily(s.leads_to, s);
    if (!('sort_order' in s)) {
      s.sort_order = (this.db.prepare('SELECT MAX(sort_order) AS m FROM skills').get().m ?? 0) + 1;
    }
    if (!('sequence' in s)) s.sequence = this.nextStep(s.family);
    const cols = ['id', ...Object.keys(s)];
    this.db.prepare(`INSERT INTO skills (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(id, ...Object.values(s));
    if (!s.leads_to) this.autoLinkTry(id);
    return this.getSkill(id);
  }

  updateSkill(id, input) {
    const cur = this.getSkill(id);
    if (!cur) throw httpError(404, 'Skill not found');
    const s = normalizeSkill(input);
    if (s.leads_to) s.leads_to = this.resolveFamily(s.leads_to, { ...cur, ...s });
    // Moved to another family: it joins the end of that family's progression.
    if ('family' in s && famKey(s.family) !== famKey(cur.family) && !('sequence' in s)) s.sequence = this.nextStep(s.family, id);
    const keys = Object.keys(s);
    if (keys.length) {
      this.db.prepare(`UPDATE skills SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...Object.values(s), id);
    }
    // Renamed to "Try …" (and not linked by hand): link it to that family.
    if ('name' in s && !('leads_to' in s)) this.autoLinkTry(id);
    return this.getSkill(id);
  }

  deleteSkill(id) {
    return tx(this.db, () => {
      this.db.prepare("DELETE FROM progress WHERE item_type = 'skill' AND item_id = ?").run(id);
      return this.db.prepare('DELETE FROM skills WHERE id = ?').run(id).changes > 0;
    });
  }

  /** Next free step number at the end of a family (any category). */
  nextStep(family, exceptId = '') {
    const m = this.db.prepare('SELECT MAX(sequence) AS m FROM skills WHERE lower(trim(family)) = ? AND id != ?').get(famKey(family), exceptId).m;
    return (m ?? 0) + 1;
  }

  /** Renumber every family 1..n across categories (keeping the current order); store "Leads to" as a family name. */
  migrateFamiliesV2() {
    tx(this.db, () => {
      for (const r of this.db.prepare("SELECT id, leads_to FROM skills WHERE leads_to != ''").all()) {
        this.db.prepare('UPDATE skills SET leads_to = ? WHERE id = ?').run(this.resolveFamily(r.leads_to), r.id);
      }
      this.renumberFamilies();
    });
  }

  renumberFamilies() {
    const groups = new Map();
    for (const r of this.db.prepare('SELECT id, family FROM skills ORDER BY sequence, sort_order, id').all()) {
      const k = famKey(r.family);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r.id);
    }
    const st = this.db.prepare('UPDATE skills SET sequence = ? WHERE id = ?');
    for (const ids of groups.values()) ids.forEach((id, i) => st.run(i + 1, id));
  }

  // Reorder: given an ordered list of skill IDs (e.g. one family), rewrite their sequence 1..n
  reorderSkills(ids) {
    tx(this.db, () => {
      const st = this.db.prepare('UPDATE skills SET sequence = ? WHERE id = ?');
      ids.forEach((id, i) => st.run(i + 1, id));
    });
  }

  /**
   * Turn a family reference into the family's name as written in the library ('' if no such family).
   * Accepts a name, or older "Category|Subcategory|Family" / "Category › Subcategory › Family" forms.
   * A step can't lead to its own family.
   */
  resolveFamily(ref, from = {}) {
    const want = normName(lastPart(ref));
    if (!want) return '';
    const hit = this.db.prepare('SELECT family FROM skills ORDER BY sequence, sort_order').all()
      .find((x) => normName(x.family) === want);
    if (!hit || (from.family && famKey(hit.family) === famKey(from.family))) return '';
    return hit.family.trim();
  }

  /** Fill in "Leads to" for "Try X" steps whose X matches an existing skill family (only where it's empty). */
  autoLinkTry(onlyId) {
    const rows = this.db.prepare("SELECT * FROM skills WHERE leads_to = '' AND lower(name) LIKE '%try %'").all()
      .filter((r) => !onlyId || r.id === onlyId);
    let n = 0;
    for (const r of rows) {
      const m = r.name.match(/try\s+(.+)$/i);
      const key = m && this.resolveFamily(m[1], r);
      if (key) { this.db.prepare('UPDATE skills SET leads_to = ? WHERE id = ?').run(key, r.id); n++; }
    }
    return n;
  }

  // ---------- Settings ----------
  getSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings WHERE key LIKE 'app.%'").all();
    const s = { videoBoardAge: 13 };
    for (const r of rows) if (r.key === 'app.videoBoardAge') s.videoBoardAge = Number(r.value) || 0;
    return s;
  }

  setSettings(input) {
    if ('videoBoardAge' in input) {
      const n = Math.max(0, Math.min(99, Number(input.videoBoardAge) || 0));
      this.db.prepare("INSERT INTO settings (key, value) VALUES ('app.videoBoardAge', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(n));
    }
    return this.getSettings();
  }

  // ---------- Athletes ----------
  getAthlete(id) { return this.db.prepare('SELECT * FROM athletes WHERE id = ?').get(id); }

  createAthlete(input) {
    const name = str(input.name);
    if (!name) throw httpError(400, 'Athlete name is required');
    const id = str(input.id) || nextId(this.db, 'athletes', 'A', 2);
    const order = (this.db.prepare('SELECT MAX(sort_order) AS m FROM athletes').get().m ?? 0) + 1;
    this.db.prepare('INSERT INTO athletes (id, name, group_notes, age, view_style, sort_order) VALUES (?,?,?,?,?,?)')
      .run(id, name, str(input.group_notes), str(input.age), viewStyle(input.view_style), input.sort_order ?? order);
    return this.getAthlete(id);
  }

  updateAthlete(id, input) {
    const a = this.getAthlete(id);
    if (!a) throw httpError(404, 'Athlete not found');
    const next = { ...a, ...input };
    if (!str(next.name)) throw httpError(400, 'Athlete name is required');
    this.db.prepare('UPDATE athletes SET name = ?, group_notes = ?, age = ?, view_style = ? WHERE id = ?')
      .run(str(next.name), str(next.group_notes), str(next.age), viewStyle(next.view_style), id);
    return this.getAthlete(id);
  }

  deleteAthlete(id) { return this.db.prepare('DELETE FROM athletes WHERE id = ?').run(id).changes > 0; }

  // ---------- Combos ----------
  listCombos() {
    const cps = this.db.prepare('SELECT * FROM combo_checkpoints').all();
    const after = this.db.prepare('SELECT * FROM combo_after').all();
    return this.db.prepare('SELECT * FROM combos ORDER BY sort_order, id').all().map((c) => ({
      ...c,
      checkpoints: cps.filter((x) => x.combo_id === c.id).map((x) => x.skill_id),
      // other combos/routines this one is ready after
      after_combos: after.filter((x) => x.combo_id === c.id).map((x) => x.after_combo_id),
    }));
  }

  getCombo(id) { return this.listCombos().find((c) => c.id === id); }

  setCheckpoints(comboId, skillIds) {
    this.db.prepare('DELETE FROM combo_checkpoints WHERE combo_id = ?').run(comboId);
    const st = this.db.prepare('INSERT OR IGNORE INTO combo_checkpoints (combo_id, skill_id) VALUES (?, ?)');
    for (const sid of skillIds || []) {
      if (this.getSkill(sid)) st.run(comboId, sid);
    }
  }

  setAfterCombos(comboId, ids) {
    this.db.prepare('DELETE FROM combo_after WHERE combo_id = ?').run(comboId);
    const st = this.db.prepare('INSERT OR IGNORE INTO combo_after (combo_id, after_combo_id) VALUES (?, ?)');
    for (const cid of ids || []) {
      if (cid !== comboId && this.db.prepare('SELECT 1 FROM combos WHERE id = ?').get(cid)) st.run(comboId, cid);
    }
  }

  createCombo(input) {
    const name = str(input.name);
    if (!name) throw httpError(400, 'Combo name is required');
    const id = str(input.id) || nextId(this.db, 'combos', 'C', 3);
    if (this.getCombo(id)) throw httpError(409, `Combo ${id} already exists`);
    const order = (this.db.prepare('SELECT MAX(sort_order) AS m FROM combos').get().m ?? 0) + 1;
    tx(this.db, () => {
      this.db.prepare('INSERT INTO combos (id, name, kind, video_url, notes, film_status, film_assignee, film_note, sort_order) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, name, input.kind === 'routine' ? 'routine' : 'combo', str(input.video_url), str(input.notes),
          normalizeFilm(input.film_status), str(input.film_assignee), str(input.film_note), order);
      this.setCheckpoints(id, input.checkpoints);
      this.setAfterCombos(id, input.after_combos);
    });
    return this.getCombo(id);
  }

  updateCombo(id, input) {
    const c = this.getCombo(id);
    if (!c) throw httpError(404, 'Combo not found');
    const next = { ...c, ...input };
    if (!str(next.name)) throw httpError(400, 'Combo name is required');
    tx(this.db, () => {
      this.db.prepare('UPDATE combos SET name = ?, kind = ?, video_url = ?, notes = ?, film_status = ?, film_assignee = ?, film_note = ? WHERE id = ?')
        .run(str(next.name), next.kind === 'routine' ? 'routine' : 'combo', str(next.video_url), str(next.notes),
          normalizeFilm(next.film_status), str(next.film_assignee), str(next.film_note), id);
      if ('checkpoints' in input) this.setCheckpoints(id, input.checkpoints);
      if ('after_combos' in input) this.setAfterCombos(id, input.after_combos);
    });
    return this.getCombo(id);
  }

  deleteCombo(id) {
    return tx(this.db, () => {
      this.db.prepare("DELETE FROM progress WHERE item_type = 'combo' AND item_id = ?").run(id);
      return this.db.prepare('DELETE FROM combos WHERE id = ?').run(id).changes > 0;
    });
  }

  // ---------- Workouts (per athlete) ----------
  getWorkout(athleteId) {
    if (!this.getAthlete(athleteId)) throw httpError(404, 'Athlete not found');
    const d = this.db;
    return {
      athlete_id: athleteId,
      skill_ids: d.prepare('SELECT skill_id FROM skill_assignments WHERE athlete_id = ?').all(athleteId).map((r) => r.skill_id),
      combos: d.prepare('SELECT combo_id, source FROM combo_assignments WHERE athlete_id = ?').all(athleteId)
        .map((r) => ({ id: r.combo_id, source: r.source })),
      dismissed_ids: d.prepare('SELECT combo_id FROM combo_dismissals WHERE athlete_id = ?').all(athleteId).map((r) => r.combo_id),
      progress: d.prepare('SELECT item_type, item_id, completed_at FROM progress WHERE athlete_id = ?').all(athleteId),
    };
  }

  /**
   * Save a workout for one athlete.
   * mode 'replace' — the athlete's assignment becomes exactly this set.
   * mode 'add'     — merge into what the athlete already has.
   * Suggested combos: any combo whose checkpoint is in the athlete's skill set is auto-added
   * unless the coach has dismissed it for this athlete.
   */
  saveWorkout(athleteId, { skill_ids = [], combo_ids = [], dismissed_ids = [], mode = 'replace' }) {
    if (!this.getAthlete(athleteId)) throw httpError(404, `Athlete ${athleteId} not found`);
    const d = this.db;
    tx(d, () => {
      const validSkills = new Set(d.prepare('SELECT id FROM skills').all().map((r) => r.id));
      const validCombos = new Set(d.prepare('SELECT id FROM combos').all().map((r) => r.id));
      const cur = this.getWorkout(athleteId);
      let skills = new Set(skill_ids.filter((s) => validSkills.has(s)));
      let combos = new Set(combo_ids.filter((c) => validCombos.has(c)));
      let dismissed = new Set(dismissed_ids.filter((c) => validCombos.has(c)));
      if (mode === 'add') {
        cur.skill_ids.forEach((s) => skills.add(s));
        cur.combos.forEach((c) => { if (!dismissed.has(c.id)) combos.add(c.id); });
        cur.dismissed_ids.forEach((c) => { if (!combos.has(c)) dismissed.add(c); });
      }
      for (const c of combos) dismissed.delete(c);
      // auto-suggest
      const cps = d.prepare('SELECT combo_id, skill_id FROM combo_checkpoints').all();
      const after = d.prepare('SELECT combo_id, after_combo_id FROM combo_after').all();
      const suggested = new Set(cps.filter((x) => skills.has(x.skill_id)).map((x) => x.combo_id));
      for (const c of suggested) if (!dismissed.has(c)) combos.add(c);
      // Combos/routines ready after another combo the athlete has (repeat for chains: combo → bigger combo → routine).
      for (let changed = true; changed;) {
        changed = false;
        for (const x of after) {
          if (combos.has(x.after_combo_id) && !suggested.has(x.combo_id)) {
            suggested.add(x.combo_id);
            if (!dismissed.has(x.combo_id) && !combos.has(x.combo_id)) { combos.add(x.combo_id); changed = true; }
          }
        }
      }

      d.prepare('DELETE FROM skill_assignments WHERE athlete_id = ?').run(athleteId);
      d.prepare('DELETE FROM combo_assignments WHERE athlete_id = ?').run(athleteId);
      d.prepare('DELETE FROM combo_dismissals WHERE athlete_id = ?').run(athleteId);
      const ins = d.prepare('INSERT INTO skill_assignments (athlete_id, skill_id) VALUES (?, ?)');
      for (const s of skills) ins.run(athleteId, s);
      const insC = d.prepare('INSERT INTO combo_assignments (athlete_id, combo_id, source) VALUES (?, ?, ?)');
      for (const c of combos) insC.run(athleteId, c, suggested.has(c) ? 'suggested' : 'manual');
      const insD = d.prepare('INSERT INTO combo_dismissals (athlete_id, combo_id) VALUES (?, ?)');
      for (const c of dismissed) insD.run(athleteId, c);
    });
    return this.getWorkout(athleteId);
  }

  setProgress(athleteId, itemType, itemId, done) {
    if (!this.getAthlete(athleteId)) throw httpError(404, 'Athlete not found');
    if (!['skill', 'combo'].includes(itemType)) throw httpError(400, 'Invalid item type');
    if (done) {
      this.db.prepare('INSERT OR IGNORE INTO progress (athlete_id, item_type, item_id) VALUES (?, ?, ?)')
        .run(athleteId, itemType, itemId);
    } else {
      this.db.prepare('DELETE FROM progress WHERE athlete_id = ? AND item_type = ? AND item_id = ?')
        .run(athleteId, itemType, itemId);
    }
    return this.getWorkout(athleteId);
  }

  // ---------- Templates ----------
  createTemplate({ name, description = '', skill_ids = [], combo_ids = [], dismissed_ids = [] }) {
    if (!str(name)) throw httpError(400, 'Template name is required');
    const r = this.db.prepare('INSERT INTO templates (name, description, skill_ids, combo_ids, dismissed_ids) VALUES (?,?,?,?,?)')
      .run(str(name), str(description), JSON.stringify(skill_ids), JSON.stringify(combo_ids), JSON.stringify(dismissed_ids));
    return Number(r.lastInsertRowid);
  }

  updateTemplate(id, input) {
    const t = this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!t) throw httpError(404, 'Template not found');
    const n = {
      name: 'name' in input ? str(input.name) : t.name,
      description: 'description' in input ? str(input.description) : t.description,
      skill_ids: 'skill_ids' in input ? JSON.stringify(input.skill_ids) : t.skill_ids,
      combo_ids: 'combo_ids' in input ? JSON.stringify(input.combo_ids) : t.combo_ids,
      dismissed_ids: 'dismissed_ids' in input ? JSON.stringify(input.dismissed_ids) : t.dismissed_ids,
    };
    if (!n.name) throw httpError(400, 'Template name is required');
    this.db.prepare('UPDATE templates SET name=?, description=?, skill_ids=?, combo_ids=?, dismissed_ids=? WHERE id=?')
      .run(n.name, n.description, n.skill_ids, n.combo_ids, n.dismissed_ids, id);
  }

  deleteTemplate(id) { return this.db.prepare('DELETE FROM templates WHERE id = ?').run(id).changes > 0; }

  // ---------- Bulk data (import / export) ----------
  allAssignments() {
    const d = this.db;
    return {
      skills: d.prepare('SELECT * FROM skill_assignments ORDER BY athlete_id').all(),
      combos: d.prepare('SELECT * FROM combo_assignments ORDER BY athlete_id').all(),
      dismissals: d.prepare('SELECT * FROM combo_dismissals ORDER BY athlete_id').all(),
      progress: d.prepare('SELECT * FROM progress ORDER BY athlete_id').all(),
    };
  }

  /**
   * Import parsed workbook data. With replace=true, the library, roster and combos are wiped first
   * (assignments/progress referencing removed rows are cascaded away). Otherwise rows are upserted by ID.
   */
  importData(data, { replace = false } = {}) {
    const d = this.db;
    const counts = { skills: 0, athletes: 0, combos: 0, assignments: 0, progress: 0, templates: 0 };
    tx(d, () => {
      if (replace) {
        d.exec('DELETE FROM progress; DELETE FROM combo_dismissals; DELETE FROM combo_assignments; DELETE FROM skill_assignments; DELETE FROM combo_checkpoints; DELETE FROM combo_after; DELETE FROM combos; DELETE FROM athletes; DELETE FROM skills;');
        if (data.templates) d.exec('DELETE FROM templates');
      }
      (data.skills || []).forEach((raw, i) => {
        if (!str(raw.id)) return;
        const s = normalizeSkill({ prerequisites: [], sort_order: i + 1, ...raw });
        if (!s.name || !s.category) {
          // Partial row (e.g. only ID + Video URL): update just those columns of an existing skill.
          const cur = this.getSkill(str(raw.id));
          const part = normalizeSkill(raw);
          delete part.name; delete part.category; delete part.sort_order;
          const keys = Object.keys(part);
          if (!cur || !keys.length) return;
          d.prepare(`UPDATE skills SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(part), cur.id);
          counts.skills++;
          return;
        }
        // Existing rows: only overwrite columns the spreadsheet actually has, so e.g. videos or
        // "Leads to" links added in the app survive importing an older workbook without those columns.
        const upd = SKILL_FIELDS.filter((f) => f in raw || f === 'sort_order');
        d.prepare(`INSERT INTO skills (id, ${SKILL_FIELDS.join(',')}) VALUES (?, ${SKILL_FIELDS.map(() => '?').join(',')})
          ON CONFLICT(id) DO UPDATE SET ${upd.map((f) => `${f}=excluded.${f}`).join(', ')}`)
          .run(str(raw.id), ...SKILL_FIELDS.map((f) => s[f] ?? (f === 'sequence' || f === 'sort_order' ? 0 : '')));
        counts.skills++;
      });
      // second pass: "Leads to" may name families that were only just imported
      for (const raw of data.skills || []) {
        if (!str(raw.id) || !str(raw.leads_to)) continue;
        const sk = this.getSkill(str(raw.id));
        if (sk) this.db.prepare('UPDATE skills SET leads_to = ? WHERE id = ?').run(this.resolveFamily(raw.leads_to, sk), sk.id);
      }
      if ((data.skills || []).length) this.autoLinkTry();
      if ((data.skills || []).some((r) => 'sequence' in r || 'family' in r)) this.renumberFamilies();
      (data.athletes || []).forEach((a, i) => {
        if (!str(a.id) || !str(a.name)) return;
        const vs = 'view_style' in a;
        d.prepare(`INSERT INTO athletes (id, name, group_notes, age, sort_order${vs ? ', view_style' : ''}) VALUES (?,?,?,?,?${vs ? ',?' : ''})
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, group_notes=excluded.group_notes, age=excluded.age, sort_order=excluded.sort_order${vs ? ', view_style=excluded.view_style' : ''}`)
          .run(str(a.id), str(a.name), str(a.group_notes), str(a.age), i + 1, ...(vs ? [viewStyle(a.view_style)] : []));
        counts.athletes++;
      });
      (data.combos || []).forEach((c, i) => {
        if (!str(c.id) || !str(c.name)) return;
        const extra = ['film_status', 'film_assignee', 'film_note'].filter((f) => f in c);
        d.prepare(`INSERT INTO combos (id, name, kind, video_url, notes, sort_order${extra.map((f) => ', ' + f).join('')}) VALUES (?,?,?,?,?,?${extra.map(() => ',?').join('')})
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, video_url=excluded.video_url, notes=excluded.notes, sort_order=excluded.sort_order${extra.map((f) => `, ${f}=excluded.${f}`).join('')}`)
          .run(str(c.id), str(c.name), c.kind === 'routine' ? 'routine' : 'combo', str(c.video_url), str(c.notes), i + 1,
            ...extra.map((f) => (f === 'film_status' ? normalizeFilm(c[f]) : str(c[f]))));
        this.setCheckpoints(str(c.id), (c.checkpoints || []).filter((t) => !/^C\d+$/i.test(t)));
        counts.combos++;
      });
      // second pass: combos ready after other combos (IDs may refer to combos imported just now)
      for (const c of data.combos || []) {
        if (!str(c.id)) continue;
        const ids = [...(c.after_combos || []), ...(c.checkpoints || []).filter((t) => /^C\d+$/i.test(t))].map((t) => String(t).toUpperCase());
        if ('after_combos' in c || ids.length) this.setAfterCombos(str(c.id), ids);
      }
      const has = (t, id) => !!d.prepare(`SELECT 1 FROM ${t} WHERE id = ?`).get(id);
      for (const a of data.skillAssignments || []) {
        if (has('athletes', a.athlete_id) && has('skills', a.skill_id)) {
          d.prepare('INSERT OR IGNORE INTO skill_assignments (athlete_id, skill_id) VALUES (?, ?)').run(a.athlete_id, a.skill_id);
          counts.assignments++;
        }
      }
      for (const a of data.comboAssignments || []) {
        if (has('athletes', a.athlete_id) && has('combos', a.combo_id)) {
          if (a.status === 'dismissed') {
            d.prepare('INSERT OR IGNORE INTO combo_dismissals (athlete_id, combo_id) VALUES (?, ?)').run(a.athlete_id, a.combo_id);
          } else {
            d.prepare('INSERT OR IGNORE INTO combo_assignments (athlete_id, combo_id, source) VALUES (?, ?, ?)')
              .run(a.athlete_id, a.combo_id, a.source === 'suggested' ? 'suggested' : 'manual');
          }
          counts.assignments++;
        }
      }
      for (const p of data.progress || []) {
        if (!has('athletes', p.athlete_id) || !['skill', 'combo'].includes(p.item_type)) continue;
        d.prepare('INSERT OR IGNORE INTO progress (athlete_id, item_type, item_id, completed_at) VALUES (?, ?, ?, ?)')
          .run(p.athlete_id, p.item_type, str(p.item_id), str(p.completed_at) || new Date().toISOString());
        counts.progress++;
      }
      for (const t of data.templates || []) {
        if (!str(t.name)) continue;
        // A template with the same name is updated, not duplicated, so re-importing is safe.
        const existing = d.prepare('SELECT id FROM templates WHERE lower(name) = lower(?)').get(str(t.name));
        if (existing) this.updateTemplate(existing.id, t);
        else this.createTemplate(t);
        counts.templates++;
      }
    });
    return counts;
  }
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
