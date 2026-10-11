-- simple-CRM · 0016 · payments on the client card: first payment, monthly retainer, other
-- each payment: kind, how much was actually paid, and how it was paid
alter table crm_payments add column if not exists kind text not null default 'other' check (kind in ('first','retainer','other'));
alter table crm_payments add column if not exists paid_amount numeric;
alter table crm_payments add column if not exists method text check (method in ('אשראי','העברה','צ''ק','מזומן'));
alter table crm_clients add column if not exists retainer_amount numeric;   -- incl. VAT; overrides the sum of retainer products
alter table crm_clients add column if not exists retainer_from date;
alter table crm_clients add column if not exists pay_method text check (pay_method in ('אשראי','העברה','צ''ק','מזומן'));

-- monthly rows are 'retainer'; a client's first non-monthly payment is 'first'; method defaults to the client's
create or replace function crm_payment_kind() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.period is not null then
    new.kind := 'retainer';
  elsif coalesce(new.kind, 'other') = 'other' and new.client_id is not null
        and not exists (select 1 from crm_payments p where p.client_id = new.client_id and p.kind = 'first') then
    new.kind := 'first';
  end if;
  if new.method is null and new.client_id is not null then
    select pay_method into new.method from crm_clients where id = new.client_id;
  end if;
  return new;
end $$;
create or replace trigger crm_payment_kind_trg before insert on crm_payments for each row execute function crm_payment_kind();

update crm_payments set kind = 'retainer' where period is not null and kind = 'other';
update crm_payments p set kind = 'first' where p.id in (
  select distinct on (client_id) id from crm_payments where period is null and client_id is not null order by client_id, due, id)
  and not exists (select 1 from crm_payments q where q.client_id = p.client_id and q.kind = 'first');
update crm_payments set paid_amount = amount where paid_at is not null and paid_amount is null;

-- monthly charges: the client's own retainer amount (incl. VAT) wins over the sum of retainer products
create or replace function crm_generate_monthly_payments() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; per text := to_char(current_date, 'YYYY-MM'); first date := date_trunc('month', current_date)::date;
begin
  for r in
    select c.org_id, c.id client_id, c.retainer_amount, c.retainer_from, s.vat,
      coalesce((select sum(sv.price) from crm_client_services sv
                where sv.client_id = c.id and sv.billing = 'חודשי' and sv.status = 'פעיל' and sv.start_date < first), 0) total
    from crm_clients c
    join crm_settings s on s.org_id = c.org_id
    where c.status in ('בקליטה','פעיל','בסיכון') and c.archived_at is null
  loop
    if r.retainer_amount is not null and r.retainer_amount > 0 then
      if r.retainer_from is null or r.retainer_from <= first then
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
end $$;
revoke execute on function crm_generate_monthly_payments() from public, anon, authenticated;
