import { useState } from 'react';
import { api } from '../api.js';
import { Confirm, Empty, Field, Icon, Modal, SearchBox, Seg, VideoModal, useApp } from '../components.jsx';
import SkillPicker from '../SkillPicker.jsx';
import { skillLabel } from '../util.js';

export default function Combos() {
  const { combos, skillById, run } = useApp();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [video, setVideo] = useState(null);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');

  const list = combos.filter((c) => (kind === 'all' || c.kind === kind) &&
    (!q || `${c.name} ${c.notes} ${c.id}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Combo Library</h1>
          <p className="muted">Optional application challenges. Link a combo to readiness checkpoints and it’s suggested automatically when that checkpoint is assigned — or keep it standalone and assign it directly.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ kind: kind === 'routine' ? 'routine' : 'combo' })}><Icon name="plus" /> New combo / routine</button>
      </div>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search combos…" />
        <Seg value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'combo', label: 'Combos' }, { value: 'routine', label: 'Routines' }]} />
      </div>
      {list.length === 0 && <Empty title="No combos yet">Create your first combo or routine.</Empty>}
      <div className="combo-grid">
        {list.map((c) => (
          <article key={c.id} className="card combo-card">
            <div className="combo-card-head">
              <span className={`kind ${c.kind}`}>{c.kind}</span>
              <span className="pill">{c.id}</span>
            </div>
            <h3>{c.name}</h3>
            {c.checkpoints.length ? (
              <div className="checkpoints">
                <small>Suggested after</small>
                {c.checkpoints.map((id) => (
                  <div key={id} className="checkpoint"><span className="pill">{id}</span> {skillById[id] ? `${skillById[id].family}: ${skillLabel(skillById[id])}` : 'missing skill'}</div>
                ))}
              </div>
            ) : <p className="muted small">Standalone — assign directly in the Workout Designer.</p>}
            {c.notes && <p className="notes">{c.notes}</p>}
            <div className="row-actions">
              {c.video_url && <button className="btn sm" onClick={() => setVideo(c)}><Icon name="play" size={18} /> Video</button>}
              <button className="btn ghost sm" onClick={() => setEditing(c)}><Icon name="edit" size={18} /> Edit</button>
              <button className="icon-btn danger" aria-label="Delete" onClick={() => setDeleting(c)}><Icon name="trash" /></button>
            </div>
          </article>
        ))}
      </div>
      {editing && <ComboEditor combo={editing} onClose={() => setEditing(null)} />}
      {deleting && <Confirm text={`Delete “${deleting.name}”? It will be removed from all athletes.`} onConfirm={() => run(() => api.deleteCombo(deleting.id), 'Combo deleted')} onClose={() => setDeleting(null)} />}
      {video && <VideoModal url={video.video_url} title={video.name} onClose={() => setVideo(null)} />}
    </div>
  );
}

function ComboEditor({ combo, onClose }) {
  const { run } = useApp();
  const isNew = !combo.id;
  const [f, setF] = useState({ name: '', kind: 'combo', checkpoints: [], video_url: '', notes: '', ...combo });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  async function save() {
    const body = { name: f.name, kind: f.kind, checkpoints: f.checkpoints, video_url: f.video_url, notes: f.notes };
    await run(() => (isNew ? api.createCombo(body) : api.updateCombo(combo.id, body)), isNew ? 'Combo created' : 'Combo saved');
    onClose();
  }
  return (
    <Modal title={isNew ? 'New combo or routine' : `Edit ${combo.id}`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim()} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name"><input value={f.name} onChange={set('name')} autoFocus={isNew} /></Field>
        <Field label="Type">
          <Seg value={f.kind} onChange={set('kind')} options={[{ value: 'combo', label: 'Combo' }, { value: 'routine', label: 'Routine' }]} />
        </Field>
        <Field label="Video link"><input type="url" inputMode="url" value={f.video_url} onChange={set('video_url')} placeholder="https://" /></Field>
      </div>
      <Field group label="Readiness checkpoints (optional)" hint="When any of these challenges is assigned, the athlete sees “Can you do this? Try this combo!”">
        <SkillPicker value={f.checkpoints} onChange={set('checkpoints')} placeholder="Search for a checkpoint skill…" />
      </Field>
      <Field label="Notes / choreography"><textarea rows={5} value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}
