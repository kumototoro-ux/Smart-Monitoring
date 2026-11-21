-- 0027: اسم مربية الفصل بدون حساب — يُعرض في الشهادة وسجل الإصدار
-- إن كان للشعبة مربية مُسنَدة بحساب فاسمها هو المعتمد، وإلا يُعرض الاسم المكتوب يدوياً
alter table public.sections add column if not exists homeroom_name text;

create or replace function public.section_homeroom(p_section uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.full_name from class_teachers ct join profiles p on p.id = ct.teacher_id where ct.section_id = p_section),
    nullif(btrim((select homeroom_name from sections where id = p_section)), '')
  )
$$;
revoke all on function public.section_homeroom(uuid) from public, anon;
grant execute on function public.section_homeroom(uuid) to authenticated;

create or replace function public.notice_student(p_student uuid, p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s   students%rowtype;
  st  settings%rowtype;
  sec sections%rowtype;
  gr  grades%rowtype;
  v_missing jsonb;
  v_subjects jsonb;
  v_head jsonb;
begin
  select * into s from students where id = p_student;
  if not found then raise exception using message = 'الطالب غير موجود', hint = 'NOT_FOUND'; end if;
  if s.section_id is null then raise exception using message = 'الطالب غير مسند لشعبة', hint = 'INVALID'; end if;
  if not public.notice_can(s.section_id) then
    raise exception using message = 'غير مصرّح لك بإصدار هذا الإشعار', hint = 'FORBIDDEN';
  end if;
  if p_term not in (1, 2) then raise exception using message = 'الترم غير صحيح', hint = 'INVALID'; end if;
  select * into st from settings where id = 1;
  select * into sec from sections where id = s.section_id;
  select * into gr from grades where id = s.grade_id;
  v_missing := public.notice_missing(s.id, p_term);

  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', s.id, 'name', s.full_name, 'name_en', s.name_en, 'national_id', s.national_id,
      'number', s.student_number, 'birth_date', s.birth_date, 'nationality', s.nationality, 'gender', s.gender),
    'branch', (select jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code) from branches b where b.id = s.branch_id),
    'grade', jsonb_build_object('name', gr.name, 'name_en', gr.name_en, 'mode', gr.assessment_mode,
             'stage', (select name from stages where id = gr.stage_id)),
    'section', sec.name,
    'homeroom', public.section_homeroom(s.section_id),
    'term', p_term, 'year', st.academic_year, 'school', st.school_name,
    'missing', v_missing, 'complete', jsonb_array_length(v_missing) = 0
  ) into v_head;

  if jsonb_array_length(v_missing) > 0 and not public.is_admin() then
    return v_head || jsonb_build_object('subjects', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gs.id, 'name', sub.name, 'name_en', sub.name_en,
    'max', (select coalesce(sum(c.max_score), 0) from assessment_components c where c.grade_subject_id = gs.id),
    'total', (select sum(r.score) from results r join assessment_components c on c.id = r.component_id
                where c.grade_subject_id = gs.id and r.student_id = s.id and r.term = p_term and r.academic_year = st.academic_year and not r.is_absent),
    'recorded', (select count(*) from results r join assessment_components c on c.id = r.component_id
                where c.grade_subject_id = gs.id and r.student_id = s.id and r.term = p_term and r.academic_year = st.academic_year),
    'comps', (select count(*) from assessment_components c where c.grade_subject_id = gs.id),
    'absent', (select bool_or(r.is_absent) from results r join assessment_components c on c.id = r.component_id
                where c.grade_subject_id = gs.id and r.student_id = s.id and r.term = p_term and r.academic_year = st.academic_year),
    'level', (select vl.label from results r join assessment_components c on c.id = r.component_id
                join verbal_levels vl on vl.id = r.verbal_level_id
                where c.grade_subject_id = gs.id and r.student_id = s.id and r.term = p_term and r.academic_year = st.academic_year
                order by c.sort_order limit 1),
    'parts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'max', c.max_score, 'score', r.score, 'absent', coalesce(r.is_absent, false)) order by c.sort_order), '[]'::jsonb)
                from assessment_components c
                left join results r on r.component_id = c.id and r.student_id = s.id and r.term = p_term and r.academic_year = st.academic_year
                where c.grade_subject_id = gs.id)
  ) order by gs.sort_order), '[]'::jsonb) into v_subjects
  from grade_subjects gs
  join subjects sub on sub.id = gs.subject_id
  where gs.grade_id = s.grade_id
    and exists (select 1 from assessment_components c where c.grade_subject_id = gs.id)
    and not exists (select 1 from branch_subject_exclusions e where e.branch_id = s.branch_id and e.grade_subject_id = gs.id)
    -- المستبعد من الكشف يُخفى، إلا إن كانت له درجات مرصودة فعلاً في الترم (لا تُحجب درجات حقيقية)
    and (
      not exists (select 1 from sheet_exclusions x where x.student_id = s.id and x.grade_subject_id = gs.id and x.academic_year = st.academic_year)
      or exists (select 1 from results r join assessment_components c on c.id = r.component_id
                  where c.grade_subject_id = gs.id and r.student_id = s.id and r.term = p_term and r.academic_year = st.academic_year)
    );

  return v_head || jsonb_build_object('subjects', v_subjects);
end $$;

revoke all on function public.notice_student(uuid, smallint) from public, anon;
grant execute on function public.notice_student(uuid, smallint) to authenticated;


create or replace function public.notice_sections()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sc.id, 'name', sc.name, 'branch_id', sc.branch_id, 'branch', b.name,
    'grade_id', sc.grade_id, 'grade', g.name, 'grade_sort', g.sort_order, 'sort', sc.sort_order,
    'homeroom', public.section_homeroom(sc.id)
  ) order by b.name, g.sort_order, sc.sort_order, sc.name), '[]'::jsonb)
  from sections sc
  join branches b on b.id = sc.branch_id
  join grades g on g.id = sc.grade_id
  where sc.is_active and public.notice_can(sc.id)
$$;
revoke all on function public.notice_sections() from public, anon;
grant execute on function public.notice_sections() to authenticated;

create or replace function public.notice_issue_summary(p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_year text; v_out jsonb;
begin
  if coalesce(public.auth_role() in ('admin', 'supervisor'), false) is not true then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  select academic_year into v_year from settings where id = 1;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.branch, q.grade_sort, q.section), '[]'::jsonb) into v_out
  from (
    select sec.id as section_id, b.id as branch_id, b.name as branch, g.id as grade_id, g.name as grade,
           g.sort_order as grade_sort, sec.name as section, public.section_homeroom(sec.id) as homeroom,
           coalesce(st.n, 0)::int as students,
           coalesce(i.issued, 0)::int as issued, coalesce(i.total, 0)::int as total,
           i.last_at, i.last_by
    from sections sec
    join branches b on b.id = sec.branch_id
    join grades g on g.id = sec.grade_id
    left join lateral (select count(*) as n from students s where s.section_id = sec.id and s.is_active) st on true
    left join lateral (
      select count(distinct ni.student_id) as issued, count(*) as total, max(ni.created_at) as last_at,
             (array_agg(ni.issuer_name order by ni.created_at desc))[1] as last_by
      from notice_issues ni
      where ni.section_id = sec.id and ni.term = p_term and ni.academic_year = v_year
    ) i on true
    where sec.is_active and (public.is_admin() or sec.branch_id = public.auth_branch())
  ) q;
  return v_out;
end $$;
revoke all on function public.notice_issue_summary(smallint) from public, anon;
grant execute on function public.notice_issue_summary(smallint) to authenticated;
