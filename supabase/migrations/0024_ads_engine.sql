-- Simple Ads: campaign settings, daily metrics per ad, creative drafts awaiting approval, the action journal,
-- and one server-key RPC for the nightly job, the Zernio webhook and the public approval page (no user session there).

create table if not exists crm_ad_campaigns (
  org_id uuid not null references crm_orgs(id) on delete cascade,
  campaign_id text not null,
  platform text not null default 'facebook',
  name text not null default '',
  goal text not null default '',
  account_id text not null default '',
  ad_account_id text not null default '',
  lead_form_id text not null default '',
  manage_mode text not null default 'manual' check (manage_mode in ('manual', 'auto')),
  auto_creatives boolean not null default false,
  approve_before_swap boolean not null default true,
  brief jsonb not null default '{}'::jsonb,
  learning text not null default '',
  disconnected boolean not null default false,
  last_action_at timestamptz,
  last_run_at timestamptz,
  last_run jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, campaign_id)
);
alter table crm_ad_campaigns enable row level security;
create policy crm_ad_campaigns_all on crm_ad_campaigns for all using (crm_is_member(org_id)) with check (crm_is_member(org_id));

create table if not exists crm_ad_metrics (
  org_id uuid not null references crm_orgs(id) on delete cascade,
  campaign_id text not null,
  adset_id text not null default '',
  ad_id text not null,
  day date not null,
  name text not null default '',
  status text not null default '',
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric not null default 0,
  frequency numeric not null default 0,
  results numeric not null default 0,
  primary key (org_id, ad_id, day)
);
create index if not exists crm_ad_metrics_campaign on crm_ad_metrics (org_id, campaign_id, day);
alter table crm_ad_metrics enable row level security;
create policy crm_ad_metrics_select on crm_ad_metrics for select using (crm_is_member(org_id));

create table if not exists crm_ad_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  campaign_id text not null,
  adset_id text not null default '',
  replaces_ad_id text not null default '',
  kind text not null default 'new' check (kind in ('new', 'replace', 'winner', 'fatigue')),
  reason text not null default '',
  by text not null default 'מערכת',
  status text not null default 'generating' check (status in ('generating', 'pending', 'approved', 'change', 'rejected', 'live', 'failed')),
  stage text not null default 'brief',
  brief jsonb not null default '{}'::jsonb,
  strategy jsonb not null default '[]'::jsonb,
  copy jsonb not null default '{}'::jsonb,
  image_feed text not null default '',
  image_story text not null default '',
  token text unique default encode(gen_random_bytes(24), 'hex'),
  note text not null default '',
  error text not null default '',
  ad_id text not null default '',
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days'
);
create index if not exists crm_ad_drafts_campaign on crm_ad_drafts (org_id, campaign_id, status);
alter table crm_ad_drafts enable row level security;
create policy crm_ad_drafts_all on crm_ad_drafts for all using (crm_is_member(org_id)) with check (crm_is_member(org_id));

-- the journal: every action on a campaign, by whom and why
alter table crm_ad_launches add column if not exists actor text not null default 'משתמש';
alter table crm_ad_launches add column if not exists reason text not null default '';
alter table crm_ad_launches add column if not exists campaign_id text not null default '';
alter table crm_ad_launches add column if not exists adset_id text not null default '';
alter table crm_ad_launches add column if not exists ad_id text not null default '';
create index if not exists crm_ad_launches_campaign on crm_ad_launches (org_id, campaign_id, created_at desc);

-- the approval email goes out through the business's Gmail with an app password kept in Vault
create or replace function public.crm_set_org_secret(p_org uuid, p_name text, p_value text)
 returns void language plpgsql security definer set search_path to 'public', 'vault'
as $function$
declare n text; sid uuid;
begin
  if p_name not in ('openai_api_key', 'smtp_app_password') then raise exception 'not allowed'; end if;
  if not crm_is_member(p_org) or not exists (select 1 from crm_members where org_id = p_org and user_id = auth.uid() and role = 'owner') then raise exception 'not allowed'; end if;
  n := p_name || '_' || p_org::text;
  select id into sid from vault.secrets where name = n;
  if coalesce(trim(p_value), '') = '' then
    if sid is not null then delete from vault.secrets where id = sid; end if;
    return;
  end if;
  if sid is null then perform vault.create_secret(trim(p_value), n); else perform vault.update_secret(sid, trim(p_value)); end if;
end $function$;

-- whether a secret is set (never its value), for the settings screen
create or replace function public.crm_has_org_secret(p_org uuid, p_name text)
 returns boolean language sql stable security definer set search_path to 'public', 'vault'
as $function$
  select crm_is_member(p_org) and p_name in ('openai_api_key', 'smtp_app_password')
    and exists (select 1 from vault.secrets where name = p_name || '_' || p_org::text)
$function$;

-- server only: p_key must be the server key (GCAL_SERVER_KEY). One entry point, switched by p_op.
create or replace function public.crm_ads_job(p_key text, p_op text, p_org uuid default null, p_data jsonb default '{}'::jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'vault', 'extensions'
as $function$
declare r jsonb; v text; d crm_ad_drafts;
begin
  if not crm_gcal_check_key(p_key) then raise exception 'not allowed'; end if;

  if p_op = 'zernio_key' then
    return to_jsonb((select decrypted_secret from vault.decrypted_secrets where name = 'zernio_api_key' limit 1));

  elsif p_op = 'webhook_secret' then
    select decrypted_secret into v from vault.decrypted_secrets where name = 'zernio_webhook_secret' limit 1;
    if v is null then
      v := encode(gen_random_bytes(24), 'hex');
      perform vault.create_secret(v, 'zernio_webhook_secret');
    end if;
    return to_jsonb(v);

  elsif p_op = 'orgs' then
    -- every business with a Zernio profile, with its tracked campaigns and engine settings
    return coalesce((select jsonb_agg(jsonb_build_object(
        'org_id', s.org_id, 'profile_id', s.social->'zernio'->>'profile_id',
        'engine', coalesce(s.social->'ads_engine', '{}'::jsonb),
        'agency', coalesce(s.agency, '{}'::jsonb),
        'campaigns', coalesce((select jsonb_agg(to_jsonb(c)) from crm_ad_campaigns c where c.org_id = s.org_id), '[]'::jsonb)))
      from crm_settings s where coalesce(s.social->'zernio'->>'profile_id', '') <> ''), '[]'::jsonb);

  elsif p_op = 'org_for_profile' then
    return to_jsonb((select s.org_id from crm_settings s where s.social->'zernio'->>'profile_id' = p_data->>'profile' limit 1));
  end if;

  -- everything below works on one business
  if p_org is null or not exists (select 1 from crm_orgs where id = p_org) then raise exception 'missing org'; end if;

  if p_op = 'save_metrics' then
    insert into crm_ad_metrics (org_id, campaign_id, adset_id, ad_id, day, name, status, spend, impressions, reach, clicks, ctr, frequency, results)
    select p_org, e->>'campaign_id', coalesce(e->>'adset_id', ''), e->>'ad_id', (e->>'day')::date, coalesce(e->>'name', ''), coalesce(e->>'status', ''),
      coalesce((e->>'spend')::numeric, 0), coalesce((e->>'impressions')::bigint, 0), coalesce((e->>'reach')::bigint, 0), coalesce((e->>'clicks')::bigint, 0),
      coalesce((e->>'ctr')::numeric, 0), coalesce((e->>'frequency')::numeric, 0), coalesce((e->>'results')::numeric, 0)
    from jsonb_array_elements(coalesce(p_data->'rows', '[]'::jsonb)) e
    where coalesce(e->>'ad_id', '') <> '' and coalesce(e->>'day', '') <> ''
    on conflict (org_id, ad_id, day) do update set campaign_id = excluded.campaign_id, adset_id = excluded.adset_id, name = excluded.name,
      status = excluded.status, spend = excluded.spend, impressions = excluded.impressions, reach = excluded.reach, clicks = excluded.clicks,
      ctr = excluded.ctr, frequency = excluded.frequency, results = excluded.results;
    return jsonb_build_object('ok', true);

  elsif p_op = 'metrics' then
    return coalesce((select jsonb_agg(to_jsonb(m) order by m.day) from crm_ad_metrics m
      where m.org_id = p_org and m.campaign_id = p_data->>'campaign' and m.day >= (p_data->>'since')::date), '[]'::jsonb);

  elsif p_op = 'log' then
    insert into crm_ad_launches (org_id, action, name, request, result, ok, actor, reason, campaign_id, adset_id, ad_id)
    values (p_org, coalesce(p_data->>'action', 'engine'), coalesce(p_data->>'name', ''), coalesce(p_data->'request', '{}'::jsonb), coalesce(p_data->'result', '{}'::jsonb),
      coalesce((p_data->>'ok')::boolean, true), coalesce(p_data->>'actor', 'מערכת'), coalesce(p_data->>'reason', ''),
      coalesce(p_data->>'campaign_id', ''), coalesce(p_data->>'adset_id', ''), coalesce(p_data->>'ad_id', ''));
    return jsonb_build_object('ok', true);

  elsif p_op = 'last_action' then
    -- the latest change the system or the user made on this campaign (not reads, not failed calls)
    return to_jsonb((select max(created_at) from crm_ad_launches where org_id = p_org and campaign_id = p_data->>'campaign' and ok
      and action not in ('engine:stable', 'engine:skip', 'engine:recommend', 'create:validate')));

  elsif p_op = 'campaign_patch' then
    update crm_ad_campaigns set
      learning = coalesce(p_data->>'learning', learning),
      disconnected = coalesce((p_data->>'disconnected')::boolean, disconnected),
      last_action_at = case when p_data ? 'last_action_at' then (p_data->>'last_action_at')::timestamptz else last_action_at end,
      last_run_at = case when p_data ? 'last_run' then now() else last_run_at end,
      last_run = coalesce(p_data->'last_run', last_run),
      updated_at = now()
    where org_id = p_org and (campaign_id = p_data->>'campaign' or (p_data->>'campaign' = '*'));
    return jsonb_build_object('ok', true);

  elsif p_op = 'drafts' then
    return coalesce((select jsonb_agg(to_jsonb(dd) order by dd.created_at) from crm_ad_drafts dd where dd.org_id = p_org
      and (p_data->>'campaign' is null or dd.campaign_id = p_data->>'campaign')
      and dd.status = any (coalesce((select array_agg(z) from jsonb_array_elements_text(p_data->'status') z), array['generating', 'pending', 'approved']))), '[]'::jsonb);

  elsif p_op = 'draft_new' then
    insert into crm_ad_drafts (org_id, campaign_id, adset_id, replaces_ad_id, kind, reason, by, brief)
    values (p_org, p_data->>'campaign_id', coalesce(p_data->>'adset_id', ''), coalesce(p_data->>'replaces_ad_id', ''),
      coalesce(p_data->>'kind', 'new'), coalesce(p_data->>'reason', ''), coalesce(p_data->>'by', 'מערכת'), coalesce(p_data->'brief', '{}'::jsonb))
    returning * into d;
    return to_jsonb(d);

  elsif p_op = 'draft_patch' then
    update crm_ad_drafts set
      status = coalesce(p_data->>'status', status), stage = coalesce(p_data->>'stage', stage),
      strategy = coalesce(p_data->'strategy', strategy), copy = coalesce(p_data->'copy', copy),
      image_feed = coalesce(p_data->>'image_feed', image_feed), image_story = coalesce(p_data->>'image_story', image_story),
      error = coalesce(p_data->>'error', error), ad_id = coalesce(p_data->>'ad_id', ad_id),
      emailed_at = case when p_data ? 'emailed' then now() else emailed_at end
    where id = (p_data->>'id')::uuid and org_id = p_org
    returning * into d;
    return to_jsonb(d);

  elsif p_op = 'ingest_lead' then
    if exists (select 1 from crm_ad_leads_seen where org_id = p_org and ext_id = p_data->>'ext') then
      return jsonb_build_object('ok', true, 'seen', true);
    end if;
    r := crm_ingest_lead_org(p_org, p_data->'lead');
    insert into crm_ad_leads_seen (org_id, ext_id, lead_id) values (p_org, p_data->>'ext', (r->>'id')::uuid) on conflict do nothing;
    return r;

  elsif p_op = 'secret' then
    if p_data->>'name' not in ('openai_api_key', 'smtp_app_password') then raise exception 'not allowed'; end if;
    return to_jsonb((select decrypted_secret from vault.decrypted_secrets where name = (p_data->>'name') || '_' || p_org::text limit 1));
  end if;

  raise exception 'unknown op';
end $function$;

-- the public approval page: read and decide one draft by its one-time token (still behind the server key)
create or replace function public.crm_ads_draft_token(p_key text, p_token text, p_decide text default null, p_note text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'vault'
as $function$
declare d crm_ad_drafts; c crm_ad_campaigns;
begin
  if not crm_gcal_check_key(p_key) then raise exception 'not allowed'; end if;
  select * into d from crm_ad_drafts where token = p_token and coalesce(p_token, '') <> '';
  if d.id is null then return null; end if;
  if p_decide is not null then
    if d.status <> 'pending' or d.expires_at < now() then raise exception 'already decided'; end if;
    if p_decide not in ('approved', 'change', 'rejected') then raise exception 'bad decision'; end if;
    update crm_ad_drafts set status = p_decide, note = coalesce(left(p_note, 1000), ''), decided_at = now() where id = d.id returning * into d;
    insert into crm_ad_launches (org_id, action, name, request, result, ok, actor, reason, campaign_id, adset_id)
    values (d.org_id, 'draft:' || p_decide, coalesce(d.copy->>'meta_headline', 'מודעה חדשה'), jsonb_build_object('draft', d.id), '{}'::jsonb, true, 'משתמש',
      case p_decide when 'approved' then 'אישור מהקישור במייל' when 'change' then 'בקשת שינוי: ' || coalesce(left(p_note, 300), '') else 'נדחה מהקישור במייל' end,
      d.campaign_id, d.adset_id);
  end if;
  select * into c from crm_ad_campaigns where org_id = d.org_id and campaign_id = d.campaign_id;
  return to_jsonb(d) || jsonb_build_object('campaign_name', coalesce(c.name, ''), 'goal', coalesce(c.goal, ''));
end $function$;

revoke all on function public.crm_ads_job(text, text, uuid, jsonb) from public;
grant execute on function public.crm_ads_job(text, text, uuid, jsonb) to anon, authenticated;
revoke all on function public.crm_ads_draft_token(text, text, text, text) from public;
grant execute on function public.crm_ads_draft_token(text, text, text, text) to anon, authenticated;
grant execute on function public.crm_has_org_secret(uuid, text) to authenticated;
