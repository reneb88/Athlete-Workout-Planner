import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Check, Confirm, Disclosure, Empty, FamilySelect, Field, Icon, Modal, ReTags, SearchBox, Seg, VideoModal, useApp, useOpenSet } from '../components.jsx';
import SkillPicker from '../SkillPicker.jsx';
import FamilyVideo from '../FamilyVideo.jsx';
import { duplicateSkill } from '../duplicate.js';
import { CATEGORIES, REQUIRED_ELEMENTS, reList, buildTree, buildsOnMap, familyHomes, familyKey, familyName, familySkills, homeOf, isVariant, matchesSearch, skillLabel } from '../util.js';

export default function Library() {
  const { skills, combos, run } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [flag, setFlag] = useState('all');
  const [editing, setEditing] = useState(null); // skill object or {new defaults}
  const [deleting, setDeleting] = useState(null);
  const [video, setVideo] = useState(null);
  const [famVideo, setFamVideo] = useState(null);
  const tree = useOpenSet(['c:Manipulation']);
  const buildsOn = useMemo(() => buildsOnMap(skills), [skills]);

  const comboBySkill = useMemo(() => {
    const m = {};
    combos.forEach((c) => c.checkpoints.forEach((s) => (m[s] ||= []).push(c)));
    return m;
  }, [combos]);

  const homes = useMemo(() => familyHomes(skills), [skills]);
  const filtered = useMemo(() => skills.filter((s) =>
    (cat === 'all' || homeOf(homes, s)?.category === cat) && matchesSearch(s, q) &&
    (flag === 'all' || (flag === 'review' && s.review_notes) || (flag === 'video' && s.video_url) ||
      (flag === 'novideo' && !s.video_url) || (flag === 'combo' && comboBySkill[s.id]) || (flag === 're-any' && reList(s).length) || (flag.startsWith('re:') && reList(s).includes(flag.slice(3))))), [skills, homes, cat, q, flag, comboBySkill]);
  const nodes = useMemo(() => buildTree(filtered, skills).filter((c) => c.subs.length), [filtered, skills]);
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
          <optgroup label="Official required elements">
            <option value="re-any">Any required element</option>
            {REQUIRED_ELEMENTS.map((r) => <option key={r} value={`re:${r}`}>Required: {r}</option>)}
          </optgroup>
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
                  header={<><h4>{f.name}</h4>{buildsOn[familyKey(f.skills[0])] && <span className="tag back">Builds on {buildsOn[familyKey(f.skills[0])].join(', ')}</span>}<span className="count">{f.skills.length}</span>
                    <button className="btn ghost sm push" onClick={(e) => { e.stopPropagation(); setFamVideo(f); }}>
                      <Icon name="play" size={16} /> Family video</button>
                    <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setEditing({ category: c.name, subcategory: s.name, family: f.name }); }}>
                      <Icon name="plus" size={18} /> Add step</button></>}>
                  <ol className="skill-list">
                    {f.skills.map((sk, i) => (
                      <li key={sk.id} className="skill-row">
                        <span className="seq">{i + 1}</span>
                        <div className="skill-main" onClick={() => setEditing(sk)}>
                          <div className="skill-name">{sk.name}{sk.target && <span className="target">{sk.target}</span>}{isVariant(sk, f) && <span className="tag variant">{sk.category} · {sk.subcategory}</span>}</div>
                          <div className="skill-meta">
                            <span className="pill">{sk.id}</span>
                            {sk.related && <span className="tag">Related: {sk.related}</span>}
                            {sk.prerequisites.length > 0 && <span className="tag">Prereq: {sk.prerequisites.join(', ')}</span>}
                            {sk.teaching_notes && <span className="tag">Notes</span>}
                            {sk.review_notes && <span className="tag warn">Review</span>}
                            <ReTags skill={sk} />
                            {sk.leads_to && <span className="tag next">→ Leads to {familyName(sk.leads_to)}</span>}
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
                          <button className="icon-btn" aria-label={`Duplicate ${sk.id}`} title="Duplicate (copy right below)"
                            onClick={async () => setEditing(await duplicateSkill(run, skills, sk))}><Icon name="copy" /></button>
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
      {famVideo && <FamilyVideo family={famVideo} onClose={() => setFamVideo(null)} />}
    </div>
  );
}

export function SkillEditor({ skill, onClose }) {
  const { skills, combos, run } = useApp();
  const isNew = !skill.id;
  const [f, setF] = useState({
    category: 'Manipulation', subcategory: '', family: '', name: '', target: '', level: '', sequence: '',
    prerequisites: [], related: '', video_url: '', teaching_notes: '', common_mistakes: '', review_notes: '', leads_to: '', required_elements: '', ...skill,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const subs = [...new Set(skills.filter((s) => s.category === f.category).sort((a, b) => a.sort_order - b.sort_order).map((s) => s.subcategory).filter(Boolean))];
  // Any family can be chosen: a family is one progression across categories (e.g. 360 doubles belong to 360).
  const homes = familyHomes(skills);
  const fams = [...homes.values()].map((h) => h.name).sort((a, b) => a.localeCompare(b));
  // Steps already in the chosen family, so a new line can go in the right place.
  const famSteps = f.family.trim() ? familySkills(skills, f.family).filter((s) => s.id !== skill.id) : [];
  const [after, setAfter] = useState('end');
  // Combos & routines this trick unlocks (stored on the combo as a readiness checkpoint).
  const [comboIds, setComboIds] = useState(() => combos.filter((c) => skill.id && c.checkpoints.includes(skill.id)).map((c) => c.id));

  async function save() {
    const body = { ...f };
    if (body.sequence === '' || body.sequence === undefined) delete body.sequence;
    delete body.id; delete body.sort_order;
    const saved = await run(() => (isNew ? api.createSkill(body) : api.updateSkill(skill.id, body)), isNew ? `“${f.name}” added to ${f.family || 'the library'}` : 'Challenge saved');
    if (isNew && after !== 'end' && famSteps.length) {
      const ids = famSteps.map((x) => x.id);
      ids.splice(after === 'start' ? 0 : ids.indexOf(after) + 1, 0, saved.id);
      await run(() => api.reorderSkills(ids));
    }
    // Sync combo checkpoints with the boxes ticked here.
    const sid = isNew ? saved.id : skill.id;
    for (const c of combos) {
      const has = c.checkpoints.includes(sid);
      const want = comboIds.includes(c.id);
      if (has !== want) {
        await run(() => api.updateCombo(c.id, { checkpoints: want ? [...c.checkpoints, sid] : c.checkpoints.filter((x) => x !== sid) }));
      }
    }
    onClose();
  }

  return (
    <Modal title={isNew ? 'Add challenge' : `Edit ${skill.id}`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        {(!f.name.trim() || !f.family.trim()) && <span className="muted small">{!f.family.trim() ? 'Choose a skill family' : 'Type the challenge name'} to save</span>}
        <button className="btn primary" disabled={!f.name.trim() || !f.category || !f.family.trim()} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Master category">
          <select className="select" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value, subcategory: '' }))}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Subcategory">
          <PickOrNew value={f.subcategory} options={subs} placeholder="New subcategory name" what="subcategory"
            onChange={(v) => setF((x) => ({ ...x, subcategory: v }))} />
        </Field>
        <Field label="Skill family">
          <PickOrNew value={f.family} options={fams} placeholder="New family name" what="family"
            onChange={(v) => {
              const h = homes.get(v.trim().toLowerCase());
              // New step with no subcategory yet: start from where the family lives (change it for a double, etc.)
              setF((x) => ({ ...x, family: v, ...(isNew && h && !x.subcategory ? { category: h.category, subcategory: h.subcategory } : {}) }));
              setAfter('end');
            }} />
        </Field>
        <Field label="Challenge / progression step"><input value={f.name} onChange={set('name')} autoFocus={isNew && !!skill.family} placeholder="e.g. Toad double" /></Field>
        {(() => {
          const same = famSteps.find((x) => x.name.trim().toLowerCase() === f.name.trim().toLowerCase()
            && (x.target || '').trim().toLowerCase() === (f.target || '').trim().toLowerCase());
          return f.name.trim() && same ? (
            <p className="banner warn" style={{ gridColumn: '1 / -1' }}>
              {f.family} already has a step called “{skillLabel(same)}” (step {famSteps.indexOf(same) + 1}). Is this a duplicate?
            </p>
          ) : null;
        })()}
        {isNew && famSteps.length > 0 && (
          <Field label="Where in the progression?">
            <select className="select block" value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="end">At the end (after step {famSteps.length})</option>
              <option value="start">At the start (step 1)</option>
              {famSteps.slice(0, -1).map((x, i) => <option key={x.id} value={x.id}>After step {i + 1}: {skillLabel(x)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Target"><input value={f.target} onChange={set('target')} placeholder="e.g. 10 jumps" /></Field>
        <Field label="Level"><input value={f.level} onChange={set('level')} placeholder="optional" /></Field>
        {!isNew && (
          <Field label="Sequence" hint="Or use the arrows in the library">
            <input type="number" inputMode="numeric" value={f.sequence} onChange={set('sequence')} />
          </Field>
        )}
        <Field label="Related manipulation"><input value={f.related} onChange={set('related')} /></Field>
        <Field label="Video link" hint="YouTube, Vimeo or a direct .mp4 link">
          <input type="url" inputMode="url" value={f.video_url} onChange={set('video_url')} placeholder="https://" />
        </Field>
      </div>
      <Field group label="Prerequisites" hint="Search, then tick as many skills as you like — or tick a whole family.">
        <SkillPicker value={f.prerequisites} onChange={set('prerequisites')} exclude={skill.id} placeholder="Search for a prerequisite skill…" />
      </Field>
      <Field group label="Official required element (rules)" hint="For competition routines — separate from the teaching category above. Pick any that apply.">
        <div className="re-pick">
          {REQUIRED_ELEMENTS.map((r) => {
            const on = reList(f).includes(r);
            return (
              <label key={r} className="opt">
                <Check checked={on} label={r} onChange={() => setF((x) => {
                  const cur = reList(x);
                  return { ...x, required_elements: (on ? cur.filter((y) => y !== r) : [...cur, r]).join(', ') };
                })} /> {r}
              </label>
            );
          })}
        </div>
      </Field>
      <Field label="Leads to (next skill family)" hint="For “Try …” steps: when this step is assigned, the coach is offered this family’s whole progression.">
        <FamilySelect value={f.leads_to} onChange={set('leads_to')} skills={skills} exclude={f.family} />
      </Field>
      <div className="form-grid two">
        <Field label="Teaching notes / cues"><textarea rows={4} value={f.teaching_notes} onChange={set('teaching_notes')} /></Field>
        <Field label="Common mistakes"><textarea rows={4} value={f.common_mistakes} onChange={set('common_mistakes')} /></Field>
      </div>
      <Field label="Review notes (coach only)"><input value={f.review_notes} onChange={set('review_notes')} /></Field>
      <Field group label="Leads to combos & routines" hint="When this trick is assigned, these are suggested: “Can you do this? Try this combo!” (Same as the readiness checkpoints in the Combo Library.)">
        <div className="chips">
          {comboIds.map((id) => {
            const c = combos.find((x) => x.id === id);
            return c && (
              <span key={id} className="chip"><Icon name="bolt" size={14} /> {c.name} <small className="muted">({c.kind})</small>
                <button type="button" aria-label={`Remove ${c.name}`} onClick={() => setComboIds((x) => x.filter((y) => y !== id))}><Icon name="x" size={16} /></button>
              </span>
            );
          })}
        </div>
        <select className="select block" value="" onChange={(e) => e.target.value && setComboIds((x) => [...x, e.target.value])} aria-label="Add a combo or routine">
          <option value="">+ Link a combo or routine…</option>
          {combos.filter((c) => !comboIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
        </select>
      </Field>
    </Modal>
  );
}

/** Pick an existing name from a list, or choose "New…" and type one. */
function PickOrNew({ value, options, onChange, placeholder, what, disabled }) {
  const [typing, setTyping] = useState(() => !!value && !options.includes(value));
  if (typing || (value && !options.includes(value))) {
    return (
      <div className="pick-new">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={typing} />
        {options.length > 0 && <button type="button" className="btn ghost sm" onClick={() => { setTyping(false); onChange(''); }}>Choose from list</button>}
      </div>
    );
  }
  return (
    <select className="select block" value={value} disabled={disabled} onChange={(e) => {
      if (e.target.value === '__new') { setTyping(true); onChange(''); } else onChange(e.target.value);
    }}>
      <option value="">{disabled ? 'Choose a subcategory first' : `Choose a ${what}…`}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value="__new">＋ New {what}…</option>
    </select>
  );
}
