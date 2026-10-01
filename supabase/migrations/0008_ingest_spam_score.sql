-- keep the site spam score on the lead
create or replace function crm_ingest_lead(p_key text, p_lead jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_phone text; v_id uuid; existing crm_leads;
begin
  v_org := crm_key_org(p_key);
  if v_org is null then raise exception 'invalid api key'; end if;
  if coalesce(trim(p_lead->>'name'), '') = '' and coalesce(trim(p_lead->>'phone'), '') = '' then
    raise exception 'name or phone required';
  end if;
  v_phone := nullif(regexp_replace(coalesce(p_lead->>'phone', ''), '[^0-9+]', '', 'g'), '');
  if v_phone like '+972%' then v_phone := '0' || substr(v_phone, 5); end if;
  if v_phone like '972%' then v_phone := '0' || substr(v_phone, 4); end if;

  if v_phone is not null then
    select * into existing from crm_leads where org_id = v_org and phone = v_phone and archived_at is null limit 1;
    if found then
      insert into crm_activities (org_id, lead_id, type, text, by)
        values (v_org, existing.id, 'פנייה חוזרת',
                'פנייה נוספת מ-' || coalesce(nullif(p_lead->>'source', ''), 'אתר') ||
                coalesce(': ' || nullif(p_lead->>'message', ''), ''), 'אוטומציה');
      perform crm_emit(v_org, 'lead_returned', jsonb_build_object('id', existing.id, 'name', existing.name, 'phone', existing.phone));
      return jsonb_build_object('ok', true, 'id', existing.id, 'duplicate', true);
    end if;
  end if;

  insert into crm_leads (org_id, name, biz, phone, email, industry, source, campaign, landing_page, pain,
                         marketing_consent, consent_at, consent_text, spam_score)
  values (v_org, coalesce(nullif(trim(p_lead->>'name'), ''), v_phone), coalesce(p_lead->>'biz', ''), v_phone,
          nullif(p_lead->>'email', ''), coalesce(p_lead->>'industry', ''), coalesce(nullif(p_lead->>'source', ''), 'אתר ישיר'),
          coalesce(p_lead->>'campaign', ''), coalesce(p_lead->>'landing_page', ''), coalesce(p_lead->>'message', ''),
          coalesce((p_lead->>'consent')::boolean, false),
          case when coalesce((p_lead->>'consent')::boolean, false) then now() end, p_lead->>'consent_text',
          case when coalesce(p_lead->>'spam_score', '') ~ '^[0-9]+(\.[0-9]+)?$' then (p_lead->>'spam_score')::numeric end)
  returning id into v_id;
  insert into crm_activities (org_id, lead_id, type, text, by)
    values (v_org, v_id, 'מערכת', 'ליד חדש מ-' || coalesce(nullif(p_lead->>'source', ''), 'אתר ישיר'), 'אוטומציה');
  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end $$;
