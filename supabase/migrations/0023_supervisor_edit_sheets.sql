-- 0023: تعديل المشرفة لكشوف فرعها (الترم الحالي فقط)، وتُسجَّل كل عملية باسمها في سجل الأحداث

create or replace function public.save_sheet(
  p_section uuid, p_grade_subject uuid, p_term smallint, p_entries jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role     public.user_role := public.auth_role();
  v_set      settings%rowtype;
  v_sec      sections%rowtype;
  v_gs       grade_subjects%rowtype;
  v_mode     public.assessment_mode;
  v_comp     record;
  v_sub      submissions%rowtype;
  v_ids      uuid[];
  v_expected int;
  v_got      int;
  v_bad      int;
  v_saved    int := 0;
  v_is_new   boolean;
begin
  -- 1) الصلاحية
  if v_role is null then
    raise exception using message = 'انتهت الجلسة، سجّلي الدخول من جديد', hint = 'AUTH';
  end if;
  -- المشرفة: تعدّل كشوف فرعها فقط
  if v_role = 'supervisor' and not public.is_supervisor_of(public.section_branch(p_section)) then
    perform write_log('grade.forbidden', 'security', 'section', p_section::text,
      jsonb_build_object('grade_subject_id', p_grade_subject, 'reason', 'other_branch'));
    raise exception using message = 'هذا الكشف ليس من فرعك', hint = 'FORBIDDEN';
  end if;
  if v_role = 'teacher' and not public.teaches(p_section, p_grade_subject) then
    perform write_log('grade.forbidden', 'security', 'section', p_section::text,
      jsonb_build_object('grade_subject_id', p_grade_subject));
    raise exception using message = 'هذا الكشف غير مسند لك', hint = 'FORBIDDEN';
  end if;

  select * into v_set from settings where id = 1;
  select * into v_sec from sections where id = p_section;
  select * into v_gs  from grade_subjects where id = p_grade_subject;
  if v_sec.id is null or v_gs.id is null or v_gs.grade_id <> v_sec.grade_id then
    raise exception using message = 'بيانات الكشف غير صحيحة', hint = 'INVALID';
  end if;
  select assessment_mode into v_mode from grades where id = v_gs.grade_id;

  -- 2) فترة الرصد والترم
  if v_role = 'teacher' then
    if not v_set.grading_open then
      raise exception using message = 'الرصد مغلق حالياً من الإدارة', hint = 'CLOSED';
    end if;
    if p_term <> v_set.current_term then
      raise exception using message = 'لا يمكن الرصد إلا للترم الحالي', hint = 'TERM';
    end if;
  end if;

  -- المشرفة تعدّل الترم الحالي فقط (وتتجاوز إغلاق الرصد ومدة التعديل كالأدمن)
  if v_role = 'supervisor' and p_term <> v_set.current_term then
    raise exception using message = 'يمكن التعديل في الترم الحالي فقط', hint = 'TERM';
  end if;

  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception using message = 'الكشف فارغ', hint = 'EMPTY';
  end if;

  -- 3) فك البيانات في جدول مؤقت
  create temp table _e on commit drop as
  select (x->>'student_id')::uuid      as student_id,
         (x->>'component_id')::uuid    as component_id,
         nullif(x->>'score', '')::numeric as score,
         nullif(x->>'verbal_level_id', '')::uuid as verbal_level_id,
         coalesce((x->>'is_absent')::boolean, false) as is_absent
  from jsonb_array_elements(p_entries) x;

  -- التكرار
  select count(*) - count(distinct (student_id, component_id)) into v_bad from _e;
  if v_bad > 0 then
    raise exception using message = 'يوجد تكرار في بيانات الكشف', hint = 'DUPLICATE';
  end if;

  -- أنواع التقييم المرسلة لازم تكون تابعة لهذه المادة
  select array_agg(distinct component_id) into v_ids from _e;
  if exists (select 1 from unnest(v_ids) cid
             where not exists (select 1 from assessment_components c
                               where c.id = cid and c.grade_subject_id = p_grade_subject)) then
    raise exception using message = 'نوع تقييم غير تابع لهذه المادة', hint = 'INVALID';
  end if;

  -- الطلاب المرسلين لازم يكونوا في الكشف
  if exists (select 1 from _e
             where student_id not in (select id from public.sheet_students(p_section, p_grade_subject, v_set.academic_year))) then
    perform write_log('grade.foreign_student', 'security', 'section', p_section::text, '{}'::jsonb);
    raise exception using message = 'يوجد طالب غير موجود في هذا الكشف', hint = 'INVALID';
  end if;

  -- 4) الاكتمال: كل طالب × كل نوع تقييم
  select count(*) into v_expected from public.sheet_students(p_section, p_grade_subject, v_set.academic_year);
  for v_comp in select * from assessment_components where id = any(v_ids) loop
    select count(*) into v_got from _e e
     where e.component_id = v_comp.id
       and (e.is_absent or e.score is not null or e.verbal_level_id is not null);
    if v_got < v_expected then
      raise exception using
        message = format('لم يكتمل رصد "%s": %s من %s طالب', v_comp.name, v_got, v_expected),
        hint = 'INCOMPLETE';
    end if;

    -- 5) صحة القيم
    if v_mode = 'numeric' then
      if v_comp.max_score is null then
        raise exception using message = format('لم تُحدد الدرجة العظمى لـ "%s"', v_comp.name), hint = 'CONFIG';
      end if;
      select count(*) into v_bad from _e e
       where e.component_id = v_comp.id and not e.is_absent
         and (e.score is null or e.verbal_level_id is not null
              or e.score < 0 or e.score > v_comp.max_score
              or e.score * 4 <> trunc(e.score * 4));   -- يسمح بـ .25 و .5 و .75
      if v_bad > 0 then
        perform write_log('grade.invalid_score', 'warning', 'component', v_comp.id::text,
          jsonb_build_object('count', v_bad, 'max', v_comp.max_score));
        raise exception using
          message = format('يوجد %s درجة غير صحيحة في "%s" (العظمى %s)', v_bad, v_comp.name, v_comp.max_score),
          hint = 'OVER_MAX';
      end if;
    else
      select count(*) into v_bad from _e e
       where e.component_id = v_comp.id and not e.is_absent
         and (e.score is not null or e.verbal_level_id is null
              or not exists (select 1 from verbal_levels vl
                             where vl.id = e.verbal_level_id and vl.grade_id = v_gs.grade_id));
      if v_bad > 0 then
        raise exception using message = format('يوجد تقييم لفظي غير صحيح في "%s"', v_comp.name), hint = 'INVALID';
      end if;
    end if;

    -- 6) نافذة التعديل
    select * into v_sub from submissions
     where section_id = p_section and component_id = v_comp.id
       and term = p_term and academic_year = v_set.academic_year
     for update;

    v_is_new := v_sub.id is null;
    if not v_is_new and v_role = 'teacher'
       and now() > greatest(v_sub.edit_until, coalesce(v_sub.unlocked_until, '-infinity'::timestamptz)) then
      perform write_log('grade.locked_attempt', 'warning', 'submission', v_sub.id::text, '{}'::jsonb);
      raise exception using
        message = format('انتهت مدة تعديل "%s". ارفعي طلب فتح للمشرفة', v_comp.name),
        hint = 'LOCKED';
    end if;

    if v_is_new then
      insert into submissions (section_id, grade_subject_id, component_id, term, academic_year,
                               submitted_by, edit_until)
      values (p_section, p_grade_subject, v_comp.id, p_term, v_set.academic_year,
              auth.uid(), now() + make_interval(days => v_set.edit_window_days))
      returning * into v_sub;
    else
      update submissions
         set last_edited_at = now(), version = version + 1
       where id = v_sub.id
      returning * into v_sub;
    end if;

    insert into results (student_id, component_id, submission_id, term, academic_year,
                         score, verbal_level_id, is_absent, updated_by, updated_at)
    select e.student_id, e.component_id, v_sub.id, p_term, v_set.academic_year,
           case when e.is_absent then null else e.score end,
           case when e.is_absent then null else e.verbal_level_id end,
           e.is_absent, auth.uid(), now()
    from _e e where e.component_id = v_comp.id
    on conflict (student_id, component_id, term, academic_year) do update
      set score = excluded.score,
          verbal_level_id = excluded.verbal_level_id,
          is_absent = excluded.is_absent,
          submission_id = excluded.submission_id,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;

    get diagnostics v_got = row_count;
    v_saved := v_saved + v_got;

    perform write_log(case when v_is_new then 'grade.submit' else 'grade.edit' end, 'info',
      'submission', v_sub.id::text,
      jsonb_build_object('section_id', p_section, 'grade_subject_id', p_grade_subject,
                         'component', v_comp.name, 'term', p_term, 'rows', v_got, 'version', v_sub.version));
  end loop;

  return jsonb_build_object('saved', v_saved, 'students', v_expected);
end $$;

revoke all on function public.save_sheet(uuid, uuid, smallint, jsonb) from public, anon;
grant execute on function public.save_sheet(uuid, uuid, smallint, jsonb) to authenticated;
