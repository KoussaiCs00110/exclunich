-- Personal starting balances for students who join during the semester.
begin;

alter table public.modules
 add column initial_justified_absences integer not null default 0 check(initial_justified_absences between 0 and 1000),
 add column initial_unjustified_absences integer not null default 0 check(initial_unjustified_absences between 0 and 1000);

-- Reuse the existing session authentication, ownership checks and student lock.
-- Both the module fields and its starting balance commit or roll back together.
-- Older clients can keep using absentia_api without resetting these balances.
create function public.exclunich_module_save(p_action text,p_body jsonb default '{}'::jsonb,p_credential text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb; item public.modules%rowtype; prior jsonb; updated jsonb; field text; amount numeric;
begin
 if p_action is distinct from 'module_save' then raise exception using errcode='22023',message='Unknown module operation.'; end if;
 result:=public.absentia_api('module_save',p_body,p_credential);
 select * into strict item from public.modules where id=(result->>'id')::uuid for update;
 foreach field in array array['initial_justified_absences','initial_unjustified_absences'] loop
  if p_body ? field then
   if jsonb_typeof(p_body->field) is distinct from 'number' then raise exception using errcode='22023',message='Earlier absences must be whole numbers between 0 and 1000.'; end if;
   amount:=(p_body->>field)::numeric;
   if amount<0 or amount>1000 or amount<>trunc(amount) then raise exception using errcode='22023',message='Earlier absences must be whole numbers between 0 and 1000.'; end if;
  end if;
 end loop;
 prior:=jsonb_build_object('initial_justified_absences',item.initial_justified_absences,'initial_unjustified_absences',item.initial_unjustified_absences);
 updated:=jsonb_build_object('initial_justified_absences',coalesce(p_body->'initial_justified_absences',prior->'initial_justified_absences'),'initial_unjustified_absences',coalesce(p_body->'initial_unjustified_absences',prior->'initial_unjustified_absences'));
 if prior is distinct from updated then
  update public.modules set initial_justified_absences=(updated->>'initial_justified_absences')::integer,initial_unjustified_absences=(updated->>'initial_unjustified_absences')::integer,updated_at=now() where id=item.id;
  insert into public.audit_logs(student_id,action,entity_type,entity_id,before_data,after_data) values(item.student_id,'starting_absences_updated','module',item.id,prior,updated);
 end if;
 return result;
end $$;
revoke all on function public.exclunich_module_save(text,jsonb,text) from public;

-- Match trusted server roles already allowed to call absentia_api, including
-- restricted custom runtime roles. Never grant browser roles access.
do $$
declare trusted record;
begin
 for trusted in
  select distinct r.rolname from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  join pg_roles r on r.oid=a.grantee
  where p.oid='public.absentia_api(text,jsonb,text)'::regprocedure
  and a.privilege_type='EXECUTE' and a.grantee<>p.proowner and r.rolname not in ('anon','authenticated')
 loop
  execute format('grant execute on function public.exclunich_module_save(text,jsonb,text) to %I',trusted.rolname);
 end loop;
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on function public.exclunich_module_save(text,jsonb,text) from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on function public.exclunich_module_save(text,jsonb,text) from authenticated; end if;
end $$;

notify pgrst,'reload schema';
commit;
