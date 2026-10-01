-- ---------- client access: partner access per platform asset ----------
create table if not exists crm_client_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  client_id uuid not null references crm_clients(id) on delete cascade,
  platform text not null,               -- מטא / גוגל / טיקטוק / אתר / דומיין / אחר
  asset text not null,                  -- עמוד פייסבוק, חשבון מודעות, פיקסל...
  ref text not null default '',         -- מזהה או קישור לנכס
  status text not null default 'לא התחיל'
    check (status in ('לא התחיל','נשלחה בקשה','ממתין ללקוח','יש גישה','בעיה')),
  notes text not null default '',
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists crm_client_access_client on crm_client_access (client_id, sort);
alter table crm_client_access enable row level security;
drop policy if exists crm_client_access_member on crm_client_access;
create policy crm_client_access_member on crm_client_access for all to authenticated
  using (crm_is_member(org_id)) with check (crm_is_member(org_id));

-- agency partner IDs used in the instructions sent to clients
alter table crm_settings add column if not exists agency jsonb not null default '{}'::jsonb;

-- ---------- small vault: website / domain logins, encrypted with Supabase Vault ----------
create table if not exists crm_vault_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  client_id uuid not null references crm_clients(id) on delete cascade,
  label text not null,
  url text not null default '',
  username text not null default '',
  secret_id uuid not null,
  last_revealed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_vault_items_client on crm_vault_items (client_id);
alter table crm_vault_items enable row level security;
-- members may read the row (label, url, username), never the secret; writes only through the functions below
drop policy if exists crm_vault_items_read on crm_vault_items;
create policy crm_vault_items_read on crm_vault_items for select to authenticated using (crm_is_member(org_id));

create or replace function crm_vault_add(p_client uuid, p_label text, p_url text, p_username text, p_secret text) returns uuid
language plpgsql security definer set search_path = public, vault as $$
declare v_org uuid; v_sid uuid; v_id uuid;
begin
  select org_id into v_org from crm_clients where id = p_client;
  if v_org is null or not crm_is_member(v_org) then raise exception 'not allowed'; end if;
  if coalesce(trim(p_label), '') = '' or coalesce(p_secret, '') = '' then raise exception 'label and secret required'; end if;
  v_sid := vault.create_secret(p_secret, 'crm-' || gen_random_uuid()::text, 'client ' || p_client::text || ': ' || trim(p_label));
  insert into crm_vault_items (org_id, client_id, label, url, username, secret_id)
    values (v_org, p_client, trim(p_label), coalesce(trim(p_url), ''), coalesce(trim(p_username), ''), v_sid)
    returning id into v_id;
  insert into crm_activities (org_id, client_id, type, text, by) values (v_org, p_client, 'מערכת', 'נשמרה בכספת: ' || trim(p_label), 'מערכת');
  return v_id;
end $$;

create or replace function crm_vault_reveal(p_id uuid) returns text
language plpgsql security definer set search_path = public, vault as $$
declare it crm_vault_items; v text;
begin
  select * into it from crm_vault_items where id = p_id;
  if it.id is null or not crm_is_member(it.org_id) then raise exception 'not allowed'; end if;
  select decrypted_secret into v from vault.decrypted_secrets where id = it.secret_id;
  update crm_vault_items set last_revealed_at = now() where id = p_id;
  insert into crm_activities (org_id, client_id, type, text, by) values (it.org_id, it.client_id, 'מערכת', 'נצפתה סיסמה בכספת: ' || it.label, 'מערכת');
  return v;
end $$;

create or replace function crm_vault_update(p_id uuid, p_label text, p_url text, p_username text, p_secret text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare it crm_vault_items;
begin
  select * into it from crm_vault_items where id = p_id;
  if it.id is null or not crm_is_member(it.org_id) then raise exception 'not allowed'; end if;
  update crm_vault_items set label = coalesce(nullif(trim(p_label), ''), label), url = coalesce(p_url, url),
    username = coalesce(p_username, username) where id = p_id;
  if coalesce(p_secret, '') <> '' then perform vault.update_secret(it.secret_id, p_secret); end if;
end $$;

create or replace function crm_vault_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public, vault as $$
declare it crm_vault_items;
begin
  select * into it from crm_vault_items where id = p_id;
  if it.id is null or not crm_is_member(it.org_id) then raise exception 'not allowed'; end if;
  delete from vault.secrets where id = it.secret_id;
  delete from crm_vault_items where id = p_id;
  insert into crm_activities (org_id, client_id, type, text, by) values (it.org_id, it.client_id, 'מערכת', 'נמחק מהכספת: ' || it.label, 'מערכת');
end $$;

revoke execute on function crm_vault_add(uuid, text, text, text, text), crm_vault_reveal(uuid),
  crm_vault_update(uuid, text, text, text, text), crm_vault_delete(uuid) from public, anon;
grant execute on function crm_vault_add(uuid, text, text, text, text), crm_vault_reveal(uuid),
  crm_vault_update(uuid, text, text, text, text), crm_vault_delete(uuid) to authenticated;
