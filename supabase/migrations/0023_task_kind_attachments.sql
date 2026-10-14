-- 0023: a task has a kind (call, meeting, ...) and attachments (links, uploaded files, or existing documents
-- of its lead/client). Tasks created without a kind get one from their title.
alter table crm_tasks add column if not exists kind text;
alter table crm_tasks add column if not exists attachments jsonb not null default '[]'::jsonb; -- [{t:'link',name,url} | {t:'file',name,path} | {t:'doc',name,doc_id}]

create or replace function crm_task_kind_of(p_title text) returns text language sql immutable as $$
  select case
    when p_title ~ '(להתקשר|שיחה|לחזור ל|טלפון)' then 'שיחה'
    when p_title ~ '(פגישה|בריף|זום)' then 'פגישה'
    when p_title ~ 'וואטסאפ' then 'וואטסאפ'
    when p_title ~ '(מייל|אימייל)' then 'מייל'
    when p_title ~ 'הצעה|הצעת מחיר' then 'הצעת מחיר'
    when p_title ~ '(תשלום|גבייה|חשבונית|לגבות)' then 'גבייה'
    when p_title ~ '(קליטת|להקים|לבנות|להכין|לעצב|להעלות|אפיון)' then 'ביצוע עבודה'
    else 'אחר' end
$$;
create or replace function crm_task_kind() returns trigger language plpgsql as $$
begin
  if new.kind is null or new.kind = '' then new.kind := crm_task_kind_of(coalesce(new.title, '')); end if;
  return new;
end $$;
create or replace trigger crm_task_kind_trg before insert on crm_tasks for each row execute function crm_task_kind();
update crm_tasks set kind = crm_task_kind_of(coalesce(title, '')) where kind is null;
