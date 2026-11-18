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
