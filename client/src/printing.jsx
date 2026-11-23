import { useApp } from './components.jsx';
import { noteVideos, moveText, athleteView, fmtDay, newSincePrint, prereqText, buildTree, buildsOnMap, familyKey, familyName, familySkills, familyVideoUrl, isVariant, shareUrl, skillLabel } from './util.js';

/** Turn a saved workout into everything a checklist needs. */
export function sheetData(athlete, w, ctx) {
  const { skillById, comboById, combos } = ctx;
  const skills = w.skill_ids.map((id) => skillById[id]).filter(Boolean);
  const assigned = w.combos.map((c) => comboById[c.id]).filter(Boolean);
  const active = new Set(assigned.map((c) => c.id));
  const comboByCheckpoint = {};
  combos.forEach((c) => { if (active.has(c.id)) c.checkpoints.forEach((s) => (comboByCheckpoint[s] ||= []).push(c)); });
  const done = new Set(w.progress.map((p) => `${p.item_type}:${p.item_id}`));
  return { athlete, skills, combos: assigned, done, comboByCheckpoint, all: ctx.skills, videoBoard: athleteView(athlete, ctx.settings) === 'videos',
    fresh: newSincePrint(w), lastPrinted: w.last_printed_at || '', notes: w.notes || [] };
}

/** Apply print options (e.g. leave out what the athlete already completed). */
export function applyOptions(d, { hideDone = false, onlyNew = false } = {}) {
  let out = d;
  if (hideDone) out = { ...out, skills: out.skills.filter((s) => !d.done.has(`skill:${s.id}`)), combos: out.combos.filter((c) => !d.done.has(`combo:${c.id}`)) };
  // Only what was added since this athlete's last printout (an add-on sheet instead of a full reprint)
  if (onlyNew && d.fresh) out = { ...out, onlyNew: true, skills: out.skills.filter((s) => d.fresh.has(`skill:${s.id}`)), combos: out.combos.filter((c) => d.fresh.has(`combo:${c.id}`)) };
  return out;
}

/** Branded checklist sheet. Hidden on screen unless inside .print-preview; always shown when printing. */
export function PrintSheet({ data, skillById, showNotes = false, poster = false, hideCategories = false, videoBoard = data.videoBoard }) {
  const { athlete, skills, combos, done, comboByCheckpoint } = data;
  const { comboById = {} } = useApp() || {};
  const buildsOn = buildsOnMap(Object.values(skillById));
  const nodes = buildTree(skills, Object.values(skillById)).filter((c) => c.subs.length);
  return (
    <div className={`print-sheet ${poster ? 'poster' : ''} ${videoBoard ? 'video-board' : ''}`}>
      <header className="ps-head">
        <div className="ps-brand"><img src="/icon.svg" alt="" /><div><strong>ROPEWORKS</strong><span>Training Studio</span></div></div>
        <div className="ps-who"><h1>{athlete.name}</h1><span>{[athlete.age && `Age ${athlete.age}`, athlete.group_notes, !poster && new Date().toLocaleDateString()].filter(Boolean).join(' · ')}</span></div>
      </header>
      {data.onlyNew && <p className="ps-addon">Add-on sheet: new since {data.lastPrinted ? fmtDay(data.lastPrinted) : 'last printout'}</p>}
      {nodes.length === 0 && combos.length === 0 && <p className="ps-empty">Nothing to practice on this list.</p>}
      {nodes.map((c) => (
        <section key={c.key} className={`ps-cat cat-${c.name.toLowerCase()}`}>
          {!hideCategories && <h2>{c.name}</h2>}
          {c.subs.flatMap((s) => s.families.map((f) => (
            <div key={f.key} className="ps-fam">
              <h3>{f.name} <small>{s.name}</small>
                {buildsOn[familyKey(f.skills[0])] && <small className="ps-builds"> · builds on {buildsOn[familyKey(f.skills[0])].join(', ')}</small>}
                {(() => { const u = familyVideoUrl(familySkills(Object.values(skillById), f.name)); return u && <a className="ps-link" href={u} target="_blank" rel="noreferrer">▶ whole family video</a>; })()}</h3>
              <ul>
                {f.skills.map((sk) => (
                  <li key={sk.id}>
                    <span className={`ps-box ${done.has(`skill:${sk.id}`) ? 'on' : ''}`} />
                    <span>{skillLabel(sk)}{isVariant(sk, f) && <small className="ps-variant"> ({sk.subcategory || sk.category})</small>}{data.fresh?.has(`skill:${sk.id}`) && !data.onlyNew && <b className="ps-new"> NEW</b>}</span>
                    {sk.video_url && <a className="ps-link" href={shareUrl(sk.video_url)} target="_blank" rel="noreferrer">▶ video</a>}
                    {showNotes && sk.teaching_notes && <em className="ps-note">{sk.teaching_notes}</em>}
                    {prereqText(sk, skillById) && <em className="ps-note">Before this: {prereqText(sk, skillById)}</em>}
                    {sk.leads_to && <em className="ps-note">→ Next skill: {familyName(sk.leads_to)}</em>}
                    {comboByCheckpoint[sk.id]?.map((cb) => <em key={cb.id} className="ps-combo">⚡ Can you do this? Try this {cb.kind}: {cb.name}{cb.video_url && <a className="ps-link" href={shareUrl(cb.video_url)} target="_blank" rel="noreferrer">▶ video</a>}</em>)}
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
              <li key={c.id}><span className={`ps-box ${done.has(`combo:${c.id}`) ? 'on' : ''}`} /><span>{c.name} <small>({c.kind}{c.checkpoints.length || c.after_combos?.length ? ` · after ${[
                ...c.checkpoints.map((id) => skillById[id]?.name || id),
                ...(c.after_combos || []).map((id) => combos.find((x) => x.id === id)?.name || id)].join(', ')}` : ''})</small></span>
                {c.video_url && <a className="ps-link" href={shareUrl(c.video_url)} target="_blank" rel="noreferrer">▶ video</a>}
                {showNotes && c.notes && <em className="ps-note">{c.notes}</em>}</li>
            ))}
          </ul>
        </section>
      )}
      {(data.notes || []).filter((n) => !n.done).length > 0 && (
        <section className="ps-cat ps-notes">
          <h2>Working on</h2>
          {[['skill', 'Working skills'], ['combo', 'Working combos'], ['routine', 'Routine']].map(([k, label]) => {
            const list = data.notes.filter((n) => n.kind === k && !n.done);
            return list.length > 0 && (
              <div key={k} className="ps-fam">
                <h3>{label}</h3>
                {list.map((n) => {
                  const lines = String(n.notes || '').split('\n').map((x) => x.trim()).filter(Boolean);
                  return (
                    <div key={n.id} className="ps-note-block">
                      <b>{n.title}</b>{noteVideos(n, skillById, comboById).map((v, vi) => <a key={vi} className="ps-link" href={shareUrl(v.url)} target="_blank" rel="noreferrer">▶ {v.label.toLowerCase()}</a>)}
                      {k === 'skill' ? <p>{n.notes}</p> : <ol>{lines.map((l, i) => <li key={i}>{moveText(l, skillById, comboById)}</li>)}</ol>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
