-- 0021: the client's account list holds the login itself (link, user name, password, readable in the CRM);
-- the encrypted vault box is gone from the client card. Passwords typed in an intake form are copied
-- here, readable, once the document belongs to a client.

alter table crm_client_access add column if not exists username text not null default '';
alter table crm_client_access add column if not exists password text not null default '';
alter table crm_intake_secrets add column if not exists access_id uuid;

create or replace function crm_intake_to_vault(p_secret uuid, p_client uuid) returns void
language plpgsql security definer set search_path = public, vault as $$
declare s crm_intake_secrets; v_id uuid; v_pw text;
begin
  select * into s from crm_intake_secrets where id = p_secret;
  if s.id is null then return; end if;
  select decrypted_secret into v_pw from vault.decrypted_secrets where id = s.secret_id;
  if s.access_id is not null and exists (select 1 from crm_client_access where id = s.access_id) then
    update crm_client_access set client_id = p_client, platform = s.label, asset = s.label, ref = s.url,
      username = s.username, password = coalesce(v_pw, password), updated_at = now() where id = s.access_id;
  else
    insert into crm_client_access (org_id, client_id, platform, asset, ref, username, password, status, notes, sort)
      values (s.org_id, p_client, s.label, s.label, s.url, s.username, coalesce(v_pw, ''), 'יש גישה', 'מהאפיון',
              coalesce((select max(sort) + 1 from crm_client_access where client_id = p_client), 1))
      returning id into v_id;
    update crm_intake_secrets set access_id = v_id where id = s.id;
  end if;
end $$;
