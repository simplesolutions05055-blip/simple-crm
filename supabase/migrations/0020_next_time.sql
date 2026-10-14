-- 0020: an optional hour for "הצעד הבא" on leads and clients (next_at stays the date)
alter table crm_leads add column if not exists next_time time;
alter table crm_clients add column if not exists next_time time;
