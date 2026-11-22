-- Run only against an isolated test database after the migration. All fixture writes roll back.
begin;

do $$
declare
 student_a uuid; student_b uuid; module_a uuid; module_b uuid; session_a uuid; session_b uuid;
 occurrence_a uuid; occurrence_b uuid; record_a uuid; snap jsonb; reply jsonb; denied boolean; count_rows integer; old_time timestamptz;
 token_a text := repeat('a',64); recovery_a text := repeat('b',64); credential_a text := repeat('c',64);
 token_b text := repeat('d',64); recovery_b text := repeat('e',64); credential_b text := repeat('f',64);
begin
 reply:=public.absentia_api('register',jsonb_build_object('full_name','A Test Student','academic_year','2026/2027','department','Computer Science','group_name','G1','semester','S3','token_hash',token_a,'recovery_hash',recovery_a,'session_hash',credential_a));
 student_a:=(reply->>'student_id')::uuid;
 if (select expires_at - created_at from public.web_sessions where session_hash=credential_a) is distinct from interval '4320 hours' then
  raise exception 'FAIL: registration session does not last 180 days';
 end if;
 denied:=false;
 begin perform public.absentia_api('snapshot','{}',credential_a); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: incomplete registration accessed dashboard'; end if;
 perform public.absentia_api('confirm','{}',credential_a);
 reply:=public.absentia_api('login',jsonb_build_object('token_hash',token_a,'session_hash',repeat('a1',32)));
 if not (reply->>'registration_complete')::boolean or
    (select expires_at - created_at from public.web_sessions where session_hash=repeat('a1',32)) is distinct from interval '4320 hours' then
  raise exception 'FAIL: login session does not last 180 days';
 end if;
 update public.web_sessions set expires_at=now() where session_hash=repeat('a1',32);
 denied:=false;
 begin perform public.absentia_api('status','{}',repeat('a1',32)); exception when invalid_authorization_specification then denied:=true; end;
 if not denied then raise exception 'FAIL: expired browser session accepted'; end if;
 reply:=public.absentia_api('register',jsonb_build_object('full_name','B Test Student','language','fr','academic_year','2026/2027','department','Computer Science','group_name','G2','semester','S3','token_hash',token_b,'recovery_hash',recovery_b,'session_hash',credential_b));
 student_b:=(reply->>'student_id')::uuid;
 if (select language from public.students where id=student_b)<>'fr' then raise exception 'FAIL: registration language not persisted'; end if;
 perform public.absentia_api('confirm','{}',credential_b);
 reply:=public.absentia_api('module_save','{"name":"Networks","code":"NET","color":"#3b82f6","semester":"S3"}',credential_a);
 module_a:=(reply->>'id')::uuid;
 reply:=public.absentia_api('module_save','{"name":"Networks B","code":"NET","color":"#3b82f6","semester":"S3"}',credential_b);
 module_b:=(reply->>'id')::uuid;
 snap:=public.absentia_api('snapshot','{}',credential_a);
 if jsonb_array_length(snap->'modules')<>1 or snap#>>'{modules,0,id}'<>module_a::text then raise exception 'FAIL: snapshot tenant isolation'; end if;
 if snap::text like '%token_hash%' or snap::text like '%session_hash%' or snap::text like '%code_hash%' then raise exception 'FAIL: snapshot leaked secrets'; end if;
 perform public.absentia_api('notifications_emit',jsonb_build_object('notifications',jsonb_build_array(jsonb_build_object('title','Test warning','message','Test event','type','first_absence','module_id',module_a,'dedup_key','test-unique-event'))),credential_a);
 perform public.absentia_api('notifications_emit',jsonb_build_object('notifications',jsonb_build_array(jsonb_build_object('title','Test warning','message','Test event','type','first_absence','module_id',module_a,'dedup_key','test-unique-event'))),credential_a);
 if (select count(*) from public.notifications where student_id=student_a and dedup_key='test-unique-event')<>1 then raise exception 'FAIL: duplicate notification'; end if;
 select id into occurrence_b from public.notifications where student_id=student_a and dedup_key='test-unique-event';
 perform public.absentia_api('notification_delete',jsonb_build_object('id',occurrence_b),credential_a);
 perform public.absentia_api('notifications_emit',jsonb_build_object('notifications',jsonb_build_array(jsonb_build_object('title','Test warning','message','Test event','type','first_absence','module_id',module_a,'dedup_key','test-unique-event'))),credential_a);
 snap:=public.absentia_api('snapshot','{}',credential_a);
 if jsonb_array_length(snap->'notifications')<>0 then raise exception 'FAIL: deleted notification reappeared'; end if;
 denied:=false;
 begin perform public.absentia_api('module_delete',jsonb_build_object('id',module_b),credential_a); exception when no_data_found then denied:=true; end;
 if not denied then raise exception 'FAIL: another student module can be deleted'; end if;
 denied:=false;
 begin perform public.absentia_api('session_save',jsonb_build_object('module_id',module_b,'session_type','TD','weekday',1,'start_time','08:00','end_time','09:00','recurrence_start','2024-01-01','recurrence_end','2024-01-01'),credential_a); exception when no_data_found then denied:=true; end;
 if not denied then raise exception 'FAIL: cross-tenant session creation'; end if;
 reply:=public.absentia_api('session_save',jsonb_build_object('module_id',module_a,'session_type','TD','weekday',1,'start_time','08:00','end_time','09:00','classroom','B12','recurrence_start','2024-01-01','recurrence_end','2024-01-01'),credential_a);
 session_a:=(reply->>'id')::uuid;
 select id,starts_at into occurrence_a,old_time from public.scheduled_occurrences where session_id=session_a;
 if old_time<>'2024-01-01T07:00:00Z'::timestamptz then raise exception 'FAIL: Africa/Algiers timezone conversion'; end if;
 reply:=public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',occurrence_a,'attendance_status','unjustified','note','Original entry'),credential_a);
 record_a:=(reply->>'id')::uuid;
 perform public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',occurrence_a,'attendance_status','justified','note','Corrected with evidence'),credential_a);
 select count(*) into count_rows from public.attendance_records where occurrence_id=occurrence_a;
 if count_rows<>1 then raise exception 'FAIL: duplicate attendance prevention'; end if;
 perform public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',occurrence_a,'attendance_status','justified','note','Corrected with evidence'),credential_a);
 if (select attendance_status from public.attendance_records where id=record_a)<>'justified' then raise exception 'FAIL: attendance correction'; end if;
 if (select count(*) from public.audit_logs where student_id=student_a and entity_type='attendance')<>2 then raise exception 'FAIL: correction audit'; end if;
 denied:=false;
 begin perform public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',occurrence_a,'attendance_status','unjustified'),credential_b); exception when no_data_found then denied:=true; end;
 if not denied then raise exception 'FAIL: another student attendance can be changed'; end if;
 perform public.absentia_api('occurrence_save',jsonb_build_object('id',occurrence_a,'cancelled',true),credential_a);
 if (select attendance_status from public.attendance_records where id=record_a)<>'cancelled' then raise exception 'FAIL: cancellation retains counted absence'; end if;
 denied:=false;
 begin perform public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',occurrence_a,'attendance_status','unjustified'),credential_a); exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'FAIL: cancelled occurrence accepts absence'; end if;
 perform public.absentia_api('occurrence_save',jsonb_build_object('id',occurrence_a,'cancelled',false),credential_a);
 perform public.absentia_api('attendance_delete',jsonb_build_object('id',record_a),credential_a);
 perform public.absentia_api('occurrence_save',jsonb_build_object('id',occurrence_a,'starts_at',now()+interval '1 day','ends_at',now()+interval '1 day 1 hour'),credential_a);
 denied:=false;
 begin perform public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',occurrence_a,'attendance_status','unjustified'),credential_a); exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'FAIL: future attendance accepted'; end if;
 perform public.absentia_api('rotate_token',jsonb_build_object('current_token_hash',token_a,'token_hash',repeat('1',64),'session_hash',repeat('2',64)),credential_a);
 if (select expires_at - created_at from public.web_sessions where session_hash=repeat('2',64)) is distinct from interval '4320 hours' then
  raise exception 'FAIL: replacement browser session does not last 180 days';
 end if;
 denied:=false;
 begin perform public.absentia_api('snapshot','{}',credential_a); exception when invalid_authorization_specification then denied:=true; end;
 if not denied then raise exception 'FAIL: rotation did not revoke old session'; end if;
 denied:=false;
 begin perform public.absentia_api('login',jsonb_build_object('token_hash',token_a,'session_hash',repeat('3',64))); exception when invalid_authorization_specification then denied:=true; end;
 if not denied then raise exception 'FAIL: old token still logs in'; end if;
 perform public.absentia_api('recover',jsonb_build_object('recovery_hash',recovery_a,'token_hash',repeat('4',64),'new_recovery_hash',repeat('5',64),'session_hash',repeat('6',64)));
 denied:=false;
 begin perform public.absentia_api('snapshot','{}',repeat('2',64)); exception when invalid_authorization_specification then denied:=true; end;
 if not denied then raise exception 'FAIL: recovery did not revoke all old sessions'; end if;
 denied:=false;
 begin perform public.absentia_api('recover',jsonb_build_object('recovery_hash',recovery_a,'token_hash',repeat('7',64),'new_recovery_hash',repeat('8',64),'session_hash',repeat('9',64))); exception when invalid_authorization_specification then denied:=true; end;
 if not denied then raise exception 'FAIL: recovery code reuse accepted'; end if;
 perform public.absentia_api('recover',jsonb_build_object('recovery_hash',recovery_a,'token_hash',repeat('4',64),'new_recovery_hash',repeat('5',64),'session_hash',repeat('7',64)));
 denied:=false;
 begin perform public.absentia_api('snapshot','{}',repeat('6',64)); exception when invalid_authorization_specification then denied:=true; end;
 if not denied then raise exception 'FAIL: retry recovery did not revoke prior pending session'; end if;
 perform public.absentia_api('confirm','{}',repeat('7',64));
 denied:=false;
 begin perform public.absentia_api('recover',jsonb_build_object('recovery_hash',recovery_a,'token_hash',repeat('4',64),'new_recovery_hash',repeat('5',64),'session_hash',repeat('8',64))); exception when invalid_authorization_specification then denied:=true; end;
 if not denied then raise exception 'FAIL: completed recovery replay accepted'; end if;
 snap:=public.absentia_api('snapshot','{}',repeat('7',64));
 if snap#>>'{student,id}'<>student_a::text or jsonb_array_length(snap->'modules')<>1 then raise exception 'FAIL: recovery lost student data'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('students','access_tokens','recovery_codes','web_sessions','modules','sessions','scheduled_occurrences','attendance_records','notifications','audit_logs','rate_limits') and not c.relrowsecurity) then raise exception 'FAIL: missing RLS'; end if;
 if exists(select 1 from information_schema.role_table_grants where table_schema='public' and grantee in ('PUBLIC','anon','authenticated') and table_name in ('students','access_tokens','recovery_codes','web_sessions','modules','sessions','scheduled_occurrences','attendance_records','notifications','audit_logs','rate_limits')) then raise exception 'FAIL: browser table privileges'; end if;
 if exists(select 1 from information_schema.routine_privileges where specific_schema='public' and routine_name='absentia_api' and grantee in ('PUBLIC','anon','authenticated')) then raise exception 'FAIL: browser RPC privileges'; end if;
 -- PostgreSQL single-user mode has implicit superuser powers even after SET ROLE.
 -- Effective-role RLS assertions therefore run only against a real server.
 if exists(select 1 from pg_roles where rolname='anon') and current_setting('absentia.offline',true) is distinct from 'on' then
  execute 'grant select on public.students to anon';
  execute 'set local role anon';
  select count(*) into count_rows from public.students;
  denied:=false;
  begin perform public.absentia_api('snapshot','{}',credential_a); exception when insufficient_privilege then denied:=true; end;
  execute 'reset role';
  execute 'revoke select on public.students from anon';
  if count_rows<>0 then raise exception 'FAIL: RLS exposed student rows to anon'; end if;
  if not denied then raise exception 'FAIL: anon can execute trusted RPC'; end if;
 end if;
 for count_rows in 1..8 loop reply:=public.absentia_api('rate_limit','{"bucket":"test-rate-limit","limit":8}'); end loop;
 reply:=public.absentia_api('rate_limit','{"bucket":"test-rate-limit","limit":8}');
 if (reply->>'allowed')::boolean then raise exception 'FAIL: durable rate limit'; end if;
 begin perform public.absentia_api('login',jsonb_build_object('token_hash',token_a,'session_hash',repeat('9',64))); exception when invalid_authorization_specification then null; end;
 if (select attempts from public.rate_limits where bucket='test-rate-limit')<>9 then raise exception 'FAIL: failed authentication rolled back rate-limit state'; end if;
 perform public.absentia_api('account_delete',jsonb_build_object('current_token_hash',repeat('4',64)),repeat('7',64));
 if exists(select 1 from public.students where id=student_a) or exists(select 1 from public.access_tokens where student_id=student_a) then raise exception 'FAIL: account deletion leaves private data'; end if;
 raise notice 'PASS: registration gate, session auth, tenant isolation, timezone, duplicate prevention, correction audit, cancellation, future attendance, token revocation, single-use recovery, durable rate limits, RLS and account deletion.';
end $$;

select 'PASS: all database workflow and security assertions completed' as verification;

rollback;
