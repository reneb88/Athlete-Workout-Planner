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
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS athletes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_notes TEXT NOT NULL DEFAULT '',
  age TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'combo',
  video_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
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
  'review_notes', 'sort_order'];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return new Store(db);
}

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
    'teaching_notes', 'common_mistakes', 'source_page', 'review_notes']) if (f in s) s[f] = str(s[f]);
  if ('sequence' in s) s.sequence = Number(s.sequence) || 0;
  if ('sort_order' in s) s.sort_order = Number(s.sort_order) || 0;
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
      templates: d.prepare('SELECT * FROM templates ORDER BY name').all().map((t) => ({
        ...t,
        skill_ids: JSON.parse(t.skill_ids),
        combo_ids: JSON.parse(t.combo_ids),
        dismissed_ids: JSON.parse(t.dismissed_ids),
      })),
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
    if (!('sort_order' in s)) {
      s.sort_order = (this.db.prepare('SELECT MAX(sort_order) AS m FROM skills').get().m ?? 0) + 1;
    }
    if (!('sequence' in s)) {
      const m = this.db.prepare(
        'SELECT MAX(sequence) AS m FROM skills WHERE category = ? AND subcategory = ? AND family = ?')
        .get(s.category, s.subcategory || '', s.family || '').m;
      s.sequence = (m ?? 0) + 1;
    }
    const cols = ['id', ...Object.keys(s)];
    this.db.prepare(`INSERT INTO skills (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(id, ...Object.values(s));
    return this.getSkill(id);
  }

  updateSkill(id, input) {
    if (!this.getSkill(id)) throw httpError(404, 'Skill not found');
    const s = normalizeSkill(input);
    const keys = Object.keys(s);
    if (keys.length) {
      this.db.prepare(`UPDATE skills SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...Object.values(s), id);
    }
    return this.getSkill(id);
  }

  deleteSkill(id) {
    return tx(this.db, () => {
      this.db.prepare("DELETE FROM progress WHERE item_type = 'skill' AND item_id = ?").run(id);
      return this.db.prepare('DELETE FROM skills WHERE id = ?').run(id).changes > 0;
    });
  }

  // Reorder: given an ordered list of skill IDs (e.g. one family), rewrite their sequence 1..n
  reorderSkills(ids) {
    tx(this.db, () => {
      const st = this.db.prepare('UPDATE skills SET sequence = ? WHERE id = ?');
      ids.forEach((id, i) => st.run(i + 1, id));
    });
  }

  // ---------- Athletes ----------
  getAthlete(id) { return this.db.prepare('SELECT * FROM athletes WHERE id = ?').get(id); }

  createAthlete(input) {
    const name = str(input.name);
    if (!name) throw httpError(400, 'Athlete name is required');
    const id = str(input.id) || nextId(this.db, 'athletes', 'A', 2);
    const order = (this.db.prepare('SELECT MAX(sort_order) AS m FROM athletes').get().m ?? 0) + 1;
    this.db.prepare('INSERT INTO athletes (id, name, group_notes, age, sort_order) VALUES (?,?,?,?,?)')
      .run(id, name, str(input.group_notes), str(input.age), input.sort_order ?? order);
    return this.getAthlete(id);
  }

  updateAthlete(id, input) {
    const a = this.getAthlete(id);
    if (!a) throw httpError(404, 'Athlete not found');
    const next = { ...a, ...input };
    if (!str(next.name)) throw httpError(400, 'Athlete name is required');
    this.db.prepare('UPDATE athletes SET name = ?, group_notes = ?, age = ? WHERE id = ?')
      .run(str(next.name), str(next.group_notes), str(next.age), id);
    return this.getAthlete(id);
  }

  deleteAthlete(id) { return this.db.prepare('DELETE FROM athletes WHERE id = ?').run(id).changes > 0; }

  // ---------- Combos ----------
  listCombos() {
    const cps = this.db.prepare('SELECT * FROM combo_checkpoints').all();
    return this.db.prepare('SELECT * FROM combos ORDER BY sort_order, id').all().map((c) => ({
      ...c,
      checkpoints: cps.filter((x) => x.combo_id === c.id).map((x) => x.skill_id),
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

  createCombo(input) {
    const name = str(input.name);
    if (!name) throw httpError(400, 'Combo name is required');
    const id = str(input.id) || nextId(this.db, 'combos', 'C', 3);
    if (this.getCombo(id)) throw httpError(409, `Combo ${id} already exists`);
    const order = (this.db.prepare('SELECT MAX(sort_order) AS m FROM combos').get().m ?? 0) + 1;
    tx(this.db, () => {
      this.db.prepare('INSERT INTO combos (id, name, kind, video_url, notes, sort_order) VALUES (?,?,?,?,?,?)')
        .run(id, name, input.kind === 'routine' ? 'routine' : 'combo', str(input.video_url), str(input.notes), order);
      this.setCheckpoints(id, input.checkpoints);
    });
    return this.getCombo(id);
  }

  updateCombo(id, input) {
    const c = this.getCombo(id);
    if (!c) throw httpError(404, 'Combo not found');
    const next = { ...c, ...input };
    if (!str(next.name)) throw httpError(400, 'Combo name is required');
    tx(this.db, () => {
      this.db.prepare('UPDATE combos SET name = ?, kind = ?, video_url = ?, notes = ? WHERE id = ?')
        .run(str(next.name), next.kind === 'routine' ? 'routine' : 'combo', str(next.video_url), str(next.notes), id);
      if ('checkpoints' in input) this.setCheckpoints(id, input.checkpoints);
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
      const suggested = new Set(cps.filter((x) => skills.has(x.skill_id)).map((x) => x.combo_id));
      for (const c of suggested) if (!dismissed.has(c)) combos.add(c);

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
        d.exec('DELETE FROM progress; DELETE FROM combo_dismissals; DELETE FROM combo_assignments; DELETE FROM skill_assignments; DELETE FROM combo_checkpoints; DELETE FROM combos; DELETE FROM athletes; DELETE FROM skills;');
        if (data.templates) d.exec('DELETE FROM templates');
      }
      const upSkill = d.prepare(`INSERT INTO skills (id, ${SKILL_FIELDS.join(',')}) VALUES (?, ${SKILL_FIELDS.map(() => '?').join(',')})
        ON CONFLICT(id) DO UPDATE SET ${SKILL_FIELDS.map((f) => `${f}=excluded.${f}`).join(', ')}`);
      (data.skills || []).forEach((raw, i) => {
        const s = normalizeSkill({ prerequisites: [], sort_order: i + 1, ...raw });
        if (!str(raw.id) || !s.name || !s.category) return;
        upSkill.run(str(raw.id), ...SKILL_FIELDS.map((f) => s[f] ?? (f === 'sequence' || f === 'sort_order' ? 0 : '')));
        counts.skills++;
      });
      const upAth = d.prepare(`INSERT INTO athletes (id, name, group_notes, age, sort_order) VALUES (?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, group_notes=excluded.group_notes, age=excluded.age, sort_order=excluded.sort_order`);
      (data.athletes || []).forEach((a, i) => {
        if (!str(a.id) || !str(a.name)) return;
        upAth.run(str(a.id), str(a.name), str(a.group_notes), str(a.age), i + 1);
        counts.athletes++;
      });
      const upCombo = d.prepare(`INSERT INTO combos (id, name, kind, video_url, notes, sort_order) VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, video_url=excluded.video_url, notes=excluded.notes, sort_order=excluded.sort_order`);
      (data.combos || []).forEach((c, i) => {
        if (!str(c.id) || !str(c.name)) return;
        upCombo.run(str(c.id), str(c.name), c.kind === 'routine' ? 'routine' : 'combo', str(c.video_url), str(c.notes), i + 1);
        this.setCheckpoints(str(c.id), c.checkpoints || []);
        counts.combos++;
      });
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
        this.createTemplate(t);
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
