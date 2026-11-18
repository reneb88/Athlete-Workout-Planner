import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { AppCtx, Icon } from './components.jsx';
import Designer from './views/Designer.jsx';
import Library from './views/Library.jsx';
import Combos from './views/Combos.jsx';
import Athletes from './views/Athletes.jsx';
import AthleteView from './views/AthleteView.jsx';
import DataPage from './views/DataPage.jsx';
import PrintCenter from './views/PrintCenter.jsx';
import Spreadsheet from './views/Spreadsheet.jsx';

const NAV = [
  { id: 'designer', label: 'Workout Designer', short: 'Designer' },
  { id: 'print', label: 'Print', short: 'Print' },
  { id: 'library', label: 'Master Library', short: 'Library' },
  { id: 'combos', label: 'Combo Library', short: 'Combos' },
  { id: 'sheet', label: 'Spreadsheet', short: 'Sheet' },
  { id: 'athletes', label: 'Athletes', short: 'Athletes' },
  { id: 'data', label: 'Import/Export', short: 'Data' },
];

function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { page: parts[0] || 'designer', arg: parts[1] || null };
}

export function go(page, arg) {
  window.location.hash = `#/${page}${arg ? '/' + encodeURIComponent(arg) : ''}`;
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [route, setRoute] = useState(parseHash);
  const [toasts, setToasts] = useState([]);

  const reload = useCallback(async () => {
    try { setData(await api.state()); setError(null); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const f = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const toast = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // Run an API call, surface errors as toasts, refresh shared state afterwards.
  const run = useCallback(async (fn, okMsg) => {
    try {
      const r = await fn();
      await reload();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      toast(e.message, 'err');
      throw e;
    }
  }, [reload, toast]);

  const ctx = useMemo(() => data && ({
    ...data,
    skillById: Object.fromEntries(data.skills.map((s) => [s.id, s])),
    comboById: Object.fromEntries(data.combos.map((c) => [c.id, c])),
    athleteById: Object.fromEntries(data.athletes.map((a) => [a.id, a])),
    reload, toast, run,
  }), [data, reload, toast, run]);

  const athleteMode = route.page === 'athlete';

  return (
    <div className={`app ${athleteMode ? 'athlete-mode' : ''}`}>
      <header className="topbar no-print">
        <a className="brand" href="#/designer" aria-label="Ropeworks Training Studio home">
          <span className="brand-mark"><img src="/icon.svg" alt="" /></span>
          <span className="brand-text"><strong>ROPEWORKS</strong><small>Training Studio</small></span>
        </a>
        <nav className="tabs">
          {NAV.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={route.page === n.id || (athleteMode && n.id === 'athletes') ? 'on' : ''}>
              <span className="long">{n.label}</span><span className="short">{n.short}</span>
            </a>
          ))}
        </nav>
      </header>
      <main className="main">
        {error && (
          <div className="banner err">
            Couldn’t reach the Ropeworks server: {error}
            <button className="btn sm" onClick={reload}>Retry</button>
          </div>
        )}
        {!ctx && !error && <div className="loading">Loading…</div>}
        {ctx && (
          <AppCtx.Provider value={ctx}>
            {route.page === 'designer' && <Designer initialAthlete={route.arg} />}
            {route.page === 'library' && <Library />}
            {route.page === 'combos' && <Combos />}
            {route.page === 'athletes' && <Athletes />}
            {route.page === 'athlete' && <AthleteView athleteId={route.arg} key={route.arg} />}
            {route.page === 'data' && <DataPage />}
            {route.page === 'print' && <PrintCenter initial={route.arg} key={route.arg || 'print'} />}
            {route.page === 'sheet' && <Spreadsheet />}
            {!['designer', 'library', 'combos', 'athletes', 'athlete', 'data', 'print', 'sheet'].includes(route.page) && <Designer />}
          </AppCtx.Provider>
        )}
      </main>
      <div className="toasts no-print" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}><Icon name={t.tone === 'err' ? 'x' : 'check'} size={18} /> {t.msg}</div>
        ))}
      </div>
    </div>
  );
}
