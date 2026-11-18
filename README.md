# Ropeworks Training Studio

An iPad-friendly web app for planning and tracking jump rope training: a master skill library, a workout designer for one or many athletes, a combo library with automatic “Can you do this? Try this combo!” suggestions, and an athlete checklist view with saved progress.

## Features

- **Master Library**: Manipulation / Multiples / Power → subcategory → skill family → progression steps. You can add, edit, delete and reorder challenges (up/down arrows), and give each one a video link, prerequisites, teaching notes, common mistakes and review notes. It has search and filters (needs review, has or is missing a video, combo checkpoints).
- **Workout Designer**: select one athlete, several athletes, or a whole group. Expand and collapse categories, subcategories and families, and tick a whole level or single challenges with tri-state checkboxes. The workout panel fills in as you tick, and you can remove items there. Then:
  - save for one athlete
  - replace the workout for many athletes, or add to what they already have
  - copy a workout from another athlete
  - save and load reusable templates
- **Combo Library**: combos and routines. Each can stand alone or be linked to one or more readiness-checkpoint skills. When a checkpoint is assigned, its combo is suggested automatically. The coach can keep or remove the suggestion for each athlete, and a removed suggestion stays removed. Combos are optional and are not progression steps.
- **Athlete View**: shows only the assigned challenges, grouped into collapsible skill families. It has large completion checkboxes and video demos (YouTube, Vimeo or .mp4 links play inside the app). Combo suggestions appear next to their checkpoints, and there's a separate Combos & Routines section. Progress is saved in the database.
- **Print and PDF**: a branded printable checklist (Print button) and a branded PDF download.
- **Import / Export**: an `.xlsx` workbook (Excel or Google Sheets) containing the library, roster, combos, assignments, progress and templates. Import accepts the original *Ropeworks Athlete Workout Designer* workbook or this app's own export, in merge or replace mode.
- **Storage**: a SQLite database on the server (`data/ropeworks.db`), so every device sees the same data.

## Run it

Requires **Node.js 22.13 or newer**.

```bash
npm install
npm run build
npm start            # → http://localhost:3001
```

To use it on an iPad at practice, run it on a laptop on the same Wi-Fi and open `http://<laptop-ip>:3001` in Safari. Then choose **Share → Add to Home Screen** so it opens full screen like an app.

For development with hot reload, run `npm run dev` and open http://localhost:5173.

Run the tests with `npm test`.

### Your athlete roster

The repository only includes the skill library and combos (`data/library-seed.xlsx`). It does **not** include athlete names. To load your roster, do either of the following:

- Put your full workbook at `data/seed.xlsx` before the first start. It is git-ignored and used instead of the library seed.
- Or, in the app, open **Import / Export → Merge** and choose your spreadsheet.

The database is created on first start. To start over, delete `data/ropeworks.db`.

### Hosting

The included `Dockerfile` runs the app with the database on a `/data` volume:

```bash
docker build -t ropeworks .
docker run -p 3001:3001 -v ropeworks-data:/data ropeworks
```

Any host that supports Docker and a persistent disk will work (Render, Railway, Fly.io, a small VPS, and so on). The app has **no login**. Before you put it on the public internet, put it behind your host's password protection or access control.
