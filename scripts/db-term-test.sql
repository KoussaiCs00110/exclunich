-- Run against an isolated migrated database. Every fixture is rolled back.
begin;

do $$
declare
 owner_id uuid; other_id uuid; module_id uuid; other_module uuid; archived_module uuid;
 new_module uuid; next_year_module uuid; series_id uuid; occurrence_id uuid;
 result jsonb; profile jsonb; snapshot jsonb; share_id uuid;
 session_a text:=repeat('1',64); session_b text:=repeat('2',64);
begin
 result:=public.absentia_api('register',jsonb_build_object('full_name','Term Owner','academic_year','2026/2027','department','CS','group_name','G1','semester','S1','token_hash',repeat('3',64),'recovery_hash',repeat('4',64),'session_hash',session_a));
 owner_id:=(result->>'student_id')::uuid;
 perform public.absentia_api('confirm','{}',session_a);
 result:=public.absentia_api('register',jsonb_build_object('full_name','Term Classmate','academic_year','2026/2027','department','CS','group_name','G1','semester','S1','token_hash',repeat('5',64),'recovery_hash',repeat('6',64),'session_hash',session_b));
 other_id:=(result->>'student_id')::uuid;
 perform public.absentia_api('confirm','{}',session_b);
 result:=public.absentia_api('module_save','{"name":"Networks","code":"NET","color":"#628b75","semester":"S1","academic_year":"forged"}',session_a);module_id:=(result->>'id')::uuid;
 if (select academic_year from public.modules where id=module_id)<>'2026/2027' then raise exception 'FAIL: module year was not derived from owner'; end if;
 result:=public.absentia_api('module_save','{"name":"Archived","code":"OLD","color":"#628b75","semester":"S1"}',session_a);archived_module:=(result->>'id')::uuid;
 update public.modules set archived_at='2020-01-01T00:00:00Z' where id=archived_module;
 result:=public.absentia_api('module_save','{"name":"Classmate Networks","code":"NET","color":"#628b75","semester":"S2"}',session_b);other_module:=(result->>'id')::uuid;
 result:=public.absentia_api('session_save',jsonb_build_object('module_id',module_id,'session_type','TD','weekday',1,'start_time','09:00','end_time','10:00','classroom','Old Room','professor','','recurrence_start','2024-01-01','recurrence_end','2024-01-01'),session_a);
 series_id:=(result->>'id')::uuid;
 select id into occurrence_id from public.scheduled_occurrences where session_id=series_id;
 perform public.absentia_api('attendance_save',jsonb_build_object('occurrence_id',occurrence_id,'attendance_status','unjustified','note','Preserved old-term note'),session_a);
 select to_jsonb(s) into profile from public.students s where id=owner_id;
 -- Preferences and ordinary profile edits must not archive the active schedule.
 perform public.absentia_api('profile_save',profile||'{"full_name":"Updated Term Owner","theme":"light"}',session_a);
 if (select archived_at from public.modules where id=module_id) is not null then raise exception 'FAIL: ordinary profile save archived timetable'; end if;
 -- A failed transaction must roll back the profile and its archive together.
 begin
  perform public.absentia_api('profile_save',profile||'{"semester":"S2"}',session_a);
  if (select archived_at from public.modules where id=module_id) is null then raise exception 'FAIL: semester update did not archive synchronously'; end if;
  perform 1/0;
 exception when division_by_zero then null;
 end;
 if (select semester from public.students where id=owner_id)<>'S1' or (select archived_at from public.modules where id=module_id) is not null then raise exception 'FAIL: archive and profile did not roll back together'; end if;
 perform public.absentia_api('profile_save',profile||'{"semester":"S2"}',session_a);
 if exists(select 1 from public.modules where student_id=owner_id and archived_at is null) then raise exception 'FAIL: semester change left active old modules'; end if;
 if (select archived_at from public.modules where id=archived_module)<>'2020-01-01T00:00:00Z' then raise exception 'FAIL: changed pre-existing archive timestamp'; end if;
 if (select archived_at from public.modules where id=other_module) is not null then raise exception 'FAIL: archived another student timetable'; end if;
 snapshot:=public.absentia_api('snapshot','{}',session_a);
 if jsonb_array_length(snapshot->'sessions')<>1 or jsonb_array_length(snapshot->'occurrences')<>1 or snapshot#>>'{attendance,0,note}'<>'Preserved old-term note' then raise exception 'FAIL: semester archive deleted history'; end if;
 result:=public.absentia_api('module_save','{"name":"New Networks","code":"NET","color":"#628b75","semester":"S2"}',session_a);new_module:=(result->>'id')::uuid;
 perform public.absentia_api('profile_save',profile||'{"semester":"S2"}',session_a);
 if (select archived_at from public.modules where id=new_module) is not null then raise exception 'FAIL: unchanged semester re-archived new modules'; end if;
 -- Changing the year alone archives the current term and permits repeated codes.
 perform public.absentia_api('profile_save',profile||'{"semester":"S2","academic_year":"2027/2028"}',session_a);
 if (select archived_at from public.modules where id=new_module) is null then raise exception 'FAIL: year-only change did not archive'; end if;
 if (select academic_year from public.modules where id=new_module)<>'2026/2027' then raise exception 'FAIL: old academic year was overwritten'; end if;
 result:=public.absentia_api('module_save','{"name":"Networks","code":"NET","color":"#628b75","semester":"S2"}',session_a);next_year_module:=(result->>'id')::uuid;
 if (select academic_year from public.modules where id=next_year_module)<>'2027/2028' then raise exception 'FAIL: new module retained old year'; end if;
 result:=public.absentia_api('session_save',jsonb_build_object('module_id',next_year_module,'session_type','TD','weekday',1,'start_time','09:00','end_time','10:00','classroom','New Room','professor','','recurrence_start','2024-01-01','recurrence_end','2024-01-01'),session_a);
 -- Import must use the new year rather than finding an archived same-code module.
 select to_jsonb(s) into profile from public.students s where id=other_id;
 perform public.absentia_api('profile_save',profile||'{"semester":"S2","academic_year":"2027/2028"}',session_b);
 result:=public.exclunich_sharing('create',jsonb_build_object('title','New year timetable','expires_days',7,'token_hash',repeat('7',64)),session_a);
 share_id:=(result->>'id')::uuid;
 result:=public.exclunich_sharing('import',jsonb_build_object('token_hash',repeat('7',64)),session_b);
 if (result->>'modules_added')::integer<>1 or not exists(select 1 from public.modules where student_id=other_id and code='NET' and semester='S2' and academic_year='2027/2028' and archived_at is null) then raise exception 'FAIL: new-year import reused old academic year'; end if;
 if (select archived_at from public.modules where id=other_module) is null then raise exception 'FAIL: simultaneous semester/year update did not archive'; end if;
 if exists(select 1 from information_schema.routine_privileges where routine_name in ('exclunich_archive_previous_term','exclunich_module_academic_year') and grantee in ('PUBLIC','anon','authenticated')) then raise exception 'FAIL: public trigger function grants'; end if;
 raise notice 'PASS: term archiving, atomicity, history, isolation, repeated saves, year-scoped module codes and timetable imports';
end $$;

select 'PASS: term archiving, atomicity, history and academic-year isolation' as verification;

rollback;
