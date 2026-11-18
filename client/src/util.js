export const CATEGORIES = ['Manipulation', 'Multiples', 'Power'];

/**
 * Build Category → Subcategory → Family → [skills] tree.
 * Subcategories and families keep their first-appearance order from the library;
 * challenges within a family are ordered by sequence.
 */
export function buildTree(skills) {
  const cats = new Map(CATEGORIES.map((c) => [c, new Map()]));
  const sorted = [...skills].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  for (const s of sorted) {
    if (!cats.has(s.category)) cats.set(s.category, new Map());
    const subs = cats.get(s.category);
    const sub = s.subcategory || 'General';
    if (!subs.has(sub)) subs.set(sub, new Map());
    const fams = subs.get(sub);
    const fam = s.family || 'General';
    if (!fams.has(fam)) fams.set(fam, []);
    fams.get(fam).push(s);
  }
  return [...cats].map(([category, subs]) => ({
    key: `c:${category}`,
    name: category,
    subs: [...subs].map(([sub, fams]) => ({
      key: `s:${category}|${sub}`,
      name: sub,
      families: [...fams].map(([fam, list]) => ({
        key: `f:${category}|${sub}|${fam}`,
        name: fam,
        skills: list.sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
      })),
    })),
  }));
}

export const idsOfFamily = (f) => f.skills.map((s) => s.id);
export const idsOfSub = (s) => s.families.flatMap(idsOfFamily);
export const idsOfCat = (c) => c.subs.flatMap(idsOfSub);

export function matchesSearch(skill, q) {
  if (!q) return true;
  const hay = [skill.id, skill.name, skill.family, skill.subcategory, skill.category, skill.target,
    skill.related, skill.teaching_notes, skill.common_mistakes, skill.level].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

export function skillLabel(s) {
  return s ? `${s.name}${s.target ? ` – ${s.target}` : ''}` : '';
}

/** "83", "83s", "1:23", "1m23s", "1h2m3s" → seconds (null if blank/invalid). */
export function parseTime(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?s?$/.test(t)) return Math.round(parseFloat(t));
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) return t.split(':').reduce((a, n) => a * 60 + Number(n), 0);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (m && (m[1] || m[2] || m[3])) return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  return null;
}

/** 83 → "1:23" */
export function formatTime(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Split a video link into its base link and start/end times (from t=, start=, end= or #t=). */
export function splitVideo(url) {
  if (!url) return { base: '', start: null, end: null };
  try {
    const u = new URL(url);
    const start = parseTime(u.searchParams.get('t') ?? u.searchParams.get('start') ?? (u.hash.match(/t=([^&]+)/)?.[1]));
    const end = parseTime(u.searchParams.get('end'));
    ['t', 'start', 'end'].forEach((k) => u.searchParams.delete(k));
    u.hash = '';
    return { base: u.toString(), start, end };
  } catch {
    return { base: url, start: null, end: null };
  }
}

/** Build a link to one part of a video: base link + start (and optional end) in seconds. */
export function videoAt(base, start, end) {
  if (!base) return '';
  try {
    const u = new URL(base);
    ['t', 'start', 'end'].forEach((k) => u.searchParams.delete(k));
    if (start) u.searchParams.set('t', String(start));
    if (end) u.searchParams.set('end', String(end));
    return u.toString();
  } catch {
    return base;
  }
}

/** Turn a YouTube / Vimeo / .mp4 link into an embeddable URL that honours start/end times; null if not embeddable. */
export function embedUrl(url) {
  if (!url) return null;
  try {
    const { start, end } = splitVideo(url);
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    const yt = (id) => {
      const q = new URLSearchParams({ rel: '0', playsinline: '1' });
      if (start) q.set('start', String(start));
      if (end) q.set('end', String(end));
      if (start || end) q.set('autoplay', '1');
      return `https://www.youtube.com/embed/${id}?${q}`;
    };
    if (host === 'youtu.be') return yt(u.pathname.slice(1));
    if (host === 'youtube.com') {
      if (u.searchParams.get('v')) return yt(u.searchParams.get('v'));
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
      if (m) return yt(m[2]);
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const v = vimeoInfo(url);
      if (v) {
        const q = new URLSearchParams({ playsinline: '1', dnt: '1' });
        if (v.hash) q.set('h', v.hash);
        if (start || end) q.set('autoplay', '1');
        return `https://player.vimeo.com/video/${v.id}?${q}${start ? `#t=${start}s` : ''}`;
      }
    }
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) {
      const clean = new URL(url);
      ['t', 'start', 'end'].forEach((k) => clean.searchParams.delete(k));
      clean.hash = start || end ? `t=${start || 0}${end ? ',' + end : ''}` : '';
      return clean.toString();
    }
  } catch { /* not a URL */ }
  return null;
}

/** Vimeo id + private hash from any Vimeo link (vimeo.com/123, vimeo.com/123/abcdef, player.vimeo.com/video/123?h=abcdef, …). */
export function vimeoInfo(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)vimeo\.com$/.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.findIndex((p) => /^\d+$/.test(p));
    if (i < 0) return null;
    const next = parts[i + 1];
    const hash = u.searchParams.get('h') || (next && /^[0-9a-f]{6,}$/i.test(next) ? next : null);
    return { id: parts[i], hash };
  } catch { return null; }
}
export const isVimeo = (url) => !!vimeoInfo(url);

export const isDirectVideo = (url) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url || '');

/** "Category|Subcategory|Family" — how a skill's "Leads to" points at a family. */
export const familyKey = (s) => [s.category, s.subcategory || '', s.family || ''].join('|');
export const familyName = (key) => (key ? key.split('|')[2] || '' : '');
export const familyWhere = (key) => (key ? key.split('|').slice(0, 2).filter(Boolean).join(' › ') : '');
/** Skills in a family, in step order. */
export const familySkills = (skills, key) => skills.filter((s) => familyKey(s) === key)
  .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
/** All families, for pickers: [{ category, families: [{ key, name, where, count }] }] */
export function familyOptions(skills) {
  return buildTree(skills).map((c) => ({
    category: c.name,
    families: c.subs.flatMap((sub) => sub.families.map((f) => {
      const key = familyKey(f.skills[0]);
      return { key, name: f.name, where: `${c.name} › ${sub.name}`, count: f.skills.length };
    })),
  })).filter((c) => c.families.length);
}

/** Reverse of "Leads to": family key → names of the families that lead into it ("Builds on: …"). */
export function buildsOnMap(skills) {
  const m = {};
  for (const s of skills) {
    if (!s.leads_to) continue;
    const from = s.family || 'General';
    const list = (m[s.leads_to] ||= []);
    if (!list.includes(from)) list.push(from);
  }
  return m;
}
