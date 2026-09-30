-- simple-CRM · schema v1
-- Lives inside the Simple-Solution-Final project. Every table is prefixed crm_ so it never
-- collides with the older tables already in public (contacts, deals, quotes, tasks...).
-- Access: only users listed in crm_members for the org. The public quote page is served
-- server-side with the service key, looked up by an unguessable token. No anon policies.

create extension if not exists pgcrypto;

-- ---------- orgs & access ----------
create table crm_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table crm_members (
  org_id uuid not null references crm_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- emails allowed to log in; a matching auth user is added to the org automatically
create table crm_allowed_emails (
  email text primary key,
  org_id uuid not null references crm_orgs(id) on delete cascade,
  role text not null default 'owner'
);

create or replace function crm_is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_members m where m.org_id = p_org and m.user_id = auth.uid())
$$;

create or replace function crm_link_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into crm_members (org_id, user_id, role)
  select a.org_id, new.id, a.role from crm_allowed_emails a where lower(a.email) = lower(new.email)
  on conflict do nothing;
  return new;
end $$;

create trigger crm_on_auth_user_created after insert on auth.users
  for each row execute function crm_link_member();

-- ---------- settings, catalog ----------
create table crm_settings (
  org_id uuid primary key references crm_orgs(id) on delete cascade,
  vat numeric not null default 18,
  valid_days int not null default 14,
  wa_template text not null default '',
  quote_template jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table crm_catalog (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  name text not null,
  billing text not null check (billing in ('חודשי','חד-פעמי')),
  price numeric not null default 0,
  setup numeric not null default 0,
  commit_months int not null default 0,
  description text not null default '',
  items jsonb not null default '[]'::jsonb,          -- [{t, on}]
  partner_share jsonb,                                -- internal only, never rendered to clients
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- leads, clients, activity ----------
create table crm_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  name text not null,
  biz text not null default '',
  phone text,
  email text,
  industry text not null default '',
  source text not null default 'אתר ישיר',
  campaign text not null default '',
  landing_page text not null default '',
  budget text not null default 'לא אמר',
  value numeric not null default 0,
  stage text not null default 'חדש' check (stage in ('חדש','נוצר קשר','כשיר','פגישה נקבעה','הצעה נשלחה','לקוח','לא עכשיו','נפסל')),
  fit jsonb not null default '{"market":false,"active":false,"budget":false,"decider":false,"pain":false}'::jsonb,
  pain text not null default '',
  next_step text not null default '',
  next_at date,
  reason text not null default '',
  links jsonb not null default '{}'::jsonb,
  custom jsonb not null default '{"details":[],"links":[]}'::jsonb,
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  consent_text text,
  spam_score numeric,
  client_id uuid,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index crm_leads_phone_uq on crm_leads (org_id, phone) where phone is not null and archived_at is null;

create table crm_clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  lead_id uuid references crm_leads(id),
  biz text not null,
  contact text not null default '',
  phone text,
  email text,
  industry text not null default '',
  status text not null default 'בקליטה' check (status in ('בקליטה','פעיל','בסיכון','הסתיים','עזב')),
  since date not null default current_date,
  wa_group text not null default '',
  info jsonb not null default '{}'::jsonb,
  custom jsonb not null default '{"info":[]}'::jsonb,
  next_step text not null default '',
  next_at date,
  churn_reason text,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table crm_leads add constraint crm_leads_client_fk foreign key (client_id) references crm_clients(id);

create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  lead_id uuid references crm_leads(id) on delete cascade,
  client_id uuid references crm_clients(id) on delete cascade,
  type text not null,
  text text not null default '',
  by text not null default 'מאור',
  at timestamptz not null default now(),
  check (lead_id is not null or client_id is not null)
);
create index on crm_activities (lead_id, at desc);
create index on crm_activities (client_id, at desc);

create or replace function crm_touch_last_contact() returns trigger
language plpgsql as $$
begin
  if new.by <> 'אוטומציה' and new.by <> 'מערכת' then
    if new.lead_id is not null then update crm_leads set last_contact_at = new.at where id = new.lead_id; end if;
    if new.client_id is not null then update crm_clients set last_contact_at = new.at where id = new.client_id; end if;
  end if;
  return new;
end $$;
create trigger crm_activity_touch after insert on crm_activities for each row execute function crm_touch_last_contact();

-- ---------- quotes & signatures ----------
create table crm_quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  no text not null,
  lead_id uuid references crm_leads(id),
  client_id uuid references crm_clients(id),
  goal text not null default '',
  valid_days int not null default 14,
  status text not null default 'טיוטה' check (status in ('טיוטה','נשלחה','נצפתה','נחתמה','נדחתה','פגה')),
  options jsonb not null default '[]'::jsonb,         -- [{title, lines:[{kind,name,desc,billing,price,setup,commit,items,reason}]}]
  selected_option int,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  views int not null default 0,
  version int not null default 1,
  replaced_by uuid references crm_quotes(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, no)
);

create table crm_quote_views (
  id bigint generated always as identity primary key,
  quote_id uuid not null references crm_quotes(id) on delete cascade,
  at timestamptz not null default now(),
  user_agent text
);

create table crm_signatures (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references crm_quotes(id) on delete cascade,
  org_id uuid not null references crm_orgs(id) on delete cascade,
  option_index int not null,
  name text not null,
  biz text not null,
  idno text,
  email text,
  signature_path text,          -- storage path of the signature image
  ip text,
  user_agent text,
  doc_hash text not null,       -- sha256 of the quote snapshot that was signed
  snapshot jsonb not null,      -- the exact quote + terms shown at signing
  signed_at timestamptz not null default now()
);

create table crm_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  client_id uuid references crm_clients(id) on delete cascade,
  quote_id uuid references crm_quotes(id),
  title text not null,
  path text,
  created_at timestamptz not null default now()
);

-- ---------- services, payments, onboarding, tasks ----------
create table crm_client_services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  client_id uuid not null references crm_clients(id) on delete cascade,
  catalog_id uuid references crm_catalog(id),
  quote_id uuid references crm_quotes(id),
  name text not null,
  billing text not null,
  price numeric not null,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'פעיל' check (status in ('פעיל','מושהה','הסתיים'))
);

create table crm_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  client_id uuid not null references crm_clients(id) on delete cascade,
  what text not null,
  amount numeric not null,
  due date not null,
  paid_at date,
  invoice text,
  partner_amount numeric,       -- internal only
  created_at timestamptz not null default now()
);

create table crm_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  client_id uuid not null references crm_clients(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort int not null default 0
);

create table crm_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  title text not null,
  description text not null default '',
  start_date date not null default current_date,
  due_date date not null default current_date,
  done boolean not null default false,
  lead_id uuid references crm_leads(id) on delete set null,
  client_id uuid references crm_clients(id) on delete set null,
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  check (due_date >= start_date)
);

create table crm_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  day date not null,
  channel text not null,
  kind text check (kind in ('אורגני','ממומן')),
  impressions numeric, reach numeric, engagement numeric, clicks numeric,
  followers numeric, spend numeric, leads_from_channel numeric,
  data_source text check (data_source in ('ממשק','ידני')),
  read_at timestamptz,
  unique (org_id, day, channel, kind)
);

-- n8n and other automations authenticate with a per-org key (stored hashed)
create table crm_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  label text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['crm_settings','crm_catalog','crm_leads','crm_clients','crm_activities','crm_quotes','crm_signatures','crm_documents','crm_client_services','crm_payments','crm_onboarding_items','crm_tasks','crm_metrics_daily'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id))', t||'_member', t);
  end loop;
end $$;

alter table crm_orgs enable row level security;
create policy crm_orgs_member on crm_orgs for select to authenticated using (crm_is_member(id));
alter table crm_members enable row level security;
create policy crm_members_self on crm_members for select to authenticated using (user_id = auth.uid());
alter table crm_allowed_emails enable row level security;   -- no policies: service role only
alter table crm_api_keys enable row level security;         -- no policies: service role only
alter table crm_quote_views enable row level security;
create policy crm_quote_views_member on crm_quote_views for select to authenticated
  using (exists (select 1 from crm_quotes q where q.id = quote_id and crm_is_member(q.org_id)));

revoke execute on function crm_is_member(uuid) from anon;
