import { buildTree, buildsOnMap, familyKey, familyName, isVariant, skillLabel } from './util.js';

/** Turn a saved workout into everything a checklist needs. */
export function sheetData(athlete, w, ctx) {
  const { skillById, comboById, combos } = ctx;
  const skills = w.skill_ids.map((id) => skillById[id]).filter(Boolean);
  const assigned = w.combos.map((c) => comboById[c.id]).filter(Boolean);
  const active = new Set(assigned.map((c) => c.id));
  const comboByCheckpoint = {};
  combos.forEach((c) => { if (active.has(c.id)) c.checkpoints.forEach((s) => (comboByCheckpoint[s] ||= []).push(c)); });
  const done = new Set(w.progress.map((p) => `${p.item_type}:${p.item_id}`));
  return { athlete, skills, combos: assigned, done, comboByCheckpoint, all: ctx.skills };
}

/** Apply print options (e.g. leave out what the athlete already completed). */
export function applyOptions(d, { hideDone = false } = {}) {
  if (!hideDone) return d;
  return {
    ...d,
    skills: d.skills.filter((s) => !d.done.has(`skill:${s.id}`)),
    combos: d.combos.filter((c) => !d.done.has(`combo:${c.id}`)),
  };
}

/** Branded checklist sheet. Hidden on screen unless inside .print-preview; always shown when printing. */
export function PrintSheet({ data, skillById, showNotes = false, poster = false }) {
  const { athlete, skills, combos, done, comboByCheckpoint } = data;
  const buildsOn = buildsOnMap(Object.values(skillById));
  const nodes = buildTree(skills, Object.values(skillById)).filter((c) => c.subs.length);
  return (
    <div className={`print-sheet ${poster ? 'poster' : ''}`}>
      <header className="ps-head">
        <div className="ps-brand"><img src="/icon.svg" alt="" /><div><strong>ROPEWORKS</strong><span>Training Studio</span></div></div>
        <div className="ps-who"><h1>{athlete.name}</h1><span>{[athlete.age && `Age ${athlete.age}`, athlete.group_notes, !poster && new Date().toLocaleDateString()].filter(Boolean).join(' · ')}</span></div>
      </header>
      {nodes.length === 0 && combos.length === 0 && <p className="ps-empty">Nothing to practice on this list.</p>}
      {nodes.map((c) => (
        <section key={c.key} className={`ps-cat cat-${c.name.toLowerCase()}`}>
          <h2>{c.name}</h2>
          {c.subs.flatMap((s) => s.families.map((f) => (
            <div key={f.key} className="ps-fam">
              <h3>{f.name} <small>{s.name}</small>
                {buildsOn[familyKey(f.skills[0])] && <small className="ps-builds"> · builds on {buildsOn[familyKey(f.skills[0])].join(', ')}</small>}</h3>
              <ul>
                {f.skills.map((sk) => (
                  <li key={sk.id}>
                    <span className={`ps-box ${done.has(`skill:${sk.id}`) ? 'on' : ''}`} />
                    <span>{skillLabel(sk)}{isVariant(sk, f) && <small className="ps-variant"> ({sk.subcategory || sk.category})</small>}</span>
                    {showNotes && sk.teaching_notes && <em className="ps-note">{sk.teaching_notes}</em>}
                    {sk.leads_to && <em className="ps-note">→ Next skill: {familyName(sk.leads_to)}</em>}
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
              <li key={c.id}><span className={`ps-box ${done.has(`combo:${c.id}`) ? 'on' : ''}`} /><span>{c.name} <small>({c.kind}{c.checkpoints.length ? ` · after ${c.checkpoints.map((id) => skillById[id]?.name || id).join(', ')}` : ''})</small></span>
                {showNotes && c.notes && <em className="ps-note">{c.notes}</em>}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
