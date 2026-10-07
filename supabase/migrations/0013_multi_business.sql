-- 0013: several businesses behind one login, with a switch between them.
-- Every crm_ table was already keyed by org_id. What changes here:
--   * each user has one ACTIVE business (crm_user_state). crm_is_member() now answers "is this row in my
--     active business", so every existing policy and every page query is scoped to it with no app change.
--     A lead of one business can never show up while the other one is open, search included.
--   * crm_is_member_any() keeps the plain membership check, for listing the businesses in the switch.
--   * api keys and WhatsApp follow the active business. Google Calendar stays one shared connection,
--     kept on the user's home business (the first one), and the calendar reads tasks of all businesses.
--   * crm_orgs.brand holds the logo and colors the app paints for each business.
--   * seeds PrimeOS as a second business for the owner of Simple Solution.

create table if not exists crm_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_org uuid references crm_orgs(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table crm_user_state enable row level security;   -- no policies: read and written through the functions below

alter table crm_orgs add column if not exists brand jsonb not null default '{}'::jsonb;

create or replace function crm_is_member_any(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_members m where m.org_id = p_org and m.user_id = auth.uid())
$$;

-- the first business the user joined: home of the shared Google Calendar
create or replace function crm_home_org() returns uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from crm_members m join crm_orgs o on o.id = m.org_id
   where m.user_id = auth.uid() order by o.created_at, m.created_at limit 1
$$;

create or replace function crm_active_org() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.active_org from crm_user_state s
       join crm_members m on m.org_id = s.active_org and m.user_id = s.user_id
      where s.user_id = auth.uid()),
    crm_home_org())
$$;

-- the check every policy uses: a member, and the row belongs to the business that is open now
create or replace function crm_is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org is not null and p_org = crm_active_org()
$$;

-- the switch lists every business the user belongs to, not only the open one
drop policy if exists crm_orgs_member on crm_orgs;
create policy crm_orgs_member on crm_orgs for select to authenticated using (crm_is_member_any(id));

create or replace function crm_my_orgs() returns table (id uuid, name text, brand jsonb, role text, active boolean, home boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.brand, m.role, o.id = crm_active_org(), o.id = crm_home_org()
    from crm_orgs o join crm_members m on m.org_id = o.id and m.user_id = auth.uid()
   order by o.created_at
$$;

create or replace function crm_set_active_org(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not crm_is_member_any(p_org) then raise exception 'not allowed'; end if;
  insert into crm_user_state (user_id, active_org, updated_at) values (auth.uid(), p_org, now())
    on conflict (user_id) do update set active_org = excluded.active_org, updated_at = now();
end $$;

-- shared calendar: open tasks of every business in a date range, tagged with the business
create or replace function crm_calendar_tasks(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
           'org_name', o.name, 'org_brand', o.brand,
           'lead', case when l.id is null then null else jsonb_build_object('id', l.id, 'name', l.name) end,
           'client', case when c.id is null then null else jsonb_build_object('id', c.id, 'biz', c.biz) end)
         order by t.due_date, t.start_time nulls first), '[]'::jsonb)
    from crm_tasks t
    join crm_orgs o on o.id = t.org_id
    left join crm_leads l on l.id = t.lead_id
    left join crm_clients c on c.id = t.client_id
   where crm_is_member_any(t.org_id) and t.due_date between p_from and p_to
$$;

-- Google Calendar status for the settings screen, always from the home business
create or replace function crm_gcal_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select gcal from crm_settings where org_id = crm_home_org()), '{}'::jsonb)
$$;

-- point the functions that picked "the first membership" at the right business
do $$
declare
  f record; def text; n int;
  q_owner text := 'select org_id into v_org from crm_members where user_id = auth.uid() and role = ''owner'' limit 1;';
  q_any   text := 'select org_id into v_org from crm_members where user_id = auth.uid() limit 1;';
begin
  for f in select * from (values
      ('crm_create_api_key', 'active'), ('crm_wa_set_secret', 'active'), ('crm_wa_status', 'active'), ('crm_wa_send', 'active'),
      ('crm_gcal_save', 'home'), ('crm_gcal_token', 'home'), ('crm_gcal_disconnect', 'home')) as x(fn, target)
  loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = f.fn and p.pronamespace = 'public'::regnamespace;
    if def is null then raise exception 'function % not found', f.fn; end if;
    n := 0;
    if position(q_owner in def) > 0 then
      def := replace(def, q_owner, 'v_org := crm_' || f.target || '_org(); if not exists (select 1 from crm_members where org_id = v_org and user_id = auth.uid() and role = ''owner'') then v_org := null; end if;');
      n := n + 1;
    end if;
    if position(q_any in def) > 0 then
      def := replace(def, q_any, 'v_org := crm_' || f.target || '_org();');
      n := n + 1;
    end if;
    if n = 0 then raise exception 'pattern not found in %', f.fn; end if;
    execute def;
  end loop;
end $$;

revoke all on function crm_is_member_any(uuid), crm_home_org(), crm_active_org(), crm_my_orgs(), crm_set_active_org(uuid),
  crm_calendar_tasks(date, date), crm_gcal_info() from public, anon;
grant execute on function crm_is_member_any(uuid), crm_home_org(), crm_active_org(), crm_my_orgs(), crm_set_active_org(uuid),
  crm_calendar_tasks(date, date), crm_gcal_info() to authenticated;

-- brands
update crm_orgs set brand = jsonb_build_object(
    'short', 'Simple Solution', 'sub', 'שיווק דיגיטלי', 'mark', '/mark.png', 'logo', '/crm-logo.png', 'site', 'simple-solution.co.il')
  where name = 'Simple Solution' and brand = '{}'::jsonb;

-- PrimeOS: a second business for everyone who owns Simple Solution
do $$
declare v_ss uuid; v_po uuid;
begin
  select id into v_ss from crm_orgs where name = 'Simple Solution' order by created_at limit 1;
  select id into v_po from crm_orgs where name = 'PrimeOS' limit 1;
  if v_po is null then
    insert into crm_orgs (name, brand) values ('PrimeOS', jsonb_build_object(
      'short', 'PrimeOS', 'sub', 'מערכת תוכן לרשויות', 'mark', '/biz/primeos.png', 'site', 'primeos.co.il',
      'accent', '#2563EB', 'accent_hi', '#3B82F6', 'navy', '#1D4ED8', 'navy_hi', '#2563EB',
      'grad', 'linear-gradient(270deg,#2563EB 0%,#4F46E5 55%,#7C3AED 100%)'))
    returning id into v_po;
    insert into crm_settings (org_id) values (v_po) on conflict do nothing;
  end if;
  if v_ss is not null then
    insert into crm_members (org_id, user_id, role)
      select v_po, m.user_id, 'owner' from crm_members m where m.org_id = v_ss and m.role = 'owner'
      on conflict do nothing;
  end if;
end $$;
