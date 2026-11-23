-- 0028: تعديل المواظبة والسلوك من الأدمن والمشرفة (فرعها فقط) — رصد «يدوي» له أولوية في الإشعار
-- • التعديل يُحفظ في كشف الفرع (teacher_id = null) بمصدر 'manual' ولا يمسّ كشوف المعلمات
-- • الأولوية في الإشعار لكل بند: يدوي ← متوسط المعلمات ← رصد الأدمن/الملف
-- • حذف القيمة اليدوية (ترك الخانة فارغة) يعيد البند لما كان قبلها
-- شغّليه كاملاً مرة واحدة، وإعادة تشغيله آمنة.

-- القيمة الفعلية التي يراها الإشعار (دالة داخلية بلا صلاحية مباشرة)
create or replace function public.conduct_effective(p_students uuid[], p_term smallint, p_year text)
returns table (student_id uuid, att numeric, beh numeric, n int, manual boolean)
language sql stable security definer set search_path = public as $$
  with rws as (
    select cs.student_id, cs.attendance, cs.behavior, cs.source, (sh.teacher_id is not null) as by_teacher
      from conduct_scores cs join conduct_sheets sh on sh.id = cs.sheet_id
     where cs.student_id = any (p_students) and sh.term = p_term and sh.academic_year = p_year
  ), oth as (
    select * from rws where source is distinct from 'manual'
  ), pick as (
    select student_id, bool_or(by_teacher) as has_t from oth group by student_id
  ), avgs as (
    select o.student_id, avg(o.attendance) as a, avg(o.behavior) as b, count(*)::int as n
      from oth o join pick p on p.student_id = o.student_id and o.by_teacher = p.has_t
     group by o.student_id
  ), man as (
    select student_id, attendance, behavior from rws where source = 'manual'
  )
  select i.student_id, round(coalesce(m.attendance, a.a), 2), round(coalesce(m.behavior, a.b), 2),
         greatest(coalesce(a.n, 0), case when m.student_id is not null then 1 else 0 end),
         m.student_id is not null
    from (select distinct student_id from rws) i
    left join avgs a on a.student_id = i.student_id
    left join man m on m.student_id = i.student_id
$$;
revoke all on function public.conduct_effective(uuid[], smallint, text) from public, anon, authenticated;

create or replace function public.notice_conduct(p_students uuid[], p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_set settings%rowtype; v_out jsonb;
begin
  if public.auth_role() is null then raise exception using message = 'غير مصرّح', hint = 'AUTH'; end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(e.student_id, jsonb_build_object('attendance', e.att, 'behavior', e.beh, 'n', e.n)), '{}'::jsonb)
    into v_out
    from public.conduct_effective(p_students, p_term, v_set.academic_year) e
    join students st on st.id = e.student_id
   where public.is_admin() or public.can_view_branch(st.branch_id);
  return v_out;
end $$;
revoke all on function public.notice_conduct(uuid[], smallint) from public, anon;
grant execute on function public.notice_conduct(uuid[], smallint) to authenticated;

-- فتح شعبة للتعديل (أدمن، أو مشرفة فرع الشعبة)
create or replace function public.conduct_manage_load(p_section uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_set settings%rowtype; v_sec sections%rowtype; v_grade grades%rowtype; v_students jsonb;
begin
  if not (public.is_admin() or public.is_supervisor_of(public.section_branch(p_section))) then
    perform write_log('conduct.forbidden', 'security', 'section', p_section::text, '{}'::jsonb);
    raise exception using message = 'غير مصرّح لك بهذه الشعبة', hint = 'FORBIDDEN';
  end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then raise exception using message = 'كشف المواظبة والسلوك غير مفعّل بعد', hint = 'CONFLICT'; end if;
  select * into v_sec from sections where id = p_section;
  if v_sec.id is null then raise exception using message = 'الشعبة غير موجودة', hint = 'NOT_FOUND'; end if;
  select * into v_grade from grades where id = v_sec.grade_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.full_name, 'number', s.student_number,
      'attendance', e.att, 'behavior', e.beh, 'manual', coalesce(e.manual, false),
      'm_att', m.attendance, 'm_beh', m.behavior,
      't_att', t.a, 't_beh', t.b,
      'graded', (select count(distinct c.grade_subject_id) from results r
                   join assessment_components c on c.id = r.component_id
                  where r.student_id = s.id and r.term = v_set.current_term and r.academic_year = v_set.academic_year)
    ) order by s.full_name), '[]'::jsonb)
    into v_students
    from students s
    left join lateral (select * from public.conduct_effective(array[s.id], v_set.current_term, v_set.academic_year) limit 1) e on true
    left join lateral (
      select cs.attendance, cs.behavior from conduct_scores cs join conduct_sheets sh on sh.id = cs.sheet_id
       where cs.student_id = s.id and cs.source = 'manual' and sh.teacher_id is null
         and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year limit 1) m on true
    left join lateral (
      select round(avg(cs.attendance), 2) as a, round(avg(cs.behavior), 2) as b
        from conduct_scores cs join conduct_sheets sh on sh.id = cs.sheet_id
       where cs.student_id = s.id and sh.teacher_id is not null
         and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year) t on true
   where s.section_id = p_section and s.is_active;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'section_id', p_section, 'section_name', v_sec.name, 'grade_name', v_grade.name, 'mode', v_grade.assessment_mode,
      'term', v_set.current_term, 'year', v_set.academic_year, 'min_subjects', v_set.conduct_min_subjects,
      'applies', coalesce(v_grade.conduct_applies, true)),
    'students', v_students);
end $$;

-- حفظ التعديلات: p_rows = [{student_id, attendance, behavior}] — null في بند = لا قيمة يدوية له، وفي البندين = حذف الرصد اليدوي
create or replace function public.conduct_manage_save(p_section uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_set settings%rowtype; v_sec sections%rowtype; v_grade grades%rowtype;
  v_sh conduct_sheets%rowtype; v_n int; v_bad int; v_saved int := 0; v_removed int := 0;
begin
  if not (public.is_admin() or public.is_supervisor_of(public.section_branch(p_section))) then
    perform write_log('conduct.forbidden', 'security', 'section', p_section::text, '{}'::jsonb);
    raise exception using message = 'غير مصرّح لك بهذه الشعبة', hint = 'FORBIDDEN';
  end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then raise exception using message = 'كشف المواظبة والسلوك غير مفعّل', hint = 'CONFLICT'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception using message = 'لا توجد تعديلات', hint = 'EMPTY';
  end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception using message = 'عدد الطلاب كبير', hint = 'VALIDATION'; end if;
  select * into v_sec from sections where id = p_section;
  select * into v_grade from grades where id = v_sec.grade_id;
  if coalesce(v_grade.conduct_applies, true) is false then
    raise exception using message = 'المواظبة والسلوك لا تنطبق على هذا الصف', hint = 'CONFLICT';
  end if;

  create temp table _m on commit drop as
    select (x->>'student_id')::uuid as student_id,
           nullif(x->>'attendance', '')::numeric as attendance,
           nullif(x->>'behavior', '')::numeric as behavior
    from jsonb_array_elements(p_rows) x;

  select count(*) into v_n from _m;
  select count(*) into v_bad from _m c
   where not exists (select 1 from students s where s.id = c.student_id and s.section_id = p_section and s.is_active);
  if v_bad > 0 then
    perform write_log('conduct.foreign_student', 'security', 'section', p_section::text, '{}'::jsonb);
    raise exception using message = 'يوجد طالب ليس في هذه الشعبة', hint = 'INVALID';
  end if;
  select count(*) into v_bad from _m where (attendance is not null and (attendance < 0 or attendance > 100))
                                       or (behavior   is not null and (behavior   < 0 or behavior   > 100));
  if v_bad > 0 then raise exception using message = 'القيمة يجب أن تكون بين 0 و100', hint = 'VALIDATION'; end if;
  if v_grade.assessment_mode = 'verbal' then
    select count(*) into v_bad from _m where (attendance is not null and attendance not in (0, 100))
                                         or (behavior   is not null and behavior   not in (0, 100));
    if v_bad > 0 then raise exception using message = 'الرصد لفظي: اختاري أحد الخيارين', hint = 'VALIDATION'; end if;
  end if;

  select * into v_sh from conduct_sheets
   where section_id = p_section and teacher_id is null and term = v_set.current_term and academic_year = v_set.academic_year
   for update;
  if v_sh.id is null then
    insert into conduct_sheets (section_id, teacher_id, term, academic_year, submitted_by, edit_until)
    values (p_section, null, v_set.current_term, v_set.academic_year, auth.uid(), now())
    returning * into v_sh;
  else
    update conduct_sheets set version = version + 1, last_edited_at = now() where id = v_sh.id;
  end if;

  -- حذف الرصد اليدوي حيث البندان فارغان
  delete from conduct_scores cs using _m m
   where cs.sheet_id = v_sh.id and cs.student_id = m.student_id and cs.source = 'manual'
     and m.attendance is null and m.behavior is null;
  get diagnostics v_removed = row_count;

  insert into conduct_scores (sheet_id, student_id, attendance, behavior, source)
  select v_sh.id, student_id, attendance, behavior, 'manual' from _m where attendance is not null or behavior is not null
  on conflict (sheet_id, student_id) do update
    set attendance = excluded.attendance, behavior = excluded.behavior, source = 'manual', updated_at = now();
  get diagnostics v_saved = row_count;

  perform write_log('conduct.manage_save', 'info', 'section', p_section::text,
    jsonb_build_object('students', v_n, 'saved', v_saved, 'removed', v_removed, 'term', v_set.current_term));
  return jsonb_build_object('saved', v_saved, 'removed', v_removed);
end $$;

revoke all on function public.conduct_manage_load(uuid) from public, anon;
revoke all on function public.conduct_manage_save(uuid, jsonb) from public, anon;
grant execute on function public.conduct_manage_load(uuid) to authenticated;
grant execute on function public.conduct_manage_save(uuid, jsonb) to authenticated;
