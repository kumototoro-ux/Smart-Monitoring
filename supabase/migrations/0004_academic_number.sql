-- =====================================================================
--  مِرقاة — الرقم الأكاديمي هو المعرّف الأساسي للطالب
--  رقم الهوية قد يتكرر (إخوة بهوية الأب) أو لا يوجد، فلا يُشترط فريداً.
--  شغّل هذا الملف مرة واحدة في SQL Editor
-- =====================================================================

-- 1) رقم الهوية: يُسمح بتكراره
drop index if exists public.students_national_id_uq;
create index if not exists students_national_id_idx on public.students(national_id);

-- 2) الرقم الأكاديمي: فريد (NULL مسموح لأكثر من طالب)
-- إذا ظهر خطأ هنا فهناك رقم أكاديمي مكرر حالياً — احذفي التكرار ثم أعيدي التشغيل
create unique index if not exists students_student_number_uq on public.students(student_number);

-- 3) الحقول الإضافية
alter table public.students add column if not exists name_en     text;
alter table public.students add column if not exists birth_date  text;  -- نص: يقبل الهجري والميلادي كما هو في المصدر
alter table public.students add column if not exists nationality text;
alter table public.students add column if not exists id_type     text;

-- 4) إضافة المعلمة لطالب: التحقق من الرقم الأكاديمي بدل الهوية
create or replace function public.teacher_add_student(
  p_section uuid, p_full_name text, p_gender text default null,
  p_national_id text default null, p_student_number text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sec sections%rowtype;
  v_id  uuid;
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_num  text := nullif(btrim(coalesce(p_student_number, '')), '');
  v_nid  text := nullif(btrim(coalesce(p_national_id, '')), '');
begin
  if not (public.teaches_section(p_section) or public.is_admin() or public.is_supervisor_of(public.section_branch(p_section))) then
    raise exception using message = 'غير مصرّح لك بالإضافة لهذه الشعبة', hint = 'FORBIDDEN';
  end if;
  if char_length(v_name) < 6 or v_name !~ '\s' then
    raise exception using message = 'اكتبي اسم الطالب ثلاثياً على الأقل', hint = 'INVALID';
  end if;
  if v_nid is not null and char_length(v_nid) > 20 then
    raise exception using message = 'رقم الهوية طويل جداً', hint = 'INVALID';
  end if;
  if v_num is not null and exists (select 1 from students where student_number = v_num) then
    raise exception using message = 'الرقم الأكاديمي مسجّل لطالب آخر — ابحثي عنه في قائمة طلاب الصف أو ارفعي طلباً للمشرفة', hint = 'DUPLICATE';
  end if;

  select * into v_sec from sections where id = p_section;
  insert into students (branch_id, grade_id, section_id, full_name, national_id, student_number,
                        gender, source, needs_review, created_by)
  values (v_sec.branch_id, v_sec.grade_id, v_sec.id, v_name, v_nid, v_num,
          case when p_gender in ('male','female') then p_gender::public.gender_type end,
          case public.auth_role() when 'teacher' then 'teacher'::public.student_source
                                  when 'supervisor' then 'supervisor' else 'admin' end,
          public.auth_role() = 'teacher', auth.uid())
  returning id into v_id;

  perform write_log('student.add', 'info', 'student', v_id::text,
    jsonb_build_object('section_id', p_section, 'name', v_name, 'student_number', v_num));
  return v_id;
end $$;
