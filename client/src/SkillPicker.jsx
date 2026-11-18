import { useMemo, useState } from 'react';
import { Icon, useApp } from './components.jsx';
import { matchesSearch, skillLabel } from './util.js';

/** Chip list of selected skill IDs + a search box to add more. */
export default function SkillPicker({ value, onChange, exclude, placeholder = 'Search skills to add…' }) {
  const { skills, skillById } = useApp();
  const [q, setQ] = useState('');
  const results = useMemo(() => (q.trim()
    ? skills.filter((s) => !value.includes(s.id) && s.id !== exclude && matchesSearch(s, q)).slice(0, 12)
    : []), [q, skills, value, exclude]);
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
        </div>
      )}
      <input type="search" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="picker-results">
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => { onChange([...value, s.id]); setQ(''); }}>
                <span className="pill">{s.id}</span>
                <span><b>{skillLabel(s)}</b><small>{s.category} › {s.subcategory} › {s.family}</small></span>
                <Icon name="plus" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
