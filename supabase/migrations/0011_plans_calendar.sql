-- business plan from the chat, AI-proposed tasks (approved by the owner), task times + Google Calendar link

create table if not exists crm_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  title text not null,
  period_start date,
  period_end date,
  summary text not null default '',
  goals jsonb not null default '[]'::jsonb,   -- [{goal, metric, target}]
  status text not null default 'פעילה' check (status in ('פעילה','הסתיימה')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table crm_plans enable row level security;
create policy crm_plans_rw on crm_plans for all to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id));

create table if not exists crm_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  plan_id uuid references crm_plans(id) on delete cascade,
  kind text not null default 'כללי',
  title text not null,
  description text not null default '',
  goal text not null default '',
  reason text not null default '',
  due_date date not null default current_date,
  start_time time,
  duration_min int,
  lead_id uuid references crm_leads(id) on delete set null,
  client_id uuid references crm_clients(id) on delete set null,
  status text not null default 'מוצעת' check (status in ('מוצעת','אושרה','נדחתה')),
  task_id uuid references crm_tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_ai_suggestions_open on crm_ai_suggestions (org_id, status, due_date);
alter table crm_ai_suggestions enable row level security;
create policy crm_ai_suggestions_rw on crm_ai_suggestions for all to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id));

alter table crm_tasks add column if not exists source text not null default 'ידני';
alter table crm_tasks add column if not exists plan_id uuid references crm_plans(id) on delete set null;
alter table crm_tasks add column if not exists goal text not null default '';
alter table crm_tasks add column if not exists start_time time;
alter table crm_tasks add column if not exists duration_min int;
alter table crm_tasks add column if not exists gcal_event_id text;

alter table crm_settings add column if not exists gcal jsonb not null default '{}'::jsonb;

-- ---------- for the planning chat (runs with the database owner role, not exposed to the app) ----------
create or replace function crm_ai_context(p_org uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := coalesce(p_org, (select id from crm_orgs order by created_at limit 1));
begin
  return jsonb_build_object(
    'today', current_date,
    'active_plan', (select to_jsonb(p) from crm_plans p where org_id = v_org and status = 'פעילה' order by created_at desc limit 1),
    'pending_suggestions', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'due', due_date, 'kind', kind) order by due_date) from crm_ai_suggestions where org_id = v_org and status = 'מוצעת'), '[]'::jsonb),
    'open_tasks', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'due', due_date, 'time', start_time) order by due_date) from crm_tasks where org_id = v_org and not done), '[]'::jsonb),
    'leads_by_stage', coalesce((select jsonb_object_agg(stage, n) from (select stage, count(*) n from crm_leads where org_id = v_org and archived_at is null group by stage) s), '{}'::jsonb),
    'leads_waiting', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'biz', biz, 'stage', stage, 'next_step', next_step, 'next_at', next_at, 'created', created_at::date) order by created_at desc)
        from (select * from crm_leads where org_id = v_org and archived_at is null and stage not in ('לקוח','לא עכשיו','נפסל') order by created_at desc limit 40) l), '[]'::jsonb),
    'open_quotes', coalesce((select jsonb_agg(jsonb_build_object('no', q.no, 'status', q.status, 'sent_at', q.sent_at, 'views', q.views,
        'for', coalesce(c.biz, l.name, ''), 'lead_id', q.lead_id, 'client_id', q.client_id))
        from crm_quotes q left join crm_clients c on c.id = q.client_id left join crm_leads l on l.id = q.lead_id
       where q.org_id = v_org and q.status in ('טיוטה','נשלחה','נצפתה') and q.replaced_by is null), '[]'::jsonb),
    'clients_active', (select count(*) from crm_clients where org_id = v_org and archived_at is null)
  );
end $$;

-- p_plan: {title, period_start, period_end, summary, goals:[...]} (null = keep the active plan)
-- p_tasks: [{title, description, kind, goal, reason, due_date, start_time, duration_min, lead_id, client_id}]
create or replace function crm_ai_sync_plan(p_plan jsonb, p_tasks jsonb, p_replace_pending boolean default true, p_org uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := coalesce(p_org, (select id from crm_orgs order by created_at limit 1));
        v_plan uuid; t jsonb; n int := 0; skipped int := 0;
begin
  if p_plan is not null then
    update crm_plans set status = 'הסתיימה', updated_at = now() where org_id = v_org and status = 'פעילה';
    insert into crm_plans (org_id, title, period_start, period_end, summary, goals)
    values (v_org, coalesce(nullif(p_plan->>'title', ''), 'תוכנית עבודה'), nullif(p_plan->>'period_start', '')::date, nullif(p_plan->>'period_end', '')::date,
            coalesce(p_plan->>'summary', ''), coalesce(p_plan->'goals', '[]'::jsonb))
    returning id into v_plan;
  else
    select id into v_plan from crm_plans where org_id = v_org and status = 'פעילה' order by created_at desc limit 1;
  end if;
  if v_plan is null then raise exception 'no active plan: send p_plan first'; end if;

  if p_replace_pending then
    delete from crm_ai_suggestions where org_id = v_org and status = 'מוצעת';
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    if coalesce(trim(t->>'title'), '') = '' then continue; end if;
    if exists (select 1 from crm_tasks where org_id = v_org and not done and title = trim(t->>'title') and due_date = coalesce(nullif(t->>'due_date', '')::date, current_date))
       or exists (select 1 from crm_ai_suggestions where org_id = v_org and status = 'מוצעת' and title = trim(t->>'title') and due_date = coalesce(nullif(t->>'due_date', '')::date, current_date)) then
      skipped := skipped + 1; continue;
    end if;
    insert into crm_ai_suggestions (org_id, plan_id, kind, title, description, goal, reason, due_date, start_time, duration_min, lead_id, client_id)
    values (v_org, v_plan, coalesce(nullif(t->>'kind', ''), 'כללי'), trim(t->>'title'), coalesce(t->>'description', ''), coalesce(t->>'goal', ''), coalesce(t->>'reason', ''),
            coalesce(nullif(t->>'due_date', '')::date, current_date), nullif(t->>'start_time', '')::time, nullif(t->>'duration_min', '')::int,
            (select id from crm_leads where id = nullif(t->>'lead_id', '')::uuid and org_id = v_org),
            (select id from crm_clients where id = nullif(t->>'client_id', '')::uuid and org_id = v_org));
    n := n + 1;
  end loop;
  return jsonb_build_object('plan_id', v_plan, 'added', n, 'skipped_duplicates', skipped);
end $$;

-- end the active plan (no plan = no AI tasks shown)
create or replace function crm_ai_end_plan(p_org uuid default null) returns void
language sql security definer set search_path = public as $$
  update crm_plans set status = 'הסתיימה', updated_at = now()
   where org_id = coalesce(p_org, (select id from crm_orgs order by created_at limit 1)) and status = 'פעילה';
  delete from crm_ai_suggestions where org_id = coalesce(p_org, (select id from crm_orgs order by created_at limit 1)) and status = 'מוצעת';
$$;

revoke all on function crm_ai_context(uuid) from public, anon, authenticated;
revoke all on function crm_ai_sync_plan(jsonb, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function crm_ai_end_plan(uuid) from public, anon, authenticated;

-- owner approves a suggestion (optionally edited) -> becomes a real task
create or replace function crm_ai_approve(p_id uuid, p_patch jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare s crm_ai_suggestions; v_task uuid; d date;
begin
  select * into s from crm_ai_suggestions where id = p_id and status = 'מוצעת';
  if s.id is null or not crm_is_member(s.org_id) then raise exception 'not found'; end if;
  d := coalesce(nullif(p_patch->>'due_date', '')::date, s.due_date);
  insert into crm_tasks (org_id, title, description, start_date, due_date, lead_id, client_id, source, plan_id, goal, start_time, duration_min)
  values (s.org_id, coalesce(nullif(trim(p_patch->>'title'), ''), s.title), coalesce(p_patch->>'description', s.description),
          least(d, current_date), d, s.lead_id, s.client_id, 'AI', s.plan_id, s.goal,
          case when p_patch ? 'start_time' then nullif(p_patch->>'start_time', '')::time else s.start_time end,
          coalesce(nullif(p_patch->>'duration_min', '')::int, s.duration_min))
  returning id into v_task;
  update crm_ai_suggestions set status = 'אושרה', task_id = v_task where id = s.id;
  return v_task;
end $$;
revoke all on function crm_ai_approve(uuid, jsonb) from public, anon;
grant execute on function crm_ai_approve(uuid, jsonb) to authenticated;

-- ---------- Google Calendar: refresh token in Vault, readable only by the app server (shared key) ----------
create or replace function crm_gcal_check_key(p_key text) returns boolean
language sql stable security definer set search_path = public, vault as $$
  select coalesce(p_key, '') <> '' and p_key = (select decrypted_secret from vault.decrypted_secrets where name = 'gcal_server_key' limit 1)
$$;
revoke all on function crm_gcal_check_key(text) from public, anon, authenticated;

create or replace function crm_gcal_save(p_key text, p_refresh text, p_email text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare v_org uuid; v_id uuid; v_name text;
begin
  if not crm_gcal_check_key(p_key) then raise exception 'not allowed'; end if;
  select org_id into v_org from crm_members where user_id = auth.uid() and role = 'owner' limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  v_name := 'gcal_refresh_' || v_org::text;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then perform vault.create_secret(p_refresh, v_name, 'Google Calendar refresh token');
  else perform vault.update_secret(v_id, p_refresh); end if;
  update crm_settings set gcal = jsonb_build_object('email', p_email, 'connected_at', now(), 'calendar_id', 'primary') where org_id = v_org;
end $$;

create or replace function crm_gcal_token(p_key text) returns text
language plpgsql stable security definer set search_path = public, vault as $$
declare v_org uuid;
begin
  if not crm_gcal_check_key(p_key) then raise exception 'not allowed'; end if;
  select org_id into v_org from crm_members where user_id = auth.uid() limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'gcal_refresh_' || v_org::text limit 1);
end $$;

create or replace function crm_gcal_disconnect() returns void
language plpgsql security definer set search_path = public, vault as $$
declare v_org uuid;
begin
  select org_id into v_org from crm_members where user_id = auth.uid() and role = 'owner' limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  delete from vault.secrets where name = 'gcal_refresh_' || v_org::text;
  update crm_settings set gcal = '{}'::jsonb where org_id = v_org;
end $$;

revoke all on function crm_gcal_save(text, text, text) from public, anon;
revoke all on function crm_gcal_token(text) from public, anon;
revoke all on function crm_gcal_disconnect() from public, anon;
grant execute on function crm_gcal_save(text, text, text) to authenticated;
grant execute on function crm_gcal_token(text) to authenticated;
grant execute on function crm_gcal_disconnect() to authenticated;
