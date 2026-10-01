-- daily pulse: add the list of leads stuck in "חדש" (no contact, more than 3 days)
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
    'stuck_leads', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'phone', phone, 'source', source,
                                    'created', to_char(created_at at time zone 'Asia/Jerusalem', 'YYYY-MM-DD')) order by created_at), '[]')
                    from crm_leads where org_id = v_org and stage = 'חדש' and last_contact_at is null
                    and created_at < now() - interval '3 days' and archived_at is null),
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
