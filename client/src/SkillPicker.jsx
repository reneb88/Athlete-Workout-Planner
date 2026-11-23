import { useMemo, useState } from 'react';
import { Check, Icon, useApp } from './components.jsx';
import { familyHomes, famId, matchesSearch, skillLabel, typeRank } from './util.js';

/**
 * Multi-select skill picker: chips for what's selected, then a search whose results have tick boxes
 * (grouped by family, with a box to tick a whole family). The list stays open while you tick.
 */
export default function SkillPicker({ value, onChange, exclude, placeholder = 'Search skills to add…' }) {
  const { skills, skillById } = useApp();
  const [q, setQ] = useState('');
  const homes = useMemo(() => familyHomes(skills), [skills]);

  const groups = useMemo(() => {
    if (!q.trim()) return [];
    const hits = skills.filter((s) => s.id !== exclude && matchesSearch(s, q))
      .sort((a, b) => typeRank(homes.get(famId(a))?.category) - typeRank(homes.get(famId(b))?.category)
        || (homes.get(famId(a))?.first ?? 0) - (homes.get(famId(b))?.first ?? 0) || a.sequence - b.sequence);
    const m = new Map();
    for (const s of hits.slice(0, 80)) {
      const k = famId(s);
      if (!m.has(k)) m.set(k, { key: k, name: homes.get(k)?.name || s.family, where: homes.get(k) ? `${homes.get(k).category} › ${homes.get(k).subcategory}` : '', items: [] });
      m.get(k).items.push(s);
    }
    return [...m.values()];
  }, [q, skills, exclude, homes]);

  const shownIds = groups.flatMap((g) => g.items.map((s) => s.id));
  const sel = new Set(value);
  const setMany = (ids, on) => {
    const next = new Set(value);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange([...next]);
  };
  const tri = (ids) => {
    const n = ids.filter((id) => sel.has(id)).length;
    return n === 0 ? false : n === ids.length ? true : 'mixed';
  };

  return (
    <div className="picker">
      {value.length > 0 && (
        <div className="chips">
          {value.map((id) => {
            const s = skillById[id];
            return (
              <span key={id} className="chip">
                <b>{id}</b> {s ? `${s.family}: ${skillLabel(s)}` : '(missing)'}
                <button type="button" aria-label={`Remove ${id}`} onClick={() => onChange(value.filter((x) => x !== id))}><Icon name="x" size={16} /></button>
              </span>
            );
          })}
          {value.length > 1 && <button type="button" className="btn ghost sm" onClick={() => onChange([])}>Clear all</button>}
        </div>
      )}
      <div className="picker-search">
        <input type="search" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" className="btn ghost sm" onClick={() => setQ('')}>Done</button>}
      </div>
      {groups.length > 0 && (
        <div className="picker-results">
          <div className="picker-bar">
            <small className="muted">{shownIds.length} found · tick as many as you like</small>
            <button type="button" className="btn ghost sm" onClick={() => setMany(shownIds, tri(shownIds) !== true)}>
              {tri(shownIds) === true ? 'Untick all shown' : 'Select all shown'}
            </button>
          </div>
          {groups.map((g) => {
            const ids = g.items.map((s) => s.id);
            return (
              <div key={g.key} className="picker-group">
                <div className="picker-fam" onClick={() => setMany(ids, tri(ids) !== true)}>
                  <Check checked={tri(ids)} onChange={(on) => setMany(ids, on)} label={`All of ${g.name}`} />
                  <b>{g.name}</b><small className="muted">{g.where}</small>
                </div>
                {g.items.map((s) => (
                  <div key={s.id} className={`picker-item ${sel.has(s.id) ? 'on' : ''}`} onClick={() => setMany([s.id], !sel.has(s.id))}>
                    <Check checked={sel.has(s.id)} onChange={(on) => setMany([s.id], on)} label={skillLabel(s)} />
                    <span className="pill">{s.id}</span>
                    <span>{skillLabel(s)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
