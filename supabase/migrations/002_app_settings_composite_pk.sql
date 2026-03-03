-- Fix app_settings: allow each user to have their own "default" row
-- Previously id was the sole PK, so only one user could have settings

alter table app_settings drop constraint app_settings_pkey;
alter table app_settings add primary key (user_id, id);
