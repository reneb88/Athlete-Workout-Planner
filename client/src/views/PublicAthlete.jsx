import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { AppCtx, Icon } from '../components.jsx';
import AthleteView from './AthleteView.jsx';

/** What an athlete sees through their private link — no coach password, only their own page. */
export default function PublicAthlete({ token }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState('');
  const [toasts, setToasts] = useState([]);
  useEffect(() => { api.publicView(token).then(setV).catch((e) => setErr(e.message)); }, [token]);
  const toast = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  const ctx = useMemo(() => v && ({
    skills: v.skills, combos: v.combos, athletes: [v.athlete], templates: [], settings: v.settings,
    assignmentCounts: {}, skillUse: {},
    skillById: Object.fromEntries(v.skills.map((s) => [s.id, s])),
    comboById: Object.fromEntries(v.combos.map((c) => [c.id, c])),
    athleteById: { [v.athlete.id]: v.athlete },
    reload: () => {}, toast, run: async (fn) => fn(),
  }), [v, toast]);
  return (
    <div className="app public-view">
      <header className="topbar no-print">
        <span className="brand"><span className="brand-mark"><img src="/icon.svg" alt="" /></span>
          <span className="brand-text"><strong>ROPEWORKS</strong><small>Training Studio</small></span></span>
      </header>
      <main className="main">
        {err && <div className="banner err">{err}</div>}
        {!v && !err && <div className="loading">Loading…</div>}
        {ctx && (
          <AppCtx.Provider value={ctx}>
            <AthleteView athleteId={v.athlete.id} publicToken={token} initial={v.workout} />
          </AppCtx.Provider>
        )}
      </main>
      <div className="toasts no-print" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}><Icon name={t.tone === 'err' ? 'x' : 'check'} size={18} /> {t.msg}</div>)}
      </div>
    </div>
  );
}
