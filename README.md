# Balance OS

A Supabase-backed personal web app for managing life tasks with categories, subtasks, context prompts, time tracking, wins journaling, habits, and a progress dashboard. The UI uses local-first editing for text-heavy and numeric fields so typing stays instant while persistence happens on blur or explicit command-style actions.

## How to Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- **Today Stack** — Choose your daily role (Life / Builder) and focus on up to 5 tasks. **Quick Entry** uses a compact form: optional first subtask (defaults to **Main**), **project** time tracking, and the estimate on that subtask so the timer can start immediately from Today or task detail. Pin tasks you want; the algorithm suggests the rest. **Log Task** records a task you already completed (e.g. "reviewed documents" in Builder, 10 min) without prior planning — it appears in Done Today and counts toward your time. Mark tasks done with the ✓ checkmark icon next to each task. **Time Capacity** shows a three-segment bar: time spent today (green), allocated to your stack (purple), and breathing room (grey). Adjust capacity per day with the tune icon — changes apply to today only, with separate budgets for Life and Builder. The algorithm uses remaining capacity (capacity minus time spent) when suggesting tasks, so it won’t over-fill your stack after you complete longer tasks. A collapsible **Done Today** section celebrates completed tasks and individually completed subtasks with motivational messages — partial progress on multi-subtask tasks shows up the day the subtask is checked off, not just when the whole task is done. **Log a win** to record accomplishments beyond your task list (e.g. started building this app, did a face mask).
- **All Tasks** — Dedicated page (main nav) to browse all active tasks by domain, with a **Log Task** button to record completed tasks retroactively. Collapsible **Pending** section (tasks waiting on a future action date) and **Done** section containing **Completed** and **Archived** tabs. Archive tasks to declutter without losing history.
- **Categories** — Domain-specific categories. **Life:** LEGAL, MONEY, MAINTENANCE, CAREGIVER. **Builder (Business):** LEGAL, CONTENT, PRODUCT, NETWORKING, LEARNING, OPS. Show/hide default categories on the Categories page; add up to 5 custom categories with name and domain. Overview cards show why each category matters; the detail page includes win condition and script.
- **Task Detail** — Click the task name to edit it (display/edit mode prevents cursor jumping). Textareas and number-heavy fields now edit against local draft state and commit on blur, so typing stays smooth without per-keystroke Supabase writes. Click/toggle/status actions still save immediately. Subtasks auto-complete the task when all are done. Context cards (why / next micro-step / reframe), priority, due dates, money impact, notes, and waiting fields are all supported. Tasks track a `completedAt` timestamp for accurate reporting. All tasks use **project-style time tracking**: estimates and actual time live on each subtask and are summed at the task level. Every task has at least one subtask (a **Main** subtask is created automatically when needed). The last subtask cannot be deleted.
- **Focus Timer** — Start/pause/stop timer per subtask; persisted in Supabase so page refresh won't lose time. **Add time** manually (minutes or `h:mm`) when you forget to start the timer; remove sessions from history via the × button. Session history and total update live. The Today page defaults to the first subtask with a "Change subtask" picker.
- **Dashboard** — Weekly stats (tasks completed, subtasks completed, time tracked, money recovered, open loops), time allocation chart, open loops trend, friction log. Filter by **All**, **Life**, or **Builder** to view stats per domain. Chart tooltips adapt to light/dark mode for readable contrast.
- **Wins** — A dedicated page to log and browse accomplishments beyond your tracked tasks. Tag wins with life, biz, vitality, or community. Browse by week, month, quarter, or year. Quick-add from the Today page footer. Revisit during quarterly reviews or when you need a boost.
- **Habits** — Dedicated habits tracker with a fast **Today** strip, one-tap logging (Done / optional Partial / Skip), and compact history views for **Week**, **Month**, and **3 Months**. Numeric values and notes now buffer locally while you type and commit on blur; one-tap status buttons and +/- controls still save immediately. **Time of day** groups habits into Morning / Anytime / Evening (default Anytime); Today shows collapsible sections (Morning expanded by default) for faster routine logging. History heatmap includes a filter: All / Morning / Anytime / Evening. Day Editor with prev/next navigation for fast backfills, consistency-first stats, streak as secondary, schedule types (daily, weekdays, every N days, X times/week), plus color/icon customization, reordering, and archiving.
- **Weekly Review** — Guided wizard that starts with a **Wins** step highlighting completed tasks, time invested, money recovered, and **other wins** you logged this week, followed by estimate mismatches, friction reflection, category focus, and smallest next step
- **Settings** — Configure default daily capacity for Life and Builder with local draft number inputs that save on blur, export/import JSON share bundles (includes categories, tasks, wins, habits, habit logs, app settings, time entries, weekly reviews, daily capacity), CSV exports (tasks + time entries), dark mode toggle, data reset. Accessible via the gear icon in the header.

## Data Storage

App data is stored in Supabase and queried with React Query. The app still follows a local-first editing pattern for text-heavy and numeric UI so in-progress edits do not block on network writes or get overwritten by fresh query data.

Primary tables include:
- `categories`
- `tasks`
- `time_entries`
- `weekly_reviews`
- `daily_capacity`
- `wins`
- `habits`
- `habit_logs`
- `app_settings`
- `timer_state`

## Export / Import

1. Go to **Settings**
2. Click **Export .json Bundle** to download all your data (including wins, habits, habit logs, and all other data)
3. To restore, click **Choose .json file** under Import — this overwrites all data
4. CSV exports are also available for `tasks_summary.csv` and `time_entries.csv`

## Seed Data

On first run, the app automatically creates 4 Life categories (LEGAL, MONEY, MAINTENANCE, CAREGIVER), 6 Builder categories (LEGAL, CONTENT, PRODUCT, NETWORKING, LEARNING, OPS), and 1 sample Life task. To re-seed, use the **Reset All Data** option in Settings and reload the page.

## Task Lifecycle

Tasks flow through these statuses: **BACKLOG** → **TODAY** → **IN_PROGRESS** → **DONE** → **ARCHIVED**. Tasks can also be set to **PENDING** (waiting) with an optional future action date. Completing all subtasks on a task automatically marks it as DONE. Undoing a completion always returns the task to BACKLOG.

## Testing

```bash
npm test
```

Tests use Vitest. `todayStack.test.ts` covers stack-building logic, actionable/waiting states, archived behaviour, and daily capacity overrides. `habits.test.ts` covers habit scheduling, consistency/streak metrics, and habit log behavior.

## Design

UI conventions, **compact / data-dense** defaults, color tokens, and dark mode live in **[design.md](./design.md)**. Tokens are defined in `src/index.css` (`@theme`).

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Supabase
- TanStack Query
- Recharts (charts)
- React Router v7
- Vitest (testing)

## Environment Variables

Set the Supabase client vars in a local `.env` file:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If you add other client-side configuration, use `VITE_`-prefixed variables so Vite exposes them to the app.

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
