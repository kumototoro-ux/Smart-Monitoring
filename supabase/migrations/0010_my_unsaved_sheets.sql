-- =====================================================================
-- 0010: تنبيه المعلمة بكشوفها التي رصدتها ولم تحفظها (أو عدّلتها ولم تحفظ التعديل)
--  - المصدر 1: أحداث client.sheet.started / abandoned في سجل التتبع (تعمل من أي جهاز)
--  - المصدر 2: مسودات هذا الجهاز التي يرسلها المتصفح (p_drafts)
--  - يُعدّ الكشف «غير محفوظ» إذا كان آخر نشاط بعد آخر حفظ فعلي للكشف
--  - security definer لأن المعلمة لا تقرأ سجل التتبع؛ والدالة تقصر النتيجة على المستخدم نفسه وإسناداته
-- =====================================================================

create or replace function public.my_unsaved_sheets(p_drafts jsonb default '[]'::jsonb)
returns table (
  section_id uuid, grade_subject_id uuid, kind text, on_device boolean,
  last_event timestamptz, filled int, total int,
  section_name text, grade_name text, subject_name text
)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  cfg as (select current_term as t, academic_year as y from public.settings where id = 1),
  act as (
    select (a.details->>'section_id')::uuid as sid, (a.details->>'grade_subject_id')::uuid as gid,
           max(a.created_at) as last_event,
           (array_agg(case when a.details->>'filled' ~ '^[0-9]{1,6}$' then (a.details->>'filled')::int end order by a.created_at desc))[1] as filled,
           (array_agg(case when a.details->>'total'  ~ '^[0-9]{1,6}$' then (a.details->>'total')::int  end order by a.created_at desc))[1] as total
      from public.audit_logs a, me, cfg
     where a.actor_id = me.uid
       and a.action in ('client.sheet.started', 'client.sheet.abandoned')
       and a.created_at >= now() - interval '90 days'
       and a.details->>'section_id'       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and a.details->>'grade_subject_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (case when a.details->>'term' ~ '^[12]$' then (a.details->>'term')::int else cfg.t end) = cfg.t
     group by 1, 2
  ),
  dr as (
    select (e->>'section_id')::uuid as sid, (e->>'grade_subject_id')::uuid as gid,
           max(to_timestamp((e->>'at')::bigint / 1000.0)) as at
      from jsonb_array_elements(case when jsonb_typeof(p_drafts) = 'array' then p_drafts else '[]'::jsonb end) e, cfg
     where e->>'section_id'       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and e->>'grade_subject_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and e->>'at' ~ '^[0-9]{10,14}$'
       and (e->>'term') = cfg.t::text
     group by 1, 2
  ),
  pairs as (
    select coalesce(act.sid, dr.sid) as sid, coalesce(act.gid, dr.gid) as gid,
           act.last_event as ev, act.filled, act.total, dr.at as draft_at
      from act full join dr on dr.sid = act.sid and dr.gid = act.gid
  ),
  calc as (
    select p.*,
           (select count(*) from public.assessment_components c where c.grade_subject_id = p.gid) as n_comps,
           (select count(*) from public.submissions s, cfg
             where s.section_id = p.sid and s.term = cfg.t and s.academic_year = cfg.y
               and s.component_id in (select c.id from public.assessment_components c where c.grade_subject_id = p.gid)) as n_saved,
           (select max(coalesce(s.last_edited_at, s.submitted_at)) from public.submissions s, cfg
             where s.section_id = p.sid and s.term = cfg.t and s.academic_year = cfg.y
               and s.component_id in (select c.id from public.assessment_components c where c.grade_subject_id = p.gid)) as last_save
      from pairs p
  )
  select c.sid, c.gid,
         case when c.n_saved = 0 then 'unsaved' else 'edit' end,
         (c.draft_at is not null and c.draft_at > coalesce(c.last_save, '-infinity'::timestamptz)),
         greatest(c.ev, c.draft_at),
         c.filled, c.total,
         s.name, g.name, sub.name
    from calc c
    join me on true
    join public.teacher_assignments ta on ta.teacher_id = me.uid and ta.section_id = c.sid and ta.grade_subject_id = c.gid
    join public.sections s on s.id = c.sid
    join public.grades g on g.id = s.grade_id
    join public.grade_subjects gs on gs.id = c.gid
    join public.subjects sub on sub.id = gs.subject_id
   where c.n_comps > 0
     and ( coalesce(c.ev, '-infinity'::timestamptz) > coalesce(c.last_save, '-infinity'::timestamptz)
        or coalesce(c.draft_at, '-infinity'::timestamptz) > coalesce(c.last_save, '-infinity'::timestamptz) )
   order by greatest(c.ev, c.draft_at) desc
   limit 30
$$;

revoke all on function public.my_unsaved_sheets(jsonb) from public;
grant execute on function public.my_unsaved_sheets(jsonb) to authenticated;
notify pgrst, 'reload schema';
