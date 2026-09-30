-- "by" is a keyword inside PL/pgSQL, so it has to be quoted
create or replace function crm_touch_last_contact() returns trigger
language plpgsql as $$
begin
  if new."by" <> 'אוטומציה' and new."by" <> 'מערכת' then
    if new.lead_id is not null then update crm_leads set last_contact_at = new.at where id = new.lead_id; end if;
    if new.client_id is not null then update crm_clients set last_contact_at = new.at where id = new.client_id; end if;
  end if;
  return new;
end $$;
