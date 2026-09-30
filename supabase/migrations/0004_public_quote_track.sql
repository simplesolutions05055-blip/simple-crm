-- the owner's own preview of a quote must not count as a client view
drop function if exists crm_public_quote(text);
create or replace function crm_public_quote(p_token text, p_track boolean default true) returns jsonb
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
  elsif p_track and q.status in ('נשלחה','נצפתה') then
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
grant execute on function crm_public_quote(text, boolean) to anon, authenticated;
