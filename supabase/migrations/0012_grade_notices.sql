-- =====================================================================
--  مِرقاة للرصد الذكي — إشعارات درجات الفصل (0012)
--  1) إعدادات الإشعار العامة + إعدادات كل فرع (المديرة، الشعار، التوقيع، الختم)
--  2) مربية الفصل (إسناد من الأدمن)
--  3) الأسماء الإنجليزية للمواد والصفوف
--  4) دوال الإصدار: كل التحقق من الصلاحية والاكتمال داخل قاعدة البيانات
--  5) مخزن خاص لصور الشعارات
--  شغّل هذا الملف مرة واحدة في SQL Editor (آمن لإعادة التشغيل)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الأسماء الإنجليزية
-- ---------------------------------------------------------------------
alter table public.subjects add column if not exists name_en text;
alter table public.grades   add column if not exists name_en text;

-- ---------------------------------------------------------------------
-- 2) الإعدادات (صف واحد عام + صف لكل فرع) — JSON مرن، تتحقق منه الواجهة
-- ---------------------------------------------------------------------
create table if not exists public.notice_settings (
  id         smallint primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.notice_settings (id) values (1) on conflict do nothing;

create table if not exists public.notice_branch_settings (
  branch_id  uuid primary key references public.branches(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- مربية الفصل: معلمة واحدة لكل شعبة
create table if not exists public.class_teachers (
  section_id  uuid primary key references public.sections(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists class_teachers_teacher_idx on public.class_teachers(teacher_id);

alter table public.notice_settings        enable row level security;
alter table public.notice_branch_settings enable row level security;
alter table public.class_teachers         enable row level security;

drop policy if exists notice_read  on public.notice_settings;
drop policy if exists notice_write on public.notice_settings;
create policy notice_read  on public.notice_settings for select to authenticated using (public.auth_role() is not null);
create policy notice_write on public.notice_settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists notice_branch_read  on public.notice_branch_settings;
drop policy if exists notice_branch_write on public.notice_branch_settings;
create policy notice_branch_read  on public.notice_branch_settings for select to authenticated using (public.can_view_branch(branch_id));
create policy notice_branch_write on public.notice_branch_settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists class_teachers_read  on public.class_teachers;
drop policy if exists class_teachers_write on public.class_teachers;
create policy class_teachers_read on public.class_teachers for select to authenticated using (
  teacher_id = auth.uid() or public.is_admin() or public.is_supervisor_of(public.section_branch(section_id))
);
create policy class_teachers_write on public.class_teachers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3) الصلاحية: من يستطيع إصدار إشعارات شعبة؟
--    الأدمن دائماً. غيره: يلزم تفعيل الإصدار من الأدمن، ثم السماح لدوره
-- ---------------------------------------------------------------------
create or replace function public.notice_can(p_section uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  d jsonb;
  r public.user_role := public.auth_role();
begin
  if r is null then return false; end if;
  if r = 'admin' then return true; end if;
  select data into d from notice_settings where id = 1;
  if not coalesce((d->>'enabled')::boolean, false) then return false; end if;
  if r = 'supervisor' then
    return coalesce((d->>'allow_supervisor')::boolean, false) and public.auth_branch() = public.section_branch(p_section);
  end if;
  if r = 'teacher' then
    return coalesce((d->>'allow_homeroom')::boolean, false)
       and exists (select 1 from class_teachers where section_id = p_section and teacher_id = auth.uid());
  end if;
  return false;
end $$;
revoke all on function public.notice_can(uuid) from public, anon;
grant execute on function public.notice_can(uuid) to authenticated;

-- هل لدى المستخدم الحالي ما يصدره؟ (لإظهار القائمة الجانبية)
create or replace function public.notice_has_access()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  d jsonb;
  r public.user_role := public.auth_role();
begin
  if r is null then return false; end if;
  if r = 'admin' then return true; end if;
  select data into d from notice_settings where id = 1;
  if not coalesce((d->>'enabled')::boolean, false) then return false; end if;
  if r = 'supervisor' then return coalesce((d->>'allow_supervisor')::boolean, false); end if;
  return coalesce((d->>'allow_homeroom')::boolean, false)
     and exists (select 1 from class_teachers where teacher_id = auth.uid());
end $$;
revoke all on function public.notice_has_access() from public, anon;
grant execute on function public.notice_has_access() to authenticated;

-- ---------------------------------------------------------------------
-- 4) المواد الناقصة لطالب في ترم (داخلية): مادة لها نوع تقييم بلا نتيجة
--    الغياب يُعدّ مرصوداً. المستثنى من المادة أو من الفرع لا يُحسب
-- ---------------------------------------------------------------------
create or replace function public.notice_missing(p_student uuid, p_term smallint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('subject', sub.name, 'teacher', t.full_name) order by gs.sort_order), '[]'::jsonb)
  from students s
  join grade_subjects gs on gs.grade_id = s.grade_id
  join subjects sub on sub.id = gs.subject_id
  left join lateral (
    select p.full_name from teacher_assignments ta join profiles p on p.id = ta.teacher_id
    where ta.section_id = s.section_id and ta.grade_subject_id = gs.id limit 1
  ) t on true
  where s.id = p_student
    and not exists (select 1 from branch_subject_exclusions e where e.branch_id = s.branch_id and e.grade_subject_id = gs.id)
    and not exists (select 1 from sheet_exclusions x where x.student_id = s.id and x.grade_subject_id = gs.id
                      and x.academic_year = (select academic_year from settings where id = 1))
    and exists (select 1 from assessment_components c where c.grade_subject_id = gs.id)
    and exists (
      select 1 from assessment_components c
      where c.grade_subject_id = gs.id
        and not exists (select 1 from results r where r.student_id = s.id and r.component_id = c.id
                          and r.term = p_term and r.academic_year = (select academic_year from settings where id = 1))
    )
$$;
revoke all on function public.notice_missing(uuid, smallint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) الشعب التي يستطيع المستخدم الإصدار لها
-- ---------------------------------------------------------------------
create or replace function public.notice_sections()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sc.id, 'name', sc.name, 'branch_id', sc.branch_id, 'branch', b.name,
    'grade_id', sc.grade_id, 'grade', g.name, 'grade_sort', g.sort_order, 'sort', sc.sort_order,
    'homeroom', hp.full_name
  ) order by b.name, g.sort_order, sc.sort_order, sc.name), '[]'::jsonb)
  from sections sc
  join branches b on b.id = sc.branch_id
  join grades g on g.id = sc.grade_id
  left join class_teachers ct on ct.section_id = sc.id
  left join profiles hp on hp.id = ct.teacher_id
  where sc.is_active and public.notice_can(sc.id)
$$;
revoke all on function public.notice_sections() from public, anon;
grant execute on function public.notice_sections() to authenticated;

-- ---------------------------------------------------------------------
-- 6) طلاب شعبة مع جاهزية إشعار كل طالب
-- ---------------------------------------------------------------------
create or replace function public.notice_roster(p_section uuid, p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not public.notice_can(p_section) then
    raise exception using message = 'غير مصرّح لك بإصدار إشعارات هذه الشعبة', hint = 'FORBIDDEN';
  end if;
  select coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'id', s.id, 'full_name', s.full_name, 'student_number', s.student_number,
      'missing', jsonb_array_length(public.notice_missing(s.id, p_term))
    ) as x
    from students s where s.section_id = p_section and s.is_active
  ) q;
  return v_out;
end $$;
revoke all on function public.notice_roster(uuid, smallint) from public, anon;
grant execute on function public.notice_roster(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------
-- 7) بيانات إشعار طالب
--    غير الأدمن لا يحصل على الدرجات إن كان الرصد ناقصاً (يُرجع القائمة الناقصة فقط)
-- ---------------------------------------------------------------------
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
    'homeroom', (select p.full_name from class_teachers ct join profiles p on p.id = ct.teacher_id where ct.section_id = s.section_id),
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
                order by c.sort_order limit 1)
  ) order by gs.sort_order), '[]'::jsonb) into v_subjects
  from grade_subjects gs
  join subjects sub on sub.id = gs.subject_id
  where gs.grade_id = s.grade_id
    and exists (select 1 from assessment_components c where c.grade_subject_id = gs.id)
    and not exists (select 1 from branch_subject_exclusions e where e.branch_id = s.branch_id and e.grade_subject_id = gs.id)
    and not exists (select 1 from sheet_exclusions x where x.student_id = s.id and x.grade_subject_id = gs.id and x.academic_year = st.academic_year);

  return v_head || jsonb_build_object('subjects', v_subjects);
end $$;
revoke all on function public.notice_student(uuid, smallint) from public, anon;
grant execute on function public.notice_student(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------
-- 8) مخزن خاص لصور الإشعار (يُقرأ ويُكتب من الخادم فقط)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notice-assets', 'notice-assets', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
