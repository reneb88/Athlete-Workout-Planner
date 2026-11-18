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
- **Print**: choose today's athletes (or everyone with a workout) and print them all at once, one athlete per page. You can also save them as a single PDF. Options: leave out challenges already checked off, include teaching notes. There's a live preview before printing.
- **Spreadsheet**: an editable, spreadsheet-style grid for the Master Library, the Athletes and the Combos. Tap a cell, type, and it saves when you move on. Add or delete rows.
- **Import / Export**: an `.xlsx` workbook (Excel or Google Sheets) containing the library, roster, combos, assignments, progress and templates. Import accepts the original *Ropeworks Athlete Workout Designer* workbook or this app's own export, in merge or replace mode.
- **Storage**: a SQLite database on the server (`data/ropeworks.db`), so every device sees the same data.

## Run it on your computer

1. Install **Node.js** (the “LTS” version) from https://nodejs.org. You only do this once.
2. Download this project from GitHub (**Code → Download ZIP**) and unzip it.
3. Double-click **`Start Ropeworks (Windows).bat`**. On a Mac, use **`Start Ropeworks (Mac).command`** instead.
   - The first start takes a minute while it installs.
   - Your browser then opens the app at http://localhost:3001.
   - Keep the black window open while you use the app, and close it to stop.
4. **On your iPad**: while the app is running on your computer, the black window shows an *“On your iPad”* address, for example `http://192.168.1.20:3001`. Open that address in Safari on the same Wi-Fi.

**Updating.** Close the black Ropeworks window, double-click **`Update Ropeworks (Windows).bat`** (it downloads the latest version, installs it and keeps your data), then start Ropeworks as usual.

**Coach password.** The first time you open the app, it asks you to create a coach password. Every device has to sign in once and then stays signed in. You can change the password under **Import/Export → Coach password**. If you forget it, double-click **`Reset Password (Windows).bat`** (or the Mac `.command` file, or run `npm run reset-password`) and then create a new one. Your data is kept. The password is stored only as a salted hash in your local database, never in this repository.

Your data lives in `data/ropeworks.db` inside the project folder. Back it up by copying that file, or by using **Import / Export → Download spreadsheet**.

For developers: run `npm install`, then `npm run dev` (hot reload on :5173), `npm test` or `npm start`.

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

Any host that supports Docker and a persistent disk will work (Render, Railway, Fly.io, a small VPS, and so on). The app is protected by the coach password. If you put it on the public internet, serve it over HTTPS.
