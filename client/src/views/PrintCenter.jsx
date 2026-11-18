import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Check, Empty, Icon, SearchBox, useApp } from '../components.jsx';
import { PrintSheet, applyOptions, sheetData } from '../printing.jsx';
import { exportPdfMany } from '../pdf.js';

const PREF_KEY = 'ropeworks.printPrefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };

export default function PrintCenter({ initial }) {
  const app = useApp();
  const { athletes, athleteById, assignmentCounts, toast } = app;
  const [selected, setSelected] = useState(() => (initial || '').split(',').filter((id) => athleteById[id]));
  const [prefs, setPrefs] = useState(() => ({ hideDone: false, showNotes: false, ...loadPrefs() }));
  const [workouts, setWorkouts] = useState({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);

  // Fetch each selected athlete's saved workout (refetched when the page opens so it's always current)
  useEffect(() => {
    let live = true;
    const missing = selected.filter((id) => !workouts[id]);
    if (!missing.length) return undefined;
    Promise.all(missing.map((id) => api.workout(id))).then((ws) => {
      if (live) setWorkouts((cur) => ({ ...cur, ...Object.fromEntries(ws.map((w) => [w.athlete_id, w])) }));
    }).catch((e) => toast(e.message, 'err'));
    return () => { live = false; };
  }, [selected, workouts, toast]);

  const sheets = useMemo(() => selected.filter((id) => workouts[id]).map((id) =>
    applyOptions(sheetData(athleteById[id], workouts[id], app), prefs)), [selected, workouts, athleteById, app, prefs]);

  const withWork = athletes.filter((a) => assignmentCounts[a.id]);
  const shown = athletes.filter((a) => !q || `${a.name} ${a.group_notes} ${a.age}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(athletes.map((a) => a.group_notes).filter(Boolean))];
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const ready = sheets.length === selected.length && selected.length > 0;

  async function pdf() {
    setBusy(true);
    try { await exportPdfMany(sheets, { showNotes: prefs.showNotes }); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="page print-center">
      <div className="no-print">
        <div className="page-head">
          <div><h1>Print workouts</h1><p className="muted">Pick the athletes for today’s practice. Each athlete prints on their own page.</p></div>
          <div className="btn-group">
            <button className="btn primary" disabled={!ready} onClick={() => window.print()}><Icon name="print" /> Print {selected.length || ''}</button>
            <button className="btn" disabled={!ready || busy} onClick={pdf}><Icon name="file" /> {busy ? 'Making PDF…' : 'Save as PDF'}</button>
          </div>
        </div>

        <section className="card athletes-card">
          <div className="card-head">
            <h2>Athletes <span className="count">{selected.length} selected</span></h2>
            <div className="btn-group">
              <SearchBox value={q} onChange={setQ} placeholder="Find athlete…" />
              {groups.length > 0 && (
                <select className="select" value="" aria-label="Select group"
                  onChange={(e) => e.target.value && setSelected(athletes.filter((a) => a.group_notes === e.target.value).map((a) => a.id))}>
                  <option value="">Select group…</option>
                  {groups.map((g) => <option key={g}>{g}</option>)}
                </select>
              )}
              <button className="btn ghost sm" onClick={() => setSelected(withWork.map((a) => a.id))}>Everyone with a workout ({withWork.length})</button>
              <button className="btn ghost sm" onClick={() => setSelected([])}>Clear</button>
            </div>
          </div>
          <div className="athlete-grid">
            {shown.map((a) => (
              <button key={a.id} className={`athlete-chip ${selected.includes(a.id) ? 'on' : ''}`} onClick={() => toggle(a.id)} aria-pressed={selected.includes(a.id)}>
                <span className="nm">{a.name}</span>
                <span className="sub">{assignmentCounts[a.id] ? `${assignmentCounts[a.id]} challenges` : 'No workout yet'}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="print-opts card">
          <label className="opt"><Check checked={prefs.hideDone} onChange={(v) => setPrefs((p) => ({ ...p, hideDone: v }))} label="Leave out completed" /> Leave out challenges already checked off</label>
          <label className="opt"><Check checked={prefs.showNotes} onChange={(v) => setPrefs((p) => ({ ...p, showNotes: v }))} label="Include notes" /> Include teaching notes</label>
        </div>

        <h2 className="preview-title">Preview</h2>
        {selected.length === 0 && <Empty title="No athletes selected">Tap athletes above, or choose “Everyone with a workout”.</Empty>}
      </div>

      <div className="print-preview">
        {sheets.map((d) => <PrintSheet key={d.athlete.id} data={d} skillById={app.skillById} showNotes={prefs.showNotes} />)}
      </div>
    </div>
  );
}
