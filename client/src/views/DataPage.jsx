import { useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, Seg, useApp } from '../components.jsx';

export default function DataPage() {
  const { skills, athletes, combos, templates, run } = useApp();
  const fileRef = useRef(null);
  const [mode, setMode] = useState('merge');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (mode === 'replace' && !window.confirm('Replace ALL library, roster, combo, assignment and progress data with this file?')) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const r = await run(() => api.importXlsx(buf, mode), `Imported ${file.name}`);
      setResult(r.counts);
    } catch { /* toast shown */ } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Import / Export</h1><p className="muted">Move data in and out of Ropeworks Training Studio as an Excel / Google Sheets compatible .xlsx file.</p></div></div>
      <div className="data-grid">
        <section className="card">
          <h2>Export</h2>
          <p>Downloads one workbook with the Master Library, Athlete Roster, Combo Library, every athlete’s assignments, progress and templates.</p>
          <p className="muted small">Currently: {skills.length} challenges · {athletes.length} athletes · {combos.length} combos · {templates.length} templates</p>
          <a className="btn primary" href="/api/export.xlsx" download><Icon name="file" /> Download spreadsheet</a>
        </section>
        <section className="card">
          <h2>Import</h2>
          <p>Accepts the original <i>Ropeworks Athlete Workout Designer</i> workbook or a file exported from this app. Sheets are matched by name (Master Library, Athlete Roster, Combo Library, Assignments, Progress, Templates) and columns by header.</p>
          <Seg value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Merge (update by ID)' }, { value: 'replace', label: 'Replace everything' }]} />
          <p className="muted small">{mode === 'merge'
            ? 'Rows with an existing ID are updated, new IDs are added. Nothing is deleted.'
            : 'Clears the current library, roster, combos, assignments and progress first. Export a backup before you do this.'}</p>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onFile} />
          <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Importing…' : 'Choose .xlsx file'}</button>
          {result && (
            <p className="banner ok">Imported {result.skills} challenges, {result.athletes} athletes, {result.combos} combos, {result.assignments} assignments, {result.progress} progress marks, {result.templates} templates.</p>
          )}
        </section>
        <ChangePassword />
      </div>
    </div>
  );
}

function ChangePassword() {
  const { toast } = useApp();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    if (f.next !== f.again) { toast('The new passwords don’t match', 'err'); return; }
    setBusy(true);
    try {
      await api.changePassword(f.current, f.next);
      toast('Password changed. Other devices will need to sign in again.');
      setF({ current: '', next: '', again: '' });
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <h2>Coach password</h2>
      <form className="pw-form" onSubmit={save}>
        <input type="password" placeholder="Current password" autoComplete="current-password" value={f.current} onChange={set('current')} aria-label="Current password" />
        <input type="password" placeholder="New password" autoComplete="new-password" value={f.next} onChange={set('next')} aria-label="New password" />
        <input type="password" placeholder="New password again" autoComplete="new-password" value={f.again} onChange={set('again')} aria-label="New password again" />
        <button className="btn" disabled={busy || !f.current || !f.next}>Change password</button>
      </form>
    </section>
  );
}
