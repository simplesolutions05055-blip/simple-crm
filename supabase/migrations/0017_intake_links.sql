-- 0017: intake forms sent to the client by link.
-- The client opens /f/<token>, fills it on the phone in steps (autosave), may upload files, and submits.
-- On submit: a task, an activity, an event (n8n), and the uploaded files show in the documents list.

alter table crm_documents
  add column if not exists token text unique,
  add column if not exists sent_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists views int not null default 0;

alter table crm_settings add column if not exists intake_templates jsonb not null default '{}'::jsonb;

-- what the client sees: the form as it was when sent, and what was filled so far
create or replace function crm_public_intake(p_token text, p_track boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d crm_documents; v_name text; v_biz text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return null; end if;
  select * into d from crm_documents where token = p_token and kind like 'intake:%';
  if d.id is null then return null; end if;
  if p_track then
    update crm_documents set views = views + 1, opened_at = coalesce(opened_at, now()) where id = d.id;
  end if;
  select coalesce(nullif(l.name, ''), l.biz) into v_name from crm_leads l where l.id = d.lead_id;
  if v_name is null then select coalesce(nullif(c.contact, ''), c.biz) into v_name from crm_clients c where c.id = d.client_id; end if;
  select coalesce(s.agency->>'name', 'Simple Solution') into v_biz from crm_settings s where s.org_id = d.org_id;
  return jsonb_build_object(
    'title', d.title, 'org', d.org_id, 'form', d.data->'form', 'answers', coalesce(d.data->'answers', '{}'::jsonb),
    'submitted_at', d.submitted_at, 'name', split_part(coalesce(v_name, ''), ' ', 1), 'biz', coalesce(v_biz, 'Simple Solution'));
end $$;

-- autosave and submit. After submit the form is locked.
create or replace function crm_save_intake(p_token text, p_answers jsonb, p_filled int, p_total int, p_submit boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d crm_documents; v_name text; f jsonb; v_prefix text; n int := 0;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then raise exception 'not found'; end if;
  if jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 300000 then raise exception 'bad answers'; end if;
  select * into d from crm_documents where token = p_token and kind like 'intake:%' for update;
  if d.id is null then raise exception 'not found'; end if;
  if d.submitted_at is not null then return jsonb_build_object('ok', false, 'submitted', true); end if;

  update crm_documents set
    data = d.data || jsonb_build_object('answers', p_answers, 'filled', greatest(0, coalesce(p_filled, 0)), 'total', greatest(0, coalesce(p_total, 0))),
    updated_at = now(),
    submitted_at = case when p_submit then now() else null end
  where id = d.id;

  if p_submit then
    select coalesce(nullif(l.name, ''), l.biz) into v_name from crm_leads l where l.id = d.lead_id;
    if v_name is null then select coalesce(nullif(c.biz, ''), c.contact) into v_name from crm_clients c where c.id = d.client_id; end if;
    v_name := coalesce(v_name, '');

    -- files the client uploaded inside the form also show in the documents list
    v_prefix := d.org_id::text || '/intake/' || p_token || '/';
    for f in
      select e from jsonb_each(p_answers) a, jsonb_array_elements(case when jsonb_typeof(a.value) = 'array' then a.value else '[]'::jsonb end) e
      where jsonb_typeof(e) = 'object' and left(e->>'path', length(v_prefix)) = v_prefix
    loop
      if exists (select 1 from storage.objects o where o.bucket_id = 'crm-docs' and o.name = f->>'path') then
        insert into crm_documents (org_id, lead_id, client_id, kind, title, path, size, mime)
          values (d.org_id, d.lead_id, d.client_id, 'file', left(coalesce(f->>'name', 'קובץ'), 200), f->>'path',
                  nullif(f->>'size', '')::bigint, null);
        n := n + 1;
      end if;
    end loop;

    insert into crm_tasks (org_id, title, description, start_date, due_date, lead_id, client_id, auto, source)
      values (d.org_id, 'לעבור על ' || d.title || case when v_name <> '' then ' · ' || v_name else '' end,
              'הלקוח מילא את האפיון בקישור' || case when n > 0 then ' והעלה ' || n || ' קבצים' else '' end || '.',
              current_date, current_date + 1, d.lead_id, d.client_id, true, 'intake');
    insert into crm_activities (org_id, lead_id, client_id, type, text, by)
      values (d.org_id, d.lead_id, d.client_id, 'מערכת', 'הלקוח מילא ושלח: ' || d.title, 'לקוח');
    perform crm_emit(d.org_id, 'intake_submitted', jsonb_build_object('id', d.id, 'title', d.title, 'name', v_name,
      'lead_id', d.lead_id, 'client_id', d.client_id, 'files', n));
  end if;
  return jsonb_build_object('ok', true, 'submitted', p_submit);
end $$;

revoke all on function crm_public_intake(text, boolean) from public;
revoke all on function crm_save_intake(text, jsonb, int, int, boolean) from public;
grant execute on function crm_public_intake(text, boolean), crm_save_intake(text, jsonb, int, int, boolean) to anon, authenticated;

-- the client (not signed in) may upload only into <org>/intake/<token>/ of an open intake link
create or replace function crm_intake_path_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare p text[] := storage.foldername(p_name);
begin
  if array_length(p, 1) <> 3 or p[2] <> 'intake' or p[3] !~ '^[a-f0-9]{32}$' then return false; end if;
  return exists (select 1 from crm_documents d where d.token = p[3] and d.org_id::text = p[1] and d.submitted_at is null);
end $$;
revoke all on function crm_intake_path_ok(text) from public;
grant execute on function crm_intake_path_ok(text) to anon, authenticated;

create policy crm_docs_intake_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'crm-docs' and crm_intake_path_ok(name));
