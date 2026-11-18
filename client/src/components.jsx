import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { embedUrl, familyName, familyOptions, familyWhere, formatTime, isDirectVideo, isVimeo, splitVideo } from './util.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function Icon({ name, size = 22 }) {
  const p = {
    chevron: <path d="M9 6l6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    check: <path d="M5 12.5l4.5 4.5L19 7" />,
    up: <path d="M6 15l6-6 6 6" />,
    down: <path d="M6 9l6 6 6-6" />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />,
    trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
    play: <path d="M8 5v14l11-7z" fill="currentColor" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
    print: <path d="M7 9V4h10v5M7 17H5v-6h14v6h-2M8 14h8v6H8z" />,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></>,
    bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5" /></>,
    file: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
    link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
  );
}

/** Tri-state checkbox: checked = true | false | 'mixed' */
export function Check({ checked, onChange, label, size = 'md', tone }) {
  const ref = useRef(null);
  return (
    <button type="button" ref={ref} role="checkbox" aria-checked={checked === 'mixed' ? 'mixed' : !!checked}
      aria-label={label} className={`check check-${size} ${checked === true ? 'on' : checked === 'mixed' ? 'mixed' : ''} ${tone || ''}`}
      onClick={(e) => { e.stopPropagation(); onChange(checked !== true); }}>
      {checked === true && <Icon name="check" size={size === 'lg' ? 26 : 20} />}
      {checked === 'mixed' && <span className="dash" />}
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function VideoModal({ url, title, onClose }) {
  const src = embedUrl(url);
  const { start, end } = splitVideo(url);
  return (
    <Modal title={title} onClose={onClose} wide>
      {(start || end) && <p className="muted small">Plays {formatTime(start || 0)}{end ? `–${formatTime(end)}` : ' onwards'}</p>}
      {src ? (
        isDirectVideo(src)
          ? <video className="video-frame" src={src} controls autoPlay playsInline />
          : isVimeo(url)
            ? <VimeoClip src={src} start={start} end={end} title={title} />
            : <iframe className="video-frame" src={src} title={title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
      ) : (
        <p className="muted">This link can’t be played inside the app.</p>
      )}
      <p><a className="btn ghost" href={url} target="_blank" rel="noreferrer"><Icon name="link" /> Open video in new tab</a></p>
    </Modal>
  );
}

/** Vimeo player that starts at `start` and pauses at `end` (Vimeo links can't stop on their own). */
function VimeoClip({ src, start, end, title }) {
  const ref = useRef(null);
  useEffect(() => {
    let player;
    let cancelled = false;
    import('@vimeo/player').then(({ default: Player }) => {
      if (cancelled || !ref.current) return;
      player = new Player(ref.current);
      if (start) player.setCurrentTime(start).catch(() => {});
      if (end) {
        player.on('timeupdate', ({ seconds }) => {
          if (seconds >= end) player.pause().then(() => player.setCurrentTime(start || 0)).catch(() => {});
        });
      }
    });
    return () => { cancelled = true; player?.off?.('timeupdate'); };
  }, [src, start, end]);
  return <iframe ref={ref} className="video-frame" src={src} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />;
}

export function Confirm({ text, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <Modal title="Are you sure?" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
      <p>{text}</p>
    </Modal>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search skills…' }) {
  return (
    <label className="search">
      <Icon name="search" />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value && <button className="icon-btn sm" onClick={() => onChange('')} aria-label="Clear search"><Icon name="x" size={18} /></button>}
    </label>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Disclosure({ open, onToggle, header, children, level = 0, className = '' }) {
  return (
    <div className={`disc lvl${level} ${open ? 'open' : ''} ${className}`}>
      <div className="disc-head" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}>
        <span className="chev"><Icon name="chevron" /></span>
        {header}
      </div>
      {open && <div className="disc-body">{children}</div>}
    </div>
  );
}

export function useOpenSet(initial = []) {
  const [open, setOpen] = useState(() => new Set(initial));
  const toggle = (k) => setOpen((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const setMany = (keys, val) => setOpen((o) => { const n = new Set(o); keys.forEach((k) => (val ? n.add(k) : n.delete(k))); return n; });
  return { open, toggle, setMany, isOpen: (k) => open.has(k), setOpen };
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ title, children }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

/** Pick a skill family (used for "Leads to"). value/onChange use the family key. */
export function FamilySelect({ value, onChange, skills, exclude, className = 'select block', label = 'Leads to' }) {
  const groups = familyOptions(skills);
  const known = groups.some((g) => g.families.some((f) => f.key === value));
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">— none —</option>
      {value && !known && <option value={value}>{familyName(value)} (missing: {familyWhere(value)})</option>}
      {groups.map((g) => (
        <optgroup key={g.category} label={g.category}>
          {g.families.filter((f) => f.key !== exclude).map((f) => (
            <option key={f.key} value={f.key}>{f.name} — {f.where.split(' › ')[1]} ({f.count})</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
