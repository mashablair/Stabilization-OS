# Balance OS data operations

For requests to manage live tasks or wins, use `npm run data -- ...`, not browser form automation or Settings import. Read `DATA-ACCESS.md` first. Use the existing user-scoped CLI session; if missing, ask the user to run the interactive login command locally. Never read browser cookies or request passwords in chat.

Read existing records before changes, compare semantic duplicates, preview batches, then apply changes already authorized by the user. Preserve completed work and tracked time. Use stable keys for new records and IDs for updates. Prefer archive for removal. Never reset or bulk-replace app data.

Private session files, plans, and backups belong in ignored `.balance-local/`. Do not print session tokens or commit private plans. Public tool code and documentation may be versioned normally. Run `npm run test:data` after modifying the data tool.
