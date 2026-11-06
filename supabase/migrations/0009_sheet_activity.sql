-- =====================================================================
-- 0009: متابعة الرصد — ملخص «بدأت الرصد / غادرت دون حفظ» لكل (معلمة × شعبة × مادة)
--  - تقرأ أحداث client.sheet.started و client.sheet.abandoned من سجل التتبع
--  - security invoker: سياسة logs_read تحصر المشرفة في فرعها تلقائياً
-- =====================================================================

create or replace function public.sheet_activity(p_since timestamptz, p_branch uuid default null)
returns table (
  actor_id uuid, section_id uuid, grade_subject_id uuid, term int,
  first_started timestamptz, last_event timestamptz, last_kind text,
  last_filled int, last_total int, abandoned_count int
)
language sql stable security invoker set search_path = public as $$
  with ev as (
    select a.actor_id,
           (a.details->>'section_id')::uuid       as sid,
           (a.details->>'grade_subject_id')::uuid as gid,
           case when a.details->>'term' ~ '^[12]$' then (a.details->>'term')::int else 1 end as term,
           a.action, a.created_at,
           case when a.details->>'filled' ~ '^[0-9]{1,6}$' then (a.details->>'filled')::int end as filled,
           case when a.details->>'total'  ~ '^[0-9]{1,6}$' then (a.details->>'total')::int  end as total
      from public.audit_logs a
     where a.action in ('client.sheet.started', 'client.sheet.abandoned')
       and a.created_at >= p_since
       and a.actor_id is not null
       and (p_branch is null or a.branch_id = p_branch)
       and a.details->>'section_id'       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and a.details->>'grade_subject_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select ev.actor_id, ev.sid, ev.gid, ev.term,
         min(ev.created_at) filter (where ev.action = 'client.sheet.started'),
         max(ev.created_at),
         (array_agg(ev.action order by ev.created_at desc))[1],
         (array_agg(ev.filled order by ev.created_at desc))[1],
         (array_agg(ev.total  order by ev.created_at desc))[1],
         (count(*) filter (where ev.action = 'client.sheet.abandoned'))::int
    from ev
   group by ev.actor_id, ev.sid, ev.gid, ev.term
$$;

grant execute on function public.sheet_activity(timestamptz, uuid) to authenticated;
notify pgrst, 'reload schema';
