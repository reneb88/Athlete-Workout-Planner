import { useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Check, Confirm, FamilySelect, Icon, Modal, SearchBox, Seg, useApp } from '../components.jsx';
import { CATEGORIES, buildTree, familyHomes, homeOf, matchesSearch } from '../util.js';

/*
 * Spreadsheet-style editor. Every cell is editable in place; a change is saved when you
 * leave the cell (tap elsewhere, Tab or Enter). New rows are added at the bottom.
 */

// `hide: true` columns start hidden; the coach can show them with the Columns button.
const SKILL_COLS = [
  { key: 'id', label: 'ID', w: 62, readOnly: true },
  { key: 'category', label: 'Category', w: 128, options: CATEGORIES },
  { key: 'subcategory', label: 'Subcategory', w: 170 },
  { key: 'family', label: 'Skill family', w: 150 },
  { key: 'name', label: 'Challenge / progression', w: 220 },
  { key: 'sequence', label: 'Step', w: 58, num: true, step: true },
  { key: 'target', label: 'Target', w: 100 },
  { key: 'video_url', label: 'Video URL', w: 170 },
  { key: 'level', label: 'Level', w: 70, hide: true },
  { key: 'prerequisites', label: 'Prerequisites (IDs)', w: 140, list: true, hide: true },
  { key: 'related', label: 'Related manipulation', w: 170, hide: true },
  { key: 'teaching_notes', label: 'Teaching notes', w: 240, hide: true },
  { key: 'common_mistakes', label: 'Common mistakes', w: 200, hide: true },
  { key: 'review_notes', label: 'Review notes', w: 200, hide: true },
  { key: 'leads_to', label: 'Leads to (next family)', w: 220, family: true, hide: true },
  { key: 'required_elements', label: 'Required element (rules)', w: 200, hide: true },
];
const ATHLETE_COLS = [
  { key: 'id', label: 'ID', w: 70, readOnly: true },
  { key: 'name', label: 'Athlete name', w: 240 },
  { key: 'age', label: 'Age', w: 80 },
  { key: 'group_notes', label: 'Group / notes', w: 300 },
];
const COMBO_COLS = [
  { key: 'id', label: 'ID', w: 70, readOnly: true },
  { key: 'name', label: 'Combo name', w: 240 },
  { key: 'kind', label: 'Type', w: 120, options: ['combo', 'routine'] },
  { key: 'checkpoints', label: 'Checkpoint skill IDs', w: 180, list: true },
  { key: 'video_url', label: 'Video URL', w: 220 },
  { key: 'notes', label: 'Notes / choreography', w: 320 },
];

const display = (col, v) => (col.list ? (v || []).join(', ') : v ?? '');

const PREF_KEY = 'ropeworks.sheetPrefs';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const defaultShown = (cols) => cols.filter((c) => !c.hide).map((c) => c.key);

export default function Spreadsheet() {
  const { skills, athletes, combos, run } = useApp();
  const [tab, setTab] = useState('skills');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [del, setDel] = useState(null);
  const [order, setOrder] = useState('progression');
  const [prefs, setPrefsState] = useState(readPrefs); // { shown: { skills: [...], ... }, compact: bool }
  const [colsOpen, setColsOpen] = useState(false);
  const setPrefs = (fn) => setPrefsState((p) => {
    const n = fn(p);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const scroller = useRef(null);

  // Every progression (category › subcategory › family) in the order the app shows it,
  // built from the full library so step numbers are always the real position.
  const groups = useMemo(() => {
    const byId = {};
    const flat = [];
    for (const c of buildTree(skills)) for (const sub of c.subs) for (const f of sub.families) {
      const ids = f.skills.map((x) => x.id);
      f.skills.forEach((x, i) => { byId[x.id] = { ids, pos: i + 1, first: i === 0 }; flat.push(x); });
    }
    return { byId, flat, homes: familyHomes(skills) };
  }, [skills]);

  const cfg = {
    skills: {
      cols: SKILL_COLS,
      rows: (order === 'progression' ? groups.flat : skills)
        .filter((s) => (cat === 'all' || homeOf(groups.homes, s)?.category === cat) && matchesSearch(s, q))
        .map((s) => ({ ...s, sequence: groups.byId[s.id]?.pos ?? s.sequence })),
      save: (id, patch) => api.updateSkill(id, patch),
      add: () => api.createSkill({ category: cat === 'all' ? 'Manipulation' : cat, subcategory: '', family: '', name: 'New challenge' }),
      remove: (id) => api.deleteSkill(id),
      noun: 'challenge',
    },
    athletes: {
      cols: ATHLETE_COLS,
      rows: athletes.filter((a) => !q || `${a.id} ${a.name} ${a.age} ${a.group_notes}`.toLowerCase().includes(q.toLowerCase())),
      save: (id, patch) => api.updateAthlete(id, patch),
      add: () => api.createAthlete({ name: 'New athlete' }),
      remove: (id) => api.deleteAthlete(id),
      noun: 'athlete',
    },
    combos: {
      cols: COMBO_COLS,
      rows: combos.filter((c) => !q || `${c.id} ${c.name} ${c.notes}`.toLowerCase().includes(q.toLowerCase())),
      save: (id, patch) => api.updateCombo(id, patch),
      add: () => api.createCombo({ name: 'New combo' }),
      remove: (id) => api.deleteCombo(id),
      noun: 'combo',
    },
  }[tab];

  const allCols = cfg.cols;
  const shownKeys = prefs.shown?.[tab] || defaultShown(allCols);
  const visibleCols = allCols.filter((c) => shownKeys.includes(c.key));
  const setShown = (keys) => setPrefs((p) => ({ ...p, shown: { ...(p.shown || {}), [tab]: keys } }));
  const toggleCol = (key) => setShown(shownKeys.includes(key) ? shownKeys.filter((k) => k !== key) : [...shownKeys, key]);

  const total = { skills: skills.length, athletes: athletes.length, combos: combos.length }[tab];

  // Put a challenge at step n of its progression; the others shift to make room and are renumbered 1, 2, 3…
  async function moveTo(row, n) {
    const ids = groups.byId[row.id].ids.filter((id) => id !== row.id);
    const at = Math.max(0, Math.min(ids.length, Math.round(n) - 1));
    ids.splice(at, 0, row.id);
    await run(() => api.reorderSkills(ids), `${row.name} is now step ${at + 1}`).catch(() => {});
  }
  const nudge = (row, dir) => moveTo(row, groups.byId[row.id].pos + dir);

  // Insert a new blank step directly below this one, in the same progression.
  async function insertBelow(row) {
    const created = await run(() => api.createSkill({ category: row.category, subcategory: row.subcategory, family: row.family, name: 'New step' }));
    const ids = groups.byId[row.id].ids.filter((id) => id !== created.id);
    ids.splice(ids.indexOf(row.id) + 1, 0, created.id);
    await run(() => api.reorderSkills(ids), `New step added after “${row.name}” — type its name`);
    setQ('');
    setTimeout(() => {
      const el = document.querySelector(`input[aria-label="Challenge / progression for ${created.id}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); el.select(); }
    }, 150);
  }

  async function commit(row, col, raw, el) {
    const before = display(col, row[col.key]);
    if (raw === String(before)) return;
    if (col.step) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) { if (el) el.value = before; return; }
      await moveTo(row, n);
      return;
    }
    let value = raw;
    if (col.list) value = raw.split(/[,;\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (col.num) value = Number(raw) || 0;
    if (col.key === 'name' && !raw.trim()) { if (el) el.value = before; return; } // names can't be blank
    await run(() => cfg.save(row.id, { [col.key]: value })).catch(() => {});
  }

  async function addRow() {
    setQ('');
    await run(() => cfg.add(), `New ${cfg.noun} added at the bottom`);
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      const rows = el.querySelectorAll('tbody tr');
      rows[rows.length - 1]?.querySelector('input:not([readonly]), select')?.focus();
    });
  }

  return (
    <div className="page sheet-page">
      <div className="page-head">
        <div>
          <h1>Spreadsheet</h1>
          <p className="muted">Edit any cell, it saves when you move to another cell. To fix the order, type a new <b>Step</b> number or use the arrows. <b>+</b> inserts a new step right below a row.</p>
        </div>
        <button className="btn primary" onClick={addRow}><Icon name="plus" /> Add {cfg.noun}</button>
      </div>
      <div className="toolbar">
        <Seg value={tab} onChange={(t) => { setTab(t); setQ(''); }} options={[
          { value: 'skills', label: `Master Library (${skills.length})` },
          { value: 'athletes', label: `Athletes (${athletes.length})` },
          { value: 'combos', label: `Combos (${combos.length})` },
        ]} />
        <SearchBox value={q} onChange={setQ} placeholder="Filter rows…" />
        <button className="btn ghost sm" onClick={() => setColsOpen(true)}>Columns ({visibleCols.length}/{allCols.length})</button>
        {tab === 'skills' && (
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        {tab === 'skills' && (
          <select className="select" value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Row order">
            <option value="progression">Progression order</option>
            <option value="original">Original row order</option>
          </select>
        )}
        {cfg.rows.length !== total && <span className="count">{cfg.rows.length} of {total} rows</span>}
      </div>

      <div className={`sheet-wrap card ${prefs.compact ? 'compact' : ''}`} ref={scroller}>
        <table className="sheet">
          <thead>
            <tr>
              <th className="rownum">#</th>
              {visibleCols.map((c) => <th key={c.key} style={{ minWidth: c.w, width: c.w }}>{c.label}</th>)}
              <th className="act" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {cfg.rows.map((row, i) => (
              <tr key={row.id} className={`${row.category ? `cat-${row.category.toLowerCase()}` : ''} ${tab === 'skills' && order === 'progression' && groups.byId[row.id]?.first ? 'group-start' : ''}`}>
                <td className="rownum">{i + 1}</td>
                {visibleCols.map((col) => {
                  const v = display(col, row[col.key]);
                  return (
                    <td key={col.key}>
                      {col.family ? (
                        <FamilySelect className="" value={v} skills={skills} exclude={row.family}
                          label={`${col.label} for ${row.id}`} onChange={(val) => commit(row, col, val)} />
                      ) : col.options ? (
                        <select value={v} onChange={(e) => commit(row, col, e.target.value)} aria-label={col.label}>
                          {!col.options.includes(v) && <option value={v}>{v}</option>}
                          {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          key={`${row.id}:${col.key}:${v}`}
                          defaultValue={v}
                          title={String(v)}
                          readOnly={col.readOnly}
                          inputMode={col.num ? 'decimal' : undefined}
                          aria-label={`${col.label} for ${row.id}`}
                          onBlur={(e) => !col.readOnly && commit(row, col, e.target.value, e.currentTarget)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') { e.currentTarget.value = v; e.currentTarget.blur(); }
                          }}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="act">
                  <div className="sheet-actions">
                    {tab === 'skills' && <>
                      <button className="icon-btn sm" aria-label={`Move ${row.id} up`} disabled={groups.byId[row.id]?.pos === 1} onClick={() => nudge(row, -1)}><Icon name="up" size={18} /></button>
                      <button className="icon-btn sm" aria-label={`Move ${row.id} down`} disabled={groups.byId[row.id]?.pos === groups.byId[row.id]?.ids.length} onClick={() => nudge(row, 1)}><Icon name="down" size={18} /></button>
                      <button className="icon-btn sm" aria-label={`Insert a step below ${row.id}`} title="Insert a new step below" onClick={() => insertBelow(row)}><Icon name="plus" size={18} /></button>
                    </>}
                    <button className="icon-btn sm danger" aria-label={`Delete ${row.id}`} onClick={() => setDel(row)}><Icon name="trash" size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cfg.rows.length === 0 && <p className="muted" style={{ padding: 16 }}>No rows match.</p>}
      </div>
      <button className="btn ghost add-below" onClick={addRow}><Icon name="plus" /> Add {cfg.noun}</button>

      {colsOpen && (
        <Modal title="Choose columns" onClose={() => setColsOpen(false)}
          footer={<button className="btn primary" onClick={() => setColsOpen(false)}>Done</button>}>
          <p className="muted small">Hidden columns keep their data — they’re just not shown here. This is remembered on this device.</p>
          <div className="col-list">
            {allCols.map((c) => (
              <label key={c.key} className="opt">
                <Check checked={shownKeys.includes(c.key)} onChange={() => toggleCol(c.key)} label={c.label} /> {c.label}
              </label>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn ghost sm" onClick={() => setShown(defaultShown(allCols))}>Main columns only</button>
            <button className="btn ghost sm" onClick={() => setShown(allCols.map((c) => c.key))}>Show all</button>
          </div>
          <label className="opt" style={{ marginTop: 12 }}>
            <Check checked={!!prefs.compact} onChange={(v) => setPrefs((p) => ({ ...p, compact: v }))} label="Compact rows" /> Compact rows (smaller text, more rows on screen)
          </label>
        </Modal>
      )}

      {del && (
        <Confirm text={`Delete ${del.id} “${del.name}”? This also removes it from athletes’ workouts.`}
          onConfirm={() => run(() => cfg.remove(del.id), 'Row deleted')} onClose={() => setDel(null)} />
      )}
    </div>
  );
}
