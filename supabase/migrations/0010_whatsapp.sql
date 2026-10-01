-- ---------- WhatsApp Cloud API (official, Meta) ----------
-- settings live in crm_settings.wa; the access token and app secret live in Supabase Vault and never leave the database.
alter table crm_settings add column if not exists wa jsonb not null default '{}'::jsonb;

create table if not exists crm_wa_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  lead_id uuid references crm_leads(id) on delete set null,
  client_id uuid references crm_clients(id) on delete set null,
  direction text not null check (direction in ('out','in')),
  phone text not null,
  kind text not null default 'text',          -- text / template / other inbound types
  template text,
  body text not null default '',
  params jsonb not null default '[]'::jsonb,
  status text not null default 'queued',      -- queued / sent / delivered / read / failed / received
  wa_id text,
  error text,
  request_id bigint,
  by text not null default 'מאור',
  at timestamptz not null default now()
);
create index if not exists crm_wa_messages_lead on crm_wa_messages (lead_id, at desc);
create index if not exists crm_wa_messages_client on crm_wa_messages (client_id, at desc);
create index if not exists crm_wa_messages_waid on crm_wa_messages (wa_id);
create index if not exists crm_wa_messages_queued on crm_wa_messages (request_id) where status = 'queued';
alter table crm_wa_messages enable row level security;
drop policy if exists crm_wa_messages_read on crm_wa_messages;
create policy crm_wa_messages_read on crm_wa_messages for select to authenticated using (crm_is_member(org_id));

-- 05X... -> 9725X... (what the Cloud API expects)
create or replace function crm_wa_e164(p text) returns text language sql immutable as $$
  select case
    when d like '972%' then d
    when d like '0%' then '972' || substr(d, 2)
    else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;
-- 9725X... -> 05X... (how phones are stored in the CRM)
create or replace function crm_wa_local(p text) returns text language sql immutable as $$
  select case when d like '972%' then '0' || substr(d, 4) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

create or replace function crm_wa_secret(p_org uuid, p_kind text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'wa_' || p_kind || '_' || p_org::text limit 1
$$;

-- owner saves the token / app secret (write only)
create or replace function crm_wa_set_secret(p_kind text, p_value text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare v_org uuid; v_id uuid; v_name text;
begin
  if p_kind not in ('token','app_secret') then raise exception 'bad kind'; end if;
  select org_id into v_org from crm_members where user_id = auth.uid() and role = 'owner' limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  v_name := 'wa_' || p_kind || '_' || v_org::text;
  select id into v_id from vault.secrets where name = v_name;
  if coalesce(trim(p_value), '') = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(trim(p_value), v_name, 'WhatsApp ' || p_kind);
  else
    perform vault.update_secret(v_id, trim(p_value));
  end if;
end $$;

create or replace function crm_wa_status() returns jsonb
language plpgsql security definer set search_path = public, vault as $$
declare v_org uuid;
begin
  select org_id into v_org from crm_members where user_id = auth.uid() limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'has_token', exists (select 1 from vault.secrets where name = 'wa_token_' || v_org::text),
    'has_app_secret', exists (select 1 from vault.secrets where name = 'wa_app_secret_' || v_org::text));
end $$;

-- the one place that talks to Meta. async through pg_net; crm_wa_sync() reads the answer.
create or replace function crm_wa_send_internal(p_org uuid, p_phone text, p_template text, p_lang text, p_params jsonb,
                                                p_text text, p_lead uuid, p_client uuid, p_by text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb; tok text; v_to text; payload jsonb; req bigint; v_id uuid; v_body text;
begin
  select wa into cfg from crm_settings where org_id = p_org;
  tok := crm_wa_secret(p_org, 'token');
  if coalesce(cfg->>'phone_number_id', '') = '' or tok is null then raise exception 'WhatsApp is not configured'; end if;
  v_to := crm_wa_e164(p_phone);
  if length(v_to) < 11 then raise exception 'bad phone'; end if;

  if coalesce(p_template, '') <> '' then
    payload := jsonb_build_object('messaging_product', 'whatsapp', 'to', v_to, 'type', 'template',
      'template', jsonb_build_object('name', p_template, 'language', jsonb_build_object('code', coalesce(nullif(p_lang, ''), 'he')))
        || case when jsonb_array_length(coalesce(p_params, '[]'::jsonb)) > 0 then jsonb_build_object('components', jsonb_build_array(
             jsonb_build_object('type', 'body', 'parameters',
               (select jsonb_agg(jsonb_build_object('type', 'text', 'text', x)) from jsonb_array_elements_text(p_params) x))))
           else '{}'::jsonb end);
    v_body := 'תבנית: ' || p_template || coalesce(' (' || (select string_agg(x, ', ') from jsonb_array_elements_text(coalesce(p_params, '[]'::jsonb)) x) || ')', '');
  else
    if coalesce(trim(p_text), '') = '' then raise exception 'empty message'; end if;
    payload := jsonb_build_object('messaging_product', 'whatsapp', 'to', v_to, 'type', 'text',
      'text', jsonb_build_object('body', p_text, 'preview_url', true));
    v_body := p_text;
  end if;

  req := net.http_post(
    url := 'https://graph.facebook.com/' || coalesce(nullif(cfg->>'api_version', ''), 'v23.0') || '/' || (cfg->>'phone_number_id') || '/messages',
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || tok),
    timeout_milliseconds := 10000);

  insert into crm_wa_messages (org_id, lead_id, client_id, direction, phone, kind, template, body, params, status, request_id, by)
    values (p_org, p_lead, p_client, 'out', crm_wa_local(v_to), case when coalesce(p_template, '') <> '' then 'template' else 'text' end,
            nullif(p_template, ''), v_body, coalesce(p_params, '[]'::jsonb), 'queued', req, coalesce(p_by, 'מאור'))
    returning id into v_id;
  insert into crm_activities (org_id, lead_id, client_id, type, text, by)
    select p_org, p_lead, p_client, 'וואטסאפ', 'נשלח: ' || left(v_body, 300), coalesce(p_by, 'מאור')
    where p_lead is not null or p_client is not null;
  return v_id;
end $$;

-- called from the app (signed-in member)
create or replace function crm_wa_send(p_phone text, p_template text, p_lang text, p_params jsonb, p_text text,
                                       p_lead uuid default null, p_client uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from crm_members where user_id = auth.uid() limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  if p_lead is not null and not exists (select 1 from crm_leads where id = p_lead and org_id = v_org) then raise exception 'not allowed'; end if;
  if p_client is not null and not exists (select 1 from crm_clients where id = p_client and org_id = v_org) then raise exception 'not allowed'; end if;
  return crm_wa_send_internal(v_org, p_phone, p_template, p_lang, p_params, p_text, p_lead, p_client, 'מאור');
end $$;

-- read Meta's answers to queued sends
create or replace function crm_wa_sync() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; j jsonb;
begin
  for r in select m.id, h.status_code, h.content, h.error_msg from crm_wa_messages m
           join net._http_response h on h.id = m.request_id
           where m.status = 'queued' and m.request_id is not null loop
    begin j := r.content::jsonb; exception when others then j := null; end;
    if r.status_code between 200 and 299 then
      update crm_wa_messages set status = 'sent', wa_id = j->'messages'->0->>'id' where id = r.id;
    else
      update crm_wa_messages set status = 'failed',
        error = coalesce(j->'error'->>'message', r.error_msg, 'HTTP ' || coalesce(r.status_code::text, '?')) where id = r.id;
    end if;
    n := n + 1;
  end loop;
  -- pg_net forgets responses after a few hours: anything still queued after 1 hour is unknown
  update crm_wa_messages set status = 'failed', error = 'אין תשובה מהשרת' where status = 'queued' and at < now() - interval '1 hour';
  return n;
end $$;

-- automatic welcome to a new lead from the site (if turned on in settings)
create or replace function crm_wa_auto_welcome(p_org uuid, p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; l crm_leads;
begin
  select wa into cfg from crm_settings where org_id = p_org;
  if coalesce((cfg->>'auto_welcome')::boolean, false) is not true or coalesce(cfg->>'welcome_template', '') = '' then return; end if;
  select * into l from crm_leads where id = p_lead;
  if l.phone is null or coalesce(l.spam_score, 0) >= 3 then return; end if;
  begin
    perform crm_wa_send_internal(p_org, l.phone, cfg->>'welcome_template', cfg->>'welcome_lang',
      jsonb_build_array(coalesce(nullif(split_part(trim(l.name), ' ', 1), ''), 'שלום')), null, p_lead, null, 'אוטומציה');
  exception when others then
    insert into crm_activities (org_id, lead_id, type, text, by) values (p_org, p_lead, 'מערכת', 'הודעת הפתיחה בוואטסאפ לא נשלחה: ' || sqlerrm, 'אוטומציה');
  end;
end $$;

-- Meta webhook: verification
create or replace function crm_wa_verify(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_token, '') <> '' and exists (select 1 from crm_settings where wa->>'verify_token' = p_token)
$$;

-- Meta webhook: incoming messages and delivery statuses (signature checked with the app secret)
create or replace function crm_wa_inbound(p_raw text, p_sig text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare j jsonb; ent jsonb; ch jsonb; v jsonb; m jsonb; s jsonb; v_org uuid; sec text; v_local text;
        v_lead uuid; v_client uuid; v_text text; v_name text; n_in int := 0; n_st int := 0;
begin
  j := p_raw::jsonb;
  for ent in select * from jsonb_array_elements(coalesce(j->'entry', '[]'::jsonb)) loop
    for ch in select * from jsonb_array_elements(coalesce(ent->'changes', '[]'::jsonb)) loop
      v := ch->'value';
      select org_id into v_org from crm_settings where wa->>'phone_number_id' = v->'metadata'->>'phone_number_id' limit 1;
      if v_org is null then continue; end if;
      sec := crm_wa_secret(v_org, 'app_secret');
      if sec is null or coalesce(p_sig, '') <> 'sha256=' || encode(hmac(convert_to(p_raw, 'UTF8'), convert_to(sec, 'UTF8'), 'sha256'), 'hex') then
        raise exception 'bad signature';
      end if;

      for m in select * from jsonb_array_elements(coalesce(v->'messages', '[]'::jsonb)) loop
        v_lead := null; v_client := null;
        v_local := crm_wa_local(m->>'from');
        v_name := (select c->'profile'->>'name' from jsonb_array_elements(coalesce(v->'contacts', '[]'::jsonb)) c limit 1);
        v_text := coalesce(m->'text'->>'body', m->'button'->>'text', m->'interactive'->'button_reply'->>'title',
                           m->'interactive'->'list_reply'->>'title', '[' || coalesce(m->>'type', 'הודעה') || ']');
        select id into v_client from crm_clients where org_id = v_org and phone = v_local and archived_at is null limit 1;
        select id into v_lead from crm_leads where org_id = v_org and phone = v_local and archived_at is null limit 1;
        if exists (select 1 from crm_wa_messages where wa_id = m->>'id') then continue; end if;
        insert into crm_wa_messages (org_id, lead_id, client_id, direction, phone, kind, body, status, wa_id, by)
          values (v_org, v_lead, v_client, 'in', v_local, coalesce(m->>'type', 'text'), v_text, 'received', m->>'id', coalesce(v_name, v_local));
        if v_lead is not null or v_client is not null then
          insert into crm_activities (org_id, lead_id, client_id, type, text, by)
            values (v_org, v_lead, v_client, 'וואטסאפ', 'התקבל: ' || left(v_text, 300), coalesce(v_name, 'לקוח'));
        end if;
        perform crm_emit(v_org, 'wa_inbound', jsonb_build_object('phone', v_local, 'name', coalesce(v_name, ''), 'text', left(v_text, 500),
          'lead_id', v_lead, 'client_id', v_client));
        n_in := n_in + 1;
      end loop;

      for s in select * from jsonb_array_elements(coalesce(v->'statuses', '[]'::jsonb)) loop
        update crm_wa_messages set status = s->>'status',
          error = coalesce(s->'errors'->0->>'title', s->'errors'->0->>'message', error)
          where wa_id = s->>'id' and direction = 'out'
            and (case status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 1 end)
              <= (case s->>'status' when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 when 'failed' then 5 else 1 end);
        n_st := n_st + 1;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'messages', n_in, 'statuses', n_st);
end $$;

-- new lead from the site (API ingest only) -> optional automatic welcome
create or replace function crm_ingest_lead(p_key text, p_lead jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_phone text; v_id uuid; existing crm_leads;
begin
  v_org := crm_key_org(p_key);
  if v_org is null then raise exception 'invalid api key'; end if;
  if coalesce(trim(p_lead->>'name'), '') = '' and coalesce(trim(p_lead->>'phone'), '') = '' then
    raise exception 'name or phone required';
  end if;
  v_phone := nullif(regexp_replace(coalesce(p_lead->>'phone', ''), '[^0-9+]', '', 'g'), '');
  if v_phone like '+972%' then v_phone := '0' || substr(v_phone, 5); end if;
  if v_phone like '972%' then v_phone := '0' || substr(v_phone, 4); end if;

  if v_phone is not null then
    select * into existing from crm_leads where org_id = v_org and phone = v_phone and archived_at is null limit 1;
    if found then
      insert into crm_activities (org_id, lead_id, type, text, by)
        values (v_org, existing.id, 'פנייה חוזרת',
                'פנייה נוספת מ-' || coalesce(nullif(p_lead->>'source', ''), 'אתר') ||
                coalesce(': ' || nullif(p_lead->>'message', ''), ''), 'אוטומציה');
      perform crm_emit(v_org, 'lead_returned', jsonb_build_object('id', existing.id, 'name', existing.name, 'phone', existing.phone));
      return jsonb_build_object('ok', true, 'id', existing.id, 'duplicate', true);
    end if;
  end if;

  insert into crm_leads (org_id, name, biz, phone, email, industry, source, campaign, landing_page, pain,
                         marketing_consent, consent_at, consent_text, spam_score)
  values (v_org, coalesce(nullif(trim(p_lead->>'name'), ''), v_phone), coalesce(p_lead->>'biz', ''), v_phone,
          nullif(p_lead->>'email', ''), coalesce(p_lead->>'industry', ''), coalesce(nullif(p_lead->>'source', ''), 'אתר ישיר'),
          coalesce(p_lead->>'campaign', ''), coalesce(p_lead->>'landing_page', ''), coalesce(p_lead->>'message', ''),
          coalesce((p_lead->>'consent')::boolean, false),
          case when coalesce((p_lead->>'consent')::boolean, false) then now() end, p_lead->>'consent_text',
          case when coalesce(p_lead->>'spam_score', '') ~ '^[0-9]+(\.[0-9]+)?$' then (p_lead->>'spam_score')::numeric end)
  returning id into v_id;
  insert into crm_activities (org_id, lead_id, type, text, by)
    values (v_org, v_id, 'מערכת', 'ליד חדש מ-' || coalesce(nullif(p_lead->>'source', ''), 'אתר ישיר'), 'אוטומציה');
  perform crm_wa_auto_welcome(v_org, v_id);
  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end $$;

revoke execute on function crm_wa_secret(uuid, text), crm_wa_send_internal(uuid, text, text, text, jsonb, text, uuid, uuid, text),
  crm_wa_sync(), crm_wa_auto_welcome(uuid, uuid) from public, anon, authenticated;
revoke execute on function crm_wa_set_secret(text, text), crm_wa_status(),
  crm_wa_send(text, text, text, jsonb, text, uuid, uuid) from public, anon;
grant execute on function crm_wa_set_secret(text, text), crm_wa_status(),
  crm_wa_send(text, text, text, jsonb, text, uuid, uuid) to authenticated;
grant execute on function crm_wa_verify(text), crm_wa_inbound(text, text) to anon, authenticated;

select cron.schedule('crm-wa-sync', '* * * * *', 'select public.crm_wa_sync()');
