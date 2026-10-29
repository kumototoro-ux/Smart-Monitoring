-- =====================================================================
--  مِرقاة — توزيع الطلاب على الشعب
--  الطلاب المستوردون بدون شعبة يظهرون في "قائمة طلاب الصف" لفرعهم،
--  والمعلمة تختار منهم طلاب شعبتها.
--  شغّل هذا الملف مرة واحدة في SQL Editor
-- =====================================================================

-- طلاب نفس الصف ونفس الفرع الذين ليس لهم شعبة
create or replace function public.section_pool(p_section uuid)
returns table (id uuid, full_name text, national_id text, student_number text, gender public.gender_type)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sec sections%rowtype;
  v_teacher boolean := public.auth_role() = 'teacher';
begin
  select * into v_sec from sections where sections.id = p_section;
  if v_sec.id is null or not (
       public.teaches_section(p_section) or public.is_admin() or public.is_supervisor_of(v_sec.branch_id)) then
    raise exception using message = 'غير مصرّح لك بهذه الشعبة', hint = 'FORBIDDEN';
  end if;

  return query
    select s.id, s.full_name,
           -- المعلمة ترى آخر 4 أرقام فقط من الهوية
           case when s.national_id is null then null
                when v_teacher then '••••••' || right(s.national_id, 4)
                else s.national_id end,
           s.student_number, s.gender
      from students s
     where s.branch_id = v_sec.branch_id
       and s.grade_id = v_sec.grade_id
       and s.section_id is null
       and s.is_active
     order by s.full_name;
end $$;

-- ضم طلاب من قائمة الصف إلى الشعبة
-- يُضم فقط من لا يزال بدون شعبة (لو سبقتك معلمة أخرى لا يُنقل)
create or replace function public.claim_students(p_section uuid, p_students uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sec sections%rowtype;
  v_done int;
begin
  select * into v_sec from sections where id = p_section;
  if v_sec.id is null or not (
       public.teaches_section(p_section) or public.is_admin() or public.is_supervisor_of(v_sec.branch_id)) then
    raise exception using message = 'غير مصرّح لك بهذه الشعبة', hint = 'FORBIDDEN';
  end if;
  if coalesce(array_length(p_students, 1), 0) = 0 then
    raise exception using message = 'اختاري طالباً واحداً على الأقل', hint = 'INVALID';
  end if;
  if array_length(p_students, 1) > 200 then
    raise exception using message = 'الحد الأقصى 200 طالب في المرة', hint = 'INVALID';
  end if;

  update students
     set section_id = p_section
   where id = any(p_students)
     and branch_id = v_sec.branch_id
     and grade_id = v_sec.grade_id
     and section_id is null
     and is_active;
  get diagnostics v_done = row_count;

  perform write_log('student.claim', 'info', 'section', p_section::text,
    jsonb_build_object('requested', array_length(p_students, 1), 'claimed', v_done));

  return jsonb_build_object('claimed', v_done, 'skipped', array_length(p_students, 1) - v_done);
end $$;

-- إرجاع طلاب من الشعبة إلى قائمة الصف (طالب ليس من هذه الشعبة)
create or replace function public.release_students(p_section uuid, p_students uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_sec sections%rowtype;
  v_done int;
begin
  select * into v_sec from sections where id = p_section;
  if v_sec.id is null or not (
       public.teaches_section(p_section) or public.is_admin() or public.is_supervisor_of(v_sec.branch_id)) then
    raise exception using message = 'غير مصرّح لك بهذه الشعبة', hint = 'FORBIDDEN';
  end if;

  update students set section_id = null
   where id = any(p_students) and section_id = p_section;
  get diagnostics v_done = row_count;

  perform write_log('student.release', 'warning', 'section', p_section::text,
    jsonb_build_object('count', v_done, 'students', to_jsonb(p_students)));
  return v_done;
end $$;

revoke execute on function public.section_pool(uuid) from anon;
revoke execute on function public.claim_students(uuid, uuid[]) from anon;
revoke execute on function public.release_students(uuid, uuid[]) from anon;
grant execute on function public.section_pool(uuid) to authenticated;
grant execute on function public.claim_students(uuid, uuid[]) to authenticated;
grant execute on function public.release_students(uuid, uuid[]) to authenticated;
