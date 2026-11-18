import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Check, Empty, Icon, SearchBox, Seg, useApp } from '../components.jsx';
import { PrintSheet, applyOptions, sheetData } from '../printing.jsx';
import { exportPdfMany } from '../pdf.js';
import { REQUIRED_ELEMENTS, reList } from '../util.js';

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

  const athleteSheets = useMemo(() => selected.filter((id) => workouts[id]).map((id) =>
    applyOptions(sheetData(athleteById[id], workouts[id], app), prefs)), [selected, workouts, athleteById, app, prefs]);

  // ---- Posters: templates (e.g. "Apples", "Oranges") or the whole library, not tied to any athlete ----
  const [mode, setMode] = useState(initial === 'posters' ? 'posters' : 'athletes');
  const [posterSel, setPosterSel] = useState([]);
  const posterSources = useMemo(() => [
    ...app.templates.map((t) => ({ id: `t:${t.id}`, name: t.name, sub: t.description, skill_ids: t.skill_ids, combo_ids: t.combo_ids })),
    // Official required elements: one poster per category so athletes can pick their 6.
    ...REQUIRED_ELEMENTS.map((r) => ({ id: `re:${r}`, name: `Required elements · ${r}`, sub: 'Pick 6',
      skill_ids: app.skills.filter((x) => reList(x).includes(r)).map((x) => x.id), combo_ids: [] })).filter((p) => p.skill_ids.length),
    { id: 'all', name: 'Whole skill library', sub: 'Every challenge', skill_ids: app.skills.map((x) => x.id), combo_ids: app.combos.map((c) => c.id) },
  ], [app.templates, app.skills, app.combos]);
  const posterSheets = useMemo(() => posterSel.map((id) => posterSources.find((p) => p.id === id)).filter(Boolean).map((p) =>
    sheetData({ id: p.id, name: p.name, age: '', group_notes: p.sub }, {
      skill_ids: p.skill_ids, combos: p.combo_ids.map((cid) => ({ id: cid })), progress: [],
    }, app)), [posterSel, posterSources, app]);
  const togglePoster = (id) => setPosterSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const sheets = mode === 'posters' ? posterSheets : athleteSheets;

  const withWork = athletes.filter((a) => assignmentCounts[a.id]);
  const shown = athletes.filter((a) => !q || `${a.name} ${a.group_notes} ${a.age}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(athletes.map((a) => a.group_notes).filter(Boolean))];
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const ready = mode === 'posters' ? sheets.length > 0 : sheets.length === selected.length && selected.length > 0;
  const count = mode === 'posters' ? posterSel.length : selected.length;

  async function pdf() {
    setBusy(true);
    try { await exportPdfMany(sheets, { showNotes: prefs.showNotes }); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="page print-center">
      <div className="no-print">
        <div className="page-head">
          <div><h1>Print</h1><p className="muted">{mode === 'posters'
            ? 'Posters print a skill list for a group (for example Apples or Oranges) without any athlete’s name or progress.'
            : 'Pick the athletes for today’s practice. Each athlete prints on their own page.'}</p></div>
          <div className="btn-group">
            <button className="btn primary" disabled={!ready} onClick={() => window.print()}><Icon name="print" /> Print {count || ''}</button>
            <button className="btn" disabled={!ready || busy} onClick={pdf}><Icon name="file" /> {busy ? 'Making PDF…' : 'Save as PDF'}</button>
          </div>
        </div>

        <div className="toolbar">
          <Seg value={mode} onChange={setMode} options={[{ value: 'athletes', label: 'Athlete checklists' }, { value: 'posters', label: 'Posters' }]} />
        </div>

        {mode === 'posters' && (
          <section className="card athletes-card">
            <div className="card-head"><h2>Posters <span className="count">{posterSel.length} selected</span></h2></div>
            <p className="muted small">Each poster is a <b>template</b>. To make one, build the list in the Workout Designer (no athlete needed) and press <b>Save as template</b>, for example “Apples” or “Oranges”.</p>
            <div className="athlete-grid">
              {posterSources.map((p) => (
                <button key={p.id} className={`athlete-chip ${posterSel.includes(p.id) ? 'on' : ''}`} onClick={() => togglePoster(p.id)} aria-pressed={posterSel.includes(p.id)}>
                  <span className="nm">{p.name}</span>
                  <span className="sub">{p.skill_ids.length} challenges{p.sub && p.id !== 'all' ? ` · ${p.sub}` : ''}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {mode === 'athletes' && <section className="card athletes-card">
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
        </section>}

        <div className="print-opts card">
          {mode === 'athletes' && <label className="opt"><Check checked={prefs.hideDone} onChange={(v) => setPrefs((p) => ({ ...p, hideDone: v }))} label="Leave out completed" /> Leave out challenges already checked off</label>}
          <label className="opt"><Check checked={prefs.showNotes} onChange={(v) => setPrefs((p) => ({ ...p, showNotes: v }))} label="Include notes" /> Include teaching notes</label>
        </div>

        <h2 className="preview-title">Preview</h2>
        {mode === 'athletes' && selected.length === 0 && <Empty title="No athletes selected">Tap athletes above, or choose “Everyone with a workout”.</Empty>}
        {mode === 'posters' && posterSel.length === 0 && <Empty title="No posters selected">Tap a poster above.</Empty>}
      </div>

      <div className="print-preview">
        {sheets.map((d) => <PrintSheet key={d.athlete.id} data={d} skillById={app.skillById} showNotes={prefs.showNotes} poster={mode === 'posters'} hideCategories={String(d.athlete.id).startsWith('re:')} />)}
      </div>
    </div>
  );
}
