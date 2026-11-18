import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Check, Confirm, Disclosure, Empty, Field, Icon, Modal, SearchBox, Seg, useApp, useOpenSet } from '../components.jsx';
import { CATEGORIES, buildTree, idsOfCat, idsOfFamily, idsOfSub, matchesSearch, skillLabel } from '../util.js';
import { go } from '../App.jsx';

const emptyWork = () => ({ skills: new Set(), manual: new Set(), dismissed: new Set() });

export default function Designer({ initialAthlete }) {
  const app = useApp();
  const { skills, combos, athletes, templates, skillById, comboById, athleteById, assignmentCounts, run, toast } = app;

  const [selected, setSelected] = useState(() => (initialAthlete && athleteById[initialAthlete] ? [initialAthlete] : []));
  const [work, setWork] = useState(emptyWork);
  const [loadedFrom, setLoadedFrom] = useState(null); // label of what's in the working set
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [athQ, setAthQ] = useState('');
  const [modal, setModal] = useState(null);
  const tree = useOpenSet();
  const lastAuto = useRef(null);

  // ----- derived combo state -----
  const checkpointMap = useMemo(() => {
    const m = {};
    combos.forEach((c) => c.checkpoints.forEach((s) => (m[s] ||= []).push(c)));
    return m;
  }, [combos]);
  const suggested = useMemo(() => {
    const out = new Map(); // comboId -> [skill ids that triggered it]
    for (const sid of work.skills) for (const c of checkpointMap[sid] || []) {
      if (!out.has(c.id)) out.set(c.id, []);
      out.get(c.id).push(sid);
    }
    return out;
  }, [work.skills, checkpointMap]);
  const activeCombos = useMemo(() => {
    const s = new Set(work.manual);
    for (const id of suggested.keys()) if (!work.dismissed.has(id)) s.add(id);
    return s;
  }, [work.manual, work.dismissed, suggested]);

  // ----- loading -----
  async function loadAthlete(id, label) {
    const w = await api.workout(id);
    setWork({
      skills: new Set(w.skill_ids),
      manual: new Set(w.combos.filter((c) => c.source === 'manual').map((c) => c.id)),
      dismissed: new Set(w.dismissed_ids),
    });
    setLoadedFrom(label ?? `${athleteById[id]?.name}’s saved workout`);
    setDirty(false);
  }
  function loadTemplate(t) {
    setWork({ skills: new Set(t.skill_ids.filter((id) => skillById[id])), manual: new Set(t.combo_ids.filter((id) => comboById[id])), dismissed: new Set(t.dismissed_ids) });
    setLoadedFrom(`Template: ${t.name}`);
    setDirty(true);
  }

  // When exactly one athlete is selected and nothing unsaved is in progress, show their workout.
  useEffect(() => {
    if (selected.length === 1 && !dirty && lastAuto.current !== selected[0]) {
      lastAuto.current = selected[0];
      loadAthlete(selected[0]).catch((e) => toast(e.message, 'err'));
    }
    if (selected.length !== 1) lastAuto.current = null;
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

  const filtered = useMemo(() => skills.filter((s) => (cat === 'all' || s.category === cat) && matchesSearch(s, q)), [skills, cat, q]);
  const nodes = useMemo(() => buildTree(filtered).filter((c) => c.subs.length), [filtered]);
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
    if (selected.length === 1) { lastAuto.current = null; await loadAthlete(selected[0]); }
  }

  function toggleAthlete(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const visibleAthletes = athletes.filter((a) => !athQ || `${a.name} ${a.group_notes} ${a.age}`.toLowerCase().includes(athQ.toLowerCase()));
  const groups = [...new Set(athletes.map((a) => a.group_notes).filter(Boolean))];

  // Selected challenges grouped by family for the summary panel
  const summary = useMemo(() => buildTree([...work.skills].map((id) => skillById[id]).filter(Boolean)).filter((c) => c.subs.length), [work.skills, skillById]);
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
                              <h4>{f.name}</h4><span className="count">{fIds.filter((id) => work.skills.has(id)).length}/{fIds.length}</span></>}>
                            <ol className="skill-list pick">
                              {f.skills.map((sk, i) => {
                                const on = work.skills.has(sk.id);
                                return (
                                  <li key={sk.id} className={`skill-row ${on ? 'on' : ''}`} onClick={() => setSkills([sk.id], !on)}>
                                    <Check checked={on} onChange={(v) => setSkills([sk.id], v)} label={skillLabel(sk)} />
                                    <span className="seq">{i + 1}</span>
                                    <div className="skill-main">
                                      <div className="skill-name">{sk.name}{sk.target && <span className="target">{sk.target}</span>}</div>
                                      {checkpointMap[sk.id] && (
                                        <div className="skill-meta">{checkpointMap[sk.id].map((cb) => <span key={cb.id} className="tag combo"><Icon name="bolt" size={14} /> {cb.name}</span>)}</div>
                                      )}
                                    </div>
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
              <button className="btn primary block" disabled={!selected.length} onClick={() => save('replace')}>
                {selected.length ? `Save for ${athleteById[selected[0]]?.name}` : 'Select an athlete to save'}
              </button>
            ) : (
              <>
                <button className="btn primary block" onClick={() => save('replace')}>Save for {selected.length} athletes (replace)</button>
                <button className="btn block" onClick={() => save('add')}>Add to {selected.length} athletes’ existing workouts</button>
              </>
            )}
            <div className="btn-row">
              <button className="btn ghost sm" onClick={() => setModal('copy')}><Icon name="copy" size={18} /> Copy from…</button>
              <button className="btn ghost sm" onClick={() => setModal('templates')}><Icon name="file" size={18} /> Templates</button>
              <button className="btn ghost sm" disabled={!work.skills.size && !activeCombos.size} onClick={() => setModal('saveTemplate')}>Save as template</button>
              {selected.length === 1 && <button className="btn ghost sm" onClick={() => go('athlete', selected[0])}><Icon name="user" size={18} /> Athlete view</button>}
              <button className="btn ghost sm danger-text" disabled={!work.skills.size && !activeCombos.size} onClick={() => setModal('clear')}>Clear</button>
            </div>
          </div>

          {/* Combos */}
          <div className="combo-panel">
            <h3><Icon name="bolt" size={18} /> Combos & routines</h3>
            {[...suggested.keys()].map((cid) => {
              const c = comboById[cid];
              const kept = !work.dismissed.has(cid);
              return (
                <div key={cid} className={`combo-suggest ${kept ? '' : 'off'}`}>
                  <div>
                    <div className="cs-title">Can you do this? Try this combo!</div>
                    <div className="cs-name">{c.name}</div>
                    <div className="cs-after">After: {suggested.get(cid).map((id) => `${skillById[id]?.family} – ${skillLabel(skillById[id])}`).join('; ')}</div>
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
          onSave={async (name, description) => { await run(() => api.createTemplate({ name, description, ...payload() }), `Template “${name}” saved`); setModal(null); }} />
      )}
      {modal === 'clear' && (
        <Confirm text="Clear every challenge and combo from the designer? Nothing is saved until you press Save." confirmLabel="Clear"
          onConfirm={() => { setWork(emptyWork()); setDirty(true); setLoadedFrom(null); }} onClose={() => setModal(null)} />
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
