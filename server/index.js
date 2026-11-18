// Ropeworks Training Studio — HTTP API + static web app.
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { initAuth } from './auth.js';
import { parseWorkbook, buildWorkbook } from './workbook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function createApp({ dbFile, seedFile } = {}) {
  const store = openDb(dbFile ?? process.env.DB_FILE ?? path.join(ROOT, 'data', 'ropeworks.db'));
  // data/seed.xlsx (your own full workbook, git-ignored) wins; otherwise the committed library-only seed.
  const seed = seedFile ?? [path.join(ROOT, 'data', 'seed.xlsx'), path.join(ROOT, 'data', 'library-seed.xlsx')].find((f) => fs.existsSync(f));
  if (store.isEmpty() && seed && fs.existsSync(seed)) {
    const counts = store.importData(await parseWorkbook(fs.readFileSync(seed)));
    console.log(`Seeded database from ${path.basename(seed)}:`, counts);
  }

  const app = express();
  // Hosting services (Render, Railway, Fly…) sit in front of the app and handle https.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  const h = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) {
      if (!e.status) console.error(e);
      res.status(e.status || 500).json({ error: e.message || 'Server error' });
    }
  };

  // ---------- Coach login ----------
  const auth = initAuth(store.db);
  app.get('/api/auth', (req, res) => res.json({ hasPassword: auth.hasPassword(), authed: auth.isAuthed(req) }));
  app.post('/api/auth/setup', h((req, res) => { auth.setup(req, res, req.body?.password); }));
  app.post('/api/auth/login', h((req, res) => { auth.login(req, res, req.body?.password); }));
  app.post('/api/auth/logout', h((req, res) => { auth.logout(req, res); }));
  app.post('/api/auth/change', h((req, res) => {
    if (!auth.isAuthed(req)) throw Object.assign(new Error('Please sign in'), { status: 401 });
    auth.change(req, res, req.body?.current, req.body?.next);
  }));
  // Everything else under /api requires a signed-in coach.
  app.use('/api', (req, res, next) => (auth.isAuthed(req) ? next() : res.status(401).json({ error: 'Please sign in' })));

  app.get('/api/state', h(() => store.snapshot()));
  app.put('/api/settings', h((req) => store.setSettings(req.body || {})));

  app.post('/api/skills', h((req) => store.createSkill(req.body)));
  app.put('/api/skills/:id', h((req) => store.updateSkill(req.params.id, req.body)));
  app.delete('/api/skills/:id', h((req) => ({ ok: store.deleteSkill(req.params.id) })));
  app.post('/api/skills/reorder', h((req) => { store.reorderSkills(req.body.ids || []); }));

  app.post('/api/athletes', h((req) => store.createAthlete(req.body)));
  app.put('/api/athletes/:id', h((req) => store.updateAthlete(req.params.id, req.body)));
  app.delete('/api/athletes/:id', h((req) => ({ ok: store.deleteAthlete(req.params.id) })));

  app.post('/api/combos', h((req) => store.createCombo(req.body)));
  app.put('/api/combos/:id', h((req) => store.updateCombo(req.params.id, req.body)));
  app.delete('/api/combos/:id', h((req) => ({ ok: store.deleteCombo(req.params.id) })));

  app.get('/api/workouts/:athleteId', h((req) => store.getWorkout(req.params.athleteId)));
  app.put('/api/workouts/:athleteId', h((req) => store.saveWorkout(req.params.athleteId, req.body)));
  // Save one working set to many athletes at once
  app.post('/api/workouts/bulk', h((req) => {
    const { athlete_ids = [], ...workout } = req.body;
    return athlete_ids.map((id) => store.saveWorkout(id, workout));
  }));
  app.put('/api/progress/:athleteId', h((req) =>
    store.setProgress(req.params.athleteId, req.body.item_type, req.body.item_id, !!req.body.done)));

  app.post('/api/templates', h((req) => ({ id: store.createTemplate(req.body) })));
  app.put('/api/templates/:id', h((req) => { store.updateTemplate(Number(req.params.id), req.body); }));
  app.delete('/api/templates/:id', h((req) => ({ ok: store.deleteTemplate(Number(req.params.id)) })));

  app.get('/api/export.xlsx', h(async (req, res) => {
    const buf = await buildWorkbook(store);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Athlete Workout Planner ${stamp}.xlsx"`);
    res.end(buf);
  }));

  app.post('/api/import', express.raw({ type: () => true, limit: '20mb' }), h(async (req) => {
    if (!req.body?.length) { const e = new Error('No file received'); e.status = 400; throw e; }
    let data;
    try { data = await parseWorkbook(req.body); } catch {
      const e = new Error('That file could not be read as an .xlsx spreadsheet'); e.status = 400; throw e;
    }
    if (!data.skills.length && !data.athletes.length && !data.combos.length) {
      const e = new Error('No Master Library, Athlete Roster or Combo Library sheet found'); e.status = 400; throw e;
    }
    return { counts: store.importData(data, { replace: req.query.mode === 'replace' }) };
  }));

  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.locals.store = store;
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3001;
  const app = await createApp();
  app.listen(port, '0.0.0.0', () => {
    const lan = Object.values(os.networkInterfaces()).flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n.address}:${port}`);
    console.log('\n  Ropeworks Training Studio is running.\n');
    console.log(`  On this computer:   http://localhost:${port}`);
    for (const u of lan) console.log(`  On your iPad:       ${u}   (same Wi-Fi)`);
    console.log('\n  Keep this window open while you use the app. Close it to stop.\n');
  });
}
