import { useState } from 'react';
import { api } from '../api.js';
import { Confirm, Empty, Field, Icon, Modal, SearchBox, Seg, useApp } from '../components.jsx';
import { go } from '../App.jsx';

export default function Athletes() {
  const { athletes, assignmentCounts, run } = useApp();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [show, setShow] = useState('all');
  const [byAge, setByAge] = useState(false);
  const hasWork = (a) => (assignmentCounts[a.id] || 0) > 0;
  const without = athletes.filter((a) => !hasWork(a));
  const list = athletes.filter((a) => (!q || `${a.name} ${a.group_notes} ${a.age} ${a.id}`.toLowerCase().includes(q.toLowerCase()))
    && (show === 'all' || (show === 'none' ? !hasWork(a) : hasWork(a))));
  // Group by age (youngest first; no age last)
  const ageGroups = [...list.reduce((m, a) => {
    const k = String(a.age || '').trim() || '—';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
    return m;
  }, new Map())].sort(([a], [b]) => (a === '—') - (b === '—') || (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b));
  const grouped = byAge || show === 'none';
  const Row = ({ a }) => (
    <div className="card roster-row">
      <button className="roster-main" onClick={() => go('athlete', a.id)}>
        <span className={`avatar ${hasWork(a) ? '' : 'no-work'}`}>{a.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>
        <span><b>{a.name}</b><small>{[a.age && `Age ${a.age}`, a.group_notes, hasWork(a) ? `${assignmentCounts[a.id]} challenges` : 'No workout yet'].filter(Boolean).join(' · ')}</small></span>
      </button>
      <div className="row-actions">
        <button className="btn sm" onClick={() => go('athlete', a.id)}><Icon name="user" size={18} /> Athlete view</button>
        <button className="btn ghost sm" onClick={() => go('designer', a.id)}>Design workout</button>
        <button className="icon-btn" aria-label="Edit" onClick={() => setEditing(a)}><Icon name="edit" /></button>
        <button className="icon-btn danger" aria-label="Delete" onClick={() => setDeleting(a)}><Icon name="trash" /></button>
      </div>
    </div>
  );
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Athletes</h1><p className="muted">{athletes.length} athletes on the roster. Open an athlete to see their checklist and track progress.</p></div>
        <button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" /> Add athlete</button>
      </div>
      {without.length > 0 && show !== 'none' && (
        <div className="banner warn">
          <span>{without.length} athlete{without.length === 1 ? ' doesn’t' : 's don’t'} have a workout yet.</span>
          <button className="btn sm" onClick={() => setShow('none')}>Show them by age</button>
        </div>
      )}
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search athletes or groups…" />
        <Seg value={show} onChange={setShow} options={[
          { value: 'all', label: `All (${athletes.length})` },
          { value: 'none', label: `No workout yet (${without.length})` },
          { value: 'has', label: `Has a workout (${athletes.length - without.length})` },
        ]} />
        {show !== 'none' && <label className="opt small-opt"><input type="checkbox" checked={byAge} onChange={(e) => setByAge(e.target.checked)} /> Group by age</label>}
      </div>
      {list.length === 0 && <Empty title="No athletes found" />}
      {grouped ? ageGroups.map(([age, group]) => {
        const need = group.filter((a) => !hasWork(a));
        return (
          <section key={age} className="age-group">
            <div className="age-head">
              <h2>{age === '—' ? 'No age entered' : `Age ${age}`}</h2>
              <span className="count">{group.length} athlete{group.length === 1 ? '' : 's'}{show !== 'none' && need.length ? ` · ${need.length} without a workout` : ''}</span>
              {need.length > 0 && (
                <button className="btn sm push" onClick={() => go('designer', need.map((a) => a.id).join(','))}>
                  Design a workout for {need.length === 1 ? need[0].name : `these ${need.length}`}
                </button>
              )}
            </div>
            <div className="roster">{group.map((a) => <Row key={a.id} a={a} />)}</div>
          </section>
        );
      }) : (
        <div className="roster">{list.map((a) => <Row key={a.id} a={a} />)}</div>
      )}
      {editing && <AthleteEditor athlete={editing} onClose={() => setEditing(null)} />}
      {deleting && <Confirm text={`Remove ${deleting.name} from the roster? Their workout and progress will be deleted.`}
        onConfirm={() => run(() => api.deleteAthlete(deleting.id), 'Athlete removed')} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function AthleteEditor({ athlete, onClose }) {
  const { run } = useApp();
  const isNew = !athlete.id;
  const [f, setF] = useState({ name: '', age: '', group_notes: '', ...athlete });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    await run(() => (isNew ? api.createAthlete(f) : api.updateAthlete(athlete.id, f)), isNew ? 'Athlete added' : 'Athlete saved');
    onClose();
  }
  return (
    <Modal title={isNew ? 'Add athlete' : `Edit ${athlete.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim()} onClick={save}>Save</button></>}>
      <Field label="Name"><input value={f.name} onChange={set('name')} autoFocus /></Field>
      <div className="form-grid two">
        <Field label="Age"><input inputMode="numeric" value={f.age} onChange={set('age')} /></Field>
        <Field label="Group / notes" hint="e.g. Competitive team, Rec class, Camp"><input value={f.group_notes} onChange={set('group_notes')} /></Field>
      </div>
    </Modal>
  );
}
