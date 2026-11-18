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

/** Turn a YouTube / Vimeo link into an embeddable URL; null if not embeddable. */
export function embedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host === 'youtube.com') {
      if (u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
      if (m) return `https://www.youtube.com/embed/${m[2]}`;
    }
    if (host === 'vimeo.com') {
      const m = u.pathname.match(/^\/(\d+)/);
      if (m) return `https://player.vimeo.com/video/${m[1]}`;
    }
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return url;
  } catch { /* not a URL */ }
  return null;
}

export const isDirectVideo = (url) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || '');
