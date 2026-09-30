-- simple-CRM · v2
-- Quotes follow Maor's template model (tracks / custom items / web / messaging / add-ons).
-- Pricing lives in crm_settings.pricing and is frozen onto a quote when it is sent.
-- Public quote page, signing and n8n ingestion go through SECURITY DEFINER functions,
-- so the app never needs the service-role key.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- columns ----------
alter table crm_settings add column if not exists pricing jsonb not null default '{}'::jsonb;
alter table crm_settings add column if not exists n8n_webhook text;
alter table crm_settings add column if not exists onboarding jsonb not null default
  '["פתיחת קבוצת וואטסאפ ללקוח","שאלון פתיחה נשלח ומולא","גישות התקבלו","פגישת בריף","תשלום ראשון התקבל","השירות עלה לאוויר"]'::jsonb;

alter table crm_quotes add column if not exists input jsonb not null default '{}'::jsonb;    -- editor state
alter table crm_quotes add column if not exists pricing jsonb;                               -- frozen at send
alter table crm_quotes add column if not exists template jsonb;                              -- frozen at send
alter table crm_quotes add column if not exists vat numeric;                                 -- frozen at send
alter table crm_quotes add column if not exists totals jsonb not null default '{}'::jsonb;   -- {title, monthly, oneoff, monthlyLines[], oneoffLines[]}
alter table crm_quotes add column if not exists signed_at timestamptz;
alter table crm_quotes add column if not exists updated_at timestamptz not null default now();
alter table crm_quotes alter column no set default '';

alter table crm_signatures add column if not exists signature_png text;
alter table crm_payments add column if not exists period text;   -- 'YYYY-MM' for monthly charges
create unique index if not exists crm_payments_period_uq on crm_payments (client_id, period) where period is not null;

-- ---------- quote numbering ----------
create or replace function crm_quote_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(now(), 'YYYY'); n int;
begin
  if coalesce(new.no, '') = '' then
    select coalesce(max(case when split_part(no, '-', 2) ~ '^\d+$' then split_part(no, '-', 2)::int end), 0) + 1 into n
      from crm_quotes where org_id = new.org_id and no like y || '-%';
    new.no := y || '-' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;
drop trigger if exists crm_quote_no_trg on crm_quotes;
create trigger crm_quote_no_trg before insert on crm_quotes for each row execute function crm_quote_no();

-- ---------- events -> n8n ----------
create table if not exists crm_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references crm_orgs(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
alter table crm_events enable row level security;
drop policy if exists crm_events_member on crm_events;
create policy crm_events_member on crm_events for select to authenticated using (crm_is_member(org_id));

create or replace function crm_emit(p_org uuid, p_type text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into crm_events (org_id, type, payload) values (p_org, p_type, coalesce(p_payload, '{}'::jsonb));
end $$;

create or replace function crm_events_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare url text;
begin
  select n8n_webhook into url from crm_settings where org_id = new.org_id;
  if url is not null and url like 'https://%' then
    perform net.http_post(
      url := url,
      body := jsonb_build_object('event', new.type, 'at', new.at, 'data', new.payload),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 5000);
  end if;
  return new;
end $$;
drop trigger if exists crm_events_push_trg on crm_events;
create trigger crm_events_push_trg after insert on crm_events for each row execute function crm_events_push();

create or replace function crm_lead_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform crm_emit(new.org_id, 'lead_created', jsonb_build_object(
    'id', new.id, 'name', new.name, 'biz', new.biz, 'phone', new.phone, 'email', new.email,
    'source', new.source, 'campaign', new.campaign, 'industry', new.industry));
  return new;
end $$;
drop trigger if exists crm_lead_event_trg on crm_leads;
create trigger crm_lead_event_trg after insert on crm_leads for each row execute function crm_lead_event();

create or replace function crm_quote_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare who jsonb;
begin
  if new.status is distinct from old.status and new.status in ('נשלחה','נצפתה','נחתמה','נדחתה') then
    select jsonb_build_object('name', coalesce(c.contact, l.name), 'biz', coalesce(c.biz, l.biz), 'phone', coalesce(c.phone, l.phone))
      into who from crm_quotes q left join crm_leads l on l.id = q.lead_id left join crm_clients c on c.id = q.client_id
      where q.id = new.id;
    perform crm_emit(new.org_id,
      case new.status when 'נשלחה' then 'quote_sent' when 'נצפתה' then 'quote_viewed'
                      when 'נחתמה' then 'quote_signed' else 'quote_rejected' end,
      jsonb_build_object('id', new.id, 'no', new.no, 'token', new.token, 'totals', new.totals) || coalesce(who, '{}'::jsonb));
  end if;
  return new;
end $$;
drop trigger if exists crm_quote_event_trg on crm_quotes;
create trigger crm_quote_event_trg after update on crm_quotes for each row execute function crm_quote_event();

-- ---------- public quote (anon) ----------
create or replace function crm_public_quote(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q crm_quotes; s crm_settings; lead crm_leads; cl crm_clients; sig crm_signatures; expired boolean;
begin
  select * into q from crm_quotes where token = p_token and sent_at is not null;
  if not found then return null; end if;
  select * into s from crm_settings where org_id = q.org_id;
  if q.lead_id is not null then select * into lead from crm_leads where id = q.lead_id; end if;
  if q.client_id is not null then select * into cl from crm_clients where id = q.client_id; end if;
  select * into sig from crm_signatures where quote_id = q.id;

  expired := q.status in ('נשלחה','נצפתה') and now() > q.sent_at + make_interval(days => q.valid_days + 1);
  if expired then
    update crm_quotes set status = 'פגה' where id = q.id; q.status := 'פגה';
  elsif q.status in ('נשלחה','נצפתה') then
    insert into crm_quote_views (quote_id) values (q.id);
    update crm_quotes set views = views + 1,
      status = case when status = 'נשלחה' then 'נצפתה' else status end
      where id = q.id;
  end if;

  return jsonb_build_object(
    'no', q.no, 'status', q.status, 'input', q.input,
    'pricing', coalesce(q.pricing, s.pricing), 'template', coalesce(q.template, s.quote_template),
    'vat', coalesce(q.vat, s.vat), 'valid_days', q.valid_days, 'sent_at', q.sent_at,
    'to_name', coalesce(cl.contact, lead.name), 'to_biz', coalesce(cl.biz, lead.biz),
    'to_email', coalesce(cl.email, lead.email),
    'signed', case when sig.id is null then null else jsonb_build_object(
      'name', sig.name, 'biz', sig.biz, 'signed_at', sig.signed_at, 'doc_hash', sig.doc_hash, 'png', sig.signature_png) end);
end $$;

-- ---------- signing (anon) ----------
create or replace function crm_sign_quote(p_token text, p_name text, p_biz text, p_idno text, p_email text,
  p_png text, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare q crm_quotes; s crm_settings; lead crm_leads; v_client uuid; snap jsonb; h text; line jsonb; i int := 0; t text;
  vat numeric; oneoff numeric;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(p_png, '') = '' then raise exception 'missing name or signature'; end if;
  if length(p_png) > 400000 then raise exception 'signature too large'; end if;

  select * into q from crm_quotes where token = p_token and sent_at is not null for update;
  if not found then raise exception 'quote not found'; end if;
  if q.status = 'נחתמה' then raise exception 'already signed'; end if;
  if q.status in ('נדחתה','פגה') or now() > q.sent_at + make_interval(days => q.valid_days + 1) then
    raise exception 'quote not open for signing';
  end if;
  select * into s from crm_settings where org_id = q.org_id;
  vat := coalesce(q.vat, s.vat);

  snap := jsonb_build_object('no', q.no, 'version', q.version, 'input', q.input,
    'pricing', coalesce(q.pricing, s.pricing), 'template', coalesce(q.template, s.quote_template),
    'vat', vat, 'totals', q.totals, 'sent_at', q.sent_at,
    'signer', jsonb_build_object('name', p_name, 'biz', p_biz, 'idno', p_idno, 'email', p_email));
  h := encode(digest(snap::text, 'sha256'), 'hex');

  insert into crm_signatures (quote_id, org_id, option_index, name, biz, idno, email, signature_png, ip, user_agent, doc_hash, snapshot)
    values (q.id, q.org_id, 0, trim(p_name), coalesce(p_biz, ''), p_idno, p_email, p_png, p_ip, p_ua, h, snap);

  -- client
  v_client := q.client_id;
  if v_client is null and q.lead_id is not null then
    select * into lead from crm_leads where id = q.lead_id;
    v_client := lead.client_id;
    if v_client is null then
      insert into crm_clients (org_id, lead_id, biz, contact, phone, email, industry)
        values (q.org_id, lead.id, coalesce(nullif(p_biz, ''), nullif(lead.biz, ''), lead.name), lead.name,
                lead.phone, coalesce(nullif(p_email, ''), lead.email), lead.industry)
        returning id into v_client;
    end if;
    update crm_leads set stage = 'לקוח', client_id = v_client where id = lead.id;
  end if;
  if v_client is null then
    insert into crm_clients (org_id, biz, contact, email) values (q.org_id, coalesce(nullif(p_biz, ''), p_name), p_name, p_email)
      returning id into v_client;
  end if;

  update crm_quotes set status = 'נחתמה', signed_at = now(), client_id = v_client, selected_option = 0 where id = q.id;

  -- services from the frozen totals
  for line in select * from jsonb_array_elements(coalesce(q.totals->'monthlyLines', '[]'::jsonb)) loop
    insert into crm_client_services (org_id, client_id, quote_id, name, billing, price, start_date)
      values (q.org_id, v_client, q.id, line->>'name', 'חודשי', (line->>'price')::numeric, current_date);
  end loop;
  for line in select * from jsonb_array_elements(coalesce(q.totals->'oneoffLines', '[]'::jsonb)) loop
    insert into crm_client_services (org_id, client_id, quote_id, name, billing, price, start_date, status)
      values (q.org_id, v_client, q.id, line->>'name', 'חד-פעמי', (line->>'price')::numeric, current_date, 'פעיל');
  end loop;

  -- one-off payment now; monthly charges are created by crm_generate_monthly_payments()
  oneoff := coalesce((q.totals->>'oneoff')::numeric, 0);
  if oneoff > 0 then
    insert into crm_payments (org_id, client_id, what, amount, due)
      values (q.org_id, v_client, 'חד פעמי, הצעה ' || q.no, round(oneoff * (1 + vat / 100)), current_date);
  end if;

  -- onboarding checklist (only if the client has none yet)
  if not exists (select 1 from crm_onboarding_items where client_id = v_client) then
    for t in select jsonb_array_elements_text(s.onboarding) loop
      i := i + 1;
      insert into crm_onboarding_items (org_id, client_id, title, sort) values (q.org_id, v_client, t, i);
    end loop;
  end if;

  insert into crm_tasks (org_id, title, description, start_date, due_date, client_id, auto)
    values (q.org_id, 'קליטת לקוח חדש', 'הצעה ' || q.no || ' נחתמה. לפתוח קבוצת וואטסאפ ולשלוח שאלון פתיחה.',
            current_date, current_date + 1, v_client, true);
  insert into crm_activities (org_id, client_id, lead_id, type, text, by)
    values (q.org_id, v_client, q.lead_id, 'מערכת', 'הצעה ' || q.no || ' נחתמה על ידי ' || trim(p_name), 'מערכת');

  return jsonb_build_object('ok', true, 'doc_hash', h, 'signed_at', now());
end $$;

create or replace function crm_reject_quote(p_token text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q crm_quotes;
begin
  select * into q from crm_quotes where token = p_token and sent_at is not null;
  if not found or q.status not in ('נשלחה','נצפתה') then return jsonb_build_object('ok', false); end if;
  update crm_quotes set status = 'נדחתה' where id = q.id;
  insert into crm_activities (org_id, client_id, lead_id, type, text, by)
    values (q.org_id, q.client_id, q.lead_id, 'מערכת', 'הצעה ' || q.no || ' נדחתה' ||
            coalesce(': ' || nullif(trim(p_reason), ''), ''), 'מערכת');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- monthly charges ----------
create or replace function crm_generate_monthly_payments() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; per text := to_char(current_date, 'YYYY-MM'); first date := date_trunc('month', current_date)::date;
begin
  for r in
    select c.org_id, c.id client_id, sum(sv.price) total, s.vat
    from crm_clients c
    join crm_client_services sv on sv.client_id = c.id and sv.billing = 'חודשי' and sv.status = 'פעיל' and sv.start_date < first
    join crm_settings s on s.org_id = c.org_id
    where c.status in ('בקליטה','פעיל','בסיכון') and c.archived_at is null
    group by c.org_id, c.id, s.vat
    having sum(sv.price) > 0
  loop
    insert into crm_payments (org_id, client_id, what, amount, due, period)
      values (r.org_id, r.client_id, 'חיוב חודשי ' || to_char(first, 'MM/YYYY'), round(r.total * (1 + r.vat / 100)), first, per)
      on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------- n8n: API keys, lead ingestion, daily digest ----------
create or replace function crm_key_org(p_key text) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select org_id from crm_api_keys
  where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and revoked_at is null
$$;

create or replace function crm_create_api_key(p_label text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; k text;
begin
  select org_id into v_org from crm_members where user_id = auth.uid() and role = 'owner' limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  k := 'sscrm_' || encode(gen_random_bytes(24), 'hex');
  insert into crm_api_keys (org_id, label, key_hash) values (v_org, coalesce(nullif(trim(p_label), ''), 'n8n'),
    encode(digest(k, 'sha256'), 'hex'));
  return k;
end $$;

create or replace function crm_list_api_keys() returns table (id uuid, label text, created_at timestamptz, revoked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select k.id, k.label, k.created_at, k.revoked_at from crm_api_keys k
  where crm_is_member(k.org_id) order by k.created_at desc
$$;

create or replace function crm_revoke_api_key(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update crm_api_keys set revoked_at = now() where id = p_id and crm_is_member(org_id)
$$;

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
                         marketing_consent, consent_at, consent_text)
  values (v_org, coalesce(nullif(trim(p_lead->>'name'), ''), v_phone), coalesce(p_lead->>'biz', ''), v_phone,
          nullif(p_lead->>'email', ''), coalesce(p_lead->>'industry', ''), coalesce(nullif(p_lead->>'source', ''), 'אתר ישיר'),
          coalesce(p_lead->>'campaign', ''), coalesce(p_lead->>'landing_page', ''), coalesce(p_lead->>'message', ''),
          coalesce((p_lead->>'consent')::boolean, false),
          case when coalesce((p_lead->>'consent')::boolean, false) then now() end, p_lead->>'consent_text')
  returning id into v_id;
  insert into crm_activities (org_id, lead_id, type, text, by)
    values (v_org, v_id, 'מערכת', 'ליד חדש מ-' || coalesce(nullif(p_lead->>'source', ''), 'אתר ישיר'), 'אוטומציה');
  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end $$;

create or replace function crm_digest(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  v_org := crm_key_org(p_key);
  if v_org is null then raise exception 'invalid api key'; end if;
  return jsonb_build_object(
    'date', current_date,
    'new_leads', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'biz', biz, 'phone', phone, 'source', source)), '[]')
                  from crm_leads where org_id = v_org and created_at >= now() - interval '1 day' and archived_at is null),
    'leads_no_touch', (select count(*) from crm_leads where org_id = v_org and stage = 'חדש' and last_contact_at is null
                       and created_at < now() - interval '1 day' and archived_at is null),
    'next_steps_due', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'step', next_step, 'at', next_at)), '[]')
                       from crm_leads where org_id = v_org and next_at <= current_date and archived_at is null
                       and stage not in ('לקוח','נפסל')),
    'tasks_due', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'due', due_date)), '[]')
                  from crm_tasks where org_id = v_org and not done and due_date <= current_date),
    'quotes_waiting', (select coalesce(jsonb_agg(jsonb_build_object('no', no, 'status', status, 'views', views, 'sent_at', sent_at)), '[]')
                       from crm_quotes where org_id = v_org and status in ('נשלחה','נצפתה')),
    'payments_overdue', (select coalesce(jsonb_agg(jsonb_build_object('client', c.biz, 'what', p.what, 'amount', p.amount, 'due', p.due)), '[]')
                         from crm_payments p join crm_clients c on c.id = p.client_id
                         where p.org_id = v_org and p.paid_at is null and p.due < current_date));
end $$;

-- ---------- grants ----------
revoke execute on function crm_quote_no() from public, anon, authenticated;
revoke execute on function crm_emit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function crm_events_push() from public, anon, authenticated;
revoke execute on function crm_lead_event() from public, anon, authenticated;
revoke execute on function crm_quote_event() from public, anon, authenticated;
revoke execute on function crm_generate_monthly_payments() from public, anon, authenticated;
revoke execute on function crm_key_org(text) from public, anon, authenticated;
revoke execute on function crm_create_api_key(text) from public, anon;
revoke execute on function crm_list_api_keys() from public, anon;
revoke execute on function crm_revoke_api_key(uuid) from public, anon;
grant execute on function crm_create_api_key(text), crm_list_api_keys(), crm_revoke_api_key(uuid) to authenticated;
grant execute on function crm_public_quote(text), crm_sign_quote(text, text, text, text, text, text, text, text),
  crm_reject_quote(text, text), crm_ingest_lead(text, jsonb), crm_digest(text) to anon, authenticated;

-- ---------- schedule: monthly charges, daily at 06:00 UTC ----------
select cron.schedule('crm-monthly-payments', '0 6 * * *', 'select public.crm_generate_monthly_payments()');
