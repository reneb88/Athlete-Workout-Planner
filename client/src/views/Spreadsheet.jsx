import { useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Confirm, FamilySelect, Icon, SearchBox, Seg, useApp } from '../components.jsx';
import { CATEGORIES, buildTree, matchesSearch } from '../util.js';

/*
 * Spreadsheet-style editor. Every cell is editable in place; a change is saved when you
 * leave the cell (tap elsewhere, Tab or Enter). New rows are added at the bottom.
 */

const SKILL_COLS = [
  { key: 'id', label: 'ID', w: 70, readOnly: true },
  { key: 'category', label: 'Category', w: 150, options: CATEGORIES },
  { key: 'subcategory', label: 'Subcategory', w: 250 },
  { key: 'family', label: 'Skill family', w: 170 },
  { key: 'name', label: 'Challenge / progression', w: 250 },
  { key: 'sequence', label: 'Step', w: 70, num: true, step: true },
  { key: 'target', label: 'Target', w: 120 },
  { key: 'level', label: 'Level', w: 80 },
  { key: 'prerequisites', label: 'Prerequisites (IDs)', w: 160, list: true },
  { key: 'related', label: 'Related manipulation', w: 190 },
  { key: 'video_url', label: 'Video URL', w: 220 },
  { key: 'teaching_notes', label: 'Teaching notes', w: 260 },
  { key: 'common_mistakes', label: 'Common mistakes', w: 220 },
  { key: 'review_notes', label: 'Review notes', w: 220 },
  { key: 'leads_to', label: 'Leads to (next family)', w: 240, family: true },
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

export default function Spreadsheet() {
  const { skills, athletes, combos, run } = useApp();
  const [tab, setTab] = useState('skills');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [del, setDel] = useState(null);
  const [order, setOrder] = useState('progression');
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
    return { byId, flat };
  }, [skills]);

  const cfg = {
    skills: {
      cols: SKILL_COLS,
      rows: (order === 'progression' ? groups.flat : skills)
        .filter((s) => (cat === 'all' || s.category === cat) && matchesSearch(s, q))
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

      <div className="sheet-wrap card" ref={scroller}>
        <table className="sheet">
          <thead>
            <tr>
              <th className="rownum">#</th>
              {cfg.cols.map((c) => <th key={c.key} style={{ minWidth: c.w }}>{c.label}</th>)}
              <th className="act" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {cfg.rows.map((row, i) => (
              <tr key={row.id} className={`${row.category ? `cat-${row.category.toLowerCase()}` : ''} ${tab === 'skills' && order === 'progression' && groups.byId[row.id]?.first ? 'group-start' : ''}`}>
                <td className="rownum">{i + 1}</td>
                {cfg.cols.map((col) => {
                  const v = display(col, row[col.key]);
                  return (
                    <td key={col.key}>
                      {col.family ? (
                        <FamilySelect className="" value={v} skills={skills} exclude={`${row.category}|${row.subcategory}|${row.family}`}
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

      {del && (
        <Confirm text={`Delete ${del.id} “${del.name}”? This also removes it from athletes’ workouts.`}
          onConfirm={() => run(() => cfg.remove(del.id), 'Row deleted')} onClose={() => setDel(null)} />
      )}
    </div>
  );
}
