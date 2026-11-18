import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Check, Confirm, Disclosure, Empty, Field, Icon, Modal, ReTags, SearchBox, Seg, useApp, useOpenSet } from '../components.jsx';
import { CATEGORIES, buildTree, buildsOnMap, familyHomes, familyKey, familyName, familySkills, familyWhere, homeOf, isVariant, idsOfCat, idsOfFamily, idsOfSub, matchesSearch, skillLabel } from '../util.js';
import { go } from '../App.jsx';
import { SkillEditor } from './Library.jsx';
import { duplicateSkill } from '../duplicate.js';

const emptyWork = () => ({ skills: new Set(), manual: new Set(), dismissed: new Set() });

// The Designer's work-in-progress is kept on this device, so leaving the page (to fix something on the
// Sheet, say) or closing the browser doesn't lose it.
const DRAFT_KEY = 'ropeworks.designerDraft';
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; } };
const writeDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } };

export default function Designer({ initialAthlete }) {
  const app = useApp();
  const { skills, combos, athletes, templates, skillById, comboById, athleteById, assignmentCounts, run, toast } = app;

  // Restore the draft unless the coach came here to design a different athlete's workout (and nothing is unsaved).
  const [draft] = useState(() => {
    const d = readDraft();
    if (!d) return null;
    if (initialAthlete && !d.dirty && (d.selected || []).join(',') !== initialAthlete) return null;
    return d;
  });
  const keep = (ids, byId) => (ids || []).filter((id) => byId[id]);
  const [selected, setSelected] = useState(() => (draft ? keep(draft.selected, athleteById)
    : (initialAthlete || '').split(',').filter((id) => athleteById[id])));
  const [work, setWork] = useState(() => (draft ? {
    skills: new Set(keep(draft.skills, skillById)), manual: new Set(keep(draft.manual, comboById)), dismissed: new Set(keep(draft.dismissed, comboById)),
  } : emptyWork()));
  const [loadedFrom, setLoadedFrom] = useState(() => draft?.loadedFrom ?? null); // label of what's in the working set
  const [dirty, setDirty] = useState(() => !!draft?.dirty);
  const [q, setQ] = useState(() => draft?.q || '');
  const [cat, setCat] = useState(() => draft?.cat || 'all');
  const [athQ, setAthQ] = useState('');
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null); // skill being edited / added from here
  const tree = useOpenSet(draft?.open || []);
  const lastAuto = useRef(draft && draft.selected?.length === 1 ? draft.selected[0] : null);
  const autoLoaded = useRef(!!draft?.autoLoaded); // working set is just an athlete's saved workout, shown automatically
  const [templateId, setTemplateId] = useState(() => draft?.templateId ?? null); // template currently loaded for editing
  const [batch, setBatch] = useState(() => draft?.batch ?? null); // athletes from the last group save, for one-by-one adjustments
  const [adjusted, setAdjusted] = useState(() => new Set(draft?.adjusted || []));

  // Keep the draft up to date.
  useEffect(() => {
    writeDraft({
      selected, skills: [...work.skills], manual: [...work.manual], dismissed: [...work.dismissed],
      loadedFrom, dirty, q, cat, open: [...tree.open], autoLoaded: autoLoaded.current,
      templateId, batch, adjusted: [...adjusted],
    });
  }, [selected, work, loadedFrom, dirty, q, cat, tree.open, templateId, batch, adjusted]);

  // A restored single-athlete view that had no unsaved changes is refreshed from the server.
  useEffect(() => {
    if (draft && !draft.dirty && selected.length === 1) { lastAuto.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- derived combo state -----
  const checkpointMap = useMemo(() => {
    const m = {};
    combos.forEach((c) => c.checkpoints.forEach((s) => (m[s] ||= []).push(c)));
    return m;
  }, [combos]);
  const suggested = useMemo(() => {
    const out = new Map(); // comboId -> [labels of the skills / combos that triggered it]
    const add = (cid, label) => { if (!out.has(cid)) out.set(cid, []); if (!out.get(cid).includes(label)) out.get(cid).push(label); };
    for (const sid of work.skills) for (const c of checkpointMap[sid] || []) add(c.id, `${skillById[sid]?.family} – ${skillLabel(skillById[sid])}`);
    // combos ready after other combos the athlete will have (chains)
    const has = (id) => work.manual.has(id) || (out.has(id) && !work.dismissed.has(id));
    for (let changed = true; changed;) {
      changed = false;
      for (const c of combos) {
        for (const a of c.after_combos || []) {
          if (has(a) && !out.has(c.id)) { add(c.id, comboById[a]?.name || a); changed = true; }
        }
      }
    }
    return out;
  }, [work.skills, work.manual, work.dismissed, checkpointMap, combos, skillById, comboById]);
  const activeCombos = useMemo(() => {
    const s = new Set(work.manual);
    for (const id of suggested.keys()) if (!work.dismissed.has(id)) s.add(id);
    return s;
  }, [work.manual, work.dismissed, suggested]);

  const buildsOn = useMemo(() => buildsOnMap(skills), [skills]);

  // "Try …" steps that lead to another family: offer that family's whole progression.
  const nextUps = useMemo(() => {
    const seen = new Map();
    for (const id of work.skills) {
      const sk = skillById[id];
      if (!sk?.leads_to || seen.has(sk.leads_to)) continue;
      const ids = familySkills(skills, sk.leads_to).map((x) => x.id);
      if (ids.length) seen.set(sk.leads_to, { key: sk.leads_to, from: sk, ids });
    }
    return [...seen.values()];
  }, [work.skills, skillById, skills]);

  // ----- loading -----
  async function loadAthlete(id, label) {
    const w = await api.workout(id);
    setWork({
      skills: new Set(w.skill_ids),
      manual: new Set(w.combos.filter((c) => c.source === 'manual').map((c) => c.id)),
      dismissed: new Set(w.dismissed_ids),
    });
    setLoadedFrom(label ?? `${athleteById[id]?.name}’s saved workout`);
    autoLoaded.current = !label;
    setTemplateId(null);
    setDirty(false);
  }
  function loadTemplate(t) {
    setWork({ skills: new Set(t.skill_ids.filter((id) => skillById[id])), manual: new Set(t.combo_ids.filter((id) => comboById[id])), dismissed: new Set(t.dismissed_ids) });
    setLoadedFrom(`Template: ${t.name}`);
    setTemplateId(t.id);
    setDirty(true);
  }

  // When exactly one athlete is selected and nothing unsaved is in progress, show their workout.
  useEffect(() => {
    if (selected.length === 1 && !dirty && lastAuto.current !== selected[0]) {
      lastAuto.current = selected[0];
      loadAthlete(selected[0]).catch((e) => toast(e.message, 'err'));
    }
    if (selected.length !== 1) lastAuto.current = null;
    // Picking several athletes starts a fresh group workout instead of reusing one athlete's saved plan.
    if (selected.length > 1 && !dirty && autoLoaded.current) {
      autoLoaded.current = false;
      setWork(emptyWork());
      setLoadedFrom(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, dirty]);

  // ----- editing -----
  const mutate = (fn) => { setWork((w) => { const n = { skills: new Set(w.skills), manual: new Set(w.manual), dismissed: new Set(w.dismissed) }; fn(n); return n; }); setDirty(true); };
  const setSkills = (ids, on) => mutate((w) => ids.forEach((id) => (on ? w.skills.add(id) : w.skills.delete(id))));
  const triState = (ids) => {
    if (!ids.length) return false;
    const n = ids.filter((id) => work.skills.has(id)).length;
    return n === 0 ? false : n === ids.length ? true : 'mixed';
  };
  const removeCombo = (id) => mutate((w) => { w.manual.delete(id); if (suggested.has(id)) w.dismissed.add(id); });
  const keepCombo = (id) => mutate((w) => { w.dismissed.delete(id); });
  const addCombo = (id) => mutate((w) => { w.manual.add(id); w.dismissed.delete(id); });

  const homes = useMemo(() => familyHomes(skills), [skills]);
  const filtered = useMemo(() => skills.filter((s) => (cat === 'all' || homeOf(homes, s)?.category === cat) && matchesSearch(s, q)), [skills, homes, cat, q]);
  const nodes = useMemo(() => buildTree(filtered, skills).filter((c) => c.subs.length), [filtered, skills]);
  const searching = !!q.trim();
  const isOpen = (k) => searching || tree.isOpen(k);

  const payload = () => ({
    skill_ids: [...work.skills],
    combo_ids: [...activeCombos],
    dismissed_ids: [...work.dismissed].filter((id) => suggested.has(id)),
  });

  async function save(mode) {
    if (!selected.length) { toast('Select at least one athlete first', 'err'); return; }
    const names = selected.map((id) => athleteById[id]?.name).join(', ');
    await run(() => (selected.length === 1 && mode === 'replace'
      ? api.saveWorkout(selected[0], { ...payload(), mode })
      : api.saveWorkouts(selected, { ...payload(), mode })),
    `${mode === 'add' ? 'Added to' : 'Saved for'} ${selected.length > 3 ? `${selected.length} athletes` : names}`);
    setDirty(false);
    if (selected.length === 1) {
      if (batch?.includes(selected[0])) setAdjusted((a) => new Set(a).add(selected[0]));
      lastAuto.current = null;
      await loadAthlete(selected[0]);
    } else {
      setBatch([...selected]);
      setAdjusted(new Set());
    }
  }

  // Switch to one athlete from the group to fine-tune their copy.
  function adjust(id, force = false) {
    if (!force && dirty && !window.confirm('You have unsaved changes. Discard them and switch athlete?')) return;
    setDirty(false);
    lastAuto.current = null;
    setSelected([id]);
  }
  const nextInBatch = batch && selected.length === 1 ? batch[batch.indexOf(selected[0]) + 1] : undefined;
  async function saveAndNext() {
    await save('replace');
    if (nextInBatch) adjust(nextInBatch, true);
  }

  function toggleAthlete(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const visibleAthletes = athletes.filter((a) => !athQ || `${a.name} ${a.group_notes} ${a.age}`.toLowerCase().includes(athQ.toLowerCase()));
  const groups = [...new Set(athletes.map((a) => a.group_notes).filter(Boolean))];

  // Selected challenges grouped by family for the summary panel
  const summary = useMemo(() => buildTree([...work.skills].map((id) => skillById[id]).filter(Boolean), skills).filter((c) => c.subs.length), [work.skills, skillById, skills]);
  const allKeys = nodes.flatMap((c) => [c.key, ...c.subs.flatMap((s) => [s.key, ...s.families.map((f) => f.key)])]);

  return (
    <div className="page designer">
      <div className="page-head">
        <div>
          <h1>Workout Designer</h1>
          <p className="muted">Choose athletes, tick progressions or single challenges, then save.</p>
        </div>
      </div>

      {/* ---------- Athlete picker ---------- */}
      <section className="card athletes-card">
        <div className="card-head">
          <h2>Athletes <span className="count">{selected.length} selected</span></h2>
          <div className="btn-group">
            <SearchBox value={athQ} onChange={setAthQ} placeholder="Find athlete…" />
            {groups.length > 0 && (
              <select className="select" value="" onChange={(e) => { const g = e.target.value; if (g) setSelected(athletes.filter((a) => a.group_notes === g).map((a) => a.id)); }} aria-label="Select group">
                <option value="">Select group…</option>
                {groups.map((g) => <option key={g}>{g}</option>)}
              </select>
            )}
            <button className="btn ghost sm" onClick={() => setSelected(visibleAthletes.map((a) => a.id))}>Select all</button>
            <button className="btn ghost sm" onClick={() => setSelected([])}>Clear</button>
          </div>
        </div>
        <div className="athlete-grid">
          {visibleAthletes.map((a) => (
            <button key={a.id} className={`athlete-chip ${selected.includes(a.id) ? 'on' : ''}`} onClick={() => toggleAthlete(a.id)} aria-pressed={selected.includes(a.id)}>
              <span className="nm">{a.name}</span>
              <span className="sub">{a.age ? `Age ${a.age}` : ''}{assignmentCounts[a.id] ? ` · ${assignmentCounts[a.id]} assigned` : ''}</span>
            </button>
          ))}
        </div>
      </section>

      {batch && (
        <section className="card batch-card">
          <div className="card-head">
            <h2>Personal adjustments <span className="count">{adjusted.size}/{batch.length} adjusted</span></h2>
            <button className="btn ghost sm" onClick={() => { setBatch(null); setAdjusted(new Set()); }}>Done</button>
          </div>
          <p className="muted small">The group workout is saved for everyone. Tap an athlete to add or remove challenges just for them, then press <b>Save & next</b>.</p>
          <div className="batch-chips">
            {batch.filter((id) => athleteById[id]).map((id) => (
              <button key={id} className={`batch-chip ${selected.length === 1 && selected[0] === id ? 'on' : ''} ${adjusted.has(id) ? 'done' : ''}`} onClick={() => adjust(id)}>
                {adjusted.has(id) && <Icon name="check" size={16} />} {athleteById[id].name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="designer-cols">
        {/* ---------- Skill tree ---------- */}
        <section className="card tree-card">
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} />
            <Seg value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
            {!searching && (
              <div className="btn-group">
                <button className="btn ghost sm" onClick={() => tree.setMany(allKeys, true)}>Expand all</button>
                <button className="btn ghost sm" onClick={() => tree.setOpen(new Set())}>Collapse all</button>
              </div>
            )}
          </div>
          {nodes.length === 0 && <Empty title="No challenges match" />}
          {nodes.map((c) => {
            const cIds = idsOfCat(c);
            return (
              <Disclosure key={c.key} level={0} open={isOpen(c.key)} onToggle={() => tree.toggle(c.key)} className={`cat-${c.name.toLowerCase()}`}
                header={<><Check size="lg" checked={triState(cIds)} onChange={(on) => setSkills(cIds, on)} label={`Select all ${c.name}`} />
                  <h2>{c.name}</h2><span className="count">{cIds.filter((id) => work.skills.has(id)).length}/{cIds.length}</span></>}>
                {c.subs.map((s) => {
                  const sIds = idsOfSub(s);
                  return (
                    <Disclosure key={s.key} level={1} open={isOpen(s.key)} onToggle={() => tree.toggle(s.key)}
                      header={<><Check checked={triState(sIds)} onChange={(on) => setSkills(sIds, on)} label={`Select all ${s.name}`} />
                        <h3>{s.name}</h3><span className="count">{sIds.filter((id) => work.skills.has(id)).length}/{sIds.length}</span></>}>
                      {s.families.map((f) => {
                        const fIds = idsOfFamily(f);
                        return (
                          <Disclosure key={f.key} level={2} open={isOpen(f.key)} onToggle={() => tree.toggle(f.key)}
                            header={<><Check checked={triState(fIds)} onChange={(on) => setSkills(fIds, on)} label={`Select whole ${f.name} progression`} />
                              <h4>{f.name}</h4>{buildsOn[familyKey(f.skills[0])] && <span className="tag back">Builds on {buildsOn[familyKey(f.skills[0])].join(', ')}</span>}<span className="count">{fIds.filter((id) => work.skills.has(id)).length}/{fIds.length}</span>
                              <button className="btn ghost sm push" title="Add a step to this family"
                                onClick={(e) => { e.stopPropagation(); setEditing({ category: f.category, subcategory: f.subcategory, family: f.name }); }}>
                                <Icon name="plus" size={16} /> Add step</button></>}>
                            <ol className="skill-list pick">
                              {f.skills.map((sk, i) => {
                                const on = work.skills.has(sk.id);
                                return (
                                  <li key={sk.id} className={`skill-row ${on ? 'on' : ''}`} onClick={() => setSkills([sk.id], !on)}>
                                    <Check checked={on} onChange={(v) => setSkills([sk.id], v)} label={skillLabel(sk)} />
                                    <span className="seq">{i + 1}</span>
                                    <div className="skill-main">
                                      <div className="skill-name">{sk.name}{sk.target && <span className="target">{sk.target}</span>}{isVariant(sk, f) && <span className="tag variant">{sk.category} · {sk.subcategory}</span>}</div>
                                      {(sk.leads_to || sk.required_elements) && <div className="skill-meta">
                                        {sk.leads_to && <span className="tag next">→ Leads to {familyName(sk.leads_to)}</span>}<ReTags skill={sk} /></div>}
                                      {checkpointMap[sk.id] && (
                                        <div className="skill-meta">{checkpointMap[sk.id].map((cb) => <span key={cb.id} className="tag combo"><Icon name="bolt" size={14} /> {cb.name}</span>)}</div>
                                      )}
                                    </div>
                                    <button className="icon-btn sm" aria-label={`Duplicate ${sk.id}`} title="Duplicate (copy right below)"
                                      onClick={async (e) => { e.stopPropagation(); setEditing(await duplicateSkill(run, skills, sk)); }}><Icon name="copy" size={18} /></button>
                                    <button className="icon-btn sm" aria-label={`Edit ${sk.name}`} title="Edit this challenge"
                                      onClick={(e) => { e.stopPropagation(); setEditing(sk); }}><Icon name="edit" size={18} /></button>
                                  </li>
                                );
                              })}
                            </ol>
                          </Disclosure>
                        );
                      })}
                    </Disclosure>
                  );
                })}
              </Disclosure>
            );
          })}
        </section>

        {/* ---------- Working workout ---------- */}
        <aside className="card workout-card">
          <div className="card-head">
            <h2>Workout <span className="count">{work.skills.size} challenges · {activeCombos.size} combos</span></h2>
          </div>
          <p className="muted small">
            {loadedFrom ? loadedFrom : 'New workout'}{dirty && <b className="unsaved"> · unsaved changes</b>}
          </p>
          {selected.length === 1 && dirty && (
            <button className="btn ghost sm" onClick={() => loadAthlete(selected[0])}>Discard changes</button>
          )}

          <div className="btn-stack">
            {selected.length <= 1 ? (
              <>
                {nextInBatch && batch?.includes(selected[0]) && (
                  <button className="btn primary block" onClick={saveAndNext}>Save & next: {athleteById[nextInBatch]?.name} →</button>
                )}
                <button className={`btn block ${nextInBatch && batch?.includes(selected[0]) ? '' : 'primary'}`} disabled={!selected.length} onClick={() => save('replace')}>
                  {selected.length ? `Save for ${athleteById[selected[0]]?.name}` : 'Select an athlete to save'}
                </button>
              </>
            ) : (
              <>
                <button className="btn primary block" onClick={() => save('add')}>Add to {selected.length} athletes’ workouts</button>
                <button className="btn block" onClick={() => save('replace')}>Replace {selected.length} athletes’ workouts with this</button>
                <p className="muted small">“Add” keeps what each athlete already has. “Replace” overwrites it.</p>
              </>
            )}
            <div className="btn-row">
              <button className="btn ghost sm" onClick={() => setModal('copy')}><Icon name="copy" size={18} /> Copy from…</button>
              <button className="btn ghost sm" onClick={() => setModal('templates')}><Icon name="file" size={18} /> Templates</button>
              {templateId && templates.some((t) => t.id === templateId) && (
                <button className="btn sm" onClick={async () => {
                  const t = templates.find((x) => x.id === templateId);
                  await run(() => api.updateTemplate(templateId, payload()), `Template “${t.name}” updated`);
                  if (!selected.length) setDirty(false);
                }}>Update template “{templates.find((t) => t.id === templateId)?.name}”</button>
              )}
              <button className="btn ghost sm" disabled={!work.skills.size && !activeCombos.size} onClick={() => setModal('saveTemplate')}>Save as {templateId ? 'new ' : ''}template</button>
              {selected.length === 1 && <button className="btn ghost sm" onClick={() => go('athlete', selected[0])}><Icon name="user" size={18} /> Athlete view</button>}
              {selected.length > 0 && <button className="btn ghost sm" disabled={dirty} title={dirty ? 'Save first' : ''} onClick={() => go('print', selected.join(','))}><Icon name="print" size={18} /> Print {selected.length > 1 ? selected.length : ''}</button>}
              <button className="btn ghost sm danger-text" disabled={!work.skills.size && !activeCombos.size} onClick={() => setModal('clear')}>Clear</button>
            </div>
          </div>

          {/* Next skills from "Try …" steps */}
          {nextUps.length > 0 && (
            <div className="next-panel">
              <h3><Icon name="chevron" size={18} /> Ready for the next skill?</h3>
              {nextUps.map((n) => {
                const have = n.ids.filter((id) => work.skills.has(id)).length;
                return (
                  <div key={n.key} className="next-item">
                    <div className="grow">
                      <div className="cs-after">After “{n.from.name}”</div>
                      <div className="cs-name">{familyName(n.key)}</div>
                      <div className="cs-after">{familyWhere(n.key, skills)} · {n.ids.length} steps</div>
                    </div>
                    {have === n.ids.length
                      ? <span className="added"><Icon name="check" size={18} /> Added</span>
                      : <button className="btn sm" onClick={() => setSkills(n.ids, true)}><Icon name="plus" size={18} /> {have ? `Add rest (${n.ids.length - have})` : 'Add progression'}</button>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Combos */}
          <div className="combo-panel">
            <h3><Icon name="bolt" size={18} /> Combos & routines</h3>
            {[...suggested.keys()].map((cid) => {
              const c = comboById[cid];
              const kept = !work.dismissed.has(cid);
              return (
                <div key={cid} className={`combo-suggest ${kept ? '' : 'off'}`}>
                  <div>
                    <div className="cs-title">Can you do this? Try this {c.kind}!</div>
                    <div className="cs-name">{c.name}</div>
                    <div className="cs-after">After: {suggested.get(cid).join('; ')}</div>
                  </div>
                  {kept
                    ? <button className="btn sm ghost" onClick={() => removeCombo(cid)}>Remove</button>
                    : <button className="btn sm" onClick={() => keepCombo(cid)}>Keep</button>}
                </div>
              );
            })}
            {[...work.manual].filter((id) => !suggested.has(id) && comboById[id]).map((cid) => (
              <div key={cid} className="combo-item">
                <span className={`kind ${comboById[cid].kind}`}>{comboById[cid].kind}</span>
                <span className="grow">{comboById[cid].name}</span>
                <button className="icon-btn sm" aria-label="Remove combo" onClick={() => removeCombo(cid)}><Icon name="x" size={18} /></button>
              </div>
            ))}
            <select className="select block" value="" onChange={(e) => e.target.value && addCombo(e.target.value)} aria-label="Add a combo or routine">
              <option value="">+ Add a combo or routine…</option>
              {combos.filter((c) => !activeCombos.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
            </select>
          </div>

          {/* Selected skills */}
          {summary.length === 0 && <Empty title="No challenges yet">Tick a category, subcategory, skill family or single challenge.</Empty>}
          {summary.map((c) => (
            <div key={c.key} className={`sum-cat cat-${c.name.toLowerCase()}`}>
              <h3>{c.name}</h3>
              {c.subs.flatMap((s) => s.families.map((f) => (
                <div key={f.key} className="sum-fam">
                  <div className="sum-fam-head"><b>{f.name}</b><small>{s.name}</small>
                    <button className="icon-btn sm push" aria-label={`Remove ${f.name}`} onClick={() => setSkills(idsOfFamily(f), false)}><Icon name="x" size={18} /></button>
                  </div>
                  <ul>
                    {f.skills.map((sk) => (
                      <li key={sk.id}>
                        <span>{skillLabel(sk)}</span>
                        <button className="icon-btn sm" aria-label={`Remove ${sk.name}`} onClick={() => setSkills([sk.id], false)}><Icon name="x" size={16} /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              )))}
            </div>
          ))}
        </aside>
      </div>

      {modal === 'copy' && (
        <Modal title="Copy a workout from…" onClose={() => setModal(null)}>
          <p className="muted">Loads that athlete’s saved workout into the designer. Then save it for the athletes you’ve selected.</p>
          <div className="list-pick">
            {athletes.filter((a) => assignmentCounts[a.id]).map((a) => (
              <button key={a.id} className="list-btn" onClick={async () => { await loadAthlete(a.id, `Copied from ${a.name}`); setDirty(true); setModal(null); }}>
                <span>{a.name}</span><small>{assignmentCounts[a.id]} challenges</small>
              </button>
            ))}
            {!athletes.some((a) => assignmentCounts[a.id]) && <Empty title="No saved workouts yet" />}
          </div>
        </Modal>
      )}
      {modal === 'templates' && <TemplatesModal templates={templates} onLoad={(t) => { loadTemplate(t); setModal(null); }} onClose={() => setModal(null)} />}
      {modal === 'saveTemplate' && (
        <SaveTemplateModal onClose={() => setModal(null)}
          onSave={async (name, description) => { const r = await run(() => api.createTemplate({ name, description, ...payload() }), `Template “${name}” saved`); setTemplateId(r.id); setLoadedFrom(`Template: ${name}`); setModal(null); }} />
      )}
      {editing && <SkillEditor skill={editing} onClose={() => setEditing(null)} />}
      {modal === 'clear' && (
        <Confirm text="Clear every challenge and combo from the designer? Nothing is saved until you press Save." confirmLabel="Clear"
          onConfirm={() => { setWork(emptyWork()); setDirty(true); setLoadedFrom(null); setTemplateId(null); }} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function SaveTemplateModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <Modal title="Save as reusable template" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim()} onClick={() => onSave(name.trim(), desc)}>Save template</button></>}>
      <Field label="Template name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Level 1 rec class" autoFocus /></Field>
      <Field label="Description (optional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Camps, competitive team, beginners…" /></Field>
    </Modal>
  );
}

function TemplatesModal({ templates, onLoad, onClose }) {
  const { run } = useApp();
  const [del, setDel] = useState(null);
  const [renaming, setRenaming] = useState(null);
  return (
    <Modal title="Workout templates" onClose={onClose}>
      {templates.length === 0 && <Empty title="No templates yet">Build a workout, then press “Save as template”.</Empty>}
      <div className="list-pick">
        {templates.map((t) => (
          <div key={t.id} className="list-row">
            {renaming?.id === t.id ? (
              <input className="grow" value={renaming.name} autoFocus onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                onKeyDown={async (e) => { if (e.key === 'Enter' && renaming.name.trim()) { await run(() => api.updateTemplate(t.id, { name: renaming.name })); setRenaming(null); } }} />
            ) : (
              <button className="list-btn grow" onClick={() => onLoad(t)}>
                <span>{t.name}</span><small>{t.skill_ids.length} challenges · {t.combo_ids.length} combos{t.description ? ` · ${t.description}` : ''}</small>
              </button>
            )}
            {renaming?.id === t.id
              ? <button className="btn sm" onClick={async () => { await run(() => api.updateTemplate(t.id, { name: renaming.name })); setRenaming(null); }}>Save</button>
              : <button className="icon-btn" aria-label="Rename" onClick={() => setRenaming({ id: t.id, name: t.name })}><Icon name="edit" /></button>}
            <button className="icon-btn danger" aria-label="Delete template" onClick={() => setDel(t)}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
      {del && <Confirm text={`Delete template “${del.name}”?`} onConfirm={() => run(() => api.deleteTemplate(del.id), 'Template deleted')} onClose={() => setDel(null)} />}
    </Modal>
  );
}
