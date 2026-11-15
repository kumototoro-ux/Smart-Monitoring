-- =====================================================================
--  مِرقاة للرصد الذكي — إشعارات الدرجات: إصدار الشعبة وتسريع القائمة (0013)
--  يعتمد على 0012. آمن لإعادة التشغيل.
-- =====================================================================

-- قائمة طلاب الشعبة مع جاهزية كل طالب: السنة تُقرأ مرة واحدة بدل تكرارها لكل طالب
create or replace function public.notice_roster(p_section uuid, p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_year text;
  v_out  jsonb;
begin
  if not public.notice_can(p_section) then
    raise exception using message = 'غير مصرّح لك بإصدار إشعارات هذه الشعبة', hint = 'FORBIDDEN';
  end if;
  select academic_year into v_year from settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'full_name', s.full_name, 'student_number', s.student_number, 'missing', m.n
         ) order by s.full_name), '[]'::jsonb)
    into v_out
  from students s
  cross join lateral (
    select count(*)::int as n
    from grade_subjects gs
    where gs.grade_id = s.grade_id
      and not exists (select 1 from branch_subject_exclusions e where e.branch_id = s.branch_id and e.grade_subject_id = gs.id)
      and not exists (select 1 from sheet_exclusions x where x.student_id = s.id and x.grade_subject_id = gs.id and x.academic_year = v_year)
      and exists (select 1 from assessment_components c where c.grade_subject_id = gs.id
                    and not exists (select 1 from results r where r.student_id = s.id and r.component_id = c.id
                                      and r.term = p_term and r.academic_year = v_year))
  ) m
  where s.section_id = p_section and s.is_active;
  return v_out;
end $$;
revoke all on function public.notice_roster(uuid, smallint) from public, anon;
grant execute on function public.notice_roster(uuid, smallint) to authenticated;

-- إشعارات الشعبة كلها دفعة واحدة (للأدمن والمشرفة فقط): مصفوفة بنفس شكل notice_student
create or replace function public.notice_section(p_section uuid, p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (coalesce(public.auth_role() in ('admin', 'supervisor'), false) and public.notice_can(p_section)) then
    raise exception using message = 'إصدار إشعارات الشعبة كاملة للأدمن والمشرفة فقط', hint = 'FORBIDDEN';
  end if;
  return coalesce((
    select jsonb_agg(public.notice_student(s.id, p_term) order by s.full_name)
    from students s where s.section_id = p_section and s.is_active
  ), '[]'::jsonb);
end $$;
revoke all on function public.notice_section(uuid, smallint) from public, anon;
grant execute on function public.notice_section(uuid, smallint) to authenticated;
