# Stabilization OS

A local-first personal web app for managing life-admin tasks with categories, subtasks, encouragement context, time tracking, wins journaling, and a progress dashboard.

## How to Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- **Today Stack** — Choose your daily role (Stabilizer / Builder) and focus on up to 5 tasks. Pin tasks you want; the algorithm suggests the rest. Mark tasks done with the ✓ checkmark icon next to each task. **Time Capacity** shows a three-segment bar: time spent today (green), allocated to your stack (purple), and breathing room (grey). Adjust capacity per day with the tune icon — changes apply to today only, with separate budgets for Stabilizer and Builder. The algorithm uses remaining capacity (capacity minus time spent) when suggesting tasks, so it won’t over-fill your stack after you complete longer tasks. A collapsible **Done Today** section celebrates completed tasks with motivational messages. **Log a win** to record accomplishments beyond your task list (e.g. started building this app, did a face mask).
- **All Tasks** — Dedicated page (main nav) to browse all active tasks by domain, with a collapsible **Done** section containing **Completed** and **Archived** tabs. Archive tasks to declutter without losing history.
- **Categories** — Organize tasks into LEGAL, MONEY, MAINTENANCE, CAREGIVER domains with context cards (why, win condition, script)
- **Task Detail** — Click the task name to edit it (display/edit mode prevents cursor jumping). Inline editing for other fields, subtasks with auto-completion (marking all subtasks done auto-completes the task), context cards (why / next micro-step / reframe), priority, due dates, money impact. Tasks track a `completedAt` timestamp for accurate reporting.
- **Focus Timer** — Start/pause/stop timer per task; persisted in IndexedDB so page refresh won't lose time. **Add time** manually (minutes or `h:mm`) when you forget to start the timer; remove sessions from history via the × button. Session history and total update live.
- **Dashboard** — Weekly stats (tasks completed, time tracked, money recovered, open loops), time allocation chart, open loops trend, friction log
- **Wins** — A dedicated page to log and browse accomplishments beyond your tracked tasks. Tag wins with life, biz, vitality, or community. Browse by week, month, quarter, or year. Quick-add from the Today page footer. Revisit during quarterly reviews or when you need a boost.
- **Weekly Review** — Guided wizard that starts with a **Wins** step highlighting completed tasks, time invested, money recovered, and **other wins** you logged this week, followed by estimate mismatches, friction reflection, category focus, and smallest next step
- **Settings** — Configure default daily capacity for Stabilizer and Builder, export/import JSON share bundles, CSV exports (tasks + time entries), dark mode toggle, data reset. Accessible via the gear icon in the header.

## Data Storage

All data is stored locally in your browser using IndexedDB (via Dexie.js) for this domain. No backend required. Data persists across page refreshes. Use **Export Share Bundle** in Settings for backups.

## Export / Import

1. Go to **Settings**
2. Click **Export .json Bundle** to download all your data
3. To restore, click **Choose .json file** under Import — this overwrites local data
4. CSV exports are also available for `tasks_summary.csv` and `time_entries.csv`

## Seed Data

On first run, the app automatically creates 4 categories (LEGAL, MONEY, MAINTENANCE, CAREGIVER) and 10 sample tasks. To re-seed, use the **Reset All Data** option in Settings and reload the page.

## Task Lifecycle

Tasks flow through these statuses: **BACKLOG** → **TODAY** → **IN_PROGRESS** → **DONE** → **ARCHIVED**. Tasks can also be set to **PENDING** (waiting) with an optional future action date. Completing all subtasks on a task automatically marks it as DONE. Undoing a completion always returns the task to BACKLOG.

## Testing

```bash
npm test
```

Tests use Vitest. `todayStack.test.ts` covers pure logic (scoring, stack building, actionable/waiting states, ARCHIVED behaviour, daily capacity overrides). `taskLifecycle.test.ts` covers DB operations (`markTaskDone`, `markTaskArchived`, `unmarkTaskDone`) using `fake-indexeddb` for IndexedDB emulation in Node.

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Dexie.js (IndexedDB)
- Recharts (charts)
- React Router v7
- Vitest (testing)

## Environment Variables

No env vars required. The app runs fully client-side with no API keys or secrets. If you add features that need configuration, use `VITE_`-prefixed variables (e.g. `VITE_API_URL`); Vite only exposes env vars starting with `VITE_` to the client.

## Building for Production

```bash
npm run build
npm run preview
```

## Deploy to Cloudflare Pages

1. Connect your repo to [Cloudflare Pages](https://pages.cloudflare.com).
2. Configure the project:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Root directory:** (leave empty if project root)
3. **Node version:** Use Node.js 18 or later (set via Environment Variables in Cloudflare dashboard: `NODE_VERSION` = `18`).
4. **SPA routing:** The `public/_redirects` file configures Cloudflare Pages to serve `index.html` for all routes (status 200), so deep links and page refreshes work. Unknown routes redirect to the homepage.
5. **Custom domain:** In your Cloudflare Pages project, go to **Custom domains** → **Set up a custom domain** and follow the steps to add your domain.
