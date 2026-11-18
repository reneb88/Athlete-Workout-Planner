import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';
import { parseWorkbook, buildWorkbook } from '../workbook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seed = fs.readFileSync(path.join(ROOT, 'data', 'library-seed.xlsx'));

async function fresh() {
  const store = openDb(':memory:');
  store.importData(await parseWorkbook(seed));
  for (let i = 1; i <= 5; i++) store.createAthlete({ id: `A0${i}`, name: `Test Athlete ${i}` });
  return store;
}

test('library seed imports all skills and combos', async () => {
  const s = await fresh();
  const snap = s.snapshot();
  assert.equal(snap.skills.length, 240);
  assert.equal(snap.athletes.length, 5);
  assert.deepEqual(snap.combos.map((c) => c.id), ['C001', 'C002']);
  assert.deepEqual(snap.combos[0].checkpoints, ['S201']);
  assert.equal(snap.combos[1].kind, 'routine');
  assert.deepEqual([...new Set(snap.skills.map((x) => x.category))].sort(), ['Manipulation', 'Multiples', 'Power']);
});

test('assigning a checkpoint auto-suggests its combo; dismissals persist per athlete', async () => {
  const s = await fresh();
  let w = s.saveWorkout('A01', { skill_ids: ['S199', 'S201'] });
  assert.deepEqual(w.combos, [{ id: 'C001', source: 'suggested' }]);
  w = s.saveWorkout('A01', { skill_ids: ['S199', 'S201'], dismissed_ids: ['C001'] });
  assert.deepEqual(w.combos, []);
  assert.deepEqual(w.dismissed_ids, ['C001']);
  // other athletes unaffected
  assert.deepEqual(s.saveWorkout('A02', { skill_ids: ['S201'] }).combos.map((c) => c.id), ['C001']);
  // standalone routine can be assigned manually
  w = s.saveWorkout('A03', { skill_ids: [], combo_ids: ['C002'] });
  assert.deepEqual(w.combos, [{ id: 'C002', source: 'manual' }]);
});

test('add mode merges with existing workout', async () => {
  const s = await fresh();
  s.saveWorkout('A01', { skill_ids: ['S001'] });
  const w = s.saveWorkout('A01', { skill_ids: ['S002'], mode: 'add' });
  assert.deepEqual(w.skill_ids.sort(), ['S001', 'S002']);
});

test('progress is saved and removed', async () => {
  const s = await fresh();
  s.saveWorkout('A01', { skill_ids: ['S001'] });
  assert.equal(s.setProgress('A01', 'skill', 'S001', true).progress.length, 1);
  assert.equal(s.setProgress('A01', 'skill', 'S001', false).progress.length, 0);
});

test('skill CRUD, reorder and new IDs', async () => {
  const s = await fresh();
  const n = s.createSkill({ category: 'Power', subcategory: 'Push-ups', family: 'Push-up', name: 'Clap push-up', prerequisites: 'S001, S002' });
  assert.equal(n.id, 'S241');
  assert.deepEqual(n.prerequisites, ['S001', 'S002']);
  assert.equal(n.sequence, 3);
  s.reorderSkills(['S241', 'S5000']);
  assert.equal(s.getSkill('S241').sequence, 1);
  s.updateSkill('S241', { video_url: 'https://youtu.be/x' });
  assert.equal(s.getSkill('S241').video_url, 'https://youtu.be/x');
  assert.ok(s.deleteSkill('S241'));
});

test('export → import round-trip keeps everything', async () => {
  const a = await fresh();
  a.saveWorkout('A05', { skill_ids: ['S201', 'S010'], combo_ids: ['C002'] });
  a.setProgress('A05', 'skill', 'S010', true);
  a.createTemplate({ name: 'Rec level 1', skill_ids: ['S001', 'S002'] });
  const buf = await buildWorkbook(a);
  const b = openDb(':memory:');
  const counts = b.importData(await parseWorkbook(buf), { replace: true });
  assert.equal(counts.skills, 240);
  assert.equal(counts.templates, 1);
  const w = b.getWorkout('A05');
  assert.deepEqual(w.skill_ids.sort(), ['S010', 'S201']);
  assert.deepEqual(w.combos.map((c) => c.id).sort(), ['C001', 'C002']);
  assert.equal(w.progress.length, 1);
});

const original = path.join(ROOT, 'data', 'seed.xlsx');
test('original Ropeworks workbook (if present locally) imports roster too', { skip: !fs.existsSync(original) }, async () => {
  const d = await parseWorkbook(fs.readFileSync(original));
  assert.equal(d.skills.length, 240);
  assert.equal(d.athletes.length, 49);
  assert.equal(d.combos.length, 2);
});

test('API requires the coach password', async () => {
  const { createApp } = await import('../index.js');
  const app = await createApp({ dbFile: ':memory:', seedFile: path.join(ROOT, 'data', 'library-seed.xlsx') });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (u, body, cookie) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  try {
    assert.deepEqual(await (await fetch(base + '/api/auth')).json(), { hasPassword: false, authed: false });
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/export.xlsx')).status, 401);
    assert.equal((await post('/api/auth/setup', { password: '123' })).status, 400);
    const setup = await post('/api/auth/setup', { password: 'test-pass-1' });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/state', { headers: { cookie } })).status, 200);
    assert.equal((await post('/api/auth/setup', { password: 'another1' })).status, 409);
    assert.equal((await post('/api/auth/login', { password: 'wrong' })).status, 401);
    const login = await post('/api/auth/login', { password: 'test-pass-1' });
    assert.equal(login.status, 200);
    await post('/api/auth/logout', {}, cookie);
    assert.equal((await fetch(base + '/api/state', { headers: { cookie } })).status, 401);
  } finally { server.close(); }
});

test('"Try" steps link to the family they lead to', async () => {
  const s = await fresh();
  assert.equal(s.getSkill('S004').leads_to, 'Basic bounce');
  assert.equal(s.getSkill('S008').leads_to, 'Double under');
  assert.equal(s.getSkill('S202').leads_to, ''); // "Try CC #1": no CC family
  s.updateSkill('S202', { leads_to: 'Spiderman' });
  assert.equal(s.getSkill('S202').leads_to, 'Spiderman');
  // round-trips through export/import
  const b = openDb(':memory:');
  b.importData(await parseWorkbook(await buildWorkbook(s)), { replace: true });
  assert.equal(b.getSkill('S202').leads_to, 'Spiderman');
  // importing a workbook without a "Leads to" column keeps links made in the app
  b.importData({ skills: [{ id: 'S202', category: 'Manipulation', subcategory: 'Arm Action/Crosses', family: 'Cross', name: 'Try CC #1' }] });
  assert.equal(b.getSkill('S202').leads_to, 'Spiderman');
});

test('re-importing an exported workbook does not duplicate templates', async () => {
  const s = await fresh();
  s.createTemplate({ name: 'Apples', skill_ids: ['S001'] });
  const buf = await buildWorkbook(s);
  s.importData(await parseWorkbook(buf));
  s.importData(await parseWorkbook(buf));
  assert.equal(s.snapshot().templates.filter((t) => t.name === 'Apples').length, 1);
});

test('a videos-only sheet (ID + Video URL) updates just the videos', async () => {
  const s = await fresh();
  s.updateSkill('S110', { teaching_notes: 'keep me' });
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Master Library');
  ws.addRow(['ID', 'Video URL']);
  ws.addRow(['S110', 'https://vimeo.com/120907342']);
  ws.addRow(['S111', 'https://vimeo.com/120907342?t=25']);
  ws.addRow(['S999', 'https://vimeo.com/1']); // unknown ID is ignored
  const counts = s.importData(await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer())));
  assert.equal(counts.skills, 2);
  const t = s.getSkill('S110');
  assert.equal(t.video_url, 'https://vimeo.com/120907342');
  assert.equal(t.teaching_notes, 'keep me');
  assert.equal(t.name, 'Toad');
  assert.equal(s.getSkill('S111').video_url, 'https://vimeo.com/120907342?t=25');
  assert.equal(s.snapshot().skills.length, 240);
});

test('a family is one progression across categories', async () => {
  const s = await fresh();
  const seq = (fam) => s.snapshot().skills.filter((x) => x.family.toLowerCase() === fam).sort((a, b) => a.sequence - b.sequence)
    .map((x) => `${x.sequence}:${x.id}`).join(' ');
  // 360 turn: Manipulation steps then the Multiples doubles/triples, numbered 1..6
  assert.equal(seq('360 turn'), '1:S016 2:S017 3:S018 4:S019 5:S020 6:S021');
  // renaming a step's family moves it to the end of that family
  s.updateSkill('S021', { family: 'Toad' });
  assert.equal(s.getSkill('S021').sequence, 8); // Toad has 7 steps (6 Leg Overs + 1 double)
  // new steps go to the end of the family, whatever their category
  assert.equal(s.createSkill({ category: 'Multiples', subcategory: 'Doubles', family: '360 turn', name: '360 double cross' }).sequence, 6);
});

test('new or renamed "Try …" steps link themselves', async () => {
  const s = await fresh();
  const n = s.createSkill({ category: 'Manipulation', subcategory: 'Starters', family: 'Basic bounce', name: 'Try Double Under' });
  assert.equal(n.leads_to, 'Double under');
  s.updateSkill('S001', { name: 'Try toad' });
  assert.equal(s.getSkill('S001').leads_to, 'Toad');
});

test('official required elements are stored, normalised and round-trip', async () => {
  const s = await fresh();
  s.updateSkill('S010', { required_elements: ['manipulation'] });
  s.updateSkill('S019', { required_elements: 'multiples; power' });
  assert.equal(s.getSkill('S010').required_elements, 'Manipulation');
  assert.equal(s.getSkill('S019').required_elements, 'Multiples, Power & Gymnastics');
  const b = openDb(':memory:');
  b.importData(await parseWorkbook(await buildWorkbook(s)), { replace: true });
  assert.equal(b.getSkill('S019').required_elements, 'Multiples, Power & Gymnastics');
});

test('combos and routines can be ready after other combos (chains)', async () => {
  const s = await fresh();
  const routine = s.createCombo({ name: 'Big routine', kind: 'routine', after_combos: ['C001'] });
  const finale = s.createCombo({ name: 'Finale', after_combos: [routine.id] });
  assert.deepEqual(s.getCombo(routine.id).after_combos, ['C001']);
  // S201 is C001's checkpoint → C001 suggested → routine → finale
  let w = s.saveWorkout('A01', { skill_ids: ['S201'] });
  assert.deepEqual(w.combos.map((c) => c.id).sort(), ['C001', routine.id, finale.id].sort());
  // dismissing the routine stops it (and what hangs off it only appears if the athlete has the routine)
  w = s.saveWorkout('A01', { skill_ids: ['S201'], dismissed_ids: [routine.id] });
  assert.deepEqual(w.combos.map((c) => c.id), ['C001']);
  // round-trips
  const b = openDb(':memory:');
  b.importData(await parseWorkbook(await buildWorkbook(s)), { replace: true });
  assert.deepEqual(b.getCombo(finale.id).after_combos, [routine.id]);
});

test('filming punch list fields on skills and combos', async () => {
  const s = await fresh();
  s.updateSkill('S110', { film_status: 'Filmed', film_assignee: 'Coach Sam', film_note: 'side view' });
  s.updateSkill('S111', { film_status: 'skip' });
  s.updateCombo('C001', { film_status: 'filmed', film_assignee: 'Jo' });
  assert.equal(s.getSkill('S110').film_status, 'filmed');
  assert.equal(s.getSkill('S111').film_status, 'skip');
  assert.equal(s.getCombo('C001').film_assignee, 'Jo');
  s.saveWorkout('A01', { skill_ids: ['S110'] });
  assert.equal(s.snapshot().skillUse.S110, 1);
  const b = openDb(':memory:');
  b.importData(await parseWorkbook(await buildWorkbook(s)), { replace: true });
  assert.equal(b.getSkill('S110').film_assignee, 'Coach Sam');
  assert.equal(b.getCombo('C001').film_status, 'filmed');
});
