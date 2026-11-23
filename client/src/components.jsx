import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { embedUrl, familyName, familyOptions, formatTime, isDirectVideo, isVimeo, shareUrl, splitVideo } from './util.js';

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
  // Rendered on top of the page (not inside whatever section opened it), so it never inherits that section's colours.
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function VideoModal({ url, title, onClose }) {
  const src = embedUrl(url);
  const { start, end, chapter } = splitVideo(url);
  return (
    <Modal title={title} onClose={onClose} wide>
      {(start || end) && <p className="muted small">Plays {formatTime(start || 0)}{end ? `–${formatTime(end)}` : ' onwards'}</p>}
      {chapter && !start && (
        <p className="banner warn small">This is a Vimeo <b>chapter</b> link — the player inside the app can’t jump to chapters, so it starts at 0:00.
          Give this step a start time instead (Library → Family video, or a link ending in #t=1m30s).</p>
      )}
      {src ? (
        isDirectVideo(src)
          ? <video className="video-frame" src={src} controls autoPlay playsInline />
          : isVimeo(url)
            ? <VimeoClip src={src} start={start} end={end} title={title} />
            : <iframe className="video-frame" src={src} title={title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
      ) : (
        <p className="muted">This link can’t be played inside the app.</p>
      )}
      <p><a className="btn ghost" href={shareUrl(url)} target="_blank" rel="noreferrer"><Icon name="link" /> Open video in new tab</a></p>
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

/** Form field. Use group for fields holding several controls (a <label> would forward clicks to the first one). */
export function Field({ label, children, hint, group = false }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="field" role={group ? 'group' : undefined} aria-label={group ? label : undefined}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Tag>
  );
}

export function Empty({ title, children }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

/** Pick a skill family (used for "Leads to"). value/onChange use the family key. */
export function FamilySelect({ value, onChange, skills, exclude, className = 'select block', label = 'Leads to' }) {
  const groups = familyOptions(skills);
  const v = familyName(value);
  const known = groups.some((g) => g.families.some((f) => f.key === v));
  const ex = (exclude || '').trim().toLowerCase();
  return (
    <select className={className} value={v} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">— none —</option>
      {v && !known && <option value={v}>{v} (not in the library)</option>}
      {groups.map((g) => (
        <optgroup key={g.category} label={g.category}>
          {g.families.filter((f) => f.key.toLowerCase() !== ex).map((f) => (
            <option key={f.key} value={f.key}>{f.name} — {f.where.split(' › ')[1]} ({f.count})</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Small, low-key "RE" tags for official required elements. */
export function ReTags({ skill }) {
  const list = String(skill?.required_elements || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length) return null;
  return list.map((r) => <span key={r} className="tag re" title={`Official required element: ${r}`}>RE · {r}</span>);
}

/**
 * Drag-to-reorder for a list, with a grip handle. Uses pointer events so it works with a finger on
 * iPad as well as a mouse. `onReorder(newIds)` is called when a row is dropped in a new place.
 */
export function useDragReorder(ids, onReorder, enabled = true) {
  const [drag, setDrag] = useState(null); // { id, y0, dy, to }
  const listRef = useRef(null);
  const dragRef = useRef(null);
  dragRef.current = drag;

  const targetIndex = (clientY, id) => {
    const rows = [...(listRef.current?.querySelectorAll('[data-drag-id]') || [])].filter((r) => r.dataset.dragId !== id);
    let to = 0;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      if (clientY > b.top + b.height / 2) to++;
    }
    return to;
  };
  const finish = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const rest = ids.filter((x) => x !== d.id);
    rest.splice(d.to, 0, d.id);
    if (rest.join() !== ids.join()) onReorder(rest);
  };

  const handleProps = (id) => (!enabled ? { style: { display: 'none' } } : {
    className: 'drag-grip',
    role: 'button',
    'aria-label': 'Drag to reorder',
    title: 'Drag to reorder',
    onClick: (e) => e.stopPropagation(),
    onPointerDown: (e) => {
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ id, y0: e.clientY, dy: 0, to: ids.filter((x) => x !== id).length ? ids.indexOf(id) : 0 });
    },
    onPointerMove: (e) => {
      const d = dragRef.current;
      if (!d || d.id !== id) return;
      setDrag({ ...d, dy: e.clientY - d.y0, to: targetIndex(e.clientY, id) });
    },
    onPointerUp: finish,
    onPointerCancel: () => setDrag(null),
  });

  const rowProps = (id) => {
    if (!drag) return { 'data-drag-id': id };
    if (drag.id === id) return { 'data-drag-id': id, className: 'dragging', style: { transform: `translateY(${drag.dy}px)` } };
    const rest = ids.filter((x) => x !== drag.id);
    const i = rest.indexOf(id);
    const cls = i === drag.to ? 'drop-before' : (i === rest.length - 1 && drag.to === rest.length ? 'drop-after' : '');
    return { 'data-drag-id': id, className: cls };
  };

  return { listRef, handleProps, rowProps, dragging: !!drag };
}

export function Grip(props) {
  return (
    <span {...props}>
      <svg width="16" height="22" viewBox="0 0 16 22" aria-hidden="true">
        {[4, 11, 18].flatMap((y) => [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="currentColor" />))}
      </svg>
    </span>
  );
}

/** An <ol> whose items can be dragged by their grip. renderItem(item, index, { rowProps, grip }). */
export function SortableList({ items, getId = (x) => x.id, enabled = true, onReorder, className = '', renderItem }) {
  const ids = items.map(getId);
  const dnd = useDragReorder(ids, onReorder, enabled);
  return (
    <ol ref={dnd.listRef} className={`${className} ${dnd.dragging ? 'is-dragging' : ''}`}>
      {items.map((it, i) => renderItem(it, i, { rowProps: dnd.rowProps(getId(it)), grip: enabled ? <Grip {...dnd.handleProps(getId(it))} /> : null }))}
    </ol>
  );
}

/** Small animated GIF preview; tap to see it big. */
export function GifThumb({ url, title = '', size = 48 }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (!url || broken) return null;
  return (
    <>
      <button type="button" className="gif-thumb" style={{ width: size, height: size }} aria-label={`Show GIF of ${title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      </button>
      {open && (
        <Modal title={title || 'GIF'} onClose={() => setOpen(false)} wide>
          <img className="gif-big" src={url} alt={title} />
        </Modal>
      )}
    </>
  );
}

/** Difficulty filter dropdown. */
export function DiffSelect({ value, onChange }) {
  const opts = [['any', 'Any difficulty'], ['1', '★ 1'], ['2', '★★ 2'], ['3', '★★★ 3'], ['4', '★★★★ 4'], ['5', '★★★★★ 5'], ['none', 'Not rated']];
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Difficulty">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
export function DiffStars({ skill }) {
  const n = parseInt(skill?.level, 10);
  if (!(n >= 1 && n <= 5)) return null;
  return <span className="diff-stars" title={`Difficulty ${n} of 5`}>{'★'.repeat(n)}</span>;
}
