-- 0022: monthly charges follow the retainer product's dates. A product counts from the 1st of the month
-- on or after its first-charge date, through its last-charge date (if set). A retainer amount set on the
-- client applies while at least one such product is running, or always when the client has no retainer products.
create or replace function public.crm_generate_monthly_payments()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int := 0; per text := to_char(current_date, 'YYYY-MM'); first date := date_trunc('month', current_date)::date;
begin
  for r in
    select c.org_id, c.id client_id, c.retainer_amount, c.retainer_from, s.vat,
      coalesce((select sum(sv.price) from crm_client_services sv
                where sv.client_id = c.id and sv.billing = 'חודשי' and sv.status = 'פעיל'
                  and sv.start_date <= first and (sv.end_date is null or sv.end_date >= first)), 0) total,
      exists (select 1 from crm_client_services sv where sv.client_id = c.id and sv.billing = 'חודשי') has_products,
      exists (select 1 from crm_client_services sv where sv.client_id = c.id and sv.billing = 'חודשי' and sv.status = 'פעיל'
                and sv.start_date <= first and (sv.end_date is null or sv.end_date >= first)) running
    from crm_clients c
    join crm_settings s on s.org_id = c.org_id
    where c.status in ('בקליטה','פעיל','בסיכון') and c.archived_at is null
  loop
    if r.retainer_amount is not null and r.retainer_amount > 0 then
      if (r.retainer_from is null or r.retainer_from <= first) and (r.running or not r.has_products) then
        insert into crm_payments (org_id, client_id, what, amount, due, period, kind)
          values (r.org_id, r.client_id, 'ריטיינר ' || to_char(first, 'MM/YYYY'), round(r.retainer_amount), first, per, 'retainer')
          on conflict do nothing;
        if found then n := n + 1; end if;
      end if;
    elsif r.total > 0 then
      insert into crm_payments (org_id, client_id, what, amount, due, period, kind)
        values (r.org_id, r.client_id, 'חיוב חודשי ' || to_char(first, 'MM/YYYY'), round(r.total * (1 + r.vat / 100)), first, per, 'retainer')
        on conflict do nothing;
      if found then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $function$;
