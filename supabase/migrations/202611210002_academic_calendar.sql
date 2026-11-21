-- Global non-teaching periods for the exact dates in academic year 2026–2027.
begin;

create function public.exclunich_non_teaching_period(p_start timestamptz,p_end timestamptz,p_timezone text)
returns text language sql stable set search_path=pg_catalog,public,pg_temp as $$
 select period.code from (values
  ('test1',date '2026-11-28',date '2026-12-03'),
  ('wh',date '2026-12-19',date '2027-01-01'),
  ('exam1',date '2027-01-09',date '2027-01-14'),
  ('test2',date '2027-03-13',date '2027-03-18'),
  ('sh',date '2027-03-20',date '2027-04-01'),
  ('exam2',date '2027-05-08',date '2027-05-13')
 ) as period(code,starts_on,ends_on)
 where p_start < ((period.ends_on+1)::timestamp at time zone p_timezone)
 and p_end > (period.starts_on::timestamp at time zone p_timezone)
 order by period.starts_on limit 1;
$$;
revoke all on function public.exclunich_non_teaching_period(timestamptz,timestamptz,text) from public;

create function public.exclunich_guard_teaching_dates()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
declare zone text; period text;
begin
 select timezone into zone from public.students where id=new.student_id;
 period:=public.exclunich_non_teaching_period(new.starts_at,new.ends_at,zone);
 if period is not null then
  if tg_op='INSERT' then return null; end if;
  if not new.cancelled then raise exception using errcode='22023',message='Regular classes cannot be scheduled during tests, holidays or exams.'; end if;
 end if;
 return new;
end $$;
revoke all on function public.exclunich_guard_teaching_dates() from public;
create trigger exclunich_guard_teaching_dates
 before insert or update of starts_at,ends_at,cancelled on public.scheduled_occurrences
 for each row execute function public.exclunich_guard_teaching_dates();

-- Keep recorded history, but remove unrecorded classes from these periods.
-- Owner-only and safe to rerun after importing older data.
create function public.exclunich_apply_academic_calendar()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare cancelled_count integer; removed_count integer;
begin
 with changed as (
  update public.scheduled_occurrences o set cancelled=true,updated_at=now()
  from public.students s where s.id=o.student_id and not o.cancelled
  and public.exclunich_non_teaching_period(o.starts_at,o.ends_at,s.timezone) is not null
  and exists(select 1 from public.attendance_records a where a.occurrence_id=o.id)
  returning o.*
 ) insert into public.audit_logs(student_id,action,entity_type,entity_id,after_data)
 select student_id,'academic_calendar_cancelled','occurrence',id,to_jsonb(changed) from changed;
 get diagnostics cancelled_count=row_count;
 delete from public.scheduled_occurrences o using public.students s
 where s.id=o.student_id
 and public.exclunich_non_teaching_period(o.starts_at,o.ends_at,s.timezone) is not null
 and not exists(select 1 from public.attendance_records a where a.occurrence_id=o.id);
 get diagnostics removed_count=row_count;
 return jsonb_build_object('cancelled_recorded',cancelled_count,'removed_unrecorded',removed_count);
end $$;
revoke all on function public.exclunich_apply_academic_calendar() from public;

do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then
  revoke all on function public.exclunich_non_teaching_period(timestamptz,timestamptz,text),public.exclunich_guard_teaching_dates(),public.exclunich_apply_academic_calendar() from anon;
 end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then
  revoke all on function public.exclunich_non_teaching_period(timestamptz,timestamptz,text),public.exclunich_guard_teaching_dates(),public.exclunich_apply_academic_calendar() from authenticated;
 end if;
end $$;

select public.exclunich_apply_academic_calendar();

notify pgrst,'reload schema';
commit;
