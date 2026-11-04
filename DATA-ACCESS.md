# Programmatic Balance OS updates

Use the local repository at `/Users/mariablair/Desktop/APPs/Balance OS`.
Run `npm run data -- help` for the command reference. No browser automation is needed for data entry.

## One-time setup

Run `npm run data -- login mashablair@gmail.com` in your own terminal. Enter your existing app password at the hidden prompt. The password is not stored or printed. A separate Supabase session is stored with owner-only permissions under the ignored `.balance-local/` directory. It refreshes on subsequent commands. If the session is revoked, sign in again. `npm run data -- logout` revokes only this CLI session.

Uses the existing `.env` public Supabase configuration and the signed-in user's row-level permissions. Never use a service-role key or copy browser cookies. Do not commit or share `.balance-local/`.

## Routine workflow for agents

1. Read `tasks`, `wins`, and `categories` with `npm run data -- list TABLE`. Inspect semantic duplicates as well as exact title matches.
2. Create a JSON plan with `tasks` and `wins` arrays. Each new record needs a permanent `key`. Use category names plus domain for tasks. Task subtasks accept titles and estimates; the tool supplies stable IDs.
3. Run `npm run data -- batch /absolute/plan.json` to preview. Existing records are skipped, never overwritten; same title/domain tasks and same date/text wins also deduplicate. For deliberate recurring tasks, use a dated title and unique key.
4. Run the same command with `--apply` when the user's request authorizes the changes. The tool backs up all app tables before adding records and reads each write back for verification. A partial failure can be rerun with the same keys.
5. Update existing records by ID using `update`, `status`, or `subtask`. Commands preview by default; `--apply` writes. Updates save a before-image and reject stale concurrent edits. Completing all subtasks completes the task; reopening a subtask reopens a completed task. Task-level completion matches the app and does not rewrite individual subtask states.
6. Use `archive` for reversible removal. Hard deletion and destructive import are intentionally absent. Preserve old completed records and tracked time.

Examples:

```sh
npm run data -- list tasks
npm run data -- status TASK_ID DONE --apply
npm run data -- subtask TASK_ID SUBTASK_ID done --apply
npm run data -- archive TASK_ID --apply
npm run data -- update tasks TASK_ID /absolute/patch.json --apply
```

Batch writes are sequential, not one transaction. A failed write stops the batch and prior successes remain. Deterministic IDs make retries safe. Local commands are serialized with `.balance-local/command.lock`; after a forcibly killed process, remove a stale lock only after confirming no CLI process remains active. User interface changes are still protected by optimistic update checks. Sessions and backups remain local to this checkout.

Run `npm run test:data` to check deduplication, ownership-field rejection, date validation, and subtask transitions.
