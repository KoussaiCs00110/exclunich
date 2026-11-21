-- ABSENTIA: normalized storage, deny-by-default RLS, session-scoped transactional API.
-- Apply as the database owner. No browser is given table or function access.
begin;

create table public.students (
 id uuid primary key default gen_random_uuid(), full_name text not null check (length(full_name) between 2 and 100),
 student_identifier text, academic_year text not null, department text not null, group_name text not null,
 semester text not null, timezone text not null default 'Africa/Algiers', language text not null default 'en' check(language in ('en','fr')),
 theme text not null default 'dark' check(theme in ('dark','light','system')), total_threshold integer not null default 5 check(total_threshold between 1 and 50),
 unjustified_threshold integer not null default 3 check(unjustified_threshold between 1 and 50), show_sunday boolean not null default false,
 notifications_enabled boolean not null default true, registration_complete boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.access_tokens (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 token_hash text not null unique check(length(token_hash)=64), created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index access_tokens_one_active on public.access_tokens(student_id) where revoked_at is null;
create table public.recovery_codes (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 code_hash text not null unique check(length(code_hash)=64), used_at timestamptz, pending_recovery boolean not null default false, created_at timestamptz not null default now()
);
create unique index recovery_codes_one_active on public.recovery_codes(student_id) where used_at is null;
create table public.web_sessions (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 session_hash text not null unique check(length(session_hash)=64), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '14 days', revoked_at timestamptz
);
create index web_sessions_student on public.web_sessions(student_id);
create table public.modules (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 name text not null check(length(name) between 1 and 120), code text not null check(length(code) between 1 and 30), professor text not null default '',
 description text not null default '', color text not null default '#3b82f6' check(color ~ '^#[0-9a-fA-F]{6}$'), semester text not null,
 total_threshold integer check(total_threshold between 1 and 50), unjustified_threshold integer check(unjustified_threshold between 1 and 50),
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(student_id,id), unique(student_id,code,semester)
);
create index modules_student_semester on public.modules(student_id,semester);
create table public.sessions (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade, module_id uuid not null,
 session_type text not null check(session_type in ('Lecture','TD','TP')), weekday integer not null check(weekday between 1 and 7),
 start_time time not null, end_time time not null, classroom text not null default '', professor text not null default '',
 recurrence_start date not null, recurrence_end date not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_time > start_time), check(recurrence_end >= recurrence_start and recurrence_end <= recurrence_start + 366),
 foreign key(student_id,module_id) references public.modules(student_id,id) on delete cascade,
 unique(student_id,id), unique(student_id,id,module_id)
);
create index sessions_student on public.sessions(student_id,module_id);
create table public.scheduled_occurrences (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 session_id uuid not null, module_id uuid not null, occurrence_date date not null, starts_at timestamptz not null, ends_at timestamptz not null,
 classroom text not null default '', session_type text not null check(session_type in ('Lecture','TD','TP')), cancelled boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at),
 foreign key(student_id,session_id,module_id) references public.sessions(student_id,id,module_id) on delete cascade,
 unique(session_id,occurrence_date), unique(student_id,id,module_id)
);
create index occurrences_student_time on public.scheduled_occurrences(student_id,starts_at);
create table public.attendance_records (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 module_id uuid not null, occurrence_id uuid not null unique, attendance_status text not null check(attendance_status in ('present','justified','unjustified','cancelled')),
 note text not null default '' check(length(note)<=2000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(student_id,occurrence_id,module_id) references public.scheduled_occurrences(student_id,id,module_id) on delete cascade
);
create index attendance_student_module on public.attendance_records(student_id,module_id);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 title text not null, message text not null, type text not null, module_id uuid, occurrence_id uuid,
 dedup_key text not null, is_read boolean not null default false, deleted_at timestamptz, created_at timestamptz not null default now(),
 unique(student_id,dedup_key), foreign key(student_id,module_id) references public.modules(student_id,id) on delete cascade,
 check(occurrence_id is null or module_id is not null),
 foreign key(student_id,occurrence_id,module_id) references public.scheduled_occurrences(student_id,id,module_id) on delete cascade
);
create index notifications_student_unread on public.notifications(student_id,is_read,created_at desc);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students on delete cascade,
 action text not null, entity_type text not null, entity_id uuid, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index audit_logs_student_time on public.audit_logs(student_id,created_at desc);
create table public.rate_limits (
 bucket text primary key, attempts integer not null default 0, reset_at timestamptz not null
);

-- RLS deliberately has no browser policies: this application authenticates with opaque,
-- server-managed sessions, not browser Supabase JWTs. Only the scoped RPC is used.
do $$ declare t text; begin
 foreach t in array array['students','access_tokens','recovery_codes','web_sessions','modules','sessions','scheduled_occurrences','attendance_records','notifications','audit_logs','rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from public',t);
 if exists(select 1 from pg_roles where rolname='anon') then execute format('revoke all on table public.%I from anon',t); end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then execute format('revoke all on table public.%I from authenticated',t); end if;
 end loop;
end $$;

create or replace function public.absentia_api(p_action text,p_body jsonb default '{}'::jsonb,p_credential text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
 sid uuid; entity uuid; token_owner uuid; prior jsonb; result jsonb; rowdata jsonb; occ public.scheduled_occurrences%rowtype;
 sess public.sessions%rowtype; student_row public.students%rowtype; lim public.rate_limits%rowtype; changed integer; notification_data jsonb;
 start_day date; stop_day date; target_weekday integer; stamp timestamptz; endstamp timestamptz;
begin
 if p_action='rate_limit' then
  -- Atomic fixed-window counter. Server sends an HMAC of the trusted proxy/IP bucket.
  insert into public.rate_limits(bucket,attempts,reset_at) values(p_body->>'bucket',1,now()+interval '15 minutes')
  on conflict(bucket) do update set attempts=case when rate_limits.reset_at<now() then 1 else rate_limits.attempts+1 end,
   reset_at=case when rate_limits.reset_at<now() then now()+interval '15 minutes' else rate_limits.reset_at end returning * into lim;
  delete from public.rate_limits where reset_at<now()-interval '1 day';
  return jsonb_build_object('allowed',lim.attempts <= coalesce((p_body->>'limit')::integer,10));
 end if;
 if p_action='register' then
  insert into public.students(full_name,student_identifier,academic_year,department,group_name,semester,language)
  values(p_body->>'full_name',nullif(p_body->>'student_identifier',''),p_body->>'academic_year',p_body->>'department',p_body->>'group_name',p_body->>'semester',coalesce(p_body->>'language','en')) returning id into sid;
  insert into public.access_tokens(student_id,token_hash) values(sid,p_body->>'token_hash');
  insert into public.recovery_codes(student_id,code_hash) values(sid,p_body->>'recovery_hash');
  insert into public.web_sessions(student_id,session_hash) values(sid,p_body->>'session_hash');
  return jsonb_build_object('student_id',sid,'registration_complete',false);
 elsif p_action='login' then
  select student_id into sid from public.access_tokens where token_hash=p_body->>'token_hash' and revoked_at is null;
  if sid is null then raise exception using errcode='28000',message='Invalid access token.'; end if;
  perform 1 from public.students where id=sid for update;
  if not exists(select 1 from public.access_tokens where student_id=sid and token_hash=p_body->>'token_hash' and revoked_at is null) then raise exception using errcode='28000',message='Invalid access token.'; end if;
  insert into public.web_sessions(student_id,session_hash) values(sid,p_body->>'session_hash');
  return (select jsonb_build_object('registration_complete',registration_complete) from public.students where id=sid);
 elsif p_action='recover' then
  select student_id into sid from public.recovery_codes where code_hash=p_body->>'recovery_hash' and (used_at is null or pending_recovery);
  if sid is null then raise exception using errcode='28000',message='Invalid or already used recovery code.'; end if;
  perform 1 from public.students where id=sid for update;
  if not exists(select 1 from public.recovery_codes where student_id=sid and code_hash=p_body->>'recovery_hash' and used_at is null) then
   -- Re-deliver only the exact pending replacement after a dropped HTTP response.
   -- Confirmation disables retries; a new recovery or rotation cannot be resurrected.
   if exists(select 1 from public.recovery_codes r join public.students s on s.id=r.student_id where r.student_id=sid and r.code_hash=p_body->>'recovery_hash' and r.pending_recovery and not s.registration_complete)
    and exists(select 1 from public.access_tokens where student_id=sid and token_hash=p_body->>'token_hash' and revoked_at is null)
    and exists(select 1 from public.recovery_codes where student_id=sid and code_hash=p_body->>'new_recovery_hash' and used_at is null) then
    update public.web_sessions set revoked_at=now() where student_id=sid and revoked_at is null;
    insert into public.web_sessions(student_id,session_hash) values(sid,p_body->>'session_hash');
    return jsonb_build_object('registration_complete',false);
   end if;
   raise exception using errcode='28000',message='Invalid or already used recovery code.';
  end if;
  update public.recovery_codes set pending_recovery=false where student_id=sid;
  update public.recovery_codes set used_at=now(),pending_recovery=true where student_id=sid and used_at is null;
  update public.access_tokens set revoked_at=now() where student_id=sid and revoked_at is null;
  update public.web_sessions set revoked_at=now() where student_id=sid and revoked_at is null;
  insert into public.access_tokens(student_id,token_hash) values(sid,p_body->>'token_hash');
  insert into public.recovery_codes(student_id,code_hash) values(sid,p_body->>'new_recovery_hash');
  insert into public.web_sessions(student_id,session_hash) values(sid,p_body->>'session_hash');
  update public.students set registration_complete=false where id=sid;
  return jsonb_build_object('registration_complete',false);
 end if;
 select student_id into sid from public.web_sessions where session_hash=p_credential and revoked_at is null and expires_at>now();
 if sid is null then raise exception using errcode='28000',message='Your session has expired. Please sign in again.'; end if;
 select * into student_row from public.students where id=sid for update;
 -- Serialize account operations with revocation, then recheck a session that may have waited.
 if not exists(select 1 from public.web_sessions where student_id=sid and session_hash=p_credential and revoked_at is null and expires_at>now()) then raise exception using errcode='28000',message='Your session has expired. Please sign in again.'; end if;
 if p_action='confirm' then
  update public.students set registration_complete=true,updated_at=now() where id=sid;
  update public.recovery_codes set pending_recovery=false where student_id=sid;
  return jsonb_build_object('registration_complete',true);
 elsif p_action='logout' then
  update public.web_sessions set revoked_at=now() where session_hash=p_credential;
  return jsonb_build_object('ok',true);
 elsif p_action='status' then
  return jsonb_build_object('registration_complete',student_row.registration_complete);
 end if;
 if not student_row.registration_complete then raise exception using errcode='42501',message='Save your access token and recovery code before continuing.'; end if;
 if p_action='snapshot' then
  return jsonb_build_object(
   'student',to_jsonb(student_row),
   'modules',coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from public.modules m where student_id=sid),'[]'::jsonb),
   'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by s.weekday,s.start_time) from public.sessions s where student_id=sid),'[]'::jsonb),
   'occurrences',coalesce((select jsonb_agg(to_jsonb(o) order by o.starts_at) from public.scheduled_occurrences o where student_id=sid),'[]'::jsonb),
   'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.attendance_records a where student_id=sid),'[]'::jsonb),
   'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from public.notifications n where student_id=sid and deleted_at is null),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.audit_logs a where student_id=sid),'[]'::jsonb));
 elsif p_action='rotate_token' then
  -- Require the current secret even with an authenticated session to reduce session theft impact.
  if not exists(select 1 from public.access_tokens where student_id=sid and token_hash=p_body->>'current_token_hash' and revoked_at is null) then raise exception using errcode='28000',message='Current access token is incorrect.'; end if;
  perform 1 from public.students where id=sid for update;
  update public.access_tokens set revoked_at=now() where student_id=sid and revoked_at is null;
  update public.web_sessions set revoked_at=now() where student_id=sid and revoked_at is null;
  insert into public.access_tokens(student_id,token_hash) values(sid,p_body->>'token_hash');
  insert into public.web_sessions(student_id,session_hash) values(sid,p_body->>'session_hash');
  return jsonb_build_object('ok',true);
 elsif p_action='rotate_recovery' then
  if not exists(select 1 from public.access_tokens where student_id=sid and token_hash=p_body->>'current_token_hash' and revoked_at is null) then raise exception using errcode='28000',message='Current access token is incorrect.'; end if;
  perform 1 from public.students where id=sid for update;
  update public.recovery_codes set used_at=now() where student_id=sid and used_at is null;
  insert into public.recovery_codes(student_id,code_hash) values(sid,p_body->>'recovery_hash');
  return jsonb_build_object('ok',true);
 elsif p_action='module_save' then
  if nullif(p_body->>'id','') is null then
   insert into public.modules(student_id,name,code,professor,description,color,semester,total_threshold,unjustified_threshold)
   values(sid,p_body->>'name',p_body->>'code',coalesce(p_body->>'professor',''),coalesce(p_body->>'description',''),p_body->>'color',p_body->>'semester',(p_body->>'total_threshold')::integer,(p_body->>'unjustified_threshold')::integer) returning id into entity;
  else
   entity=(p_body->>'id')::uuid;
   update public.modules set name=p_body->>'name',code=p_body->>'code',professor=coalesce(p_body->>'professor',''),description=coalesce(p_body->>'description',''),color=p_body->>'color',semester=p_body->>'semester',total_threshold=(p_body->>'total_threshold')::integer,unjustified_threshold=(p_body->>'unjustified_threshold')::integer,updated_at=now() where id=entity and student_id=sid;
   if not found then raise exception using errcode='P0002',message='Module not found.'; end if;
  end if;
  return jsonb_build_object('id',entity);
 elsif p_action='module_archive' then
  update public.modules set archived_at=case when coalesce((p_body->>'archived')::boolean,true) then now() else null end,updated_at=now() where id=(p_body->>'id')::uuid and student_id=sid;
  if not found then raise exception using errcode='P0002',message='Module not found.'; end if;
 elsif p_action='module_delete' then
  delete from public.modules where id=(p_body->>'id')::uuid and student_id=sid;
  if not found then raise exception using errcode='P0002',message='Module not found.'; end if;
 elsif p_action='session_save' then
  if not exists(select 1 from public.modules where id=(p_body->>'module_id')::uuid and student_id=sid and archived_at is null) then raise exception using errcode='P0002',message='Active module not found.'; end if;
  if nullif(p_body->>'id','') is null then
   insert into public.sessions(student_id,module_id,session_type,weekday,start_time,end_time,classroom,professor,recurrence_start,recurrence_end)
   values(sid,(p_body->>'module_id')::uuid,p_body->>'session_type',(p_body->>'weekday')::integer,(p_body->>'start_time')::time,(p_body->>'end_time')::time,coalesce(p_body->>'classroom',''),coalesce(p_body->>'professor',''),(p_body->>'recurrence_start')::date,(p_body->>'recurrence_end')::date) returning * into sess;
  else
   select * into sess from public.sessions where id=(p_body->>'id')::uuid and student_id=sid for update;
   if not found then raise exception using errcode='P0002',message='Session not found.'; end if;
   if sess.module_id<>(p_body->>'module_id')::uuid and exists(select 1 from public.attendance_records a join public.scheduled_occurrences o on o.id=a.occurrence_id where o.session_id=sess.id) then raise exception using errcode='22023',message='A session with attendance cannot be moved to another module.'; end if;
   -- Recorded occurrences are immutable historical schedule entries; unrecorded occurrences can be rebuilt.
   delete from public.scheduled_occurrences o where o.session_id=sess.id and not exists(select 1 from public.attendance_records a where a.occurrence_id=o.id);
   update public.sessions set module_id=(p_body->>'module_id')::uuid,session_type=p_body->>'session_type',weekday=(p_body->>'weekday')::integer,start_time=(p_body->>'start_time')::time,end_time=(p_body->>'end_time')::time,classroom=coalesce(p_body->>'classroom',''),professor=coalesce(p_body->>'professor',''),recurrence_start=(p_body->>'recurrence_start')::date,recurrence_end=(p_body->>'recurrence_end')::date,updated_at=now() where id=sess.id returning * into sess;
  end if;
  insert into public.scheduled_occurrences(student_id,session_id,module_id,occurrence_date,starts_at,ends_at,classroom,session_type)
  select sid,sess.id,sess.module_id,d::date,(d::date+sess.start_time) at time zone student_row.timezone,(d::date+sess.end_time) at time zone student_row.timezone,sess.classroom,sess.session_type
  from generate_series(sess.recurrence_start::timestamp,sess.recurrence_end::timestamp,interval '1 day') d where extract(isodow from d)=sess.weekday
  on conflict(session_id,occurrence_date) do nothing;
  return jsonb_build_object('id',sess.id);
 elsif p_action='session_delete' then
  delete from public.sessions where id=(p_body->>'id')::uuid and student_id=sid;
  if not found then raise exception using errcode='P0002',message='Session not found.'; end if;
 elsif p_action='occurrence_save' then
  select * into occ from public.scheduled_occurrences where id=(p_body->>'id')::uuid and student_id=sid for update;
  if not found then raise exception using errcode='P0002',message='Scheduled occurrence not found.'; end if;
  if exists(select 1 from public.attendance_records where occurrence_id=occ.id) and (p_body ? 'starts_at' or p_body ? 'ends_at') then raise exception using errcode='22023',message='Remove the attendance record before rescheduling this occurrence.'; end if;
  update public.scheduled_occurrences set starts_at=coalesce((p_body->>'starts_at')::timestamptz,starts_at),ends_at=coalesce((p_body->>'ends_at')::timestamptz,ends_at),classroom=coalesce(p_body->>'classroom',classroom),cancelled=coalesce((p_body->>'cancelled')::boolean,cancelled),updated_at=now() where id=occ.id;
  -- Cancelling an occurrence cancels its record, retaining a correction audit.
  if coalesce((p_body->>'cancelled')::boolean,false) then
   select to_jsonb(a) into prior from public.attendance_records a where occurrence_id=occ.id;
   if prior is not null then
    update public.attendance_records set attendance_status='cancelled',updated_at=now() where occurrence_id=occ.id returning to_jsonb(attendance_records.*) into rowdata;
    insert into public.audit_logs(student_id,action,entity_type,entity_id,before_data,after_data) values(sid,'corrected','attendance',occ.id,prior,rowdata);
   end if;
  end if;
 elsif p_action='attendance_save' then
  select * into occ from public.scheduled_occurrences where id=(p_body->>'occurrence_id')::uuid and student_id=sid for update;
  if not found then raise exception using errcode='P0002',message='Scheduled occurrence not found.'; end if;
  if occ.ends_at>now() then raise exception using errcode='22023',message='Attendance can only be recorded after the session has ended.'; end if;
  if occ.cancelled and p_body->>'attendance_status'<>'cancelled' then raise exception using errcode='22023',message='Restore the cancelled session before recording attendance.'; end if;
  select to_jsonb(a) into prior from public.attendance_records a where occurrence_id=occ.id;
  insert into public.attendance_records(student_id,module_id,occurrence_id,attendance_status,note) values(sid,occ.module_id,occ.id,p_body->>'attendance_status',coalesce(p_body->>'note',''))
  on conflict(occurrence_id) do update set attendance_status=excluded.attendance_status,note=excluded.note,updated_at=now()
  where attendance_records.attendance_status is distinct from excluded.attendance_status or attendance_records.note is distinct from excluded.note
  returning to_jsonb(attendance_records.*) into rowdata;
  if rowdata is null then rowdata:=prior; end if;
  if prior is distinct from rowdata then
   insert into public.audit_logs(student_id,action,entity_type,entity_id,before_data,after_data) values(sid,case when prior is null then 'created' else 'corrected' end,'attendance',occ.id,prior,rowdata);
  end if;
  return rowdata;
 elsif p_action='attendance_delete' then
  delete from public.attendance_records where id=(p_body->>'id')::uuid and student_id=sid returning to_jsonb(attendance_records.*) into prior;
  if prior is null then raise exception using errcode='P0002',message='Attendance record not found.'; end if;
  insert into public.audit_logs(student_id,action,entity_type,entity_id,before_data) values(sid,'deleted','attendance',(prior->>'occurrence_id')::uuid,prior);
 elsif p_action='profile_save' then
  if not exists(select 1 from pg_timezone_names where name=p_body->>'timezone') then raise exception using errcode='22023',message='Unknown timezone.'; end if;
  update public.students set full_name=p_body->>'full_name',student_identifier=nullif(p_body->>'student_identifier',''),academic_year=p_body->>'academic_year',department=p_body->>'department',group_name=p_body->>'group_name',semester=p_body->>'semester',timezone=p_body->>'timezone',language=p_body->>'language',theme=p_body->>'theme',total_threshold=(p_body->>'total_threshold')::integer,unjustified_threshold=(p_body->>'unjustified_threshold')::integer,show_sunday=(p_body->>'show_sunday')::boolean,notifications_enabled=(p_body->>'notifications_enabled')::boolean,updated_at=now() where id=sid;
 elsif p_action='notifications_read' then
  update public.notifications set is_read=true where student_id=sid and (not(p_body ? 'id') or id=(p_body->>'id')::uuid);
 elsif p_action='notification_delete' then
  update public.notifications set deleted_at=now() where id=(p_body->>'id')::uuid and student_id=sid;
 elsif p_action='notifications_emit' then
  if student_row.notifications_enabled then
   for notification_data in select value from jsonb_array_elements(p_body->'notifications') loop
    insert into public.notifications(student_id,title,message,type,module_id,occurrence_id,dedup_key)
    values(sid,notification_data->>'title',notification_data->>'message',notification_data->>'type',(notification_data->>'module_id')::uuid,(notification_data->>'occurrence_id')::uuid,notification_data->>'dedup_key') on conflict(student_id,dedup_key) do nothing;
   end loop;
  end if;
 elsif p_action='account_delete' then
  if not exists(select 1 from public.access_tokens where student_id=sid and token_hash=p_body->>'current_token_hash' and revoked_at is null) then raise exception using errcode='28000',message='Current access token is incorrect.'; end if;
  delete from public.students where id=sid;
 else raise exception using errcode='22023',message='Unknown operation.';
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.absentia_api(text,jsonb,text) from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on function public.absentia_api(text,jsonb,text) from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on function public.absentia_api(text,jsonb,text) from authenticated; end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.absentia_api(text,jsonb,text) to service_role; end if;
end $$;
commit;
