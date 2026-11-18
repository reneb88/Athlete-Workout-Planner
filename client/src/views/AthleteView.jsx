import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Check, Disclosure, Empty, Icon, Seg, VideoModal, useApp, useOpenSet } from '../components.jsx';
import { buildTree, skillLabel } from '../util.js';
import { go } from '../App.jsx';
import { exportPdf } from '../pdf.js';

export default function AthleteView({ athleteId }) {
  const app = useApp();
  const { athleteById, skillById, comboById, combos, toast } = app;
  const athlete = athleteById[athleteId];
  const [w, setW] = useState(null);
  const [filter, setFilter] = useState('all');
  const [video, setVideo] = useState(null);
  const tree = useOpenSet();

  const load = useCallback(() => api.workout(athleteId).then(setW).catch((e) => toast(e.message, 'err')), [athleteId, toast]);
  useEffect(() => { if (athlete) load(); }, [athlete, load]);

  const done = useMemo(() => new Set((w?.progress || []).map((p) => `${p.item_type}:${p.item_id}`)), [w]);
  const assignedSkills = useMemo(() => (w?.skill_ids || []).map((id) => skillById[id]).filter(Boolean), [w, skillById]);
  const assignedCombos = useMemo(() => (w?.combos || []).map((c) => ({ ...comboById[c.id], source: c.source })).filter((c) => c.id), [w, comboById]);
  const activeComboIds = new Set(assignedCombos.map((c) => c.id));
  const comboByCheckpoint = useMemo(() => {
    const m = {};
    combos.forEach((c) => { if (activeComboIds.has(c.id)) c.checkpoints.forEach((s) => (m[s] ||= []).push(c)); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combos, w]);

  const shown = assignedSkills.filter((s) => filter === 'all' || (filter === 'todo') !== done.has(`skill:${s.id}`));
  const nodes = buildTree(shown).filter((c) => c.subs.length);
  const families = nodes.flatMap((c) => c.subs.flatMap((s) => s.families.map((f) => ({ ...f, category: c.name, sub: s.name }))));

  // Families default to open on first view
  useEffect(() => { if (w) tree.setMany(families.map((f) => f.key), true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [w?.athlete_id]);

  if (!athlete) return <div className="page"><Empty title="Athlete not found"><a href="#/athletes">Back to athletes</a></Empty></div>;
  if (!w) return <div className="loading">Loading…</div>;

  const total = assignedSkills.length + assignedCombos.length;
  const complete = assignedSkills.filter((s) => done.has(`skill:${s.id}`)).length + assignedCombos.filter((c) => done.has(`combo:${c.id}`)).length;
  const pct = total ? Math.round((complete / total) * 100) : 0;

  async function toggle(type, id, on) {
    // optimistic update
    setW((x) => ({ ...x, progress: on ? [...x.progress, { item_type: type, item_id: id, completed_at: new Date().toISOString() }] : x.progress.filter((p) => !(p.item_type === type && p.item_id === id)) }));
    try { setW(await api.setProgress(athleteId, type, id, on)); app.reload(); } catch (e) { toast(e.message, 'err'); load(); }
  }

  const routines = assignedCombos.filter((c) => c.kind === 'routine');
  const comboList = assignedCombos.filter((c) => c.kind !== 'routine');

  return (
    <div className="page athlete-view">
      <div className="athlete-hero no-print">
        <button className="btn ghost sm back" onClick={() => go('athletes')}><Icon name="chevron" size={18} /> Athletes</button>
        <div className="hero-row">
          <div>
            <p className="eyebrow">Ropeworks training plan</p>
            <h1>{athlete.name}</h1>
            <p className="muted">{[athlete.age && `Age ${athlete.age}`, athlete.group_notes].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="ring" style={{ '--p': pct }} aria-label={`${pct}% complete`}><span>{pct}%</span><small>{complete}/{total}</small></div>
        </div>
        <div className="toolbar">
          <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'todo', label: 'To do' }, { value: 'done', label: 'Done' }]} />
          <div className="btn-group">
            <button className="btn ghost sm" onClick={() => tree.setMany(families.map((f) => f.key), true)}>Expand all</button>
            <button className="btn ghost sm" onClick={() => tree.setOpen(new Set())}>Collapse all</button>
            <button className="btn sm" onClick={() => window.print()}><Icon name="print" size={18} /> Print</button>
            <button className="btn sm" onClick={() => exportPdf({ athlete, skills: assignedSkills, combos: assignedCombos, done, comboByCheckpoint })}><Icon name="file" size={18} /> PDF</button>
            <button className="btn ghost sm" onClick={() => go('designer', athleteId)}>Edit workout</button>
          </div>
        </div>
      </div>

      {total === 0 && <Empty title="Nothing assigned yet">Use the Workout Designer to assign challenges to {athlete.name}.</Empty>}

      <div className="no-print">
        {families.length === 0 && assignedSkills.length > 0 && <Empty title={filter === 'done' ? 'Nothing checked off yet' : 'Everything is done — nice work!'} />}
        {families.map((f) => {
          const n = f.skills.length;
          const allSkillsInFam = assignedSkills.filter((s) => s.category === f.category && s.subcategory === f.sub && s.family === f.name);
          const d = allSkillsInFam.filter((s) => done.has(`skill:${s.id}`)).length;
          return (
            <Disclosure key={f.key} level={2} open={tree.isOpen(f.key)} onToggle={() => tree.toggle(f.key)} className={`fam-card cat-${f.category.toLowerCase()}`}
              header={<><div className="fam-title"><h3>{f.name}</h3><small>{f.category} › {f.sub}</small></div>
                <span className={`count ${d === allSkillsInFam.length ? 'done' : ''}`}>{d}/{allSkillsInFam.length}</span></>}>
              <ul className="check-list">
                {f.skills.slice(0, n).map((s) => {
                  const on = done.has(`skill:${s.id}`);
                  return (
                    <li key={s.id}>
                      <div className={`check-item ${on ? 'on' : ''}`} onClick={() => toggle('skill', s.id, !on)}>
                        <Check size="lg" checked={on} onChange={(v) => toggle('skill', s.id, v)} label={skillLabel(s)} />
                        <div className="grow">
                          <div className="ci-name">{s.name}{s.target && <span className="target">{s.target}</span>}</div>
                          {s.teaching_notes && <div className="ci-notes">{s.teaching_notes}</div>}
                        </div>
                        {s.video_url && <button className="icon-btn accent lg" aria-label="Watch demo" onClick={(e) => { e.stopPropagation(); setVideo({ url: s.video_url, title: skillLabel(s) }); }}><Icon name="play" /></button>}
                      </div>
                      {comboByCheckpoint[s.id]?.map((c) => {
                        const cOn = done.has(`combo:${c.id}`);
                        return (
                          <div key={c.id} className={`combo-callout ${cOn ? 'on' : ''}`}>
                            <Icon name="bolt" />
                            <div className="grow">
                              <div className="cs-title">Can you do this? Try this combo!</div>
                              <div className="cs-name">{c.name}</div>
                            </div>
                            {c.video_url && <button className="icon-btn accent" aria-label="Watch combo" onClick={() => setVideo({ url: c.video_url, title: c.name })}><Icon name="play" /></button>}
                            <Check checked={cOn} onChange={(v) => toggle('combo', c.id, v)} label={`Completed ${c.name}`} tone="orange" />
                          </div>
                        );
                      })}
                    </li>
                  );
                })}
              </ul>
            </Disclosure>
          );
        })}

        {assignedCombos.length > 0 && (
          <section className="card combos-section">
            <h2><Icon name="bolt" /> Combos & routines <span className="count">optional</span></h2>
            {[['Combos', comboList], ['Routines', routines]].map(([label, list]) => list.length > 0 && (
              <div key={label}>
                <h3>{label}</h3>
                <ul className="check-list">
                  {list.filter((c) => filter === 'all' || (filter === 'todo') !== done.has(`combo:${c.id}`)).map((c) => {
                    const on = done.has(`combo:${c.id}`);
                    return (
                      <li key={c.id}>
                        <div className={`check-item ${on ? 'on' : ''}`} onClick={() => toggle('combo', c.id, !on)}>
                          <Check size="lg" checked={on} onChange={(v) => toggle('combo', c.id, v)} label={c.name} tone="orange" />
                          <div className="grow">
                            <div className="ci-name">{c.name}</div>
                            {c.checkpoints.length > 0 && <div className="ci-notes">Ready after: {c.checkpoints.map((id) => skillById[id] ? `${skillById[id].family} – ${skillLabel(skillById[id])}` : id).join('; ')}</div>}
                            {c.notes && <div className="ci-notes">{c.notes}</div>}
                          </div>
                          {c.video_url && <button className="icon-btn accent lg" aria-label="Watch demo" onClick={(e) => { e.stopPropagation(); setVideo({ url: c.video_url, title: c.name }); }}><Icon name="play" /></button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>

      <PrintSheet athlete={athlete} skills={assignedSkills} combos={assignedCombos} done={done} comboByCheckpoint={comboByCheckpoint} skillById={skillById} />
      {video && <VideoModal url={video.url} title={video.title} onClose={() => setVideo(null)} />}
    </div>
  );
}

/** Print-only branded checklist (everything expanded). */
function PrintSheet({ athlete, skills, combos, done, comboByCheckpoint, skillById }) {
  const nodes = buildTree(skills).filter((c) => c.subs.length);
  return (
    <div className="print-sheet">
      <header className="ps-head">
        <div className="ps-brand"><img src="/icon.svg" alt="" /><div><strong>ROPEWORKS</strong><span>Training Studio</span></div></div>
        <div className="ps-who"><h1>{athlete.name}</h1><span>{[athlete.age && `Age ${athlete.age}`, athlete.group_notes, new Date().toLocaleDateString()].filter(Boolean).join(' · ')}</span></div>
      </header>
      {nodes.map((c) => (
        <section key={c.key} className={`ps-cat cat-${c.name.toLowerCase()}`}>
          <h2>{c.name}</h2>
          {c.subs.flatMap((s) => s.families.map((f) => (
            <div key={f.key} className="ps-fam">
              <h3>{f.name} <small>{s.name}</small></h3>
              <ul>
                {f.skills.map((sk) => (
                  <li key={sk.id}>
                    <span className={`ps-box ${done.has(`skill:${sk.id}`) ? 'on' : ''}`} />
                    <span>{skillLabel(sk)}</span>
                    {comboByCheckpoint[sk.id]?.map((cb) => <em key={cb.id} className="ps-combo">⚡ Can you do this? Try this combo: {cb.name}</em>)}
                  </li>
                ))}
              </ul>
            </div>
          )))}
        </section>
      ))}
      {combos.length > 0 && (
        <section className="ps-cat">
          <h2>Combos & routines</h2>
          <ul>
            {combos.map((c) => (
              <li key={c.id}><span className={`ps-box ${done.has(`combo:${c.id}`) ? 'on' : ''}`} /><span>{c.name} <small>({c.kind}{c.checkpoints.length ? ` · after ${c.checkpoints.map((id) => skillById[id]?.name || id).join(', ')}` : ''})</small></span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
