export const CATEGORIES = ['Manipulation', 'Multiples', 'Power'];

/** Family identity: same family name (any category) = one progression. */
export const famId = (s) => String((s && s.family) || 'General').trim().toLowerCase();

/**
 * Where each family "lives": the category/subcategory of its first step (normally the manipulation
 * core skill). Multiples variants of that skill appear inside the same family.
 */
export function familyHomes(all) {
  const homes = new Map();
  for (const s of all) {
    const k = famId(s);
    const h = homes.get(k);
    if (!h || s.sequence < h.sequence || (s.sequence === h.sequence && s.sort_order < h.sort_order)) {
      homes.set(k, { category: s.category, subcategory: s.subcategory || 'General', name: (s.family || 'General').trim(), sequence: s.sequence, sort_order: s.sort_order, first: s.sort_order });
    }
  }
  for (const s of all) { const h = homes.get(famId(s)); if (s.sort_order < h.first) h.first = s.sort_order; }
  return homes;
}
export const homeOf = (homes, s) => homes.get(famId(s));

/**
 * Build Category → Subcategory → Family → [skills] tree. Each family is one progression shown under
 * its home category/subcategory (computed from `all`, so filtering doesn't move families around);
 * its steps are ordered by sequence across categories.
 */
export function buildTree(skills, all = skills) {
  const homes = familyHomes(all.length ? all : skills);
  const cats = new Map(CATEGORIES.map((c) => [c, new Map()]));
  const byFam = new Map();
  for (const s of skills) {
    const k = famId(s);
    if (!byFam.has(k)) byFam.set(k, []);
    byFam.get(k).push(s);
  }
  const fams = [...byFam.entries()].map(([k, list]) => ({ k, list, home: homes.get(k) || familyHomes(list).get(k) }))
    .sort((a, b) => a.home.first - b.home.first);
  for (const { k, list, home } of fams) {
    if (!cats.has(home.category)) cats.set(home.category, new Map());
    const subs = cats.get(home.category);
    if (!subs.has(home.subcategory)) subs.set(home.subcategory, []);
    subs.get(home.subcategory).push({
      key: `f:${k}`,
      name: home.name,
      category: home.category,
      subcategory: home.subcategory,
      skills: list.sort((a, b) => a.sequence - b.sequence || a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
    });
  }
  return [...cats].map(([category, subs]) => ({
    key: `c:${category}`,
    name: category,
    subs: [...subs].map(([sub, families]) => ({ key: `s:${category}|${sub}`, name: sub, families })),
  }));
}

/** True if a step sits in a different category/subcategory than its family's home (e.g. a double in a manipulation family). */
export const isVariant = (s, f) => s.category !== f.category || (s.subcategory || 'General') !== f.subcategory;

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
  if (!url) return { base: '', start: null, end: null, chapter: null };
  try {
    const u = new URL(url);
    const start = parseTime(u.searchParams.get('t') ?? u.searchParams.get('start') ?? (u.hash.match(/(?:^#|&)t=([^&]+)/)?.[1]));
    const end = parseTime(u.searchParams.get('end'));
    // Vimeo chapter links (#chapter=123): only vimeo.com understands these, not the embedded player.
    const chapter = u.hash.match(/chapter=(\d+)/)?.[1] || null;
    ['t', 'start', 'end'].forEach((k) => u.searchParams.delete(k));
    u.hash = '';
    return { base: u.toString(), start, end, chapter };
  } catch {
    return { base: url, start: null, end: null, chapter: null };
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

/** "Leads to" stores a family name. (Older data stored "Category|Subcategory|Family"; the last part is the name.) */
export const familyName = (ref) => (ref ? String(ref).split('|').pop().trim() : '');
export const familyKey = (s) => famId(s);
const refId = (ref) => familyName(ref).toLowerCase();
/** "Category › Subcategory" where a family lives. */
export const familyWhere = (ref, skills = []) => {
  const h = familyHomes(skills).get(refId(ref));
  return h ? `${h.category} › ${h.subcategory}` : '';
};
/** Skills in a family, in step order. */
export const familySkills = (skills, ref) => skills.filter((s) => famId(s) === refId(ref))
  .sort((a, b) => a.sequence - b.sequence || a.sort_order - b.sort_order || a.id.localeCompare(b.id));
/** All families, for pickers: [{ category, families: [{ key, name, where, count }] }] */
export function familyOptions(skills) {
  return buildTree(skills).map((c) => ({
    category: c.name,
    families: c.subs.flatMap((sub) => sub.families.map((f) => ({ key: f.name, name: f.name, where: `${c.name} › ${sub.name}`, count: f.skills.length }))),
  })).filter((c) => c.families.length);
}

/** Reverse of "Leads to": family key → names of the families that lead into it ("Builds on: …"). */
export function buildsOnMap(skills) {
  const m = {};
  for (const s of skills) {
    if (!s.leads_to) continue;
    const k = refId(s.leads_to);
    const from = (s.family || 'General').trim();
    const list = (m[k] ||= []);
    if (!list.includes(from)) list.push(from);
  }
  return m;
}

/** Official required-element categories (competition rules) — separate from the teaching categories. */
export const REQUIRED_ELEMENTS = ['Multiples', 'Power & Gymnastics', 'Manipulation'];
export const reList = (s) => String(s?.required_elements || '').split(',').map((x) => x.trim()).filter(Boolean);

/** YouTube video id from any YouTube link, or null. */
function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (host === 'youtube.com') return u.searchParams.get('v') || u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/)?.[2] || null;
  } catch { /* not a URL */ }
  return null;
}

/**
 * A link to give athletes (PDFs, printouts): opens the video on its own site at the step's start time.
 * Vimeo uses #t=…s, YouTube uses ?t=…; the "end" time can't be carried outside the app.
 */
export function shareUrl(url) {
  if (!url) return '';
  const { start, chapter } = splitVideo(url);
  const v = vimeoInfo(url);
  if (v) return `https://vimeo.com/${v.id}${v.hash ? '/' + v.hash : ''}${start ? `#t=${start}s` : chapter ? `#chapter=${chapter}` : ''}`;
  const yt = youtubeId(url);
  if (yt) return `https://youtu.be/${yt}${start ? `?t=${start}` : ''}`;
  const { base } = splitVideo(url);
  return start ? `${base}#t=${start}` : base;
}

/** The one video a whole family shares (if its steps all use the same video), as a share link from the start. */
export function familyVideoUrl(familySteps) {
  const bases = [...new Set(familySteps.map((s) => splitVideo(s.video_url).base).filter(Boolean))];
  return bases.length === 1 && familySteps.filter((s) => s.video_url).length > 1 ? shareUrl(bases[0]) : '';
}

/** 'videos' (video board) or 'checklist' for an athlete: their own setting, else automatic by age. */
export function athleteView(athlete, settings = {}) {
  if (athlete?.view_style === 'videos' || athlete?.view_style === 'checklist') return athlete.view_style;
  const from = Number(settings.videoBoardAge ?? 13);
  const age = parseFloat(athlete?.age);
  return from > 0 && Number.isFinite(age) && age >= from ? 'videos' : 'checklist';
}

/** Names of a skill's prerequisites, e.g. "Cross open, Side swing" (family name added when it differs). */
export function prereqText(skill, skillById) {
  return (skill?.prerequisites || []).map((id) => {
    const p = skillById[id];
    if (!p) return null;
    return p.family && p.family.trim().toLowerCase() !== String(skill.family).trim().toLowerCase() && p.name.toLowerCase() !== p.family.toLowerCase()
      ? `${p.family}: ${skillLabel(p)}` : skillLabel(p);
  }).filter(Boolean).join(', ');
}
