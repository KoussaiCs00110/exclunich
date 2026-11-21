begin;

do $$
declare
 sid uuid; mid uuid; series uuid; recorded uuid; unrecorded uuid;
 result jsonb; denied boolean; stamp date; code text; boundary date;
 credential text:=repeat('8',64);
begin
 for code,stamp,boundary in select * from (values
  ('test1',date '2026-11-28',date '2026-12-03'),('wh',date '2026-12-19',date '2027-01-01'),
  ('exam1',date '2027-01-09',date '2027-01-14'),('test2',date '2027-03-13',date '2027-03-18'),
  ('sh',date '2027-03-20',date '2027-04-01'),('exam2',date '2027-05-08',date '2027-05-13')
 ) p(code,first_date,last_date) loop
  if public.exclunich_non_teaching_period((stamp+time '09:00') at time zone 'Africa/Algiers',(stamp+time '10:00') at time zone 'Africa/Algiers','Africa/Algiers') is distinct from code then raise exception 'FAIL: missing inclusive start %',code; end if;
  if public.exclunich_non_teaching_period((boundary+time '09:00') at time zone 'Africa/Algiers',(boundary+time '10:00') at time zone 'Africa/Algiers','Africa/Algiers') is distinct from code then raise exception 'FAIL: missing inclusive end %',code; end if;
  if public.exclunich_non_teaching_period((boundary+1+time '09:00') at time zone 'Africa/Algiers',(boundary+1+time '10:00') at time zone 'Africa/Algiers','Africa/Algiers') is not null then raise exception 'FAIL: boundary is not inclusive only'; end if;
 end loop;
 if public.exclunich_non_teaching_period('2026-11-27T22:00Z','2026-11-27T23:00Z','Africa/Algiers') is not null then raise exception 'FAIL: exclusive midnight end'; end if;
 if public.exclunich_non_teaching_period('2026-11-27T23:00Z','2026-11-28T00:00Z','Africa/Algiers') is distinct from 'test1' then raise exception 'FAIL: local timezone boundary'; end if;
 result:=public.absentia_api('register',jsonb_build_object('full_name','Calendar Test Student','academic_year','2026/2027','department','CS','group_name','Calendar','semester','S3','token_hash',repeat('9',64),'recovery_hash',repeat('a',64),'session_hash',credential));
 sid:=(result->>'student_id')::uuid;perform public.absentia_api('confirm','{}',credential);
 result:=public.absentia_api('module_save','{"name":"Calendar Module","code":"CAL","color":"#628b75","semester":"S3"}',credential);mid:=(result->>'id')::uuid;
 result:=public.absentia_api('session_save',jsonb_build_object('module_id',mid,'session_type','TD','weekday',7,'start_time','09:00','end_time','10:00','recurrence_start','2026-11-22','recurrence_end','2027-01-28'),credential);series:=(result->>'id')::uuid;
 if (select count(*) from public.scheduled_occurrences where session_id=series)<>6 then raise exception 'FAIL: recurrence did not skip four blocked weeks'; end if;
 if exists(select 1 from public.scheduled_occurrences o where student_id=sid and public.exclunich_non_teaching_period(o.starts_at,o.ends_at,'Africa/Algiers') is not null) then raise exception 'FAIL: blocked occurrence inserted'; end if;
 select id into recorded from public.scheduled_occurrences where session_id=series order by starts_at limit 1;
 denied:=false;begin perform public.absentia_api('occurrence_save',jsonb_build_object('id',recorded,'starts_at','2026-11-29T08:00Z','ends_at','2026-11-29T09:00Z'),credential);exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'FAIL: rescheduled into academic break'; end if;
 -- Simulate data created before this migration; the cleanup must keep attendance.
 alter table public.scheduled_occurrences disable trigger exclunich_guard_teaching_dates;
 insert into public.scheduled_occurrences(student_id,session_id,module_id,occurrence_date,starts_at,ends_at,classroom,session_type) values(sid,series,mid,'2026-11-29','2026-11-29T08:00Z','2026-11-29T09:00Z','','TD') returning id into recorded;
 insert into public.attendance_records(student_id,module_id,occurrence_id,attendance_status,note) values(sid,mid,recorded,'present','Keep historical note');
 insert into public.scheduled_occurrences(student_id,session_id,module_id,occurrence_date,starts_at,ends_at,classroom,session_type) values(sid,series,mid,'2026-12-20','2026-12-20T08:00Z','2026-12-20T09:00Z','','TD') returning id into unrecorded;
 alter table public.scheduled_occurrences enable trigger exclunich_guard_teaching_dates;
 result:=public.exclunich_apply_academic_calendar();
 if not exists(select 1 from public.scheduled_occurrences where id=recorded and cancelled) then raise exception 'FAIL: recorded history removed'; end if;
 if not exists(select 1 from public.attendance_records where occurrence_id=recorded and note='Keep historical note' and attendance_status='present') then raise exception 'FAIL: original attendance modified'; end if;
 if exists(select 1 from public.scheduled_occurrences where id=unrecorded) then raise exception 'FAIL: unrecorded blocked class retained'; end if;
 denied:=false;begin perform public.absentia_api('occurrence_save',jsonb_build_object('id',recorded,'cancelled',false),credential);exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'FAIL: restored blocked session'; end if;
 result:=public.exclunich_apply_academic_calendar();
 if result<>'{"cancelled_recorded":0,"removed_unrecorded":0}'::jsonb then raise exception 'FAIL: cleanup is not idempotent'; end if;
 if exists(select 1 from information_schema.routine_privileges where routine_name in ('exclunich_non_teaching_period','exclunich_guard_teaching_dates','exclunich_apply_academic_calendar') and grantee in ('PUBLIC','anon','authenticated')) then raise exception 'FAIL: public calendar-management privileges'; end if;
end $$;

select 'PASS: academic calendar boundaries, recurrence, rescheduling, history and cleanup' as verification;

rollback;
