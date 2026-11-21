-- Exclunich: revocable schedule snapshots, with private per-student copies.
begin;

create table public.timetable_shares (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.students(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'), title text not null check(length(title) between 1 and 100),
 snapshot jsonb not null, created_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, check(expires_at>created_at and expires_at<=created_at+interval '30 days')
);
create index timetable_shares_owner on public.timetable_shares(owner_id,created_at desc);
create table public.timetable_share_imports (
 share_id uuid not null references public.timetable_shares(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade, imported_at timestamptz not null default now(),
 primary key(share_id,student_id)
);
create table public.timetable_imported_sessions (
 student_id uuid not null references public.students(id) on delete cascade, source_session_id uuid not null,
 session_id uuid not null, primary key(student_id,source_session_id),
 foreign key(student_id,session_id) references public.sessions(student_id,id) on delete cascade
);
do $$ declare t text; begin
 foreach t in array array['timetable_shares','timetable_share_imports','timetable_imported_sessions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public',t);
  if exists(select 1 from pg_roles where rolname='anon') then execute format('revoke all on table public.%I from anon',t); end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then execute format('revoke all on table public.%I from authenticated',t); end if;
 end loop;
end $$;

create function public.exclunich_sharing(p_action text,p_body jsonb default '{}'::jsonb,p_credential text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
 sid uuid; student_row public.students%rowtype; share public.timetable_shares%rowtype; payload jsonb; info jsonb;
 item jsonb; own_module public.modules%rowtype; new_id uuid; mapped_module uuid; mapped_session uuid;
 module_map jsonb:='{}'; session_map jsonb:='{}'; module_count integer:=0; session_count integer:=0; field text; ttl integer;
begin
 select student_id into sid from public.web_sessions where session_hash=p_credential and revoked_at is null and expires_at>now();
 if sid is null then raise exception using errcode='28000',message='Your session has expired. Please sign in again.'; end if;
 select * into student_row from public.students where id=sid for update;
 if not exists(select 1 from public.web_sessions where session_hash=p_credential and student_id=sid and revoked_at is null and expires_at>now()) then raise exception using errcode='28000',message='Your session has expired. Please sign in again.'; end if;
 if not student_row.registration_complete then raise exception using errcode='42501',message='Complete registration before sharing timetables.'; end if;
 if p_action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'created_at',created_at,'expires_at',expires_at,'revoked_at',revoked_at,'module_count',jsonb_array_length(snapshot->'modules'),'session_count',jsonb_array_length(snapshot->'sessions')) order by created_at desc) from public.timetable_shares where owner_id=sid),'[]'::jsonb);
 elsif p_action='revoke' then
  update public.timetable_shares set revoked_at=coalesce(revoked_at,now()) where id=(p_body->>'id')::uuid and owner_id=sid;
  if not found then raise exception using errcode='P0002',message='Timetable share not found.'; end if;
  return jsonb_build_object('ok',true);
 elsif p_action='create' then
  ttl:=coalesce((p_body->>'expires_days')::integer,7);
  if ttl not in (1,7,30) or length(btrim(p_body->>'title')) not between 1 and 100 then raise exception using errcode='22023',message='Choose a title and an expiry of 1, 7 or 30 days.'; end if;
  if (select count(*) from public.timetable_shares where owner_id=sid and revoked_at is null and expires_at>now())>=10 then raise exception using errcode='22023',message='Revoke an existing token before creating another. You can have 10 active timetable shares.'; end if;
  payload:=jsonb_build_object('version',1,'cohort',jsonb_build_object('group_name',student_row.group_name,'department',student_row.department,'academic_year',student_row.academic_year,'semester',student_row.semester),'timezone',student_row.timezone,
   'modules',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'code',m.code,'professor',m.professor,'color',m.color,'semester',m.semester)) from public.modules m where m.student_id=sid and m.archived_at is null and m.semester=student_row.semester),'[]'::jsonb),
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'module_id',s.module_id,'session_type',s.session_type,'weekday',s.weekday,'start_time',s.start_time,'end_time',s.end_time,'classroom',s.classroom,'professor',s.professor,'recurrence_start',s.recurrence_start,'recurrence_end',s.recurrence_end)) from public.sessions s join public.modules m on m.id=s.module_id where s.student_id=sid and m.archived_at is null and m.semester=student_row.semester),'[]'::jsonb),
   'occurrences',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'session_id',o.session_id,'module_id',o.module_id,'occurrence_date',o.occurrence_date,'starts_at',o.starts_at,'ends_at',o.ends_at,'classroom',o.classroom,'session_type',o.session_type,'cancelled',o.cancelled)) from public.scheduled_occurrences o join public.modules m on m.id=o.module_id where o.student_id=sid and m.archived_at is null and m.semester=student_row.semester),'[]'::jsonb));
  if jsonb_array_length(payload->'sessions')=0 then raise exception using errcode='22023',message='Add sessions in your current semester before sharing your timetable.'; end if;
  if jsonb_array_length(payload->'modules')>100 or jsonb_array_length(payload->'sessions')>300 or jsonb_array_length(payload->'occurrences')>5000 then raise exception using errcode='22023',message='This timetable is too large to share. Limit it to the current semester.'; end if;
  insert into public.timetable_shares(owner_id,token_hash,title,snapshot,expires_at) values(sid,p_body->>'token_hash',btrim(p_body->>'title'),payload,now()+make_interval(days=>ttl)) returning * into share;
 else
  select * into share from public.timetable_shares where token_hash=p_body->>'token_hash' and revoked_at is null and expires_at>now() for share;
  if not found then raise exception using errcode='22023',message='This timetable token is invalid, expired or revoked.'; end if;
  foreach field in array array['group_name','department','academic_year','semester'] loop
   if lower(regexp_replace(btrim(to_jsonb(student_row)->>field),'\s+',' ','g'))<>lower(regexp_replace(btrim(share.snapshot->'cohort'->>field),'\s+',' ','g')) then raise exception using errcode='22023',message='This timetable is for a different group, department, academic year or semester. Check your profile.'; end if;
  end loop;
 end if;
 info:=jsonb_build_object('id',share.id,'title',share.title,'created_at',share.created_at,'expires_at',share.expires_at,'revoked_at',share.revoked_at,'module_count',jsonb_array_length(share.snapshot->'modules'),'session_count',jsonb_array_length(share.snapshot->'sessions'));
 if p_action='create' then return info; end if;
 if p_action='preview' then return info||jsonb_build_object('snapshot',share.snapshot,'already_imported',exists(select 1 from public.timetable_share_imports where share_id=share.id and student_id=sid),'is_owner',share.owner_id=sid); end if;
 if p_action<>'import' then raise exception using errcode='22023',message='Unknown sharing operation.'; end if;
 if share.owner_id=sid then raise exception using errcode='22023',message='This timetable is already yours. Give this token to a classmate.'; end if;
 if exists(select 1 from public.timetable_share_imports where share_id=share.id and student_id=sid) then return jsonb_build_object('modules_added',0,'sessions_added',0,'already_imported',true); end if;
 if student_row.timezone<>share.snapshot->>'timezone' then raise exception using errcode='22023',message='Set your timezone to '||(share.snapshot->>'timezone')||' before importing this timetable.'; end if;
 for item in select value from jsonb_array_elements(share.snapshot->'modules') loop
  if exists(select 1 from jsonb_array_elements(share.snapshot->'sessions') s where s->>'module_id'=item->>'id') and not exists(select 1 from jsonb_array_elements(share.snapshot->'sessions') s where s->>'module_id'=item->>'id' and not exists(select 1 from public.timetable_imported_sessions i where i.student_id=sid and i.source_session_id=(s->>'id')::uuid)) then continue; end if;
  select * into own_module from public.modules where student_id=sid and code=item->>'code' and semester=student_row.semester;
  if found then
   if own_module.archived_at is not null or lower(btrim(own_module.name))<>lower(btrim(item->>'name')) then raise exception using errcode='22023',message='A module code is already used by another or archived module. Rename or restore it first.'; end if;
   new_id:=own_module.id;
  else
   insert into public.modules(student_id,name,code,professor,color,semester) values(sid,item->>'name',item->>'code',item->>'professor',item->>'color',student_row.semester) returning id into new_id;module_count:=module_count+1;
  end if;
  module_map:=module_map||jsonb_build_object(item->>'id',new_id);
 end loop;
 for item in select value from jsonb_array_elements(share.snapshot->'sessions') loop
  if exists(select 1 from public.timetable_imported_sessions where student_id=sid and source_session_id=(item->>'id')::uuid) then continue; end if;
  mapped_module:=(module_map->>(item->>'module_id'))::uuid;
  insert into public.sessions(student_id,module_id,session_type,weekday,start_time,end_time,classroom,professor,recurrence_start,recurrence_end) values(sid,mapped_module,item->>'session_type',(item->>'weekday')::integer,(item->>'start_time')::time,(item->>'end_time')::time,item->>'classroom',item->>'professor',(item->>'recurrence_start')::date,(item->>'recurrence_end')::date) returning id into new_id;
  insert into public.timetable_imported_sessions values(sid,(item->>'id')::uuid,new_id);
  session_map:=session_map||jsonb_build_object(item->>'id',new_id);session_count:=session_count+1;
 end loop;
 for item in select value from jsonb_array_elements(share.snapshot->'occurrences') loop
  mapped_session:=(session_map->>(item->>'session_id'))::uuid;if mapped_session is null then continue; end if;
  insert into public.scheduled_occurrences(student_id,session_id,module_id,occurrence_date,starts_at,ends_at,classroom,session_type,cancelled) values(sid,mapped_session,(module_map->>(item->>'module_id'))::uuid,(item->>'occurrence_date')::date,(item->>'starts_at')::timestamptz,(item->>'ends_at')::timestamptz,item->>'classroom',item->>'session_type',(item->>'cancelled')::boolean);
 end loop;
 insert into public.timetable_share_imports(share_id,student_id) values(share.id,sid);
 insert into public.audit_logs(student_id,action,entity_type,entity_id,after_data) values(sid,'imported','timetable',share.id,jsonb_build_object('title',share.title,'modules_added',module_count,'sessions_added',session_count));
 return jsonb_build_object('modules_added',module_count,'sessions_added',session_count,'already_imported',false);
end $$;
revoke all on function public.exclunich_sharing(text,jsonb,text) from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on function public.exclunich_sharing(text,jsonb,text) from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on function public.exclunich_sharing(text,jsonb,text) from authenticated; end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.exclunich_sharing(text,jsonb,text) to service_role; end if;
end $$;

commit;

