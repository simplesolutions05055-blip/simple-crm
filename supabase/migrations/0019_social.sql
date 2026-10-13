-- 0019: the "סושיאל" area. A weekly scan (a scheduled Claude task using Supermetrics, web search and the
-- platforms' official sources) writes a snapshot per platform and one report per week; the app only reads,
-- marks recommendations as tasks, and edits what to scan.

alter table crm_settings add column if not exists social jsonb not null default '{}'::jsonb; -- { niche, notes }

create table if not exists crm_social_watch (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  kind text not null check (kind in ('mine', 'account', 'hashtag')),
  platform text not null check (platform in ('אינסטגרם', 'פייסבוק', 'טיקטוק')),
  value text not null,
  created_at timestamptz not null default now()
);
create index if not exists crm_social_watch_org on crm_social_watch (org_id, kind);

create table if not exists crm_social_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  platform text not null,
  week_start date not null,              -- the Sunday the week starts on
  metrics jsonb not null default '{}'::jsonb,   -- followers, followers_change, reach, engagement_rate, posts, views, avg_watch_sec ...
  top_posts jsonb not null default '[]'::jsonb, -- [{title, type, url, metric_label, metric}]
  created_at timestamptz not null default now(),
  unique (org_id, platform, week_start)
);

create table if not exists crm_social_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  week_start date not null,
  scanned_at timestamptz not null default now(),
  summary text not null default '',
  recommendations jsonb not null default '[]'::jsonb, -- [{id, priority: גבוה|בינוני|נמוך, platform, title, why, source_url, task_id}]
  trends jsonb not null default '[]'::jsonb,          -- [{kind: ויראלי|צליל|האשטג|פורמט, platform, title, url, metric, why, adapt}]
  updates jsonb not null default '[]'::jsonb,         -- [{platform, change, meaning, source, url, date}]
  rules jsonb not null default '{}'::jsonb,           -- {platform: {updated, items: [{rule, source, url}]}}
  sources jsonb not null default '{}'::jsonb,         -- connection status seen by the scan: {אינסטגרם: true, ...}
  unique (org_id, week_start)
);

create table if not exists crm_social_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  requested_at timestamptz not null default now(),
  done_at timestamptz
);

alter table crm_social_watch enable row level security;
alter table crm_social_snapshots enable row level security;
alter table crm_social_reports enable row level security;
alter table crm_social_requests enable row level security;
create policy crm_social_watch_member on crm_social_watch for all to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id));
create policy crm_social_snapshots_member on crm_social_snapshots for select to authenticated using (crm_is_member(org_id));
create policy crm_social_reports_member on crm_social_reports for select to authenticated using (crm_is_member(org_id));
create policy crm_social_reports_member_upd on crm_social_reports for update to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id));
create policy crm_social_requests_member on crm_social_requests for all to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id));
