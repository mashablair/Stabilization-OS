-- Add timezone column to app_settings
-- Stores the user's chosen IANA timezone identifier (e.g. "America/New_York").
-- NULL means "use the browser's detected timezone" (the client default).
alter table app_settings
  add column if not exists timezone text;
