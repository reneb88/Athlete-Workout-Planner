import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Check, Confirm, Disclosure, Empty, Field, GifThumb, Icon, Modal, ReTags, Seg, SortableList, VideoModal, useApp, useOpenSet } from '../components.jsx';
import { athleteView, dbDate, fmtDay, newSincePrint, prereqText, buildTree, buildsOnMap, famId, familyKey, familyName, familySkills, isVariant, skillLabel, splitVideo } from '../util.js';
import { go } from '../App.jsx';
import { exportPdf } from '../pdf.js';
import { PrintSheet } from '../printing.jsx';
import SkillPicker from '../SkillPicker.jsx';

export default function AthleteView({ athleteId, publicToken, initial }) {
  // Opened through an athlete's private link: their own view, nothing to edit except ticking things off.
  const readOnly = !!publicToken;
  const app = useApp();
  const { athleteById, skillById, comboById, combos, toast } = app;
  const buildsOn = useMemo(() => buildsOnMap(app.skills), [app.skills]);
  const athlete = athleteById[athleteId];
  const [w, setW] = useState(initial || null);
  const [filter, setFilter] = useState('all');
  const [video, setVideo] = useState(null);
  const tree = useOpenSet();

  const load = useCallback(() => (publicToken ? api.publicView(publicToken).then((v) => setW(v.workout)) : api.workout(athleteId).then(setW))
    .catch((e) => toast(e.message, 'err')), [athleteId, toast, publicToken]);
  useEffect(() => { if (athlete && !initial) load(); }, [athlete, load, initial]);

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
    try {
      if (publicToken) setW(await api.publicProgress(publicToken, type, id, on));
      else { setW(await api.setProgress(athleteId, type, id, on)); app.reload(); }
    } catch (e) { toast(e.message, 'err'); load(); }
  }

  const routines = assignedCombos.filter((c) => c.kind === 'routine');
  const comboList = assignedCombos.filter((c) => c.kind !== 'routine');

  const board = athleteView(athlete, app.settings) === 'videos';
  const fresh = newSincePrint(w);
  const markPrinted = () => (readOnly ? null : api.markPrinted([athlete.id]).then(load).catch(() => {}));
  const setView = (v) => app.run(() => api.updateAthlete(athlete.id, { view_style: v }), v ? `${athlete.name}: ${v === 'videos' ? 'video board' : 'checklist'}` : `${athlete.name}: automatic by age`);

  return (
    <div className="page athlete-view">
      <div className="athlete-hero no-print">
        {!readOnly && <button className="btn ghost sm back" onClick={() => go('athletes')}><Icon name="chevron" size={18} /> Athletes</button>}
        <div className="hero-row">
          <div>
            <p className="eyebrow">{board ? 'Ropeworks video board' : 'Ropeworks training plan'}</p>
            <h1>{athlete.name}</h1>
            <p className="muted">{[athlete.age && `Age ${athlete.age}`, athlete.group_notes].filter(Boolean).join(' · ')}</p>
          </div>
          {!board && <div className="ring" style={{ '--p': pct }} aria-label={`${pct}% complete`}><span>{pct}%</span><small>{complete}/{total}</small></div>}
        </div>
        <div className="toolbar">
          {!readOnly && <>
            <Seg value={board ? 'videos' : 'checklist'} onChange={setView} options={[{ value: 'checklist', label: 'Checklist' }, { value: 'videos', label: 'Video board' }]} />
            {athlete.view_style
              ? <button className="btn ghost sm" onClick={() => setView('')}>Use automatic (age {app.settings?.videoBoardAge ?? 13}+ = video board)</button>
              : <small className="muted auto-note">Automatic by age</small>}
          </>}
          {!board && <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'todo', label: 'To do' }, { value: 'done', label: 'Done' }]} />}
          <div className="btn-group">
            {!board && <>
              <button className="btn ghost sm" onClick={() => tree.setMany(families.map((f) => f.key), true)}>Expand all</button>
              <button className="btn ghost sm" onClick={() => tree.setOpen(new Set())}>Collapse all</button>
            </>}
            <button className="btn sm" onClick={() => { window.print(); markPrinted(); }}><Icon name="print" size={18} /> Print</button>
            {!readOnly && <button className="btn ghost sm" onClick={() => go('print', athleteId)}>Print options</button>}
            {!readOnly && <ShareButton athlete={athlete} />}
            <button className="btn sm" onClick={async () => { await exportPdf({ athlete, skills: assignedSkills, combos: assignedCombos, done, comboByCheckpoint, all: app.skills, videoBoard: board, fresh, notes: w.notes }); markPrinted(); }}><Icon name="file" size={18} /> PDF</button>
            {!readOnly && <button className="btn ghost sm" onClick={() => go('designer', athleteId)}>Edit workout</button>}
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

      <CoachNotes athlete={athlete} notes={w.notes || []} onChange={(notes) => setW((x) => ({ ...x, notes }))} onPlay={setVideo} readOnly={readOnly} />
      {!readOnly && <History w={w} lastPrinted={w.last_printed_at} />}
      <PrintSheet data={{ athlete, skills: assignedSkills, combos: assignedCombos, done, comboByCheckpoint, fresh, notes: w.notes }} skillById={skillById} videoBoard={board} />
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

const NOTE_GROUPS = [
  { kind: 'skill', title: 'Working skills', hint: 'A new trick you’re working on, with coaching notes.' },
  { kind: 'combo', title: 'Working combos', hint: 'A combination — one move per line, in order.' },
  { kind: 'routine', title: 'Routine', hint: 'Their routine written out in order — one element per line.' },
];
const linesOf = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);

/** Coach notes on an athlete's profile: working skills, working combos and their routine (in order). */
function CoachNotes({ athlete, notes, onChange, onPlay, readOnly }) {
  const { run } = useApp();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showDone, setShowDone] = useState({});
  const [picking, setPicking] = useState(false);
  // Add many at once: library skills become working skills; library combos/routines keep their moves and video.
  const addMany = async ({ skills: sIds, combos: cIds }, skillById, comboById) => {
    const have = (kind, title, comboId) => notes.some((n) => (comboId && n.combo_id === comboId)
      || (n.kind === kind && n.title.trim().toLowerCase() === title.trim().toLowerCase()));
    const todo = [
      ...sIds.map((id) => skillById[id]).filter(Boolean).map((s) => ({ kind: 'skill', title: `${s.family}: ${skillLabel(s)}`, notes: s.teaching_notes || '', video_url: s.video_url || '' })),
      ...cIds.map((id) => comboById[id]).filter(Boolean).map((c) => ({ kind: c.kind === 'routine' ? 'routine' : 'combo', title: c.name, notes: c.notes || '', video_url: c.video_url || '', combo_id: c.id })),
    ].filter((n) => !have(n.kind, n.title, n.combo_id));
    if (!todo.length) { setPicking(false); return; }
    let list = notes;
    for (const n of todo) list = await api.saveNote(athlete.id, n);
    onChange(list);
    await run(() => Promise.resolve(), `Added ${todo.length} to ${athlete.name.split(' ')[0]}’s coach notes`);
    setPicking(false);
  };
  const save = async ({ toLibrary, updateLibrary, ...note }) => {
    // Combos and routines can live in the Combo Library too, so they can be given to other athletes later.
    if (note.kind !== 'skill') {
      const lib = { name: note.title.trim() || 'Untitled', kind: note.kind === 'routine' ? 'routine' : 'combo', notes: note.notes, video_url: note.video_url || '' };
      if (!note.combo_id && toLibrary) note.combo_id = (await run(() => api.createCombo(lib), `“${lib.name}” added to the Combo Library`)).id;
      else if (note.combo_id && updateLibrary) await run(() => api.updateCombo(note.combo_id, lib), 'Combo Library updated too');
    }
    const list = await run(() => api.saveNote(athlete.id, note, note.id), note.id ? 'Saved' : 'Added');
    onChange(list);
  };
  if (readOnly) {
    const active = notes.filter((n) => !n.done);
    if (!active.length) return null;
    return (
      <section className="card coach-notes no-print">
        <div className="cn-head"><h2>What I’m working on</h2></div>
        {NOTE_GROUPS.map((g) => {
          const items = active.filter((n) => n.kind === g.kind);
          return items.length > 0 && (
            <div key={g.kind} className={`cn-group cn-${g.kind}`}>
              <div className="cn-group-head"><h3>{g.kind === 'routine' ? 'My routine' : g.title}</h3></div>
              {items.map((n) => <NoteCard key={n.id} n={n} onPlay={onPlay} readOnly />)}
            </div>
          );
        })}
      </section>
    );
  }
  return (
    <section className="card coach-notes no-print">
      <div className="cn-head">
        <h2>Coach notes</h2>
        <small className="muted">What {athlete.name.split(' ')[0]} is working on right now</small>
        <button className="btn primary sm push" onClick={() => setPicking('skills')}><Icon name="plus" size={16} /> Add from library</button>
      </div>
      {NOTE_GROUPS.map((g) => {
        const items = notes.filter((n) => n.kind === g.kind);
        const active = items.filter((n) => !n.done);
        const doneItems = items.filter((n) => n.done);
        return (
          <div key={g.kind} className={`cn-group cn-${g.kind}`}>
            <div className="cn-group-head">
              <h3>{g.title} {active.length > 0 && <span className="count">{active.length}</span>}</h3>
              {g.kind === 'skill' ? (
                <span className="btn-group">
                  <button className="btn ghost sm" onClick={() => setEditing({ kind: 'skill', title: '', notes: '', video_url: '' })}>Write one</button>
                  <button className="btn sm" onClick={() => setPicking('skills')}><Icon name="plus" size={16} /> Add skills</button>
                </span>
              ) : (
                <button className="btn sm" onClick={() => setEditing({ kind: g.kind, title: '', notes: '', video_url: '' })}><Icon name="plus" size={16} /> Add</button>
              )}
            </div>
            {active.length === 0 && <p className="muted small">{g.hint}</p>}
            {active.map((n) => <NoteCard key={n.id} n={n} onEdit={() => setEditing(n)} onDelete={() => setDeleting(n)} onPlay={onPlay}
              onDone={async (v) => onChange(await run(() => api.noteDone(n.id, v), v ? 'Marked done' : 'Back to working on'))} />)}
            {doneItems.length > 0 && (
              <button className="btn ghost sm" onClick={() => setShowDone((x) => ({ ...x, [g.kind]: !x[g.kind] }))}>
                {showDone[g.kind] ? 'Hide' : 'Show'} done ({doneItems.length})
              </button>
            )}
            {showDone[g.kind] && doneItems.map((n) => <NoteCard key={n.id} n={n} onEdit={() => setEditing(n)} onDelete={() => setDeleting(n)} onPlay={onPlay}
              onDone={async (v) => onChange(await run(() => api.noteDone(n.id, v)))} />)}
          </div>
        );
      })}
      {picking && <LibraryPicker notes={notes} initialTab={picking} onAdd={addMany} onClose={() => setPicking(false)} />}
      {editing && <NoteEditor note={editing} onSave={async (n) => { await save(n); setEditing(null); }} onClose={() => setEditing(null)} />}
      {deleting && <Confirm text={`Delete “${deleting.title || 'this note'}”?`}
        onConfirm={async () => onChange(await run(() => api.deleteNote(deleting.id), 'Deleted'))} onClose={() => setDeleting(null)} />}
    </section>
  );
}

function NoteCard({ n, onEdit, onDelete, onDone, onPlay, readOnly }) {
  const lines = linesOf(n.notes);
  if (n.kind === 'skill') {
    // Working skills: a compact focus list, one line each
    return (
      <div className={`cn-skill-row ${n.done ? 'done' : ''}`}>
        {!readOnly && <Check checked={n.done} onChange={onDone} label={`Done: ${n.title}`} />}
        <div className="grow">
          <b>{n.title}</b>
          {n.notes && <div className="cn-skill-note">{n.notes}</div>}
        </div>
        {n.video_url && <button className="icon-btn accent" aria-label="Watch video" onClick={() => onPlay({ url: n.video_url, title: n.title })}><Icon name="play" /></button>}
        {!readOnly && <button className="icon-btn" aria-label="Edit note" onClick={onEdit}><Icon name="edit" /></button>}
        {!readOnly && <button className="icon-btn danger" aria-label="Delete note" onClick={onDelete}><Icon name="trash" /></button>}
      </div>
    );
  }
  return (
    <article className={`cn-card ${n.done ? 'done' : ''}`}>
      <div className="cn-card-head">
        {!readOnly && <Check checked={n.done} onChange={onDone} label={`Done: ${n.title}`} />}
        <b className="grow">{n.title || (n.kind === 'routine' ? 'Routine' : 'Untitled')}{n.combo_id && <span className="tag lib-tag" title="Saved in the Combo Library">In Combo Library</span>}</b>
        {n.video_url && <button className="icon-btn accent" aria-label="Watch video" onClick={() => onPlay({ url: n.video_url, title: n.title })}><Icon name="play" /></button>}
        {!readOnly && <button className="icon-btn" aria-label="Edit note" onClick={onEdit}><Icon name="edit" /></button>}
        {!readOnly && <button className="icon-btn danger" aria-label="Delete note" onClick={onDelete}><Icon name="trash" /></button>}
      </div>
      {n.kind === 'skill'
        ? (n.notes && <p className="cn-text">{n.notes}</p>)
        : lines.length > 0 && <ol className="cn-moves">{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>}
      {!readOnly && <small className="muted">Updated {fmtDay(n.updated_at)}</small>}
    </article>
  );
}

function NoteEditor({ note, onSave, onClose }) {
  const { skills, combos, comboById } = useApp();
  const [f, setF] = useState({ combo_id: '', ...note, toLibrary: !note.combo_id, updateLibrary: false });
  const linked = f.combo_id ? comboById[f.combo_id] : null;
  const nameClash = !f.combo_id && f.toLibrary && f.title.trim() && combos.find((c) => c.name.trim().toLowerCase() === f.title.trim().toLowerCase());
  const fromLibrary = (id) => {
    const c = comboById[id];
    if (!c) return;
    setF((x) => ({ ...x, kind: c.kind === 'routine' ? 'routine' : 'combo', title: c.name, notes: c.notes || '', video_url: c.video_url || x.video_url, combo_id: c.id, toLibrary: false, updateLibrary: false }));
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const ordered = f.kind !== 'skill';
  const options = useMemo(() => [...new Set(skills.map((s) => (s.name.toLowerCase() === s.family.toLowerCase() ? skillLabel(s) : `${s.family} – ${skillLabel(s)}`)))].sort(), [skills]);
  return (
    <Modal title={note.id ? 'Edit note' : 'New note'} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!f.title.trim() && !f.notes.trim()} onClick={() => onSave(f)}>Save</button></>}>
      <Field label="Type">
        <Seg value={f.kind} onChange={set('kind')} options={[{ value: 'skill', label: 'Working skill' }, { value: 'combo', label: 'Combo' }, { value: 'routine', label: 'Routine' }]} />
      </Field>
      {ordered && !note.id && combos.length > 0 && (
        <Field label="Start from the Combo Library (optional)" hint="Fills in the title, moves and video — then change anything for this athlete.">
          <select className="select block" value={linked ? f.combo_id : ''} onChange={(e) => fromLibrary(e.target.value)}>
            <option value="">— write a new one —</option>
            {combos.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
          </select>
        </Field>
      )}
      <Field label="Title"><input value={f.title} onChange={set('title')} autoFocus
        placeholder={f.kind === 'routine' ? 'e.g. Single rope freestyle 2027' : f.kind === 'combo' ? 'e.g. Toad combo' : 'e.g. Triple under'} /></Field>
      {ordered ? (
        <Field group label="Moves in order" hint="Drag ⋮⋮ or use the arrows to reorder. Shown numbered on the athlete’s page and printout.">
          <MovesBuilder value={f.notes} onChange={(v) => setF((x) => ({ ...x, notes: v }))} skillOptions={options} />
        </Field>
      ) : (
        <Field label="Notes" hint="Coaching cues, what to focus on, goals…">
          <textarea rows={5} value={f.notes} onChange={set('notes')} placeholder="Keep elbows in, land on the balls of the feet…" />
        </Field>
      )}
      <Field label="Video link (optional)"><input type="url" inputMode="url" value={f.video_url || ''} onChange={set('video_url')} placeholder="https://vimeo.com/…" /></Field>
      {ordered && !linked && (
        <label className="opt">
          <input type="checkbox" checked={f.toLibrary} onChange={(e) => setF((x) => ({ ...x, toLibrary: e.target.checked }))} />
          Also save to the Combo Library, so I can give it to other athletes later
        </label>
      )}
      {nameClash && <p className="banner warn small">The Combo Library already has “{nameClash.name}”. Pick it under “Start from the Combo Library”, or give this one a different title.</p>}
      {ordered && linked && (
        <label className="opt">
          <input type="checkbox" checked={f.updateLibrary} onChange={(e) => setF((x) => ({ ...x, updateLibrary: e.target.checked }))} />
          Also update “{linked.name}” in the Combo Library with these changes
        </label>
      )}
    </Modal>
  );
}

/** Pick several skills, combos and routines from the library at once. */
function LibraryPicker({ notes, onAdd, onClose, initialTab = 'skills' }) {
  const { combos, skillById, comboById } = useApp();
  const [tab, setTab] = useState(initialTab);
  const [skillIds, setSkillIds] = useState([]);
  const [comboIds, setComboIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const already = (c) => notes.some((n) => n.combo_id === c.id || n.title.trim().toLowerCase() === c.name.trim().toLowerCase());
  const list = combos.filter((c) => (tab === 'routines' ? c.kind === 'routine' : c.kind !== 'routine'));
  const total = skillIds.length + comboIds.length;
  const toggle = (id) => setComboIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <Modal title="Add from the library" onClose={onClose} wide
      footer={<><span className="muted small grow">{total ? `${skillIds.length} skills · ${comboIds.length} combos/routines selected` : 'Tick as many as you like'}</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!total || busy} onClick={async () => { setBusy(true); try { await onAdd({ skills: skillIds, combos: comboIds }, skillById, comboById); } finally { setBusy(false); } }}>
          {busy ? 'Adding…' : `Add ${total || ''}`}</button></>}>
      <Seg value={tab} onChange={setTab} options={[
        { value: 'skills', label: `Working skills${skillIds.length ? ` (${skillIds.length})` : ''}` },
        { value: 'combos', label: `Combos${comboIds.filter((id) => comboById[id]?.kind !== 'routine').length ? ` (${comboIds.filter((id) => comboById[id]?.kind !== 'routine').length})` : ''}` },
        { value: 'routines', label: `Routines${comboIds.filter((id) => comboById[id]?.kind === 'routine').length ? ` (${comboIds.filter((id) => comboById[id]?.kind === 'routine').length})` : ''}` },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'skills' && (
          <Field group label="Search and tick skills" hint="Tick single skills, or a whole family. Each one becomes a Working skill (with its video and teaching notes).">
            <SkillPicker value={skillIds} onChange={setSkillIds} placeholder="Search skills, e.g. toad, cross, triple…" />
          </Field>
        )}
        {tab !== 'skills' && (list.length === 0
          ? <p className="muted">No {tab} in the Combo Library yet.</p>
          : (
            <div className="lib-pick">
              {list.map((c) => {
                const on = comboIds.includes(c.id);
                const dup = already(c);
                return (
                  <div key={c.id} className={`picker-item ${on ? 'on' : ''} ${dup ? 'dup' : ''}`} onClick={() => !dup && toggle(c.id)}>
                    <Check checked={dup || on} onChange={() => !dup && toggle(c.id)} label={c.name} />
                    <span className="grow"><b>{c.name}</b>{c.notes && <small className="muted"> · {c.notes.split('\n').filter(Boolean).length} moves</small>}</span>
                    {dup && <small className="muted">already added</small>}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </Modal>
  );
}

/** Routine / combo builder: one row per move — type it, pick a skill, or insert a combo. */
function MovesBuilder({ value, onChange, skillOptions }) {
  const { combos } = useApp();
  const lines = String(value || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const [text, setText] = useState('');
  const [skill, setSkill] = useState('');
  const [comboId, setComboId] = useState('');
  const [asText, setAsText] = useState(false);
  const setLines = (ls) => onChange(ls.map((x) => x.trim()).filter(Boolean).join('\n'));
  const add = (...items) => setLines([...lines, ...items]);
  const move = (i, d) => { const ls = [...lines]; const j = i + d; if (j < 0 || j >= ls.length) return; [ls[i], ls[j]] = [ls[j], ls[i]]; setLines(ls); };
  const combo = combos.find((c) => c.id === comboId);
  const comboMoves = combo ? String(combo.notes || '').split('\n').map((x) => x.trim()).filter(Boolean) : [];
  if (asText) {
    return (
      <div>
        <textarea rows={10} value={value} onChange={(e) => onChange(e.target.value)} placeholder={'One move per line'} />
        <button type="button" className="btn ghost sm" onClick={() => { setLines(lines); setAsText(false); }}>Back to the builder</button>
      </div>
    );
  }
  const ids = lines.map((_, i) => `m${i}`);
  return (
    <div className="moves">
      {lines.length === 0 ? <p className="muted small">No moves yet — add them below.</p> : (
        <SortableList className="moves-list" items={ids} getId={(x) => x}
          onReorder={(newIds) => setLines(newIds.map((id) => lines[Number(id.slice(1))]))}
          renderItem={(id, i, { rowProps, grip }) => (
            <li key={`${id}:${lines[i]}`} {...rowProps} className={`move-row ${rowProps.className || ''}`}>
              {grip}
              <span className="move-n">{i + 1}</span>
              <input className="move-text" defaultValue={lines[i]} aria-label={`Move ${i + 1}`}
                onBlur={(e) => { if (e.target.value.trim() !== lines[i]) { const ls = [...lines]; ls[i] = e.target.value; setLines(ls); } }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={18} /></button>
              <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={18} /></button>
              <button type="button" className="icon-btn sm danger" aria-label={`Remove move ${i + 1}`} onClick={() => setLines(lines.filter((_, k) => k !== i))}><Icon name="x" size={18} /></button>
            </li>
          )} />
      )}
      <div className="move-add">
        <div className="move-add-row">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a move (e.g. Opening pose, freeze 4 counts)…"
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { e.preventDefault(); add(text); setText(''); } }} />
          <button type="button" className="btn sm" disabled={!text.trim()} onClick={() => { add(text); setText(''); }}><Icon name="plus" size={16} /> Add</button>
        </div>
        <div className="move-add-row">
          <input list="builder-skill-list" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="…or pick a skill from the library"
            onKeyDown={(e) => { if (e.key === 'Enter' && skill.trim()) { e.preventDefault(); add(skill); setSkill(''); } }} />
          <datalist id="builder-skill-list">{skillOptions.map((o) => <option key={o} value={o} />)}</datalist>
          <button type="button" className="btn sm" disabled={!skill.trim()} onClick={() => { add(skill); setSkill(''); }}><Icon name="plus" size={16} /> Add skill</button>
        </div>
        {combos.length > 0 && (
          <div className="move-add-row">
            <select className="select" value={comboId} onChange={(e) => setComboId(e.target.value)} aria-label="Pick a combo">
              <option value="">…or pick a combo or routine</option>
              {combos.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
            </select>
            <button type="button" className="btn sm" disabled={!combo} onClick={() => { add(combo.name); setComboId(''); }}>Add as one move</button>
            <button type="button" className="btn sm" disabled={!comboMoves.length} onClick={() => { add(...comboMoves); setComboId(''); }}>
              Add its {comboMoves.length || ''} moves</button>
          </div>
        )}
        <button type="button" className="btn ghost sm" onClick={() => setAsText(true)}>Edit as text</button>
      </div>
    </div>
  );
}

/** Coach: get the athlete's private link (and QR code) to send them. */
function ShareButton({ athlete }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const make = async (regenerate = false) => {
    const { token } = await api.shareLink(athlete.id, regenerate);
    const url = `${window.location.origin}/#/a/${token}`;
    setLink(url);
    const QR = (await import('qrcode')).default;
    setQr(await QR.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b1e3a' } }));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast('Press and hold the link to copy it'); }
  };
  return (
    <>
      <button className="btn sm" onClick={() => { setOpen(true); make().catch((e) => toast(e.message, 'err')); }}><Icon name="link" size={18} /> Share with athlete</button>
      {open && (
        <Modal title={`${athlete.name}’s private link`} onClose={() => setOpen(false)}>
          <p>Send this to {athlete.name.split(' ')[0]} (or their parent). It opens <b>only their page</b> — their checklist or video board and what they’re working on — with no password. They can tick things off but can’t change anything else.</p>
          {link ? (
            <>
              <div className="share-link"><input readOnly value={link} onFocus={(e) => e.target.select()} /><button className="btn primary sm" onClick={copy}>Copy</button></div>
              {qr && <img className="share-qr" src={qr} alt="QR code for the link" />}
              <p className="muted small">Print the QR code or show it on your screen — they scan it with their phone camera.</p>
              <button className="btn ghost sm danger-text" onClick={() => setConfirmNew(true)}>Make a new link (the old one stops working)</button>
            </>
          ) : <p className="muted">Making the link…</p>}
          {confirmNew && <Confirm text="Make a new link? The old link will stop working for anyone who has it." confirmLabel="Make new link"
            onConfirm={() => make(true).then(() => toast('New link made')).catch((e) => toast(e.message, 'err'))} onClose={() => setConfirmNew(false)} />}
        </Modal>
      )}
    </>
  );
}
