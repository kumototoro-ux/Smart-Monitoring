-- =====================================================================
--  مِرقاة — كشف المواظبة والسلوك (تقييم منفصل لا يدخل في مجموع الدرجات)
--  شغّل هذا الملف مرة واحدة في SQL Editor، وإعادة تشغيله آمنة.
--
--  • لكل معلمة كشف لكل شعبة تدرّس فيها (بغض النظر عن مادتها) لكل فصل وعام.
--  • الصفوف الرقمية: درجتان من 100 (المواظبة، السلوك). الصفوف اللفظية (التمهيدي/الأول/الثاني):
--    اختيار إيجابي = 100، وغير ذلك = 0، ويُترجم في الإشعار إلى العبارة اللفظية.
--  • عند إصدار الإشعار يُحسب متوسط كل المعلمات اللواتي رصدن للطالب.
--  • القفل وطلب التعديل مثل كشوف المواد (نافذة تعديل ثم طلب فتح).
--  • الميزة مطفأة افتراضيًا حتى تفعّلها الأدمن من الإعدادات.
-- =====================================================================

alter table public.settings add column if not exists conduct_enabled boolean not null default false;
alter table public.settings add column if not exists conduct_min_subjects smallint not null default 3
  check (conduct_min_subjects between 1 and 30);

create table if not exists public.conduct_sheets (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references public.sections(id) on delete cascade,
  teacher_id     uuid references public.profiles(id) on delete cascade,   -- null = ملف الفرع
  term           smallint not null check (term in (1, 2)),
  academic_year  text not null,
  submitted_by   uuid references public.profiles(id) on delete set null,
  submitted_at   timestamptz not null default now(),
  edit_until     timestamptz not null,
  unlocked_until timestamptz,
  last_edited_at timestamptz,
  version        integer not null default 1,
  unique (section_id, teacher_id, term, academic_year)
);
create unique index if not exists conduct_sheets_branchfile_uq
  on public.conduct_sheets (section_id, term, academic_year) where teacher_id is null;
create index if not exists conduct_sheets_teacher_idx on public.conduct_sheets (teacher_id);

create table if not exists public.conduct_scores (
  sheet_id   uuid not null references public.conduct_sheets(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance numeric(5,2) check (attendance is null or attendance between 0 and 100),
  behavior   numeric(5,2) check (behavior   is null or behavior   between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (sheet_id, student_id)
);
create index if not exists conduct_scores_student_idx on public.conduct_scores (student_id);

alter table public.conduct_sheets enable row level security;
alter table public.conduct_scores enable row level security;

drop policy if exists conduct_sheets_read on public.conduct_sheets;
create policy conduct_sheets_read on public.conduct_sheets for select to authenticated using (
  public.is_admin() or teacher_id = auth.uid() or public.is_supervisor_of(public.section_branch(section_id))
);
drop policy if exists conduct_scores_read on public.conduct_scores;
create policy conduct_scores_read on public.conduct_scores for select to authenticated using (
  exists (select 1 from public.conduct_sheets cs where cs.id = sheet_id)
);

-- ---------------------------------------------------------------------
-- فتح كشف المعلمة لشعبة (الطلاب وما رُصد وحالة القفل)
-- ---------------------------------------------------------------------
create or replace function public.conduct_load(p_section uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_set settings%rowtype; v_sec sections%rowtype; v_grade grades%rowtype;
  v_sh conduct_sheets%rowtype; v_editable boolean; v_students jsonb;
begin
  if public.auth_role() is distinct from 'teacher' then
    raise exception using message = 'كشف المواظبة والسلوك للمعلمات', hint = 'FORBIDDEN';
  end if;
  if not public.teaches_section(p_section) then
    raise exception using message = 'هذه الشعبة غير مسندة لك', hint = 'FORBIDDEN';
  end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then
    raise exception using message = 'كشف المواظبة والسلوك غير مفعّل بعد', hint = 'CONFLICT';
  end if;
  select * into v_sec from sections where id = p_section;
  select * into v_grade from grades where id = v_sec.grade_id;
  select * into v_sh from conduct_sheets
   where section_id = p_section and teacher_id = auth.uid() and term = v_set.current_term and academic_year = v_set.academic_year;
  v_editable := v_set.grading_open and (v_sh.id is null
                  or now() <= greatest(v_sh.edit_until, coalesce(v_sh.unlocked_until, '-infinity'::timestamptz)));

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.full_name, 'number', s.student_number,
      'attendance', cs.attendance, 'behavior', cs.behavior,
      'graded', (select count(distinct c.grade_subject_id) from results r
                   join assessment_components c on c.id = r.component_id
                  where r.student_id = s.id and r.term = v_set.current_term and r.academic_year = v_set.academic_year)
    ) order by s.full_name), '[]'::jsonb)
    into v_students
    from students s
    left join conduct_scores cs on cs.sheet_id = v_sh.id and cs.student_id = s.id
   where s.section_id = p_section and s.is_active;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'section_id', p_section, 'section_name', v_sec.name, 'grade_name', v_grade.name, 'mode', v_grade.assessment_mode,
      'term', v_set.current_term, 'year', v_set.academic_year, 'grading_open', v_set.grading_open,
      'saved', v_sh.id is not null, 'edit_until', v_sh.edit_until, 'unlocked_until', v_sh.unlocked_until,
      'editable', v_editable, 'min_subjects', v_set.conduct_min_subjects, 'version', v_sh.version),
    'students', v_students);
end $$;

-- ---------------------------------------------------------------------
-- حفظ كشف المعلمة: p_rows = [{student_id, attendance, behavior}] (null = لم يُرصد)
-- ---------------------------------------------------------------------
create or replace function public.conduct_save(p_section uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_set settings%rowtype; v_sec sections%rowtype; v_mode public.assessment_mode;
  v_sh conduct_sheets%rowtype; v_n int; v_bad int; v_saved int;
begin
  if public.auth_role() is distinct from 'teacher' then
    raise exception using message = 'كشف المواظبة والسلوك للمعلمات', hint = 'FORBIDDEN';
  end if;
  if not public.teaches_section(p_section) then
    perform write_log('conduct.forbidden', 'security', 'section', p_section::text, '{}'::jsonb);
    raise exception using message = 'هذه الشعبة غير مسندة لك', hint = 'FORBIDDEN';
  end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then raise exception using message = 'كشف المواظبة والسلوك غير مفعّل', hint = 'CONFLICT'; end if;
  if not v_set.grading_open then raise exception using message = 'الرصد مغلق حالياً من الإدارة', hint = 'CLOSED'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception using message = 'الكشف فارغ', hint = 'EMPTY';
  end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception using message = 'عدد الطلاب كبير', hint = 'VALIDATION'; end if;

  select * into v_sec from sections where id = p_section;
  select assessment_mode into v_mode from grades where id = v_sec.grade_id;

  create temp table _c on commit drop as
    select (x->>'student_id')::uuid as student_id,
           nullif(x->>'attendance', '')::numeric as attendance,
           nullif(x->>'behavior', '')::numeric as behavior
    from jsonb_array_elements(p_rows) x;

  select count(*) into v_n from _c;
  select count(*) into v_bad from _c c
   where not exists (select 1 from students s where s.id = c.student_id and s.section_id = p_section and s.is_active);
  if v_bad > 0 then raise exception using message = 'يوجد طالب ليس في هذه الشعبة', hint = 'INVALID'; end if;
  select count(*) into v_bad from _c where (attendance is not null and (attendance < 0 or attendance > 100))
                                       or (behavior   is not null and (behavior   < 0 or behavior   > 100));
  if v_bad > 0 then raise exception using message = 'القيمة يجب أن تكون بين 0 و100', hint = 'VALIDATION'; end if;
  if v_mode = 'verbal' then
    select count(*) into v_bad from _c where (attendance is not null and attendance not in (0, 100))
                                         or (behavior   is not null and behavior   not in (0, 100));
    if v_bad > 0 then raise exception using message = 'الرصد لفظي: اختاري أحد الخيارين', hint = 'VALIDATION'; end if;
  end if;

  select * into v_sh from conduct_sheets
   where section_id = p_section and teacher_id = auth.uid() and term = v_set.current_term and academic_year = v_set.academic_year
   for update;
  if v_sh.id is null then
    insert into conduct_sheets (section_id, teacher_id, term, academic_year, submitted_by, edit_until)
    values (p_section, auth.uid(), v_set.current_term, v_set.academic_year, auth.uid(),
            now() + make_interval(days => v_set.edit_window_days))
    returning * into v_sh;
  else
    if now() > greatest(v_sh.edit_until, coalesce(v_sh.unlocked_until, '-infinity'::timestamptz)) then
      perform write_log('conduct.locked', 'warning', 'section', p_section::text, '{}'::jsonb);
      raise exception using message = 'الكشف مقفل، اطلبي فتح التعديل', hint = 'LOCKED';
    end if;
    update conduct_sheets set version = version + 1, last_edited_at = now() where id = v_sh.id;
  end if;

  insert into conduct_scores (sheet_id, student_id, attendance, behavior)
  select v_sh.id, student_id, attendance, behavior from _c
  on conflict (sheet_id, student_id) do update
    set attendance = excluded.attendance, behavior = excluded.behavior, updated_at = now();
  get diagnostics v_saved = row_count;

  perform write_log('conduct.save', 'info', 'section', p_section::text,
    jsonb_build_object('students', v_n, 'term', v_set.current_term));
  return jsonb_build_object('saved', v_saved);
end $$;

-- ---------------------------------------------------------------------
-- متوسط المواظبة والسلوك للإشعار: يجمع كل الكشوف المحفوظة للطالب في الفصل
-- ---------------------------------------------------------------------
create or replace function public.notice_conduct(p_students uuid[], p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_set settings%rowtype; v_out jsonb;
begin
  if public.auth_role() is null then raise exception using message = 'غير مصرّح', hint = 'AUTH'; end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(student_id, jsonb_build_object('attendance', att, 'behavior', beh, 'n', n)), '{}'::jsonb)
    into v_out
  from (
    select cs.student_id,
           round(avg(cs.attendance), 2) as att, round(avg(cs.behavior), 2) as beh, count(*) as n
      from conduct_scores cs
      join conduct_sheets sh on sh.id = cs.sheet_id
      join students st on st.id = cs.student_id
     where cs.student_id = any (p_students) and sh.term = p_term and sh.academic_year = v_set.academic_year
       and (public.is_admin() or public.can_view_branch(st.branch_id))
     group by cs.student_id
  ) q;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- مراجعة الطلب: نفس الدالة الأصلية + فتح كشف المواظبة والسلوك عند الموافقة
-- (طلب نوعه other وحمولته kind = conduct_unlock)
-- ---------------------------------------------------------------------
create or replace function public.review_request(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_r   requests%rowtype;
  v_set settings%rowtype;
  v_sec sections%rowtype;
begin
  select * into v_r from requests where id = p_request for update;
  if v_r.id is null then
    raise exception using message = 'الطلب غير موجود', hint = 'NOT_FOUND';
  end if;
  if not (public.is_admin() or public.is_supervisor_of(v_r.branch_id)) then
    perform write_log('request.review_forbidden', 'security', 'request', p_request::text, '{}'::jsonb);
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  if v_r.status <> 'pending' then
    raise exception using message = 'تمت مراجعة هذا الطلب مسبقاً', hint = 'DONE';
  end if;
  select * into v_set from settings where id = 1;

  if p_approve then
    if v_r.type = 'unlock_sheet' then
      update submissions
         set unlocked_until = now() + make_interval(hours => v_set.unlock_hours)
       where section_id = v_r.section_id and grade_subject_id = v_r.grade_subject_id
         and term = coalesce(v_r.term, v_set.current_term) and academic_year = v_set.academic_year;
    elsif v_r.type = 'other' and v_r.payload->>'kind' = 'conduct_unlock' then
      update conduct_sheets
         set unlocked_until = now() + make_interval(hours => v_set.unlock_hours)
       where section_id = v_r.section_id and teacher_id = v_r.requested_by
         and term = coalesce(v_r.term, v_set.current_term) and academic_year = v_set.academic_year;
    elsif v_r.type = 'add_student' then
      select * into v_sec from sections where id = v_r.section_id;
      insert into students (branch_id, grade_id, section_id, full_name, national_id, student_number,
                            gender, source, needs_review, created_by)
      values (v_sec.branch_id, v_sec.grade_id, v_sec.id,
              btrim(v_r.payload->>'full_name'),
              nullif(btrim(v_r.payload->>'national_id'), ''),
              nullif(btrim(v_r.payload->>'student_number'), ''),
              case when v_r.payload->>'gender' in ('male','female') then (v_r.payload->>'gender')::public.gender_type end,
              'supervisor', false, auth.uid());
    elsif v_r.type = 'remove_student' and v_r.student_id is not null then
      update students set is_active = false where id = v_r.student_id;
    end if;
  end if;

  update requests
     set status = case when p_approve then 'approved'::public.request_status else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
   where id = p_request;

  perform write_log(case when p_approve then 'request.approve' else 'request.reject' end, 'info',
    'request', p_request::text, jsonb_build_object('type', v_r.type));
end $$;

revoke all on function public.conduct_load(uuid)                 from public, anon;
revoke all on function public.conduct_save(uuid, jsonb)          from public, anon;
revoke all on function public.notice_conduct(uuid[], smallint)   from public, anon;
grant execute on function public.conduct_load(uuid)               to authenticated;
grant execute on function public.conduct_save(uuid, jsonb)        to authenticated;
grant execute on function public.notice_conduct(uuid[], smallint) to authenticated;
