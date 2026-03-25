#App descriptions from different angles:

Here are a few strong app descriptions you can paste into another LLM (or into a project/system prompt). Everything is grounded in your README.

##Option A  concise product description (best default)

Balance OS is a local-first personal web app that helps you manage life-admin and business tasks without overwhelm. It uses a Today Stack (Stabilizer/Builder) with a capacity-aware suggestion algorithm, plus task categories with context cards (why/win condition/script), subtasks, waiting/pending tasks, and a focus timer for accurate time tracking. It also includes wins journaling, a weekly review wizard, and a dashboard showing weekly progress (time, tasks completed, money recovered, open loops, friction). All data is stored locally in IndexedDB with export/import JSON bundles and CSV exportsno backend required.

##Option B  slightly more narrative (for LLMs that get intent)

Balance OS is a nervous-system-friendly productivity app for people building a business while handling real adult responsibilities. It turns overwhelming admin into a calm daily stack by limiting focus to ~5 tasks, respecting your available capacity, and surfacing the next best actions. It tracks time per task, supports Waiting tasks that become actionable on a future date, and reinforces momentum with context cards and a wins journal. Its local-first (IndexedDB) with easy backups via a share bundle export/import.

##Option C  technical summary (for an LLM that will work on the codebase)

Balance OS is a React + Vite + TypeScript SPA (Tailwind v4, React Router v7) with local persistence via IndexedDB (Dexie). Core modules: Today Stack with role-based domains (Stabilizer/Builder), scoring + capacity-aware stack building, tasks with subtasks and lifecycle states (BACKLOG/TODAY/IN_PROGRESS/DONE/ARCHIVED plus PENDING with action date), focus timer with persisted sessions, dashboard analytics, wins journal, weekly review wizard, and settings with export/import JSON bundles + CSV exports. No env vars or backend. Deployed on Cloudflare Pages with SPA
\_redirects
