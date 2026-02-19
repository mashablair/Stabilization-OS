# Stabilization OS

A local-first personal web app for managing life-admin tasks with categories, subtasks, encouragement context, time tracking, and a progress dashboard.

## How to Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- **Today Stack** — Choose your daily role (Stabilizer / Builder / Caregiver), set available minutes, and focus on 3-5 prioritized tasks
- **Categories** — Organize tasks into LEGAL, MONEY, MAINTENANCE, EMOTIONAL domains with context cards (why, win condition, script)
- **Task Detail** — Inline editing, subtasks, context cards (why / next micro-step / reframe), priority, due dates, money impact
- **Focus Timer** — Start/pause/stop timer per task; persisted in IndexedDB so page refresh won't lose time
- **Dashboard** — Weekly stats (tasks completed, time tracked, money recovered, open loops), time allocation chart, open loops trend, friction log
- **Weekly Review** — Guided 10-15 minute wizard with estimate mismatch review, friction reflection, category focus, and smallest next step
- **Settings** — Export/import JSON share bundles, CSV exports (tasks + time entries), dark mode toggle, data reset

## Data Storage

All data is stored locally in your browser using IndexedDB (via Dexie.js). No backend required. Data persists across page refreshes.

## Export / Import

1. Go to **Settings**
2. Click **Export .json Bundle** to download all your data
3. To restore, click **Choose .json file** under Import — this overwrites local data
4. CSV exports are also available for `tasks_summary.csv` and `time_entries.csv`

## Seed Data

On first run, the app automatically creates 4 categories (LEGAL, MONEY, MAINTENANCE, EMOTIONAL) and 7 sample tasks. To re-seed, use the **Reset All Data** option in Settings and reload the page.

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Dexie.js (IndexedDB)
- Recharts (charts)
- React Router v7

## Building for Production

```bash
npm run build
npm run preview
```
