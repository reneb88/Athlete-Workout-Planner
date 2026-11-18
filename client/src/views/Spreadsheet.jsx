import { useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Confirm, Icon, SearchBox, Seg, useApp } from '../components.jsx';
import { CATEGORIES, matchesSearch } from '../util.js';

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
  { key: 'sequence', label: 'Step', w: 70, num: true },
  { key: 'target', label: 'Target', w: 120 },
  { key: 'level', label: 'Level', w: 80 },
  { key: 'prerequisites', label: 'Prerequisites (IDs)', w: 160, list: true },
  { key: 'related', label: 'Related manipulation', w: 190 },
  { key: 'video_url', label: 'Video URL', w: 220 },
  { key: 'teaching_notes', label: 'Teaching notes', w: 260 },
  { key: 'common_mistakes', label: 'Common mistakes', w: 220 },
  { key: 'review_notes', label: 'Review notes', w: 220 },
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
  const scroller = useRef(null);

  const cfg = {
    skills: {
      cols: SKILL_COLS,
      rows: skills.filter((s) => (cat === 'all' || s.category === cat) && matchesSearch(s, q)),
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

  async function commit(row, col, raw, el) {
    const before = display(col, row[col.key]);
    if (raw === String(before)) return;
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
          <p className="muted">Edit any cell, it saves when you move to another cell. Changes show up everywhere in the app straight away.</p>
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
        {cfg.rows.length !== total && <span className="count">{cfg.rows.length} of {total} rows</span>}
      </div>

      <div className="sheet-wrap card" ref={scroller}>
        <table className="sheet">
          <thead>
            <tr>
              <th className="rownum">#</th>
              {cfg.cols.map((c) => <th key={c.key} style={{ minWidth: c.w }}>{c.label}</th>)}
              <th className="act" aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {cfg.rows.map((row, i) => (
              <tr key={row.id} className={row.category ? `cat-${row.category.toLowerCase()}` : ''}>
                <td className="rownum">{i + 1}</td>
                {cfg.cols.map((col) => {
                  const v = display(col, row[col.key]);
                  return (
                    <td key={col.key}>
                      {col.options ? (
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
                  <button className="icon-btn sm danger" aria-label={`Delete ${row.id}`} onClick={() => setDel(row)}><Icon name="trash" size={18} /></button>
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
