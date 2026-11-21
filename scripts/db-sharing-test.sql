begin;

do $$
declare
 owner uuid; recipient uuid; other_group uuid; owner_module uuid; own_module uuid; series uuid; share_id uuid;
 result jsonb; preview jsonb; imported jsonb; denied boolean; count_before integer; key text;
 owner_session text:=repeat('a',64); recipient_session text:=repeat('b',64); other_session text:=repeat('c',64);
begin
 result:=public.absentia_api('register',jsonb_build_object('full_name','PRIVATE_OWNER_NAME','academic_year','2026/2027','department','CS','group_name','Group 03','semester','S1','token_hash',repeat('d',64),'recovery_hash',repeat('e',64),'session_hash',owner_session));owner:=(result->>'student_id')::uuid;perform public.absentia_api('confirm','{}',owner_session);
 result:=public.absentia_api('register',jsonb_build_object('full_name','Recipient Student','academic_year','2026/2027','department','cs','group_name','group   03','semester','s1','token_hash',repeat('f',64),'recovery_hash',repeat('1',64),'session_hash',recipient_session));recipient:=(result->>'student_id')::uuid;perform public.absentia_api('confirm','{}',recipient_session);
 result:=public.absentia_api('register',jsonb_build_object('full_name','Other Student','academic_year','2026/2027','department','CS','group_name','Group 04','semester','S1','token_hash',repeat('2',64),'recovery_hash',repeat('3',64),'session_hash',other_session));other_group:=(result->>'student_id')::uuid;perform public.absentia_api('confirm','{}',other_session);
 result:=public.absentia_api('module_save','{"name":"Networks","code":"NET","color":"#93AA84","semester":"S1","description":"PRIVATE_MODULE_NOTE","professor":"Public Professor","total_threshold":1,"unjustified_threshold":1}',owner_session);owner_module:=(result->>'id')::uuid;
 result:=public.absentia_api('session_save',jsonb_build_object('module_id',owner_module,'session_type','TD','weekday',1,'start_time','08:00','end_time','09:00','classroom','B12','professor','Public Professor','recurrence_start','2024-01-01','recurrence_end','2024-01-08'),owner_session);series:=(result->>'id')::uuid;
 select id into share_id from public.scheduled_occurrences where session_id=series order by starts_at limit 1;
 perform public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',share_id,'attendance_status','unjustified','note','PRIVATE_ATTENDANCE_NOTE'),owner_session);
 update public.scheduled_occurrences set cancelled=true where session_id=series and occurrence_date='2024-01-08';
 result:=public.exclunich_sharing('create',jsonb_build_object('title','Group 03 timetable','expires_days',7,'token_hash',repeat('4',64),'snapshot','{"attack":true}'),owner_session);share_id:=(result->>'id')::uuid;
 if result::text like '%token_hash%' or result::text like '%snapshot%' then raise exception 'FAIL: create leaked stored secrets'; end if;
 preview:=public.exclunich_sharing('preview',jsonb_build_object('token_hash',repeat('4',64)),recipient_session);
 if (preview->>'is_owner')::boolean then raise exception 'FAIL: owner identity'; end if;
 if preview::text like '%PRIVATE_%' or preview::text like '%attendance%' or preview::text like '%threshold%' or preview::text like '%token_hash%' or preview::text like '%student_id%' or preview::text like '%attack%' then raise exception 'FAIL: sharing leaked private data or trusted supplied snapshot'; end if;
 if jsonb_array_length(preview#>'{snapshot,sessions}')<>1 or jsonb_array_length(preview#>'{snapshot,occurrences}')<>2 then raise exception 'FAIL: schedule missing'; end if;
 denied:=false;begin perform public.exclunich_sharing('preview',jsonb_build_object('token_hash',repeat('4',64)),other_session);exception when invalid_parameter_value then denied:=true;end;if not denied then raise exception 'FAIL: group boundary';end if;
 foreach key in array array['department','academic_year','semester'] loop
  execute format('update public.students set %I=$1 where id=$2',key) using 'mismatch',recipient;
  denied:=false;begin perform public.exclunich_sharing('preview',jsonb_build_object('token_hash',repeat('4',64)),recipient_session);exception when invalid_parameter_value then denied:=true;end;if not denied then raise exception 'FAIL: cohort boundary %',key;end if;
  execute format('update public.students set %I=$1 where id=$2',key) using case key when 'department' then 'CS' when 'academic_year' then '2026/2027' else 'S1' end,recipient;
 end loop;
 result:=public.absentia_api('module_save','{"name":"Networks","code":"NET","color":"#93AA84","semester":"S1","professor":"Personal Professor","total_threshold":9,"unjustified_threshold":8}',recipient_session);own_module:=(result->>'id')::uuid;
 imported:=public.exclunich_sharing('import',jsonb_build_object('token_hash',repeat('4',64)),recipient_session);
 if (imported->>'modules_added')::integer<>0 or (imported->>'sessions_added')::integer<>1 then raise exception 'FAIL: import counts';end if;
 if (select count(*) from public.attendance_records where student_id=recipient)<>0 then raise exception 'FAIL: imported another student attendance';end if;
 if (select total_threshold from public.modules where id=own_module)<>9 or (select professor from public.modules where id=own_module)<>'Personal Professor' then raise exception 'FAIL: overwrote recipient module settings';end if;
 if (select count(*) from public.scheduled_occurrences where student_id=recipient)<>2 or (select count(*) from public.scheduled_occurrences where student_id=recipient and cancelled)<>1 then raise exception 'FAIL: occurrence copying';end if;
 if exists(select 1 from public.scheduled_occurrences where student_id=recipient and module_id=owner_module) then raise exception 'FAIL: foreign ownership mapping';end if;
 if not exists(select 1 from public.scheduled_occurrences where student_id=recipient and starts_at='2024-01-01T07:00:00Z') then raise exception 'FAIL: changed session instants';end if;
 imported:=public.exclunich_sharing('import',jsonb_build_object('token_hash',repeat('4',64)),recipient_session);
 if not (imported->>'already_imported')::boolean or (select count(*) from public.sessions where student_id=recipient)<>1 then raise exception 'FAIL: same token duplication';end if;
 result:=public.exclunich_sharing('create',jsonb_build_object('title','Another token','expires_days',1,'token_hash',repeat('5',64)),owner_session);
 imported:=public.exclunich_sharing('import',jsonb_build_object('token_hash',repeat('5',64)),recipient_session);
 if (imported->>'sessions_added')::integer<>0 or (select count(*) from public.sessions where student_id=recipient)<>1 then raise exception 'FAIL: different tokens duplicated same source series';end if;
 denied:=false;begin perform public.exclunich_sharing('revoke',jsonb_build_object('id',share_id),recipient_session);exception when no_data_found then denied:=true;end;if not denied then raise exception 'FAIL: recipient revoked owner share';end if;
 perform public.exclunich_sharing('revoke',jsonb_build_object('id',share_id),owner_session);
 denied:=false;begin perform public.exclunich_sharing('preview',jsonb_build_object('token_hash',repeat('4',64)),recipient_session);exception when invalid_parameter_value then denied:=true;end;if not denied then raise exception 'FAIL: revoked token remained usable';end if;
 if (select count(*) from public.sessions where student_id=recipient)<>1 then raise exception 'FAIL: revocation deleted private copy';end if;
 update public.timetable_shares set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where token_hash=repeat('5',64);
 denied:=false;begin perform public.exclunich_sharing('preview',jsonb_build_object('token_hash',repeat('5',64)),recipient_session);exception when invalid_parameter_value then denied:=true;end;if not denied then raise exception 'FAIL: expiry';end if;
 denied:=false;begin perform public.exclunich_sharing('list','{}',repeat('0',64));exception when invalid_authorization_specification then denied:=true;end;if not denied then raise exception 'FAIL: anonymous listing';end if;
 if exists(select 1 from information_schema.routine_privileges where routine_name='exclunich_sharing' and grantee in ('PUBLIC','anon','authenticated')) then raise exception 'FAIL: public sharing RPC access';end if;
 if exists(select 1 from pg_class where relname in ('timetable_shares','timetable_share_imports','timetable_imported_sessions') and not relrowsecurity) then raise exception 'FAIL: sharing RLS flags';end if;
 raise notice 'PASS: timetable sharing, privacy, cohort restrictions, duplication, expiry and revocation';
end $$;

select 'PASS: timetable sharing, privacy, cohort restrictions, duplication, expiry and revocation' as verification;

rollback;

