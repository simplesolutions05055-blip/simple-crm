-- 0012: documents belong to a lead or a client, and follow the lead when it becomes a client.
-- Used for intake forms (אפיונים) and for the signed copy of a quote.

alter table crm_documents
  add column if not exists lead_id uuid references crm_leads(id) on delete set null,
  add column if not exists kind text not null default 'file',
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists crm_documents_lead_idx on crm_documents(lead_id);
create index if not exists crm_documents_client_idx on crm_documents(client_id);

-- when a quote is signed: keep a document of it, and move the lead's documents to the new client
create or replace function crm_quote_signed_doc() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'נחתמה' and old.status is distinct from 'נחתמה' then
    insert into crm_documents (org_id, lead_id, client_id, quote_id, kind, title)
      values (new.org_id, new.lead_id, new.client_id, new.id, 'quote_signed', 'הצעת מחיר ' || new.no || ' · חתומה');
    if new.lead_id is not null and new.client_id is not null then
      update crm_documents set client_id = new.client_id
        where lead_id = new.lead_id and client_id is null;
    end if;
  end if;
  return new;
end $$;

revoke all on function crm_quote_signed_doc() from public, anon, authenticated;

drop trigger if exists crm_quote_signed_doc_trg on crm_quotes;
create trigger crm_quote_signed_doc_trg after update on crm_quotes
  for each row execute function crm_quote_signed_doc();
