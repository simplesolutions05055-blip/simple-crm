-- 0018: passwords typed in an intake form go to Supabase Vault (never into the document),
-- and a filled form can be reopened for the client.

alter table crm_documents add column if not exists reopened_at timestamptz;

create table if not exists crm_intake_secrets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  doc_id uuid not null references crm_documents(id) on delete cascade,
  key text not null,                 -- <field id>:<platform>
  label text not null default '',
  url text not null default '',
  username text not null default '',
  secret_id uuid not null,
  vault_item_id uuid,                -- the copy in the client's vault, once the doc belongs to a client
  updated_at timestamptz not null default now(),
  unique (doc_id, key)
);
alter table crm_intake_secrets enable row level security;
-- members see which passwords exist, never the password; writes only through the functions below
create policy crm_intake_secrets_read on crm_intake_secrets for select to authenticated using (crm_is_member(org_id));

-- shared writer: create or replace the secret, and mirror it into the client's vault when there is a client
create or replace function crm_intake_put(p_doc crm_documents, p_key text, p_label text, p_url text, p_user text, p_value text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare s crm_intake_secrets; v_sid uuid; v_label text := left(coalesce(nullif(trim(p_label), ''), 'פרטי כניסה'), 80);
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9-]{1,20}:.{1,40}$' then raise exception 'bad key'; end if;
  if coalesce(p_value, '') = '' or length(p_value) > 500 then raise exception 'bad value'; end if;
  select * into s from crm_intake_secrets where doc_id = p_doc.id and key = p_key;
  if s.id is null then
    v_sid := vault.create_secret(p_value, 'crm-intake-' || gen_random_uuid()::text, 'intake ' || p_doc.id::text || ': ' || v_label);
    insert into crm_intake_secrets (org_id, doc_id, key, label, url, username, secret_id)
      values (p_doc.org_id, p_doc.id, p_key, v_label, left(coalesce(trim(p_url), ''), 500), left(coalesce(trim(p_user), ''), 200), v_sid)
      returning * into s;
  else
    perform vault.update_secret(s.secret_id, p_value);
    update crm_intake_secrets set label = v_label, url = left(coalesce(trim(p_url), ''), 500), username = left(coalesce(trim(p_user), ''), 200), updated_at = now()
      where id = s.id returning * into s;
  end if;
  if p_doc.client_id is not null then perform crm_intake_to_vault(s.id, p_doc.client_id); end if;
end $$;

create or replace function crm_intake_to_vault(p_secret uuid, p_client uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s crm_intake_secrets; v_id uuid;
begin
  select * into s from crm_intake_secrets where id = p_secret;
  if s.id is null then return; end if;
  if s.vault_item_id is not null and exists (select 1 from crm_vault_items where id = s.vault_item_id) then
    update crm_vault_items set label = s.label || ' (מהאפיון)', url = s.url, username = s.username, client_id = p_client where id = s.vault_item_id;
  else
    insert into crm_vault_items (org_id, client_id, label, url, username, secret_id)
      values (s.org_id, p_client, s.label || ' (מהאפיון)', s.url, s.username, s.secret_id) returning id into v_id;
    update crm_intake_secrets set vault_item_id = v_id where id = s.id;
  end if;
end $$;

-- the lead became a client: its intake passwords join the client's vault
create or replace function crm_intake_doc_client() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.client_id is not null and new.client_id is distinct from old.client_id then
    for r in select id from crm_intake_secrets where doc_id = new.id loop
      perform crm_intake_to_vault(r.id, new.client_id);
    end loop;
  end if;
  return new;
end $$;
create or replace trigger crm_intake_doc_client_trg after update of client_id on crm_documents
  for each row execute function crm_intake_doc_client();

-- the client, from the link (only while the form is open)
create or replace function crm_intake_secret(p_token text, p_key text, p_label text, p_url text, p_user text, p_value text) returns boolean
language plpgsql security definer set search_path = public as $$
declare d crm_documents;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then raise exception 'not found'; end if;
  select * into d from crm_documents where token = p_token and kind like 'intake:%';
  if d.id is null then raise exception 'not found'; end if;
  if d.submitted_at is not null then raise exception 'submitted'; end if;
  perform crm_intake_put(d, p_key, p_label, p_url, p_user, p_value);
  return true;
end $$;

-- the office: set or replace a password while editing the document
create or replace function crm_intake_set_secret(p_doc uuid, p_key text, p_label text, p_url text, p_user text, p_value text) returns boolean
language plpgsql security definer set search_path = public as $$
declare d crm_documents;
begin
  select * into d from crm_documents where id = p_doc;
  if d.id is null or not crm_is_member(d.org_id) then raise exception 'not allowed'; end if;
  perform crm_intake_put(d, p_key, p_label, p_url, p_user, p_value);
  return true;
end $$;

-- the office: show a password, logged like the vault
create or replace function crm_intake_reveal(p_doc uuid, p_key text) returns text
language plpgsql security definer set search_path = public, vault as $$
declare s crm_intake_secrets; d crm_documents; v text;
begin
  select * into d from crm_documents where id = p_doc;
  if d.id is null or not crm_is_member(d.org_id) then raise exception 'not allowed'; end if;
  select * into s from crm_intake_secrets where doc_id = p_doc and key = p_key;
  if s.id is null then return null; end if;
  select decrypted_secret into v from vault.decrypted_secrets where id = s.secret_id;
  insert into crm_activities (org_id, lead_id, client_id, type, text, by)
    values (d.org_id, d.lead_id, d.client_id, 'מערכת', 'נצפתה סיסמה מהאפיון: ' || s.label, 'מערכת');
  return v;
end $$;

revoke all on function crm_intake_put(crm_documents, text, text, text, text, text) from public, anon, authenticated;
revoke all on function crm_intake_to_vault(uuid, uuid) from public, anon, authenticated;
revoke all on function crm_intake_doc_client() from public, anon, authenticated;
revoke all on function crm_intake_secret(text, text, text, text, text, text) from public;
revoke all on function crm_intake_set_secret(uuid, text, text, text, text, text) from public, anon;
revoke all on function crm_intake_reveal(uuid, text) from public, anon;
grant execute on function crm_intake_secret(text, text, text, text, text, text) to anon, authenticated;
grant execute on function crm_intake_set_secret(uuid, text, text, text, text, text), crm_intake_reveal(uuid, text) to authenticated;
-- re-submitting after a reopen does not list the same uploaded file twice
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
      if exists (select 1 from storage.objects o where o.bucket_id = 'crm-docs' and o.name = f->>'path')
         and not exists (select 1 from crm_documents x where x.org_id = d.org_id and x.kind = 'file' and x.path = f->>'path') then
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
      values (d.org_id, d.lead_id, d.client_id, 'מערכת', case when d.reopened_at is not null then 'הלקוח השלים ושלח שוב: ' else 'הלקוח מילא ושלח: ' end || d.title, 'לקוח');
    perform crm_emit(d.org_id, 'intake_submitted', jsonb_build_object('id', d.id, 'title', d.title, 'name', v_name,
      'lead_id', d.lead_id, 'client_id', d.client_id, 'files', n));
  end if;
  return jsonb_build_object('ok', true, 'submitted', p_submit);
end $$;

