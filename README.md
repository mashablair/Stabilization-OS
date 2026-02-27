# Balance OS

A local-first personal web app for managing life tasks with categories, subtasks, encouragement context, time tracking, wins journaling, and a progress dashboard.

## How to Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- **Today Stack** — Choose your daily role (Life / Builder) and focus on up to 5 tasks. Pin tasks you want; the algorithm suggests the rest. **Log Task** records a task you already completed (e.g. "reviewed documents" in Builder, 10 min) without prior planning — it appears in Done Today and counts toward your time. Mark tasks done with the ✓ checkmark icon next to each task. **Time Capacity** shows a three-segment bar: time spent today (green), allocated to your stack (purple), and breathing room (grey). Adjust capacity per day with the tune icon — changes apply to today only, with separate budgets for Life and Builder. The algorithm uses remaining capacity (capacity minus time spent) when suggesting tasks, so it won’t over-fill your stack after you complete longer tasks. A collapsible **Done Today** section celebrates completed tasks with motivational messages. **Log a win** to record accomplishments beyond your task list (e.g. started building this app, did a face mask).
- **All Tasks** — Dedicated page (main nav) to browse all active tasks by domain, with a **Log Task** button to record completed tasks retroactively. Collapsible **Pending** section (tasks waiting on a future action date) and **Done** section containing **Completed** and **Archived** tabs. Archive tasks to declutter without losing history.
- **Categories** — Domain-specific categories. **Life:** LEGAL, MONEY, MAINTENANCE, CAREGIVER. **Builder (Business):** LEGAL, CONTENT, PRODUCT, NETWORKING, LEARNING, OPS. Show/hide default categories on the Categories page; add up to 5 custom categories with name and domain. Overview cards show why each category matters; the detail page includes win condition and script.
- **Task Detail** — Click the task name to edit it (display/edit mode prevents cursor jumping). Inline editing for other fields, subtasks with auto-completion (marking all subtasks done auto-completes the task), context cards (why / next micro-step / reframe), priority, due dates, money impact. Tasks track a `completedAt` timestamp for accurate reporting. **Project Mode** lets you estimate and track time per subtask for larger tasks (e.g. passport renewal, divorce project). Switch to Project Mode when a task has subtasks; estimates and actual time are summed at the task level. Switch back to regular mode to collapse subtask time into task totals. A confirmation modal appears when switching modes: session history (time entries) is cleared, but totals are preserved.
- **Focus Timer** — Start/pause/stop timer per task; persisted in IndexedDB so page refresh won't lose time. **Add time** manually (minutes or `h:mm`) when you forget to start the timer; remove sessions from history via the × button. Session history and total update live. For Project Mode tasks, start the timer on any subtask; the Today page defaults to the first subtask with a "Change subtask" picker.
- **Dashboard** — Weekly stats (tasks completed, time tracked, money recovered, open loops), time allocation chart, open loops trend, friction log. Filter by **All**, **Life**, or **Builder** to view stats per domain. Chart tooltips adapt to light/dark mode for readable contrast.
- **Wins** — A dedicated page to log and browse accomplishments beyond your tracked tasks. Tag wins with life, biz, vitality, or community. Browse by week, month, quarter, or year. Quick-add from the Today page footer. Revisit during quarterly reviews or when you need a boost.
- **Habits** — Dedicated habits tracker with a fast **Today** strip, one-tap logging (Done / optional Partial / Skip), and compact history views for **Week**, **Month**, and **3 Months**. Includes Day Editor with prev/next navigation for fast backfills, consistency-first stats, streak as secondary, schedule types (daily, weekdays, every N days, X times/week), plus color/icon customization, reordering, and archiving.
- **Weekly Review** — Guided wizard that starts with a **Wins** step highlighting completed tasks, time invested, money recovered, and **other wins** you logged this week, followed by estimate mismatches, friction reflection, category focus, and smallest next step
- **Settings** — Configure default daily capacity for Life and Builder, export/import JSON share bundles (includes categories, tasks, habits, habit logs, app settings, time entries), CSV exports (tasks + time entries), dark mode toggle, data reset. Accessible via the gear icon in the header.

## Data Storage

All data is stored locally in your browser using IndexedDB (via Dexie.js) for this domain. No backend required. Data persists across page refreshes. Use **Export Share Bundle** in Settings for backups.

Habit tracking uses two tables:
- `habits` (configuration: type, schedule, goal, color/icon, archive state, sort order)
- `habitLogs` (per-day outcome/value/note by `habitId + date`)

## Export / Import

1. Go to **Settings**
2. Click **Export .json Bundle** to download all your data (including habits + habit logs)
3. To restore, click **Choose .json file** under Import — this overwrites local data
4. CSV exports are also available for `tasks_summary.csv` and `time_entries.csv`

## Seed Data

On first run, the app automatically creates 4 Life categories (LEGAL, MONEY, MAINTENANCE, CAREGIVER), 6 Builder categories (LEGAL, CONTENT, PRODUCT, NETWORKING, LEARNING, OPS), and 10 sample Life tasks. To re-seed, use the **Reset All Data** option in Settings and reload the page.

## Task Lifecycle

Tasks flow through these statuses: **BACKLOG** → **TODAY** → **IN_PROGRESS** → **DONE** → **ARCHIVED**. Tasks can also be set to **PENDING** (waiting) with an optional future action date. Completing all subtasks on a task automatically marks it as DONE. Undoing a completion always returns the task to BACKLOG.

## Testing

```bash
npm test
```

Tests use Vitest. `todayStack.test.ts` covers pure logic (scoring, stack building, actionable/waiting states, ARCHIVED behaviour, daily capacity overrides). `taskLifecycle.test.ts` covers DB operations (`markTaskDone`, `markTaskArchived`, `unmarkTaskDone`) using `fake-indexeddb` for IndexedDB emulation in Node. `habits.test.ts` covers habit scheduling, consistency/streak metrics, and `upsertHabitLog` behavior.

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
