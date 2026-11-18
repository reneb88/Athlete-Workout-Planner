import { api } from './api.js';
import { familySkills } from './util.js';

const COPY_FIELDS = ['category', 'subcategory', 'family', 'name', 'level', 'target', 'prerequisites', 'related', 'video_url',
  'teaching_notes', 'common_mistakes', 'review_notes', 'leads_to', 'required_elements'];

/** Copy a challenge (everything except its ID) and place the copy right after the original in its family. */
export async function duplicateSkill(run, skills, sk) {
  const body = Object.fromEntries(COPY_FIELDS.map((f) => [f, sk[f]]));
  const created = await run(() => api.createSkill(body));
  const ids = familySkills(skills, sk.family).map((x) => x.id).filter((id) => id !== created.id);
  ids.splice(ids.indexOf(sk.id) + 1, 0, created.id);
  await run(() => api.reorderSkills(ids), `Copied “${sk.name}” — now change what’s different`);
  return { ...created, sequence: ids.indexOf(created.id) + 1 };
}
