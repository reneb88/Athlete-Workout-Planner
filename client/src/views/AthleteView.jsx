import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Check, Disclosure, Empty, GifThumb, Icon, ReTags, Seg, VideoModal, useApp, useOpenSet } from '../components.jsx';
import { athleteView, dbDate, fmtDay, newSincePrint, prereqText, buildTree, buildsOnMap, famId, familyKey, familyName, familySkills, isVariant, skillLabel, splitVideo } from '../util.js';
import { go } from '../App.jsx';
import { exportPdf } from '../pdf.js';
import { PrintSheet } from '../printing.jsx';

export default function AthleteView({ athleteId }) {
  const app = useApp();
  const { athleteById, skillById, comboById, combos, toast } = app;
  const buildsOn = useMemo(() => buildsOnMap(app.skills), [app.skills]);
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
  const nodes = buildTree(shown, app.skills).filter((c) => c.subs.length);
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

  const board = athleteView(athlete, app.settings) === 'videos';
  const fresh = newSincePrint(w);
  const markPrinted = () => api.markPrinted([athlete.id]).then(load).catch(() => {});
  const setView = (v) => app.run(() => api.updateAthlete(athlete.id, { view_style: v }), v ? `${athlete.name}: ${v === 'videos' ? 'video board' : 'checklist'}` : `${athlete.name}: automatic by age`);

  return (
    <div className="page athlete-view">
      <div className="athlete-hero no-print">
        <button className="btn ghost sm back" onClick={() => go('athletes')}><Icon name="chevron" size={18} /> Athletes</button>
        <div className="hero-row">
          <div>
            <p className="eyebrow">{board ? 'Ropeworks video board' : 'Ropeworks training plan'}</p>
            <h1>{athlete.name}</h1>
            <p className="muted">{[athlete.age && `Age ${athlete.age}`, athlete.group_notes].filter(Boolean).join(' · ')}</p>
          </div>
          {!board && <div className="ring" style={{ '--p': pct }} aria-label={`${pct}% complete`}><span>{pct}%</span><small>{complete}/{total}</small></div>}
        </div>
        <div className="toolbar">
          <Seg value={board ? 'videos' : 'checklist'} onChange={setView} options={[{ value: 'checklist', label: 'Checklist' }, { value: 'videos', label: 'Video board' }]} />
          {athlete.view_style
            ? <button className="btn ghost sm" onClick={() => setView('')}>Use automatic (age {app.settings?.videoBoardAge ?? 13}+ = video board)</button>
            : <small className="muted auto-note">Automatic by age</small>}
          {!board && <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'todo', label: 'To do' }, { value: 'done', label: 'Done' }]} />}
          <div className="btn-group">
            {!board && <>
              <button className="btn ghost sm" onClick={() => tree.setMany(families.map((f) => f.key), true)}>Expand all</button>
              <button className="btn ghost sm" onClick={() => tree.setOpen(new Set())}>Collapse all</button>
            </>}
            <button className="btn sm" onClick={() => { window.print(); markPrinted(); }}><Icon name="print" size={18} /> Print</button>
            <button className="btn ghost sm" onClick={() => go('print', athleteId)}>Print options</button>
            <button className="btn sm" onClick={async () => { await exportPdf({ athlete, skills: assignedSkills, combos: assignedCombos, done, comboByCheckpoint, all: app.skills, videoBoard: board, fresh }); markPrinted(); }}><Icon name="file" size={18} /> PDF</button>
            <button className="btn ghost sm" onClick={() => go('designer', athleteId)}>Edit workout</button>
          </div>
        </div>
      </div>

      {total === 0 && <Empty title="Nothing assigned yet">Use the Workout Designer to assign challenges to {athlete.name}.</Empty>}

      {board ? (
        <VideoBoard skills={assignedSkills} all={app.skills} combos={assignedCombos} onPlay={setVideo} skillById={skillById} fresh={fresh} />
      ) : <div className="no-print">
        {families.length === 0 && assignedSkills.length > 0 && <Empty title={filter === 'done' ? 'Nothing checked off yet' : 'Everything is done — nice work!'} />}
        {groupBy(families, (f) => f.category).map(([cat, list]) => (
          <TypeSection key={cat} name={cat} count={`${list.length} famil${list.length === 1 ? 'y' : 'ies'}`}>
        {list.map((f) => {
          const n = f.skills.length;
          const allSkillsInFam = assignedSkills.filter((s) => famId(s) === famId(f.skills[0]));
          const d = allSkillsInFam.filter((s) => done.has(`skill:${s.id}`)).length;
          return (
            <Disclosure key={f.key} level={2} open={tree.isOpen(f.key)} onToggle={() => tree.toggle(f.key)} className={`fam-card cat-${f.category.toLowerCase()}`}
              header={<><div className="fam-title"><h3>{f.name}</h3><small>{f.category} › {f.sub}</small>
                  {buildsOn[familyKey(f.skills[0])] && <small className="builds-on">Builds on: {buildsOn[familyKey(f.skills[0])].join(', ')}</small>}</div>
                {(() => {
                  const bases = [...new Set(f.skills.map((x) => splitVideo(x.video_url).base).filter(Boolean))];
                  return bases.length === 1 && f.skills.filter((x) => x.video_url).length > 1 && (
                    <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setVideo({ url: bases[0], title: `${f.name} – whole video` }); }}>
                      <Icon name="play" size={16} /> Whole video</button>
                  );
                })()}
                <span className={`count ${d === allSkillsInFam.length ? 'done' : ''}`}>{d}/{allSkillsInFam.length}</span></>}>
              <ul className="check-list">
                {f.skills.slice(0, n).map((s) => {
                  const on = done.has(`skill:${s.id}`);
                  return (
                    <li key={s.id}>
                      <div className={`check-item ${on ? 'on' : ''}`} onClick={() => toggle('skill', s.id, !on)}>
                        <Check size="lg" checked={on} onChange={(v) => toggle('skill', s.id, v)} label={skillLabel(s)} />
                        <div className="grow">
                          <div className="ci-name">{s.name}{s.target && <span className="target">{s.target}</span>}{fresh.has(`skill:${s.id}`) && <span className="tag new-tag" title={`Added ${fmtDay(w.assigned_at[`skill:${s.id}`])}`}>NEW</span>}{isVariant(s, f) && <span className="tag variant">{s.subcategory || s.category}</span>}</div>
                          {s.teaching_notes && <div className="ci-notes">{s.teaching_notes}</div>}
                          {prereqText(s, skillById) && <div className="ci-prereq">Before this: {prereqText(s, skillById)}</div>}
                          {s.leads_to && <div className="ci-next">→ Next skill: {familyName(s.leads_to)}</div>}
                          {s.required_elements && <div className="skill-meta"><ReTags skill={s} /></div>}
                        </div>
                        <GifThumb url={s.gif_url} title={skillLabel(s)} size={52} />
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
          </TypeSection>
        ))}

        {assignedCombos.length > 0 && (
          <TypeSection name="Combos & routines" cls="combos" count={`${assignedCombos.length}`}>
          <section className="card combos-section">
            <p className="muted small">Optional — try these when you’re ready.</p>
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
                            {(c.checkpoints.length > 0 || c.after_combos?.length > 0) && <div className="ci-notes">Ready after: {[
                              ...c.checkpoints.map((id) => skillById[id] ? `${skillById[id].family} – ${skillLabel(skillById[id])}` : id),
                              ...(c.after_combos || []).map((id) => comboById[id]?.name || id)].join('; ')}</div>}
                            {assignedCombos.filter((n) => n.after_combos?.includes(c.id)).map((n) => (
                              <div key={n.id} className="ci-next combo-next"><Icon name="bolt" size={14} /> Can you do this? Try this {n.kind}: {n.name}</div>
                            ))}
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
          </TypeSection>
        )}
      </div>}

      <History w={w} lastPrinted={w.last_printed_at} />
      <PrintSheet data={{ athlete, skills: assignedSkills, combos: assignedCombos, done, comboByCheckpoint, fresh }} skillById={skillById} videoBoard={board} />
      {video && <VideoModal url={video.url} title={video.title} onClose={() => setVideo(null)} />}
    </div>
  );
}

/** Video board (older athletes): families as cards with the whole video and each skill's clip — no checklist. */
function VideoBoard({ skills, all, combos, onPlay, skillById, fresh = new Set() }) {
  const buildsOn = buildsOnMap(all);
  const fams = buildTree(skills, all).flatMap((c) => c.subs.flatMap((s) => s.families.map((f) => ({ ...f, cat: c.name, sub: s.name }))));
  const wholeOf = (f) => {
    const steps = familySkills(all, f.name);
    const bases = [...new Set(steps.map((x) => splitVideo(x.video_url).base).filter(Boolean))];
    return bases.length === 1 && steps.filter((x) => x.video_url).length > 1 ? bases[0] : '';
  };
  return (
    <div className="no-print">
      {groupBy(fams, (f) => f.cat).map(([cat, list]) => (
      <TypeSection key={cat} name={cat} count={`${list.length} famil${list.length === 1 ? 'y' : 'ies'}`}>
      <div className="vb-grid">
        {list.map((f) => {
          const whole = wholeOf(f);
          return (
            <article key={f.key} className={`card vb-card cat-${f.cat.toLowerCase()}`}>
              <div className="vb-head">
                <div className="grow"><h3>{f.name}</h3><small className="muted">{f.cat} › {f.sub}</small>
                  {buildsOn[familyKey(f.skills[0])] && <small className="builds-on vb-builds">Builds on: {buildsOn[familyKey(f.skills[0])].join(', ')}</small>}</div>
                {whole && <button className="btn primary sm" onClick={() => onPlay({ url: whole, title: `${f.name} – whole video` })}><Icon name="play" size={16} /> Whole video</button>}
              </div>
              <ul className="vb-list">
                {f.skills.map((s) => (
                  <li key={s.id}>
                    {s.video_url
                      ? <button className="vb-play" onClick={() => onPlay({ url: s.video_url, title: skillLabel(s) })} aria-label={`Watch ${skillLabel(s)}`}><Icon name="play" size={18} /></button>
                      : <span className="vb-play none" title="Video coming soon"><Icon name="play" size={18} /></span>}
                    <span className="grow">{s.name}{s.target && <span className="target">{s.target}</span>}{isVariant(s, f) && <span className="tag variant">{s.subcategory || s.category}</span>}{fresh.has(`skill:${s.id}`) && <span className="tag new-tag">NEW</span>}
                      {prereqText(s, skillById) && <small className="vb-prereq">Before this: {prereqText(s, skillById)}</small>}
                      {s.leads_to && <small className="vb-next">→ Next skill: {familyName(s.leads_to)}</small>}</span>
                    <GifThumb url={s.gif_url} title={skillLabel(s)} size={44} />
                    {!s.video_url && <small className="muted">video coming soon</small>}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      </TypeSection>
      ))}
      {combos.length > 0 && (
      <TypeSection name="Combos & routines" cls="combos" count={`${combos.length}`}>
      <div className="vb-grid">
          <article className="card vb-card vb-combos">
                        <ul className="vb-list">
              {combos.map((c) => (
                <li key={c.id}>
                  {c.video_url
                    ? <button className="vb-play" onClick={() => onPlay({ url: c.video_url, title: c.name })} aria-label={`Watch ${c.name}`}><Icon name="play" size={18} /></button>
                    : <span className="vb-play none"><Icon name="play" size={18} /></span>}
                  <span className="grow">{c.name} <small className="muted">({c.kind})</small></span>
                  {!c.video_url && <small className="muted">video coming soon</small>}
                </li>
              ))}
            </ul>
          </article>
      </div>
      </TypeSection>
      )}
      {fams.length === 0 && combos.length === 0 && <Empty title="Nothing assigned yet" />}
    </div>
  );
}

/** Dated log of what was added to / removed from this athlete's workout. */
function History({ w, lastPrinted }) {
  const [open, setOpen] = useState(false);
  const days = [];
  for (const h of w.history || []) {
    const day = fmtDay(h.at);
    let d = days[days.length - 1];
    if (!d || d.day !== day) { d = { day, added: [], removed: [] }; days.push(d); }
    d[h.action === 'removed' ? 'removed' : 'added'].push(h.item_name || h.item_id);
  }
  return (
    <section className="card history no-print">
      <div className="history-head" onClick={() => setOpen((x) => !x)} role="button" tabIndex={0}>
        <h2>Workout history</h2>
        <small className="muted">{lastPrinted ? `Last printed ${fmtDay(lastPrinted)}` : 'Not printed yet'}{w.history?.length ? ` · ${w.history.length} changes` : ''}</small>
        <span className="push">{open ? 'Hide' : 'Show'}</span>
      </div>
      {open && (days.length === 0 ? <p className="muted">No changes recorded yet. Changes are tracked from now on.</p> : (
        <ul className="history-list">
          {days.map((d) => (
            <li key={d.day}>
              <b>{d.day}</b>
              {d.added.length > 0 && <div className="h-added">+ Added: {d.added.join(', ')}</div>}
              {d.removed.length > 0 && <div className="h-removed">− Removed: {d.removed.join(', ')}</div>}
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

/** Keep order while grouping: [[key, items], …] */
function groupBy(list, keyOf) {
  const m = new Map();
  for (const x of list) { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m];
}

/** Collapsible section per type (Manipulation, Multiples, Power, Combos & routines). Remembered on this device. */
const TYPE_KEY = 'ropeworks.collapsedTypes';
function TypeSection({ name, count, cls, children }) {
  const [closed, setClosed] = useState(() => { try { return JSON.parse(localStorage.getItem(TYPE_KEY)) || []; } catch { return []; } });
  const open = !closed.includes(name);
  const toggle = () => {
    const next = open ? [...closed, name] : closed.filter((x) => x !== name);
    setClosed(next);
    try { localStorage.setItem(TYPE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return (
    <section className={`type-section cat-${cls || name.toLowerCase()}`}>
      <button type="button" className={`type-head ${open ? 'open' : ''}`} onClick={toggle} aria-expanded={open}>
        <span className="chev"><Icon name="chevron" /></span>
        <h2>{name}</h2>
        {count && <span className="count">{count}</span>}
        <small className="muted push">{open ? 'Hide' : 'Show'}</small>
      </button>
      {open && <div className="type-body">{children}</div>}
    </section>
  );
}
