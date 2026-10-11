-- simple-CRM · where each lead is located (city, street address, region of Israel)
alter table crm_leads add column if not exists city text;
alter table crm_leads add column if not exists address text;
alter table crm_leads add column if not exists region text;
create index if not exists crm_leads_region_idx on crm_leads (org_id, region);
