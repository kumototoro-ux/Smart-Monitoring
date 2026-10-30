-- =====================================================================
--  مِرقاة — تحسين ضم الطلاب للشعبة
--  الطالب مرتبط بالشعبة (وليس بالمعلمة): إذا ضمته أي معلمة لشعبة أ
--  يظهر تلقائياً في كشوف كل معلمات شعبة أ لكل المواد.
--  هذا التحديث يميّز بين: طالب ضُم الآن / موجود أصلاً في نفس الشعبة / أخذته شعبة أخرى
-- =====================================================================
create or replace function public.claim_students(p_section uuid, p_students uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sec sections%rowtype;
  v_done int;
  v_here int;
  v_total int := coalesce(array_length(p_students, 1), 0);
begin
  select * into v_sec from sections where id = p_section;
  if v_sec.id is null or not (
       public.teaches_section(p_section) or public.is_admin() or public.is_supervisor_of(v_sec.branch_id)) then
    raise exception using message = 'غير مصرّح لك بهذه الشعبة', hint = 'FORBIDDEN';
  end if;
  if v_total = 0 then
    raise exception using message = 'اختاري طالباً واحداً على الأقل', hint = 'INVALID';
  end if;
  if v_total > 200 then
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

  -- من كان موجوداً في نفس الشعبة قبل الضغط (ضمته زميلة من نفس الشعبة)
  select count(*) - v_done into v_here from students
   where id = any(p_students) and section_id = p_section;

  perform write_log('student.claim', 'info', 'section', p_section::text,
    jsonb_build_object('requested', v_total, 'claimed', v_done, 'already_here', v_here));

  return jsonb_build_object('claimed', v_done, 'already', v_here, 'skipped', v_total - v_done - v_here);
end $$;
