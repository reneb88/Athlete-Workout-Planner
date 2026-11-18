import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Confirm, Disclosure, Empty, Field, Icon, Modal, SearchBox, Seg, VideoModal, useApp, useOpenSet } from '../components.jsx';
import SkillPicker from '../SkillPicker.jsx';
import { CATEGORIES, buildTree, matchesSearch, skillLabel } from '../util.js';

export default function Library() {
  const { skills, combos, run } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [flag, setFlag] = useState('all');
  const [editing, setEditing] = useState(null); // skill object or {new defaults}
  const [deleting, setDeleting] = useState(null);
  const [video, setVideo] = useState(null);
  const tree = useOpenSet(['c:Manipulation']);

  const comboBySkill = useMemo(() => {
    const m = {};
    combos.forEach((c) => c.checkpoints.forEach((s) => (m[s] ||= []).push(c)));
    return m;
  }, [combos]);

  const filtered = useMemo(() => skills.filter((s) =>
    (cat === 'all' || s.category === cat) && matchesSearch(s, q) &&
    (flag === 'all' || (flag === 'review' && s.review_notes) || (flag === 'video' && s.video_url) ||
      (flag === 'novideo' && !s.video_url) || (flag === 'combo' && comboBySkill[s.id]))), [skills, cat, q, flag, comboBySkill]);
  const nodes = useMemo(() => buildTree(filtered).filter((c) => c.subs.length), [filtered]);
  const searching = q.trim() || flag !== 'all';
  const isOpen = (k) => searching || tree.isOpen(k);

  const allKeys = nodes.flatMap((c) => [c.key, ...c.subs.flatMap((s) => [s.key, ...s.families.map((f) => f.key)])]);

  async function move(family, idx, dir) {
    const ids = family.skills.map((s) => s.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await run(() => api.reorderSkills(ids));
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Master Library</h1>
          <p className="muted">{skills.length} challenges · {filtered.length !== skills.length ? `${filtered.length} shown` : 'all shown'}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ category: cat === 'all' ? 'Manipulation' : cat })}><Icon name="plus" /> Add challenge</button>
      </div>

      <div className="toolbar sticky">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, family, target, notes, ID…" />
        <Seg value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
        <select className="select" value={flag} onChange={(e) => setFlag(e.target.value)} aria-label="Filter">
          <option value="all">All challenges</option>
          <option value="review">Needs review</option>
          <option value="video">Has video</option>
          <option value="novideo">Missing video</option>
          <option value="combo">Combo checkpoints</option>
        </select>
        {!searching && (
          <div className="btn-group">
            <button className="btn ghost sm" onClick={() => tree.setMany(allKeys, true)}>Expand all</button>
            <button className="btn ghost sm" onClick={() => tree.setOpen(new Set())}>Collapse all</button>
          </div>
        )}
      </div>

      {nodes.length === 0 && <Empty title="No challenges match">Try a different search or filter.</Empty>}

      {nodes.map((c) => (
        <Disclosure key={c.key} level={0} open={isOpen(c.key)} onToggle={() => tree.toggle(c.key)}
          className={`cat-${c.name.toLowerCase()}`}
          header={<><h2>{c.name}</h2><span className="count">{c.subs.reduce((n, s) => n + s.families.reduce((m, f) => m + f.skills.length, 0), 0)}</span></>}>
          {c.subs.map((s) => (
            <Disclosure key={s.key} level={1} open={isOpen(s.key)} onToggle={() => tree.toggle(s.key)}
              header={<><h3>{s.name}</h3><span className="count">{s.families.reduce((m, f) => m + f.skills.length, 0)}</span></>}>
              {s.families.map((f) => (
                <Disclosure key={f.key} level={2} open={isOpen(f.key)} onToggle={() => tree.toggle(f.key)}
                  header={<><h4>{f.name}</h4><span className="count">{f.skills.length}</span>
                    <button className="btn ghost sm push" onClick={(e) => { e.stopPropagation(); setEditing({ category: c.name, subcategory: s.name, family: f.name }); }}>
                      <Icon name="plus" size={18} /> Add step</button></>}>
                  <ol className="skill-list">
                    {f.skills.map((sk, i) => (
                      <li key={sk.id} className="skill-row">
                        <span className="seq">{i + 1}</span>
                        <div className="skill-main" onClick={() => setEditing(sk)}>
                          <div className="skill-name">{sk.name}{sk.target && <span className="target">{sk.target}</span>}</div>
                          <div className="skill-meta">
                            <span className="pill">{sk.id}</span>
                            {sk.related && <span className="tag">Related: {sk.related}</span>}
                            {sk.prerequisites.length > 0 && <span className="tag">Prereq: {sk.prerequisites.join(', ')}</span>}
                            {sk.teaching_notes && <span className="tag">Notes</span>}
                            {sk.review_notes && <span className="tag warn">Review</span>}
                            {comboBySkill[sk.id]?.map((cb) => <span key={cb.id} className="tag combo"><Icon name="bolt" size={14} /> {cb.name}</span>)}
                          </div>
                        </div>
                        <div className="row-actions">
                          {sk.video_url && <button className="icon-btn accent" aria-label="Play video" onClick={() => setVideo(sk)}><Icon name="play" /></button>}
                          {!searching && <>
                            <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(f, i, -1)}><Icon name="up" /></button>
                            <button className="icon-btn" aria-label="Move down" disabled={i === f.skills.length - 1} onClick={() => move(f, i, 1)}><Icon name="down" /></button>
                          </>}
                          <button className="icon-btn" aria-label="Edit" onClick={() => setEditing(sk)}><Icon name="edit" /></button>
                          <button className="icon-btn danger" aria-label="Delete" onClick={() => setDeleting(sk)}><Icon name="trash" /></button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Disclosure>
              ))}
            </Disclosure>
          ))}
        </Disclosure>
      ))}

      {editing && <SkillEditor skill={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Confirm text={`Delete “${skillLabel(deleting)}” (${deleting.id}) from ${deleting.family}? It will be removed from every athlete’s workout.`}
          onConfirm={() => run(() => api.deleteSkill(deleting.id), 'Challenge deleted')} onClose={() => setDeleting(null)} />
      )}
      {video && <VideoModal url={video.video_url} title={skillLabel(video)} onClose={() => setVideo(null)} />}
    </div>
  );
}

function SkillEditor({ skill, onClose }) {
  const { skills, combos, run } = useApp();
  const isNew = !skill.id;
  const [f, setF] = useState({
    category: 'Manipulation', subcategory: '', family: '', name: '', target: '', level: '', sequence: '',
    prerequisites: [], related: '', video_url: '', teaching_notes: '', common_mistakes: '', review_notes: '', ...skill,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target ? e.target.value : e }));
  const subs = [...new Set(skills.filter((s) => s.category === f.category).map((s) => s.subcategory))];
  const fams = [...new Set(skills.filter((s) => s.category === f.category && (!f.subcategory || s.subcategory === f.subcategory)).map((s) => s.family))];
  const linked = combos.filter((c) => c.checkpoints.includes(skill.id));

  async function save() {
    const body = { ...f };
    if (body.sequence === '' || body.sequence === undefined) delete body.sequence;
    delete body.id; delete body.sort_order;
    await run(() => (isNew ? api.createSkill(body) : api.updateSkill(skill.id, body)), isNew ? 'Challenge added' : 'Challenge saved');
    onClose();
  }

  return (
    <Modal title={isNew ? 'Add challenge' : `Edit ${skill.id}`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!f.name.trim() || !f.category} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Master category">
          <select className="select" value={f.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Subcategory">
          <input list="dl-subs" value={f.subcategory} onChange={set('subcategory')} placeholder="e.g. Leg Overs" />
          <datalist id="dl-subs">{subs.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Skill family">
          <input list="dl-fams" value={f.family} onChange={set('family')} placeholder="e.g. Toad" />
          <datalist id="dl-fams">{fams.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Challenge / progression step"><input value={f.name} onChange={set('name')} autoFocus={isNew} /></Field>
        <Field label="Target"><input value={f.target} onChange={set('target')} placeholder="e.g. 10 jumps" /></Field>
        <Field label="Level"><input value={f.level} onChange={set('level')} placeholder="optional" /></Field>
        <Field label="Sequence" hint={isNew ? 'Leave blank to add at the end of the family' : 'Or use the arrows in the library'}>
          <input type="number" inputMode="numeric" value={f.sequence} onChange={set('sequence')} />
        </Field>
        <Field label="Related manipulation"><input value={f.related} onChange={set('related')} /></Field>
        <Field label="Video link" hint="YouTube, Vimeo or a direct .mp4 link">
          <input type="url" inputMode="url" value={f.video_url} onChange={set('video_url')} placeholder="https://" />
        </Field>
      </div>
      <Field label="Prerequisites">
        <SkillPicker value={f.prerequisites} onChange={set('prerequisites')} exclude={skill.id} placeholder="Search for a prerequisite skill…" />
      </Field>
      <div className="form-grid two">
        <Field label="Teaching notes / cues"><textarea rows={4} value={f.teaching_notes} onChange={set('teaching_notes')} /></Field>
        <Field label="Common mistakes"><textarea rows={4} value={f.common_mistakes} onChange={set('common_mistakes')} /></Field>
      </div>
      <Field label="Review notes (coach only)"><input value={f.review_notes} onChange={set('review_notes')} /></Field>
      {linked.length > 0 && (
        <p className="muted"><Icon name="bolt" size={16} /> Readiness checkpoint for: {linked.map((c) => c.name).join(', ')}</p>
      )}
    </Modal>
  );
}
