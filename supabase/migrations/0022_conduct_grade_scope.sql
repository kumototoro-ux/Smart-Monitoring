-- 0022: تحديد الصفوف التي تشملها المواظبة والسلوك (التمهيدي بلا مواظبة وسلوك)
alter table public.grades add column if not exists conduct_applies boolean not null default true;
update public.grades set conduct_applies = false where name like '%تمهيد%' and conduct_applies;

-- ينظّف ما أضافه «رصد الكل» سابقًا لصفوف مستثناة (لا يمس رصد المعلمات)
delete from public.conduct_scores cs using public.students st, public.grades g
 where st.id = cs.student_id and g.id = st.grade_id and not g.conduct_applies and cs.source = 'admin_fill';
delete from public.conduct_sheets sh where sh.teacher_id is null
   and not exists (select 1 from public.conduct_scores c where c.sheet_id = sh.id);

create or replace function public.conduct_fill_all(p_branch uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_set settings%rowtype; n_students int := 0; n_sections int := 0; n_low int := 0; n_already int := 0;
begin
  if not public.is_admin() then raise exception using message = 'للمسؤول فقط', hint = 'FORBIDDEN'; end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then raise exception using message = 'فعّلي كشف المواظبة والسلوك أولاً', hint = 'CONFLICT'; end if;

  create temp table _el on commit drop as
  select s.id as student_id, s.section_id, s.branch_id, s.grade_id,
         (select count(distinct c.grade_subject_id) from results r
            join assessment_components c on c.id = r.component_id
           where r.student_id = s.id and r.term = v_set.current_term and r.academic_year = v_set.academic_year) as graded
    from students s
   where s.is_active and s.section_id is not null and (p_branch is null or s.branch_id = p_branch)
     and coalesce((select g.conduct_applies from grades g where g.id = s.grade_id), true);

  select count(*) into n_low from _el where graded < v_set.conduct_min_subjects;
  delete from _el where graded < v_set.conduct_min_subjects;

  -- كشف الأدمن لكل شعبة
  insert into conduct_sheets (section_id, teacher_id, term, academic_year, submitted_by, edit_until)
  select distinct e.section_id, null::uuid, v_set.current_term, v_set.academic_year, auth.uid(), now()
    from _el e
   where not exists (select 1 from conduct_sheets x where x.section_id = e.section_id and x.teacher_id is null
                      and x.term = v_set.current_term and x.academic_year = v_set.academic_year);

  with ins as (
    insert into conduct_scores (sheet_id, student_id, attendance, behavior, source)
    select x.id, e.student_id, 100, 100, 'admin_fill'
      from _el e join conduct_sheets x on x.section_id = e.section_id and x.teacher_id is null
                                      and x.term = v_set.current_term and x.academic_year = v_set.academic_year
    on conflict (sheet_id, student_id) do nothing
    returning student_id
  ) select count(*) into n_students from ins;
  select count(*) into n_already from _el;
  n_already := n_already - n_students;
  select count(distinct section_id) into n_sections from _el;

  perform write_log('conduct.fill_all', 'warning', 'branch', coalesce(p_branch::text, 'all'),
    jsonb_build_object('filled', n_students, 'already', n_already, 'below_min', n_low, 'term', v_set.current_term));
  return jsonb_build_object('filled', n_students, 'already', n_already, 'below_min', n_low, 'sections', n_sections);
end $$;

create or replace function public.conduct_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_set settings%rowtype; v_out jsonb;
begin
  if not public.is_admin() then raise exception using message = 'للمسؤول فقط', hint = 'FORBIDDEN'; end if;
  select * into v_set from settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object('branch_id', b.id, 'branch', b.name, 'students', q.students, 'eligible', q.eligible,
                                               'teacher', q.t, 'admin', q.a) order by b.name), '[]'::jsonb)
    into v_out
  from branches b
  join lateral (
    select count(*) as students,
           count(*) filter (where g >= v_set.conduct_min_subjects) as eligible,
           count(*) filter (where t) as t, count(*) filter (where a and not t) as a
      from (
        select s.id,
               (select count(distinct c.grade_subject_id) from results r join assessment_components c on c.id = r.component_id
                 where r.student_id = s.id and r.term = v_set.current_term and r.academic_year = v_set.academic_year) as g,
               exists (select 1 from conduct_scores cs join conduct_sheets sh on sh.id = cs.sheet_id
                        where cs.student_id = s.id and sh.teacher_id is not null and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year) as t,
               exists (select 1 from conduct_scores cs join conduct_sheets sh on sh.id = cs.sheet_id
                        where cs.student_id = s.id and sh.teacher_id is null and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year) as a
          from students s where s.branch_id = b.id and s.is_active
           and coalesce((select g.conduct_applies from grades g where g.id = s.grade_id), true)
      ) z
  ) q on true;
  return v_out;
end $$;


-- تغيير حالة الصف (للأدمن)
create or replace function public.set_grade_conduct(p_grade uuid, p_applies boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception using message = 'للمسؤول فقط', hint = 'FORBIDDEN'; end if;
  update grades set conduct_applies = p_applies where id = p_grade;
  if not found then raise exception using message = 'الصف غير موجود', hint = 'NOT_FOUND'; end if;
  perform write_log('conduct.grade_toggle', 'info', 'grade', p_grade::text, jsonb_build_object('applies', p_applies));
end $$;
revoke all on function public.set_grade_conduct(uuid, boolean) from public, anon;
grant execute on function public.set_grade_conduct(uuid, boolean) to authenticated;
revoke all on function public.conduct_fill_all(uuid) from public, anon;
grant execute on function public.conduct_fill_all(uuid) to authenticated;
revoke all on function public.conduct_admin_stats() from public, anon;
grant execute on function public.conduct_admin_stats() to authenticated;
