import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Check, Empty, Icon, SearchBox, Seg, useApp } from '../components.jsx';
import { PrintSheet, applyOptions, sheetData } from '../printing.jsx';
import { exportPdfMany } from '../pdf.js';
import { REQUIRED_ELEMENTS, buildTree, reList } from '../util.js';

const PREF_KEY = 'ropeworks.printPrefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };

export default function PrintCenter({ initial }) {
  const app = useApp();
  const { athletes, athleteById, assignmentCounts, toast } = app;
  const [selected, setSelected] = useState(() => (initial === 'all'
    ? athletes.filter((a) => assignmentCounts[a.id]).map((a) => a.id)
    : (initial || '').split(',').filter((id) => athleteById[id])));
  const [pending, setPending] = useState(null); // 'print' | 'pdf' once everything has loaded
  const [prefs, setPrefs] = useState(() => ({ hideDone: false, showNotes: false, ...loadPrefs() }));
  const [workouts, setWorkouts] = useState({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);

  // Fetch each selected athlete's saved workout (refetched when the page opens so it's always current)
  const [mode, setMode] = useState(initial === 'posters' ? 'posters' : initial === 'overview' ? 'overview' : 'athletes');
  const withWorkIds = useMemo(() => athletes.filter((a) => assignmentCounts[a.id]).map((a) => a.id), [athletes, assignmentCounts]);
  useEffect(() => {
    let live = true;
    const missing = (mode === 'overview' ? withWorkIds : selected).filter((id) => !workouts[id]);
    if (!missing.length) return undefined;
    Promise.all(missing.map((id) => api.workout(id))).then((ws) => {
      if (live) setWorkouts((cur) => ({ ...cur, ...Object.fromEntries(ws.map((w) => [w.athlete_id, w])) }));
    }).catch((e) => toast(e.message, 'err'));
    return () => { live = false; };
  }, [selected, workouts, toast, mode, withWorkIds]);

  const athleteSheets = useMemo(() => selected.filter((id) => workouts[id]).map((id) =>
    applyOptions(sheetData(athleteById[id], workouts[id], app), prefs)), [selected, workouts, athleteById, app, prefs]);

  // ---- Posters: templates (e.g. "Apples", "Oranges") or the whole library, not tied to any athlete ----
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
  const overviewReady = withWorkIds.every((id) => workouts[id]);
  const ready = mode === 'overview' ? overviewReady && withWorkIds.length > 0
    : mode === 'posters' ? sheets.length > 0 : sheets.length === selected.length && selected.length > 0;
  const count = mode === 'posters' ? posterSel.length : mode === 'overview' ? '' : selected.length;

  // "Print all assignments": select everyone with a workout, then print/PDF once their workouts have loaded.
  useEffect(() => {
    if (!pending || !ready) return;
    const what = pending;
    setPending(null);
    if (what === 'print') setTimeout(() => window.print(), 300); else pdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, ready]);
  const printAll = (what) => { setMode('athletes'); setSelected(withWorkIds); setPending(what); };

  async function pdf() {
    setBusy(true);
    try { await exportPdfMany(sheets, { showNotes: prefs.showNotes, poster: mode === 'posters' }); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="page print-center">
      <div className="no-print">
        <div className="page-head">
          <div><h1>Print</h1><p className="muted">{mode === 'posters'
            ? 'Posters print a skill list for a group (for example Apples or Oranges) without any athlete’s name or progress.'
            : mode === 'overview' ? 'One sheet listing every athlete and what they’re working on.'
              : 'Pick the athletes for today’s practice. Each athlete prints on their own page.'}</p></div>
          <div className="btn-group">
            <button className="btn primary" disabled={!ready} onClick={() => window.print()}><Icon name="print" /> Print {count || ''}</button>
            {mode !== 'overview' && <button className="btn" disabled={!ready || busy} onClick={pdf}><Icon name="file" /> {busy ? 'Making PDF…' : 'Save as PDF'}</button>}
          </div>
        </div>

        <div className="card print-all">
          <div className="grow"><b>Print all assignments</b><small className="muted">Every athlete with a workout ({withWorkIds.length}), one checklist each.</small></div>
          <button className="btn" disabled={!withWorkIds.length || !!pending} onClick={() => printAll('print')}><Icon name="print" size={18} /> {pending === 'print' ? 'Getting ready…' : 'Print all'}</button>
          <button className="btn" disabled={!withWorkIds.length || !!pending || busy} onClick={() => printAll('pdf')}><Icon name="file" size={18} /> {pending === 'pdf' || busy ? 'Making PDF…' : 'PDF of all'}</button>
        </div>

        <div className="toolbar">
          <Seg value={mode} onChange={setMode} options={[{ value: 'athletes', label: 'Athlete checklists' }, { value: 'overview', label: 'Assignment overview' }, { value: 'posters', label: 'Posters' }]} />
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
        {mode === 'overview' && !withWorkIds.length && <Empty title="No assignments yet">Give athletes a workout in the Designer first.</Empty>}
        {mode === 'athletes' && selected.length === 0 && <Empty title="No athletes selected">Tap athletes above, or choose “Everyone with a workout”.</Empty>}
        {mode === 'posters' && posterSel.length === 0 && <Empty title="No posters selected">Tap a poster above.</Empty>}
      </div>

      <div className="print-preview">
        {mode === 'overview' && overviewReady && <Overview ids={withWorkIds} workouts={workouts} />}
        {mode !== 'overview' && sheets.map((d) => <PrintSheet key={d.athlete.id} data={d} skillById={app.skillById} showNotes={prefs.showNotes} poster={mode === 'posters'} hideCategories={String(d.athlete.id).startsWith('re:')} />)}
      </div>
    </div>
  );
}

/** One compact sheet: every athlete with a workout, by age, and the families they're working on. */
function Overview({ ids, workouts }) {
  const { athleteById, skillById, comboById, skills } = useApp();
  const rows = ids.map((id) => athleteById[id]).filter(Boolean)
    .sort((a, b) => (parseFloat(a.age) || 99) - (parseFloat(b.age) || 99) || a.name.localeCompare(b.name));
  return (
    <div className="print-sheet overview-sheet">
      <header className="ps-head">
        <div className="ps-brand"><img src="/icon.svg" alt="" /><div><strong>ROPEWORKS</strong><span>Training Studio</span></div></div>
        <div className="ps-who"><h1>Assignment overview</h1><span>{rows.length} athletes · {new Date().toLocaleDateString()}</span></div>
      </header>
      <table className="ov-table">
        <thead><tr><th>Athlete</th><th>Age</th><th>Working on (done / assigned)</th><th>Combos & routines</th><th>Done</th></tr></thead>
        <tbody>
          {rows.map((a) => {
            const w = workouts[a.id];
            const done = new Set(w.progress.map((p) => `${p.item_type}:${p.item_id}`));
            const assigned = w.skill_ids.map((id) => skillById[id]).filter(Boolean);
            const fams = buildTree(assigned, skills).flatMap((c) => c.subs.flatMap((s) => s.families));
            const combos = w.combos.map((c) => comboById[c.id]).filter(Boolean);
            const total = assigned.length + combos.length;
            const n = assigned.filter((s) => done.has(`skill:${s.id}`)).length + combos.filter((c) => done.has(`combo:${c.id}`)).length;
            return (
              <tr key={a.id}>
                <td><b>{a.name}</b>{a.group_notes && <small> · {a.group_notes}</small>}</td>
                <td>{a.age}</td>
                <td>{fams.map((f) => `${f.name} ${f.skills.filter((s) => done.has(`skill:${s.id}`)).length}/${f.skills.length}`).join(' · ')}</td>
                <td>{combos.map((c) => c.name).join(', ')}</td>
                <td>{total ? Math.round((n / total) * 100) : 0}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
