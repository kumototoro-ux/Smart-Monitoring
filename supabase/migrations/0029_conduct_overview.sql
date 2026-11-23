-- 0029: ملخص المواظبة والسلوك لكل شعبة (لصفحة الأدمن والمشرفة): العدد، المكتمل، المعدّل يدوياً، المنخفض
-- يعرض الأدمن كل الشعب والمشرفة شعب فرعها فقط. شغّليه مرة واحدة، وإعادة تشغيله آمنة.
create or replace function public.conduct_manage_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_set settings%rowtype; v_ids uuid[]; v_out jsonb;
begin
  if not (public.is_admin() or public.auth_role() = 'supervisor') then
    raise exception using message = 'غير مصرّح', hint = 'FORBIDDEN';
  end if;
  select * into v_set from settings where id = 1;
  select array_agg(s.id) into v_ids
    from students s join sections sec on sec.id = s.section_id
   where s.is_active and sec.is_active and (public.is_admin() or sec.branch_id = public.auth_branch());

  select coalesce(jsonb_agg(jsonb_build_object(
      'section_id', q.section_id, 'students', q.students, 'done', q.done, 'manual', q.manual, 'low', q.low)), '[]'::jsonb)
    into v_out
  from (
    select s.section_id, count(*)::int as students,
           count(*) filter (where e.att is not null and e.beh is not null)::int as done,
           count(*) filter (where coalesce(e.manual, false))::int as manual,
           count(*) filter (where e.att < 50 or e.beh < 50)::int as low
      from students s
      left join public.conduct_effective(coalesce(v_ids, '{}'::uuid[]), v_set.current_term, v_set.academic_year) e on e.student_id = s.id
     where s.id = any (coalesce(v_ids, '{}'::uuid[]))
     group by s.section_id
  ) q;
  return v_out;
end $$;
revoke all on function public.conduct_manage_overview() from public, anon;
grant execute on function public.conduct_manage_overview() to authenticated;
