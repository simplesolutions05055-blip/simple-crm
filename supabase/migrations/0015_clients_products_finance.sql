-- simple-CRM · 0015
-- 1. a lead that reaches "לקוח" becomes a client (and can be sent back to the pipeline)
-- 2. uploaded files on leads and clients (private bucket, per business)
-- 3. products on clients: description, list price, retainer, supplier and supplier cost
-- 4. suppliers, manual expenses, client churn dates -> the finance tab

-- ---------- 1. lead <-> client ----------
alter table crm_clients add column if not exists left_at date;

create or replace function crm_lead_to_client(p_lead uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare l crm_leads; v_client uuid;
begin
  select * into l from crm_leads where id = p_lead for update;
  if not found or not crm_is_member(l.org_id) then raise exception 'not allowed'; end if;
  v_client := l.client_id;
  if v_client is not null and exists (select 1 from crm_clients where id = v_client) then
    update crm_clients set archived_at = null, left_at = null,
      status = case when status in ('הסתיים','עזב') then 'בקליטה' else status end
      where id = v_client;
  else
    insert into crm_clients (org_id, lead_id, biz, contact, phone, email, industry)
      values (l.org_id, l.id, coalesce(nullif(l.biz, ''), l.name), l.name, l.phone, l.email, l.industry)
      returning id into v_client;
  end if;
  update crm_leads set stage = 'לקוח', client_id = v_client where id = l.id;
  update crm_documents set client_id = v_client where lead_id = l.id and client_id is null;
  update crm_quotes set client_id = v_client where lead_id = l.id and client_id is null;
  insert into crm_activities (org_id, lead_id, client_id, type, text, by)
    values (l.org_id, l.id, v_client, 'מערכת', 'הליד הפך ללקוח', 'מערכת');
  return v_client;
end $$;
revoke all on function crm_lead_to_client(uuid) from public, anon;
grant execute on function crm_lead_to_client(uuid) to authenticated;

create or replace function crm_client_to_lead(p_client uuid, p_stage text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c crm_clients; v_lead uuid;
begin
  select * into c from crm_clients where id = p_client for update;
  if not found or not crm_is_member(c.org_id) then raise exception 'not allowed'; end if;
  if p_stage not in ('חדש','נוצר קשר','כשיר','פגישה נקבעה','הצעה נשלחה','לא עכשיו') then raise exception 'BAD_STAGE'; end if;
  v_lead := c.lead_id;
  if v_lead is null or not exists (select 1 from crm_leads where id = v_lead) then
    insert into crm_leads (org_id, name, biz, phone, email, industry, source, stage, client_id)
      values (c.org_id, coalesce(nullif(c.contact, ''), c.biz), c.biz, c.phone, c.email, c.industry, 'אחר', p_stage, c.id)
      returning id into v_lead;
    update crm_clients set lead_id = v_lead where id = c.id;
  else
    update crm_leads set stage = p_stage, archived_at = null, client_id = c.id where id = v_lead;
  end if;
  update crm_clients set archived_at = now() where id = c.id;
  insert into crm_activities (org_id, lead_id, client_id, type, text, by)
    values (c.org_id, v_lead, c.id, 'מערכת', 'הוחזר מלקוחות לרשימת הלידים, שלב: ' || p_stage, 'מערכת');
  return v_lead;
end $$;
revoke all on function crm_client_to_lead(uuid, text) from public, anon;
grant execute on function crm_client_to_lead(uuid, text) to authenticated;

-- leads already sitting in "לקוח" without a client card follow the new rule
do $$ declare r record; begin
  for r in select l.id, l.org_id from crm_leads l
           where l.stage = 'לקוח' and l.archived_at is null
             and (l.client_id is null or not exists (select 1 from crm_clients c where c.id = l.client_id)) loop
    declare l crm_leads; v uuid; begin
      select * into l from crm_leads where id = r.id;
      insert into crm_clients (org_id, lead_id, biz, contact, phone, email, industry)
        values (l.org_id, l.id, coalesce(nullif(l.biz, ''), l.name), l.name, l.phone, l.email, l.industry) returning id into v;
      update crm_leads set client_id = v where id = l.id;
      update crm_documents set client_id = v where lead_id = l.id and client_id is null;
      update crm_quotes set client_id = v where lead_id = l.id and client_id is null;
      insert into crm_activities (org_id, lead_id, client_id, type, text, by) values (l.org_id, l.id, v, 'מערכת', 'הליד הפך ללקוח', 'מערכת');
    end;
  end loop;
end $$;

-- churn date follows the status
create or replace function crm_client_left() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status in ('הסתיים','עזב') and (old.status is distinct from new.status) and new.left_at is null then
    new.left_at := current_date;
  elsif new.status not in ('הסתיים','עזב') then
    new.left_at := null;
  end if;
  return new;
end $$;
drop trigger if exists crm_client_left_trg on crm_clients;
create trigger crm_client_left_trg before update on crm_clients for each row execute function crm_client_left();
update crm_clients set left_at = coalesce(left_at, current_date) where status in ('הסתיים','עזב') and left_at is null;

-- ---------- 2. uploaded files ----------
insert into storage.buckets (id, name, public, file_size_limit)
  values ('crm-docs', 'crm-docs', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = 26214400;
alter table crm_documents add column if not exists size bigint;
alter table crm_documents add column if not exists mime text;

-- files live under <org_id>/..., readable and writable only by members of that business
create or replace function crm_doc_path_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare f text := (storage.foldername(p_name))[1];
begin
  if f is null or f !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return crm_is_member(f::uuid);
end $$;
revoke all on function crm_doc_path_ok(text) from public, anon;
grant execute on function crm_doc_path_ok(text) to authenticated;
drop policy if exists crm_docs_member_select on storage.objects;
drop policy if exists crm_docs_member_insert on storage.objects;
drop policy if exists crm_docs_member_delete on storage.objects;
create policy crm_docs_member_select on storage.objects for select to authenticated
  using (bucket_id = 'crm-docs' and crm_doc_path_ok(name));
create policy crm_docs_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-docs' and crm_doc_path_ok(name));
create policy crm_docs_member_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crm-docs' and crm_doc_path_ok(name));

-- ---------- 3. suppliers + products on clients ----------
create table if not exists crm_suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  name text not null,
  field text not null default '',
  phone text,
  email text,
  notes text not null default '',
  default_cost numeric not null default 0,
  default_billing text not null default 'חודשי' check (default_billing in ('חודשי','חד-פעמי')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists crm_suppliers_org_idx on crm_suppliers (org_id);
alter table crm_suppliers enable row level security;
drop policy if exists crm_suppliers_member on crm_suppliers;
create policy crm_suppliers_member on crm_suppliers for all to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id));

-- billing/price keep their meaning (the monthly charge generator reads them):
--   retainer -> billing 'חודשי', price = monthly price, setup_price = one-off sale price
--   one-off  -> billing 'חד-פעמי', price = one-off sale price
alter table crm_client_services add column if not exists description text not null default '';
alter table crm_client_services add column if not exists list_price numeric;
alter table crm_client_services add column if not exists setup_price numeric;
alter table crm_client_services add column if not exists supplier_id uuid references crm_suppliers(id) on delete set null;
alter table crm_client_services add column if not exists supplier_cost numeric;
alter table crm_client_services add column if not exists supplier_billing text check (supplier_billing in ('חודשי','חד-פעמי'));
alter table crm_client_services add column if not exists supplier_active boolean not null default true;
alter table crm_client_services add column if not exists supplier_stopped_at date;
alter table crm_client_services add column if not exists supplier_keep boolean not null default false; -- "להמשיך" on the stop alert
alter table crm_client_services add column if not exists created_at timestamptz not null default now();
create index if not exists crm_client_services_supplier_idx on crm_client_services (supplier_id);

alter table crm_settings add column if not exists products jsonb not null default
  '["קמפיין ממומן","ניהול סושיאל","יום צילום","חבילת 3 סרטונים","אוטומציות","פיתוח מערכת"]'::jsonb;

-- ---------- 4. manual expenses ----------
create table if not exists crm_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references crm_orgs(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  category text not null default 'כללי',
  billing text not null default 'חודשי' check (billing in ('חודשי','חד-פעמי')),
  start_date date not null default current_date,
  end_date date,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists crm_expenses_org_idx on crm_expenses (org_id);
alter table crm_expenses enable row level security;
drop policy if exists crm_expenses_member on crm_expenses;
create policy crm_expenses_member on crm_expenses for all to authenticated using (crm_is_member(org_id)) with check (crm_is_member(org_id));
