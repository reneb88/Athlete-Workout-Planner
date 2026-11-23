// Spreadsheet import / export (.xlsx) for Ropeworks Training Studio.
// Import understands both the original "Ropeworks Athlete Workout Designer" workbook and
// the workbook this app exports. Columns are matched by header text, not position.
import ExcelJS from 'exceljs';
import { readXlsx } from './xlsx-reader.js';

const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Locate a header row (within the first 12 rows) that contains `marker`, and return row objects.
function readTable(sheet, marker, aliases) {
  if (!sheet) return [];
  const rows = sheet.rows;
  let headerRow = 0;
  let headers = [];
  for (let r = 1; r <= Math.min(12, rows.length - 1); r++) {
    const vals = (rows[r] || []).map(norm);
    if (vals.includes(norm(marker))) { headerRow = r; headers = vals; break; }
  }
  if (!headerRow) return [];
  const colFor = {};
  for (const [key, names] of Object.entries(aliases)) {
    const idx = headers.findIndex((h) => h && names.map(norm).includes(h));
    if (idx > 0) colFor[key] = idx;
  }
  const out = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const obj = {};
    let any = false;
    for (const [key, col] of Object.entries(colFor)) {
      const t = row[col] ?? '';
      obj[key] = t;
      if (t) any = true;
    }
    if (any) out.push(obj);
  }
  return out;
}

const SKILL_ALIASES = {
  id: ['ID', 'Skill ID'],
  category: ['Master category', 'Category'],
  subcategory: ['Subcategory'],
  family: ['Skill family', 'Family'],
  name: ['Challenge / progression', 'Challenge', 'Name'],
  level: ['Level'],
  sequence: ['Sequence', 'Step'],
  target: ['Target'],
  prerequisites: ['Prerequisite', 'Prerequisites'],
  related: ['Related manipulation', 'Related'],
  video_url: ['Video URL', 'Video'],
  teaching_notes: ['Teaching cues', 'Teaching notes'],
  common_mistakes: ['Common mistakes'],
  source_page: ['Source page'],
  review_notes: ['Review notes'],
  leads_to: ['Leads to', 'Leads to (next skill family)', 'Next skill'],
  required_elements: ['Required element', 'Required elements', 'Official required element'],
  gif_url: ['GIF', 'GIF URL', 'GIF link', 'new gif'],
  film_status: ['Film status'],
  film_assignee: ['Film assigned to', 'Filmed by'],
  film_note: ['Film note', 'Filming note'],
};

export async function parseWorkbook(buffer) {
  const sheets = await readXlsx(buffer);
  const sheet = (name) => sheets.find((w) => norm(w.name) === norm(name));

  // Only columns that exist in the sheet are returned, so a partial sheet (e.g. just ID + Video URL)
  // updates those columns and leaves everything else alone.
  const skills = readTable(sheet('Master Library'), 'ID', SKILL_ALIASES).map((s) => {
    const out = { ...s };
    if ('prerequisites' in s) {
      const tokens = s.prerequisites ? s.prerequisites.split(/[,;\s]+/).filter(Boolean) : [];
      out.prerequisites = tokens.filter((t) => /^S\d+$/i.test(t)).map((t) => t.toUpperCase());
      if (s.prerequisites && out.prerequisites.length !== tokens.length) {
        out.teaching_notes = [s.teaching_notes || '', `Prerequisite: ${s.prerequisites}`].filter(Boolean).join('\n');
      }
    }
    return out;
  }).filter((s) => s.id);

  const athletes = readTable(sheet('Athlete Roster'), 'Athlete name', {
    id: ['Athlete slot', 'Athlete ID', 'ID'],
    name: ['Athlete name', 'Name'],
    group_notes: ['Group / notes', 'Group', 'Notes'],
    age: ['Age'],
    view_style: ['Athlete page', 'View style'],
  }).filter((a) => a.name).map((a, i) => ({ ...a, id: a.id || `A${String(i + 1).padStart(2, '0')}` }));

  const combos = readTable(sheet('Combo Library'), 'Combo ID', {
    id: ['Combo ID'],
    name: ['Combo name', 'Name'],
    kind: ['Type', 'Kind'],
    checkpoints: ['Checkpoint skill ID', 'Checkpoint skill IDs', 'Checkpoints'],
    after_combos: ['Ready after combo IDs', 'Ready after combos'],
    film_status: ['Film status'],
    film_assignee: ['Film assigned to', 'Filmed by'],
    film_note: ['Film note', 'Filming note'],
    video_url: ['Video URL', 'Video'],
    notes: ['Notes / choreography', 'Notes'],
  }).filter((c) => c.id && c.name).map((c) => ({
    ...c,
    kind: (c.kind ? norm(c.kind) === 'routine' : /routine/i.test(c.name)) ? 'routine' : 'combo',
    checkpoints: (c.checkpoints || '').split(/[,;\s]+/).filter(Boolean).map((t) => t.toUpperCase()),
    ...('after_combos' in c ? { after_combos: (c.after_combos || '').split(/[,;\s]+/).filter(Boolean).map((t) => t.toUpperCase()) } : {}),
  }));

  const assignRows = readTable(sheet('Assignments'), 'Athlete ID', {
    athlete_id: ['Athlete ID'], item_type: ['Type'], item_id: ['Item ID'], source: ['Source'], status: ['Status'],
  });
  const skillAssignments = assignRows.filter((r) => r.item_type === 'skill').map((r) => ({ athlete_id: r.athlete_id, skill_id: r.item_id }));
  const comboAssignments = assignRows.filter((r) => r.item_type === 'combo').map((r) => ({
    athlete_id: r.athlete_id, combo_id: r.item_id, source: r.source, status: r.status,
  }));

  const progress = readTable(sheet('Progress'), 'Athlete ID', {
    athlete_id: ['Athlete ID'], item_type: ['Type'], item_id: ['Item ID'], completed_at: ['Completed at'],
  });

  const noteSheet = sheet('Athlete Notes');
  const athleteNotes = noteSheet ? readTable(noteSheet, 'Athlete ID', {
    athlete_id: ['Athlete ID'], kind: ['Type'], title: ['Title'], notes: ['Notes', 'Moves / notes'], video_url: ['Video URL'], done: ['Done'],
    skill_id: ['Skill ID'], combo_id: ['Combo ID'], videos: ['More videos'],
  }).map((n) => ({ ...n, notes: n.notes })) : undefined;

  const templates = readTable(sheet('Templates'), 'Template name', {
    name: ['Template name'], description: ['Description'], skill_ids: ['Skill IDs'], combo_ids: ['Combo IDs'], dismissed_ids: ['Dismissed combo IDs'],
  }).map((t) => ({
    name: t.name,
    description: t.description,
    skill_ids: (t.skill_ids || '').split(/[,;\s]+/).filter(Boolean),
    combo_ids: (t.combo_ids || '').split(/[,;\s]+/).filter(Boolean),
    dismissed_ids: (t.dismissed_ids || '').split(/[,;\s]+/).filter(Boolean),
  }));

  const hasTemplatesSheet = !!sheet('Templates');
  return {
    skills, athletes, combos, skillAssignments, comboAssignments, progress,
    templates: hasTemplatesSheet ? templates : undefined,
    athleteNotes,
  };
}

const BRAND = 'FF0B1E3A';
const ACCENT = 'FFFF5A1F';

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Exo' };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  row.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

export async function buildWorkbook(store) {
  const snap = store.snapshot();
  const all = store.allAssignments();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ropeworks Training Studio';
  wb.created = new Date();

  const lib = wb.addWorksheet('Master Library', { properties: { tabColor: { argb: ACCENT } } });
  lib.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Master category', key: 'category', width: 15 },
    { header: 'Subcategory', key: 'subcategory', width: 28 },
    { header: 'Skill family', key: 'family', width: 22 },
    { header: 'Challenge / progression', key: 'name', width: 34 },
    { header: 'Level', key: 'level', width: 8 },
    { header: 'Sequence', key: 'sequence', width: 10 },
    { header: 'Target', key: 'target', width: 14 },
    { header: 'Prerequisite', key: 'prerequisites', width: 16 },
    { header: 'Related manipulation', key: 'related', width: 26 },
    { header: 'Video URL', key: 'video_url', width: 30 },
    { header: 'Teaching cues', key: 'teaching_notes', width: 36 },
    { header: 'Common mistakes', key: 'common_mistakes', width: 30 },
    { header: 'Source page', key: 'source_page', width: 11 },
    { header: 'Review notes', key: 'review_notes', width: 30 },
    { header: 'Leads to', key: 'leads_to', width: 40 },
    { header: 'Required element', key: 'required_elements', width: 30 },
    { header: 'Film status', key: 'film_status', width: 14 },
    { header: 'Film assigned to', key: 'film_assignee', width: 18 },
    { header: 'Film note', key: 'film_note', width: 30 },
    { header: 'GIF', key: 'gif_url', width: 40 },
  ];
  for (const s of snap.skills) lib.addRow({ ...s, prerequisites: s.prerequisites.join(', '), leads_to: s.leads_to ? s.leads_to.split('|').join(' › ') : '' });
  styleHeader(lib);

  const ros = wb.addWorksheet('Athlete Roster');
  ros.columns = [
    { header: 'Athlete slot', key: 'id', width: 12 },
    { header: 'Athlete name', key: 'name', width: 26 },
    { header: 'Group / notes', key: 'group_notes', width: 30 },
    { header: 'Age', key: 'age', width: 8 },
    { header: 'Athlete page', key: 'view_style', width: 14 },
  ];
  snap.athletes.forEach((a) => ros.addRow(a));
  styleHeader(ros);

  const skillName = Object.fromEntries(snap.skills.map((s) => [s.id, s]));
  const cl = wb.addWorksheet('Combo Library');
  cl.columns = [
    { header: 'Combo ID', key: 'id', width: 10 },
    { header: 'Combo name', key: 'name', width: 30 },
    { header: 'Type', key: 'kind', width: 10 },
    { header: 'Checkpoint skill ID', key: 'checkpoints', width: 20 },
    { header: 'Ready after (linked skill)', key: 'ready', width: 40 },
    { header: 'Ready after combo IDs', key: 'after_combos', width: 20 },
    { header: 'Film status', key: 'film_status', width: 14 },
    { header: 'Film assigned to', key: 'film_assignee', width: 18 },
    { header: 'Film note', key: 'film_note', width: 30 },
    { header: 'Video URL', key: 'video_url', width: 30 },
    { header: 'Notes / choreography', key: 'notes', width: 40 },
  ];
  for (const c of snap.combos) {
    cl.addRow({
      ...c,
      checkpoints: c.checkpoints.join(', '),
      after_combos: (c.after_combos || []).join(', '),
      ready: c.checkpoints.map((id) => skillName[id] ? `${skillName[id].family}: ${skillName[id].name}${skillName[id].target ? ' – ' + skillName[id].target : ''}` : id).join('; '),
    });
  }
  styleHeader(cl);

  const athName = Object.fromEntries(snap.athletes.map((a) => [a.id, a.name]));
  const comboName = Object.fromEntries(snap.combos.map((c) => [c.id, c.name]));
  const as = wb.addWorksheet('Assignments');
  as.columns = [
    { header: 'Athlete ID', key: 'athlete_id', width: 11 },
    { header: 'Athlete name', key: 'athlete', width: 24 },
    { header: 'Type', key: 'item_type', width: 8 },
    { header: 'Item ID', key: 'item_id', width: 9 },
    { header: 'Item', key: 'item', width: 40 },
    { header: 'Source', key: 'source', width: 11 },
    { header: 'Status', key: 'status', width: 11 },
  ];
  for (const a of all.skills) {
    const s = skillName[a.skill_id];
    as.addRow({ athlete_id: a.athlete_id, athlete: athName[a.athlete_id], item_type: 'skill', item_id: a.skill_id,
      item: s ? `${s.family}: ${s.name}${s.target ? ' – ' + s.target : ''}` : '', source: '', status: 'assigned' });
  }
  for (const a of all.combos) {
    as.addRow({ athlete_id: a.athlete_id, athlete: athName[a.athlete_id], item_type: 'combo', item_id: a.combo_id,
      item: comboName[a.combo_id], source: a.source, status: 'assigned' });
  }
  for (const a of all.dismissals) {
    as.addRow({ athlete_id: a.athlete_id, athlete: athName[a.athlete_id], item_type: 'combo', item_id: a.combo_id,
      item: comboName[a.combo_id], source: 'suggested', status: 'dismissed' });
  }
  styleHeader(as);

  const nt = wb.addWorksheet('Athlete Notes');
  nt.columns = [
    { header: 'Athlete ID', key: 'athlete_id', width: 11 },
    { header: 'Athlete name', key: 'athlete', width: 24 },
    { header: 'Type', key: 'kind', width: 10 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Notes', key: 'notes', width: 60 },
    { header: 'Video URL', key: 'video_url', width: 30 },
    { header: 'Done', key: 'done', width: 8 },
    { header: 'Skill ID', key: 'skill_id', width: 9 },
    { header: 'Combo ID', key: 'combo_id', width: 9 },
    { header: 'More videos', key: 'videos', width: 50 },
  ];
  for (const n of store.allNotes()) {
    const vids = (() => { try { return JSON.parse(n.videos || '[]'); } catch { return []; } })();
    const row = nt.addRow({ ...n, athlete: athName[n.athlete_id], done: n.done ? 'yes' : '', videos: vids.map((v) => `${v.label ? v.label + ': ' : ''}${v.url}`).join('; ') });
    row.getCell('notes').alignment = { wrapText: true, vertical: 'top' };
  }
  styleHeader(nt);

  const pr = wb.addWorksheet('Progress');
  pr.columns = [
    { header: 'Athlete ID', key: 'athlete_id', width: 11 },
    { header: 'Athlete name', key: 'athlete', width: 24 },
    { header: 'Type', key: 'item_type', width: 8 },
    { header: 'Item ID', key: 'item_id', width: 9 },
    { header: 'Item', key: 'item', width: 40 },
    { header: 'Completed at', key: 'completed_at', width: 22 },
  ];
  for (const p of all.progress) {
    const s = skillName[p.item_id];
    pr.addRow({ ...p, athlete: athName[p.athlete_id],
      item: p.item_type === 'skill' ? (s ? `${s.family}: ${s.name}` : '') : comboName[p.item_id] });
  }
  styleHeader(pr);

  const tp = wb.addWorksheet('Templates');
  tp.columns = [
    { header: 'Template name', key: 'name', width: 26 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Skill IDs', key: 'skill_ids', width: 60 },
    { header: 'Combo IDs', key: 'combo_ids', width: 20 },
    { header: 'Dismissed combo IDs', key: 'dismissed_ids', width: 20 },
  ];
  for (const t of snap.templates) {
    tp.addRow({ ...t, skill_ids: t.skill_ids.join(', '), combo_ids: t.combo_ids.join(', '), dismissed_ids: t.dismissed_ids.join(', ') });
  }
  styleHeader(tp);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
