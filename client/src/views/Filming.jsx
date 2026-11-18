import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Empty, Icon, SearchBox, Seg, useApp } from '../components.jsx';
import FamilyVideo from '../FamilyVideo.jsx';
import { CATEGORIES, buildTree, familyHomes, familySkills, familyVideoUrl, homeOf, matchesSearch, skillLabel } from '../util.js';

/*
 * "Need to film" punch list for staff: every challenge, combo and routine without a video,
 * with a status (to film / filmed – needs link / skip), who's filming it and a note.
 * Pasting a video link marks it done.
 */

export const filmStatus = (x) => (x.video_url ? 'done' : x.film_status || 'todo');
const LABEL = { todo: 'To film', filmed: 'Filmed – needs link', done: 'Done', skip: 'Skip' };

export default function Filming() {
  const { skills, combos, skillUse = {}, run } = useApp();
  const [show, setShow] = useState('open');
  const [who, setWho] = useState('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [usedFirst, setUsedFirst] = useState(true);
  const [famVideo, setFamVideo] = useState(null);

  const homes = useMemo(() => familyHomes(skills), [skills]);
  const assignees = useMemo(() => [...new Set([...skills, ...combos].map((x) => x.film_assignee).filter(Boolean))].sort(), [skills, combos]);

  const keep = (x) => {
    const st = filmStatus(x);
    if (show === 'open' && !(st === 'todo' || st === 'filmed')) return false;
    if (!['open', 'all'].includes(show) && st !== show) return false;
    if (who === 'none' && x.film_assignee) return false;
    if (!['all', 'none'].includes(who) && x.film_assignee !== who) return false;
    return true;
  };
  const shownSkills = skills.filter((s) => keep(s) && (cat === 'all' || homeOf(homes, s)?.category === cat) && matchesSearch(s, q));
  const shownCombos = cat === 'all' || cat === 'combos'
    ? combos.filter((c) => keep(c) && (!q || `${c.name} ${c.notes}`.toLowerCase().includes(q.toLowerCase()))) : [];

  const families = useMemo(() => {
    const list = buildTree(shownSkills, skills).flatMap((c) => c.subs.flatMap((s) => s.families.map((f) => ({ ...f, cat: c.name, sub: s.name }))));
    const use = (f) => f.skills.reduce((n, s) => n + (skillUse[s.id] || 0), 0);
    return usedFirst ? [...list].sort((a, b) => use(b) - use(a)) : list;
  }, [shownSkills, skills, skillUse, usedFirst]);

  // progress over everything that needs a video (skip excluded)
  const everything = [...skills, ...combos].map(filmStatus).filter((s) => s !== 'skip');
  const doneN = everything.filter((s) => s === 'done').length;
  const filmedN = everything.filter((s) => s === 'filmed').length;
  const pct = everything.length ? Math.round((doneN / everything.length) * 100) : 100;

  const saveSkill = (id, patch) => run(() => api.updateSkill(id, patch)).catch(() => {});
  const saveCombo = (id, patch) => run(() => api.updateCombo(id, patch)).catch(() => {});

  return (
    <div className="page film-page">
      <div className="no-print">
        <div className="page-head">
          <div>
            <h1>Film list</h1>
            <p className="muted">Everything that still needs a video. Assign it to a staff member, mark it filmed, then paste the link when it’s uploaded.</p>
          </div>
          <button className="btn primary" onClick={() => window.print()}><Icon name="print" /> Print this list</button>
        </div>

        <div className="card film-progress">
          <div className="fp-bar"><span style={{ width: `${pct}%` }} /></div>
          <p><b>{doneN}</b> of {everything.length} have a video ({pct}%) · <b>{everything.length - doneN - filmedN}</b> to film · <b>{filmedN}</b> filmed, waiting for a link</p>
        </div>

        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search…" />
          <Seg value={show} onChange={setShow} options={[
            { value: 'open', label: 'Still needed' }, { value: 'todo', label: 'To film' }, { value: 'filmed', label: 'Filmed' },
            { value: 'done', label: 'Done' }, { value: 'skip', label: 'Skip' }, { value: 'all', label: 'All' },
          ]} />
          <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assigned to">
            <option value="all">Everyone</option>
            <option value="none">Not assigned yet</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            <option value="combos">Combos & routines only</option>
          </select>
          <label className="opt small-opt"><input type="checkbox" checked={usedFirst} onChange={(e) => setUsedFirst(e.target.checked)} /> Skills athletes have first</label>
        </div>

        <datalist id="film-assignees">{assignees.map((a) => <option key={a} value={a} />)}</datalist>

        {cat !== 'combos' && families.map((f) => {
          const whole = familySkills(skills, f.name);
          const famUrl = familyVideoUrl(whole);
          const use = f.skills.reduce((n, s) => n + (skillUse[s.id] || 0), 0);
          return (
            <section key={f.key} className={`card film-fam cat-${f.cat.toLowerCase()}`}>
              <div className="film-fam-head">
                <div className="grow">
                  <h3>{f.name}</h3>
                  <small className="muted">{f.cat} › {f.sub}{use ? ` · ${use} assignment${use === 1 ? '' : 's'}` : ''}</small>
                </div>
                {famUrl && <span className="tag ok-tag"><Icon name="check" size={14} /> family video</span>}
                <AssignAll family={f} onAssign={(name) => Promise.all(f.skills.map((s) => api.updateSkill(s.id, { film_assignee: name })))
                  .then(() => run(() => Promise.resolve(), `${f.name}: assigned to ${name || 'nobody'}`))} />
                <button className="btn ghost sm" onClick={() => setFamVideo({ name: f.name, skills: whole })}><Icon name="play" size={16} /> Family video</button>
              </div>
              <div className="film-rows">
                {f.skills.map((s) => (
                  <FilmRow key={s.id} item={s} label={skillLabel(s)} step={whole.findIndex((x) => x.id === s.id) + 1}
                    use={skillUse[s.id] || 0} onSave={(patch) => saveSkill(s.id, patch)} />
                ))}
              </div>
            </section>
          );
        })}

        {shownCombos.length > 0 && (
          <section className="card film-fam">
            <div className="film-fam-head"><div className="grow"><h3><Icon name="bolt" size={18} /> Combos & routines</h3></div></div>
            <div className="film-rows">
              {shownCombos.map((c) => (
                <FilmRow key={c.id} item={c} label={`${c.name} (${c.kind})`} onSave={(patch) => saveCombo(c.id, patch)} />
              ))}
            </div>
          </section>
        )}

        {families.length === 0 && shownCombos.length === 0 && (
          <Empty title={show === 'open' ? 'Nothing left to film 🎉' : 'Nothing matches'}>{show === 'open' ? 'Every challenge has a video or is marked Skip.' : 'Try a different filter.'}</Empty>
        )}
      </div>

      {/* Printable punch list */}
      <div className="film-print">
        <h1>Ropeworks · Film list</h1>
        <p>{new Date().toLocaleDateString()} · {LABEL[show] || (show === 'open' ? 'Still needed' : 'All')}{who !== 'all' ? ` · ${who === 'none' ? 'Not assigned' : who}` : ''}</p>
        <table>
          <thead><tr><th /><th>Family</th><th>#</th><th>Challenge</th><th>Status</th><th>Who</th><th>Note</th></tr></thead>
          <tbody>
            {families.flatMap((f) => {
              const whole = familySkills(skills, f.name);
              return f.skills.map((s) => (
                <tr key={s.id}><td>☐</td><td>{f.name}</td><td>{whole.findIndex((x) => x.id === s.id) + 1}</td><td>{skillLabel(s)}</td>
                  <td>{LABEL[filmStatus(s)]}</td><td>{s.film_assignee}</td><td>{s.film_note}</td></tr>
              ));
            })}
            {shownCombos.map((c) => (
              <tr key={c.id}><td>☐</td><td>{c.kind === 'routine' ? 'Routine' : 'Combo'}</td><td /><td>{c.name}</td>
                <td>{LABEL[filmStatus(c)]}</td><td>{c.film_assignee}</td><td>{c.film_note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {famVideo && <FamilyVideo family={famVideo} onClose={() => setFamVideo(null)} />}
    </div>
  );
}

function AssignAll({ family, onAssign }) {
  const [v, setV] = useState('');
  return (
    <span className="assign-all">
      <input list="film-assignees" value={v} placeholder="Assign family to…" onChange={(e) => setV(e.target.value)} aria-label={`Assign ${family.name} to`}
        onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAssign(v.trim()); setV(''); } }} />
      {v.trim() && <button className="btn sm" onClick={() => { onAssign(v.trim()); setV(''); }}>Assign</button>}
    </span>
  );
}

function FilmRow({ item, label, step, use = 0, onSave }) {
  const st = filmStatus(item);
  const blurSave = (field) => (e) => { const v = e.target.value.trim(); if (v !== (item[field] || '')) onSave({ [field]: v }); };
  const enter = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <div className={`film-row st-${st}`}>
      <div className="film-what">
        {step ? <span className="seq">{step}</span> : null}
        <div>
          <div className="fr-name">{label}</div>
          {use > 0 && <small className="muted">{use} athlete{use === 1 ? '' : 's'} have this</small>}
        </div>
      </div>
      <select className="select fr-status" value={st === 'done' ? 'done' : st} disabled={st === 'done'} aria-label={`Status for ${label}`}
        onChange={(e) => onSave({ film_status: e.target.value === 'todo' ? '' : e.target.value })}>
        {st === 'done' && <option value="done">✓ Done</option>}
        <option value="todo">To film</option>
        <option value="filmed">Filmed – needs link</option>
        <option value="skip">Skip (no video)</option>
      </select>
      <input key={`a:${item.film_assignee}`} className="fr-who" list="film-assignees" defaultValue={item.film_assignee} placeholder="Who’s filming?"
        aria-label={`Who is filming ${label}`} onBlur={blurSave('film_assignee')} onKeyDown={enter} />
      <input key={`n:${item.film_note}`} className="fr-note" defaultValue={item.film_note} placeholder="Note (angle, rope, who demos…)"
        aria-label={`Filming note for ${label}`} onBlur={blurSave('film_note')} onKeyDown={enter} />
      <input key={`v:${item.video_url}`} className="fr-link" type="url" inputMode="url" defaultValue={item.video_url} placeholder="Paste video link…"
        aria-label={`Video link for ${label}`} onBlur={blurSave('video_url')} onKeyDown={enter} />
    </div>
  );
}
