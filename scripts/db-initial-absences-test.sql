begin;

do $$
declare
 a uuid; b uuid; mid uuid; other_mid uuid; fresh uuid; result jsonb; payload jsonb; body jsonb; invalid jsonb; denied boolean; audit_count integer;
 ca text:=repeat('b',64); cb text:=repeat('c',64);
begin
 result:=public.absentia_api('register',jsonb_build_object('full_name','Starting Balance A','academic_year','2026/2027','department','CS','group_name','Balance','semester','S3','token_hash',repeat('d',64),'recovery_hash',repeat('e',64),'session_hash',ca));
 a:=(result->>'student_id')::uuid;perform public.absentia_api('confirm','{}',ca);
 result:=public.absentia_api('register',jsonb_build_object('full_name','Starting Balance B','academic_year','2026/2027','department','CS','group_name','Balance','semester','S3','token_hash',repeat('f',64),'recovery_hash',repeat('a',64),'session_hash',cb));
 b:=(result->>'student_id')::uuid;perform public.absentia_api('confirm','{}',cb);
 body:='{"name":"Balance Module","code":"BAL","color":"#628b75","semester":"S3"}';
 result:=public.absentia_api('module_save',body,ca);mid:=(result->>'id')::uuid;
 if not exists(select 1 from public.modules where id=mid and initial_justified_absences=0 and initial_unjustified_absences=0) then raise exception 'FAIL: legacy module defaults'; end if;
 body:=body||jsonb_build_object('id',mid,'initial_justified_absences',1,'initial_unjustified_absences',2);
 perform public.exclunich_module_save('module_save',body,ca);
 perform public.exclunich_module_save('module_save',body,ca);
 if (select count(*) from public.audit_logs where student_id=a and action='starting_absences_updated')<>1 then raise exception 'FAIL: starting balance retry duplicated audit'; end if;
 if exists(select 1 from public.attendance_records where student_id=a) or exists(select 1 from public.scheduled_occurrences where student_id=a) then raise exception 'FAIL: starting balances fabricated attendance'; end if;
 foreach invalid in array array['-1'::jsonb,'1.5'::jsonb,'1001'::jsonb,'null'::jsonb,'"2"'::jsonb] loop
  denied:=false;begin perform public.exclunich_module_save('module_save',body||jsonb_build_object('name','Must Roll Back','initial_justified_absences',invalid),ca);exception when invalid_parameter_value then denied:=true;end;
  if not denied or not exists(select 1 from public.modules where id=mid and name='Balance Module' and initial_justified_absences=1 and initial_unjustified_absences=2) then raise exception 'FAIL: invalid balance or partial module commit'; end if;
 end loop;
 denied:=false;begin perform public.exclunich_module_save('module_save',body,cb);exception when no_data_found then denied:=true;end;
 if not denied then raise exception 'FAIL: another student edited a balance'; end if;
 denied:=false;begin perform public.exclunich_module_save('module_save',body,repeat('0',64));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'FAIL: invalid session edited a balance'; end if;
 perform public.exclunich_module_save('module_save',(body-'initial_unjustified_absences')||'{"initial_justified_absences":0}',ca);
 if not exists(select 1 from public.modules where id=mid and initial_justified_absences=0 and initial_unjustified_absences=2) then raise exception 'FAIL: omitted balance did not preserve value'; end if;
 perform public.absentia_api('module_save',body-'initial_justified_absences'-'initial_unjustified_absences',ca);
 if (select initial_unjustified_absences from public.modules where id=mid)<>2 then raise exception 'FAIL: old client reset balance'; end if;
 -- Assign balances independently without rewriting the unassigned legacy counts.
 body:=body||'{"initial_absences_by_type":{"Lecture":{"justified":1,"unjustified":0},"TD":{"justified":0,"unjustified":2}}}'::jsonb;
 perform public.exclunich_module_save_by_type('module_save',body,ca);
 select count(*) into audit_count from public.audit_logs where student_id=a and action='starting_absences_updated';
 perform public.exclunich_module_save_by_type('module_save',body,ca);
 if (select count(*) from public.audit_logs where student_id=a and action='starting_absences_updated')<>audit_count then raise exception 'FAIL: typed balance retry duplicated audit'; end if;
 if not exists(select 1 from public.modules where id=mid and initial_absences_by_type=body->'initial_absences_by_type' and initial_unjustified_absences=2) then raise exception 'FAIL: typed balances not saved'; end if;
 foreach invalid in array array['null'::jsonb,'[]'::jsonb,'{"Other":{"justified":0,"unjustified":0}}'::jsonb,'{"TD":null}'::jsonb,'{"TD":{"justified":0}}'::jsonb,'{"TD":{"justified":0,"unjustified":-1}}'::jsonb,'{"TD":{"justified":0,"unjustified":1.5}}'::jsonb,'{"TD":{"justified":1001,"unjustified":0}}'::jsonb,'{"TD":{"justified":"1","unjustified":0}}'::jsonb,'{"TD":{"justified":0,"unjustified":null}}'::jsonb,'{"TD":{"justified":0,"unjustified":0,"extra":0}}'::jsonb] loop
  denied:=false;begin perform public.exclunich_module_save_by_type('module_save',body||jsonb_build_object('name','Must Roll Back','initial_absences_by_type',invalid),ca);exception when invalid_parameter_value then denied:=true;end;
  if not denied or not exists(select 1 from public.modules where id=mid and name='Balance Module' and initial_absences_by_type=body->'initial_absences_by_type') then raise exception 'FAIL: invalid typed balance or partial commit'; end if;
 end loop;
 denied:=false;begin perform public.exclunich_module_save_by_type('module_save',body,cb);exception when no_data_found then denied:=true;end;
 if not denied then raise exception 'FAIL: another student edited typed balances'; end if;
 denied:=false;begin perform public.exclunich_module_save_by_type('module_save',body,repeat('0',64));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'FAIL: invalid session edited typed balances'; end if;
 perform public.exclunich_module_save('module_save',body-'initial_absences_by_type',ca);
 if not exists(select 1 from public.modules where id=mid and initial_absences_by_type=body->'initial_absences_by_type') then raise exception 'FAIL: old client reset typed balances'; end if;
 result:=public.absentia_api('snapshot','{}',ca);
 if not exists(select 1 from jsonb_array_elements(result->'modules') m where m->>'id'=mid::text and m->'initial_absences_by_type'=body->'initial_absences_by_type') then raise exception 'FAIL: typed balances absent from snapshot'; end if;
 perform public.absentia_api('session_save',jsonb_build_object('module_id',mid,'session_type','TD','weekday',7,'start_time','09:00','end_time','10:00','recurrence_start','2026-11-22','recurrence_end','2026-11-22'),ca);
 result:=public.exclunich_sharing('create',jsonb_build_object('title','Balance private','expires_days',1,'token_hash',repeat('1',64)),ca);
 payload:=public.exclunich_sharing('preview',jsonb_build_object('token_hash',repeat('1',64)),cb);
 if (payload->'snapshot')::text like '%initial_%absences%' then raise exception 'FAIL: starting balances shared'; end if;
 perform public.exclunich_sharing('import',jsonb_build_object('token_hash',repeat('1',64)),cb);
 select id into other_mid from public.modules where student_id=b and code='BAL';
 if not exists(select 1 from public.modules where id=other_mid and initial_justified_absences=0 and initial_unjustified_absences=0 and initial_absences_by_type='{}'::jsonb) then raise exception 'FAIL: imported personal counts'; end if;
 result:=public.absentia_api('snapshot','{}',ca);
 payload:=(result->'student')||jsonb_build_object('academic_year','2027/2028');
 perform public.absentia_api('profile_save',payload,ca);
 if not exists(select 1 from public.modules where id=mid and archived_at is not null and initial_unjustified_absences=2 and initial_absences_by_type=body->'initial_absences_by_type') then raise exception 'FAIL: archived balance lost'; end if;
 result:=public.exclunich_module_save('module_save',body-'id'-'initial_justified_absences'-'initial_unjustified_absences',ca);fresh:=(result->>'id')::uuid;
 if not exists(select 1 from public.modules where id=fresh and initial_justified_absences=0 and initial_unjustified_absences=0) then raise exception 'FAIL: new year inherited balance'; end if;
 if exists(select 1 from information_schema.routine_privileges where routine_name in ('exclunich_module_save','exclunich_module_save_by_type') and grantee in ('PUBLIC','anon','authenticated')) then raise exception 'FAIL: browser balance RPC privileges'; end if;
 if exists(select 1 from pg_roles where rolname='service_role') and not has_function_privilege('service_role','public.exclunich_module_save(text,jsonb,text)','EXECUTE') then raise exception 'FAIL: trusted server role lost access'; end if;
 if exists(select 1 from pg_roles where rolname='service_role') and not has_function_privilege('service_role','public.exclunich_module_save_by_type(text,jsonb,text)','EXECUTE') then raise exception 'FAIL: trusted server role lost typed balance access'; end if;
end $$;

select 'PASS: initial absence balances, atomic updates, tenant isolation, sharing privacy and term archives' as verification;

rollback;
