-- Absence limits are evaluated independently for Lecture, TD and TP.
-- Keep old untyped balances intact; only the student can assign their types.
begin;

create function public.exclunich_valid_initial_absences_by_type(balances jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare entry record; kind text; amount numeric;
begin
 if balances is null or jsonb_typeof(balances) is distinct from 'object' then return false; end if;
 for entry in select * from jsonb_each(balances) loop
  if entry.key not in ('Lecture','TD','TP') or jsonb_typeof(entry.value) is distinct from 'object' then return false; end if;
  if not (entry.value ?& array['justified','unjustified']) or entry.value - array['justified','unjustified'] <> '{}'::jsonb then return false; end if;
  foreach kind in array array['justified','unjustified'] loop
   if jsonb_typeof(entry.value->kind) is distinct from 'number' then return false; end if;
   amount:=(entry.value->>kind)::numeric;
   if amount<0 or amount>1000 or amount<>trunc(amount) then return false; end if;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function public.exclunich_valid_initial_absences_by_type(jsonb) from public;

alter table public.modules add column initial_absences_by_type jsonb not null default '{}'::jsonb
 check(public.exclunich_valid_initial_absences_by_type(initial_absences_by_type));

-- A distinct endpoint makes a missing migration fail before any partial save.
create function public.exclunich_module_save_by_type(p_action text,p_body jsonb default '{}'::jsonb,p_credential text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb; item public.modules%rowtype; balances jsonb;
begin
 result:=public.exclunich_module_save(p_action,p_body,p_credential);
 select * into strict item from public.modules where id=(result->>'id')::uuid for update;
 if p_body ? 'initial_absences_by_type' then
  balances:=p_body->'initial_absences_by_type';
  if not public.exclunich_valid_initial_absences_by_type(balances) then
   raise exception using errcode='22023',message='Earlier absences must be whole numbers between 0 and 1000, separately for Lecture, TD and TP.';
  end if;
  if item.initial_absences_by_type is distinct from balances then
   update public.modules set initial_absences_by_type=balances,updated_at=now() where id=item.id;
   insert into public.audit_logs(student_id,action,entity_type,entity_id,before_data,after_data)
    values(item.student_id,'starting_absences_updated','module',item.id,
     jsonb_build_object('initial_absences_by_type',item.initial_absences_by_type),jsonb_build_object('initial_absences_by_type',balances));
  end if;
 end if;
 return result;
end $$;
revoke all on function public.exclunich_module_save_by_type(text,jsonb,text) from public;

do $$
declare trusted record;
begin
 for trusted in
  select distinct r.rolname from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  join pg_roles r on r.oid=a.grantee
  where p.oid='public.exclunich_module_save(text,jsonb,text)'::regprocedure
  and a.privilege_type='EXECUTE' and a.grantee<>p.proowner and r.rolname not in ('anon','authenticated')
 loop
  execute format('grant execute on function public.exclunich_module_save_by_type(text,jsonb,text) to %I',trusted.rolname);
 end loop;
 if exists(select 1 from pg_roles where rolname='anon') then
  revoke all on function public.exclunich_module_save_by_type(text,jsonb,text) from anon;
  revoke all on function public.exclunich_valid_initial_absences_by_type(jsonb) from anon;
 end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then
  revoke all on function public.exclunich_module_save_by_type(text,jsonb,text) from authenticated;
  revoke all on function public.exclunich_valid_initial_absences_by_type(jsonb) from authenticated;
 end if;
end $$;

notify pgrst,'reload schema';
commit;
