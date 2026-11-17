-- =====================================================================
--  مِرقاة — نظرة على الأعوام الدراسية (قراءة فقط، لا تغيّر أي بيانات)
--  شغّل هذا الملف مرة واحدة في SQL Editor، وإعادة تشغيله آمنة.
--  تُرجع لكل (عام، فرع، صف، فصل): عدد التسليمات والدرجات والطلاب المرصودين.
--  للأدمن فقط.
-- =====================================================================
create or replace function public.year_overview()
returns table (academic_year text, branch_id uuid, grade_id uuid, term smallint,
               submissions bigint, results bigint, students_graded bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'غير مصرّح' using hint = 'FORBIDDEN';
  end if;
  return query
    select r.academic_year, sc.branch_id, sc.grade_id, r.term,
           count(distinct r.submission_id)::bigint,
           count(*)::bigint,
           count(distinct r.student_id)::bigint
    from public.results r
    join public.submissions sb on sb.id = r.submission_id
    join public.sections sc on sc.id = sb.section_id
    group by r.academic_year, sc.branch_id, sc.grade_id, r.term;
end $$;

revoke all on function public.year_overview() from public, anon;
grant execute on function public.year_overview() to authenticated;
