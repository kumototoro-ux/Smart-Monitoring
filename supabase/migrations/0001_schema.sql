-- =====================================================================
--  مِرقاة للرصد الذكي — قاعدة البيانات
--  الجداول + الصلاحيات (RLS) + الدوال الآمنة للرصد + سجل التتبع
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- =====================================================================

-- ---------------------------------------------------------------------
-- الأنواع
-- ---------------------------------------------------------------------
create type public.user_role       as enum ('admin', 'supervisor', 'teacher');
create type public.assessment_mode as enum ('numeric', 'verbal');
create type public.gender_type     as enum ('male', 'female');
create type public.student_source  as enum ('import', 'admin', 'supervisor', 'teacher');
create type public.request_type    as enum ('unlock_sheet', 'add_student', 'remove_student', 'other');
create type public.request_status  as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.log_severity    as enum ('info', 'warning', 'error', 'security');

-- ---------------------------------------------------------------------
-- دالة تحديث updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- 1) الإعدادات (صف واحد فقط)
-- =====================================================================
create table public.settings (
  id               smallint primary key default 1 check (id = 1),
  school_name      text        not null default 'مدارس دار الهدى',
  academic_year    text        not null default '1447هـ',
  current_term     smallint    not null default 1 check (current_term in (1, 2)),
  grading_open     boolean     not null default false,
  edit_window_days smallint    not null default 3 check (edit_window_days between 0 and 60),
  unlock_hours     smallint    not null default 48 check (unlock_hours between 1 and 720),
  updated_at       timestamptz not null default now()
);
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 2) الفروع
-- =====================================================================
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  code       text unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger branches_touch before update on public.branches
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 3) المراحل والصفوف
-- =====================================================================
create table public.stages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order smallint not null default 0
);

create table public.grades (
  id              uuid primary key default gen_random_uuid(),
  stage_id        uuid not null references public.stages(id) on delete restrict,
  name            text not null unique,
  sort_order      smallint not null default 0,
  assessment_mode public.assessment_mode not null default 'numeric',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index grades_stage_idx on public.grades(stage_id);
create trigger grades_touch before update on public.grades
  for each row execute function public.touch_updated_at();

-- الصفوف الموجودة في كل فرع
create table public.branch_grades (
  branch_id uuid not null references public.branches(id) on delete cascade,
  grade_id  uuid not null references public.grades(id)   on delete cascade,
  primary key (branch_id, grade_id)
);

-- الشعب داخل كل صف في كل فرع
create table public.sections (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null,
  grade_id   uuid not null,
  name       text not null,
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, grade_id, name),
  foreign key (branch_id, grade_id) references public.branch_grades(branch_id, grade_id) on delete cascade,
  constraint sections_grade_id_fkey  foreign key (grade_id)  references public.grades(id)   on delete cascade,
  constraint sections_branch_id_fkey foreign key (branch_id) references public.branches(id) on delete cascade
);
create index sections_branch_idx on public.sections(branch_id);

-- مستويات الرصد اللفظي لكل صف
create table public.verbal_levels (
  id         uuid primary key default gen_random_uuid(),
  grade_id   uuid not null references public.grades(id) on delete cascade,
  label      text not null,
  sort_order smallint not null default 0,
  unique (grade_id, label)
);

-- =====================================================================
-- 4) المواد وربطها بالصفوف وأنواع التقييم
-- =====================================================================
create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  kind       text not null default 'general' check (kind in ('general', 'kg')),
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- المادة داخل الصف (لكل الفروع)
create table public.grade_subjects (
  id         uuid primary key default gen_random_uuid(),
  grade_id   uuid not null references public.grades(id)   on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  sort_order smallint not null default 0,
  unique (grade_id, subject_id)
);
create index grade_subjects_grade_idx on public.grade_subjects(grade_id);

-- استثناء مادة من فرع معيّن (الافتراضي: المادة موجودة في كل الفروع)
create table public.branch_subject_exclusions (
  branch_id        uuid not null references public.branches(id)       on delete cascade,
  grade_subject_id uuid not null references public.grade_subjects(id) on delete cascade,
  primary key (branch_id, grade_subject_id)
);

-- أنواع التقييم لكل مادة في كل صف (أعمال السنة / قصيرة / نهائي ...)
create table public.assessment_components (
  id               uuid primary key default gen_random_uuid(),
  grade_subject_id uuid not null references public.grade_subjects(id) on delete cascade,
  name             text not null,
  max_score        numeric(6,2) check (max_score is null or max_score > 0),
  sort_order       smallint not null default 0,
  unique (grade_subject_id, name)
);
create index components_gs_idx on public.assessment_components(grade_subject_id);

-- إنشاء أنواع التقييم الافتراضية تلقائياً عند ربط مادة بصف
create or replace function public.create_default_components()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode public.assessment_mode;
begin
  select assessment_mode into v_mode from grades where id = new.grade_id;
  if v_mode = 'verbal' then
    insert into assessment_components (grade_subject_id, name, max_score, sort_order)
    values (new.id, 'التقييم', null, 1);
  else
    insert into assessment_components (grade_subject_id, name, max_score, sort_order) values
      (new.id, 'أعمال السنة',        20, 1),
      (new.id, 'الاختبارات القصيرة', 20, 2),
      (new.id, 'الاختبار النهائي',   60, 3);
  end if;
  return new;
end $$;
create trigger grade_subjects_defaults after insert on public.grade_subjects
  for each row execute function public.create_default_components();

-- =====================================================================
-- 5) الحسابات
-- =====================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name     text not null,
  role          public.user_role not null,
  branch_id     uuid references public.branches(id) on delete restrict,
  phone         text,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- المشرفة والمعلمة لازم يكون لها فرع
  check (role = 'admin' or branch_id is not null)
);
create index profiles_branch_idx on public.profiles(branch_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- إسناد المعلمة: شعبة + مادة
create table public.teacher_assignments (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.profiles(id)       on delete cascade,
  section_id       uuid not null references public.sections(id)       on delete cascade,
  grade_subject_id uuid not null references public.grade_subjects(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (teacher_id, section_id, grade_subject_id)
);
create index assignments_teacher_idx on public.teacher_assignments(teacher_id);
create index assignments_section_idx on public.teacher_assignments(section_id);

-- =====================================================================
-- 6) الطلاب
-- =====================================================================
create table public.students (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches(id) on delete restrict,
  grade_id       uuid not null references public.grades(id)   on delete restrict,
  section_id     uuid references public.sections(id)          on delete set null,
  full_name      text not null,
  national_id    text,
  student_number text,
  gender         public.gender_type,
  source         public.student_source not null default 'admin',
  needs_review   boolean not null default false,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index students_national_id_uq on public.students(national_id); -- NULL مسموح لأكثر من طالب
create index students_section_idx on public.students(section_id) where is_active;
create index students_branch_idx  on public.students(branch_id);
create trigger students_touch before update on public.students
  for each row execute function public.touch_updated_at();

-- استبعاد طالب من كشف مادة معيّنة (موجود في الكشف لكنه لا يدرس المادة/الصف)
create table public.sheet_exclusions (
  student_id       uuid not null references public.students(id)       on delete cascade,
  grade_subject_id uuid not null references public.grade_subjects(id) on delete cascade,
  academic_year    text not null,
  reason           text,
  excluded_by      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (student_id, grade_subject_id, academic_year)
);

-- =====================================================================
-- 7) الرصد
-- =====================================================================
-- الكشف: شعبة + مادة + نوع تقييم + ترم
create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  section_id       uuid not null references public.sections(id)              on delete cascade,
  grade_subject_id uuid not null references public.grade_subjects(id)        on delete cascade,
  component_id     uuid not null references public.assessment_components(id) on delete cascade,
  term             smallint not null check (term in (1, 2)),
  academic_year    text not null,
  submitted_by     uuid references public.profiles(id) on delete set null,
  submitted_at     timestamptz not null default now(),
  edit_until       timestamptz not null,
  unlocked_until   timestamptz,
  last_edited_at   timestamptz,
  version          integer not null default 1,
  unique (section_id, component_id, term, academic_year)
);
create index submissions_teacher_idx on public.submissions(submitted_by);
create index submissions_gs_idx      on public.submissions(grade_subject_id);

-- الدرجات
create table public.results (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id)              on delete cascade,
  component_id    uuid not null references public.assessment_components(id) on delete cascade,
  submission_id   uuid not null references public.submissions(id)           on delete cascade,
  term            smallint not null check (term in (1, 2)),
  academic_year   text not null,
  score           numeric(6,2) check (score is null or score >= 0),
  verbal_level_id uuid references public.verbal_levels(id) on delete restrict,
  is_absent       boolean not null default false,
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (student_id, component_id, term, academic_year),
  check (
    (is_absent and score is null and verbal_level_id is null)
    or (not is_absent and ((score is not null)::int + (verbal_level_id is not null)::int) = 1)
  )
);
create index results_submission_idx on public.results(submission_id);

-- =====================================================================
-- 8) الطلبات
-- =====================================================================
create table public.requests (
  id               uuid primary key default gen_random_uuid(),
  type             public.request_type not null,
  status           public.request_status not null default 'pending',
  branch_id        uuid not null references public.branches(id) on delete cascade,
  requested_by     uuid not null references public.profiles(id) on delete cascade,
  section_id       uuid references public.sections(id)       on delete set null,
  grade_subject_id uuid references public.grade_subjects(id) on delete set null,
  term             smallint,
  student_id       uuid references public.students(id)       on delete set null,
  payload          jsonb not null default '{}'::jsonb,
  note             text check (char_length(note) <= 1000),
  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now()
);
create index requests_branch_status_idx on public.requests(branch_id, status);
create index requests_requester_idx     on public.requests(requested_by);

-- =====================================================================
-- 9) سجل التتبع
-- =====================================================================
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_role  public.user_role,
  actor_name  text,
  branch_id   uuid references public.branches(id) on delete set null,
  action      text not null,
  severity    public.log_severity not null default 'info',
  entity      text,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  ip          text,
  user_agent  text
);
create index audit_created_idx  on public.audit_logs(created_at desc);
create index audit_actor_idx    on public.audit_logs(actor_id, created_at desc);
create index audit_severity_idx on public.audit_logs(severity, created_at desc);
create index audit_action_idx   on public.audit_logs(action, created_at desc);

-- =====================================================================
-- دوال مساعدة للصلاحيات
-- =====================================================================
create or replace function public.auth_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function public.auth_branch()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

create or replace function public.is_supervisor_of(p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'supervisor' and public.auth_branch() = p_branch, false)
$$;

-- الأدمن، أو أي مستخدم نشط تابع لنفس الفرع
create or replace function public.can_view_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.auth_branch() = p_branch, false)
$$;

-- هل المعلمة الحالية مسندة لهذه الشعبة؟
create or replace function public.teaches_section(p_section uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teacher_assignments
    where teacher_id = auth.uid() and section_id = p_section
  ) and public.auth_role() = 'teacher'
$$;

create or replace function public.teaches(p_section uuid, p_grade_subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teacher_assignments
    where teacher_id = auth.uid() and section_id = p_section and grade_subject_id = p_grade_subject
  ) and public.auth_role() = 'teacher'
$$;

create or replace function public.section_branch(p_section uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from sections where id = p_section
$$;

-- تسجيل حدث في سجل التتبع (يُستدعى من داخل الدوال)
create or replace function public.write_log(
  p_action text, p_severity public.log_severity, p_entity text, p_entity_id text, p_details jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_p profiles%rowtype;
begin
  select * into v_p from profiles where id = auth.uid();
  insert into audit_logs (actor_id, actor_role, actor_name, branch_id, action, severity, entity, entity_id, details)
  values (v_p.id, v_p.role, v_p.full_name, v_p.branch_id, p_action, p_severity, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end $$;
revoke all on function public.write_log(text, public.log_severity, text, text, jsonb) from public, anon, authenticated;

-- تسجيل حدث من الواجهة (أخطاء الواجهة، محاولات غير مصرّح بها...)
create or replace function public.log_client_event(
  p_action text, p_severity text default 'info', p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_sev public.log_severity;
  v_recent int;
begin
  if auth.uid() is null then return; end if;
  -- حماية من إغراق السجل: 60 حدث كحد أقصى في الدقيقة لكل مستخدم
  select count(*) into v_recent from audit_logs
   where actor_id = auth.uid() and created_at > now() - interval '1 minute';
  if v_recent >= 60 then return; end if;

  v_sev := case when p_severity in ('info','warning','error','security')
                then p_severity::public.log_severity else 'info' end;
  perform write_log(left('client.' || p_action, 80), v_sev, null, null,
                    case when pg_column_size(p_details) > 8000 then '{"truncated":true}'::jsonb else p_details end);
end $$;

-- =====================================================================
-- تفعيل RLS على كل الجداول
-- =====================================================================
alter table public.settings                  enable row level security;
alter table public.branches                  enable row level security;
alter table public.stages                    enable row level security;
alter table public.grades                    enable row level security;
alter table public.branch_grades             enable row level security;
alter table public.sections                  enable row level security;
alter table public.verbal_levels             enable row level security;
alter table public.subjects                  enable row level security;
alter table public.grade_subjects            enable row level security;
alter table public.branch_subject_exclusions enable row level security;
alter table public.assessment_components     enable row level security;
alter table public.profiles                  enable row level security;
alter table public.teacher_assignments       enable row level security;
alter table public.students                  enable row level security;
alter table public.sheet_exclusions          enable row level security;
alter table public.submissions               enable row level security;
alter table public.results                   enable row level security;
alter table public.requests                  enable row level security;
alter table public.audit_logs                enable row level security;

-- ---- بيانات مرجعية: يقرأها كل مستخدم مسجّل، ويعدّلها الأدمن فقط ----
create policy ref_read  on public.settings              for select to authenticated using (true);
create policy ref_write on public.settings              for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ref_read  on public.stages                for select to authenticated using (true);
create policy ref_write on public.stages                for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ref_read  on public.grades                for select to authenticated using (true);
create policy ref_write on public.grades                for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ref_read  on public.verbal_levels         for select to authenticated using (true);
create policy ref_write on public.verbal_levels         for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ref_read  on public.subjects              for select to authenticated using (true);
create policy ref_write on public.subjects              for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ref_read  on public.grade_subjects        for select to authenticated using (true);
create policy ref_write on public.grade_subjects        for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ref_read  on public.assessment_components for select to authenticated using (true);
create policy ref_write on public.assessment_components for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ref_read  on public.branch_subject_exclusions for select to authenticated using (true);
create policy ref_write on public.branch_subject_exclusions for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- الفروع ----
create policy branches_read  on public.branches for select to authenticated using (public.can_view_branch(id));
create policy branches_write on public.branches for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy branch_grades_read  on public.branch_grades for select to authenticated using (public.can_view_branch(branch_id));
create policy branch_grades_write on public.branch_grades for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy sections_read  on public.sections for select to authenticated using (public.can_view_branch(branch_id));
create policy sections_write on public.sections for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- الحسابات: القراءة فقط، والتعديل يتم من السيرفر بعد التحقق ----
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or (public.auth_role() = 'supervisor' and branch_id = public.auth_branch())
);

-- ---- الإسناد ----
create policy assignments_read on public.teacher_assignments for select to authenticated using (
  teacher_id = auth.uid()
  or public.is_admin()
  or public.is_supervisor_of(public.section_branch(section_id))
);
create policy assignments_write on public.teacher_assignments for all to authenticated
  using      (public.is_admin() or public.is_supervisor_of(public.section_branch(section_id)))
  with check (public.is_admin() or public.is_supervisor_of(public.section_branch(section_id)));

-- ---- الطلاب ----
create policy students_read on public.students for select to authenticated using (
  public.is_admin()
  or public.is_supervisor_of(branch_id)
  or (section_id is not null and public.teaches_section(section_id))
);
create policy students_write on public.students for all to authenticated
  using      (public.is_admin() or public.is_supervisor_of(branch_id))
  with check (public.is_admin() or public.is_supervisor_of(branch_id));

create policy exclusions_read on public.sheet_exclusions for select to authenticated using (
  exists (select 1 from students s where s.id = student_id and (
    public.is_admin() or public.is_supervisor_of(s.branch_id)
    or (s.section_id is not null and public.teaches(s.section_id, grade_subject_id))
  ))
);
create policy exclusions_write on public.sheet_exclusions for all to authenticated
  using      (exists (select 1 from students s where s.id = student_id and (public.is_admin() or public.is_supervisor_of(s.branch_id))))
  with check (exists (select 1 from students s where s.id = student_id and (public.is_admin() or public.is_supervisor_of(s.branch_id))));

-- ---- الرصد: قراءة فقط، والكتابة عبر save_sheet ----
create policy submissions_read on public.submissions for select to authenticated using (
  public.is_admin()
  or public.is_supervisor_of(public.section_branch(section_id))
  or public.teaches(section_id, grade_subject_id)
);
create policy results_read on public.results for select to authenticated using (
  exists (select 1 from submissions sb where sb.id = submission_id and (
    public.is_admin()
    or public.is_supervisor_of(public.section_branch(sb.section_id))
    or public.teaches(sb.section_id, sb.grade_subject_id)
  ))
);

-- ---- الطلبات ----
create policy requests_read on public.requests for select to authenticated using (
  requested_by = auth.uid() or public.is_admin() or public.is_supervisor_of(branch_id)
);
create policy requests_insert on public.requests for insert to authenticated with check (
  requested_by = auth.uid()
  and status = 'pending'
  and branch_id = public.auth_branch()
  and public.auth_role() = 'teacher'
);

-- ---- سجل التتبع: الأدمن يرى الكل، والمشرفة ترى فرعها ----
create policy logs_read on public.audit_logs for select to authenticated using (
  public.is_admin() or public.is_supervisor_of(branch_id)
);

-- =====================================================================
-- الدوال الآمنة (RPC)
-- ملاحظة: أي سجل يُكتب قبل raise exception يُلغى مع العملية،
-- لذلك محاولات الرفض (FORBIDDEN / LOCKED / OVER_MAX ...) يسجّلها السيرفر
-- في التطبيق بعد استلام الخطأ (lib/audit.ts).
-- =====================================================================

-- الطلاب الذين يظهرون في كشف (شعبة + مادة) لهذه السنة
create or replace function public.sheet_students(p_section uuid, p_grade_subject uuid, p_year text)
returns setof public.students language sql stable security definer set search_path = public as $$
  select s.* from students s
  where s.section_id = p_section and s.is_active
    and not exists (
      select 1 from sheet_exclusions e
      where e.student_id = s.id and e.grade_subject_id = p_grade_subject and e.academic_year = p_year
    )
  order by s.full_name
$$;
revoke all on function public.sheet_students(uuid, uuid, text) from public, anon, authenticated;

-- حالة الكشف: هل يمكن التعديل؟
create or replace function public.sheet_status(p_section uuid, p_grade_subject uuid, p_term smallint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_set settings%rowtype;
  v_out jsonb;
begin
  if not (public.is_admin()
          or public.is_supervisor_of(public.section_branch(p_section))
          or public.teaches(p_section, p_grade_subject)) then
    raise exception using message = 'غير مصرّح لك بهذا الكشف', hint = 'FORBIDDEN';
  end if;
  select * into v_set from settings where id = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'component_id', c.id,
           'submission_id', sb.id,
           'submitted_at', sb.submitted_at,
           'edit_until', sb.edit_until,
           'unlocked_until', sb.unlocked_until,
           'version', sb.version,
           'editable', (sb.id is null) or now() <= greatest(sb.edit_until, coalesce(sb.unlocked_until, '-infinity'::timestamptz))
         ) order by c.sort_order), '[]'::jsonb)
    into v_out
  from assessment_components c
  left join submissions sb
    on sb.component_id = c.id and sb.section_id = p_section
   and sb.term = p_term and sb.academic_year = v_set.academic_year
  where c.grade_subject_id = p_grade_subject;

  return jsonb_build_object(
    'grading_open', v_set.grading_open,
    'current_term', v_set.current_term,
    'academic_year', v_set.academic_year,
    'components', v_out
  );
end $$;

-- ---------------------------------------------------------------------
-- حفظ الكشف — كل التحققات تتم هنا داخل قاعدة البيانات
-- p_entries: [{ "student_id": uuid, "component_id": uuid,
--               "score": number|null, "verbal_level_id": uuid|null, "is_absent": bool }]
-- ---------------------------------------------------------------------
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
  if v_role = 'supervisor' then
    raise exception using message = 'المشرفة لا ترصد الدرجات', hint = 'FORBIDDEN';
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

-- ---------------------------------------------------------------------
-- المعلمة تضيف طالباً ناقصاً في كشفها
-- ---------------------------------------------------------------------
create or replace function public.teacher_add_student(
  p_section uuid, p_full_name text, p_gender text default null,
  p_national_id text default null, p_student_number text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sec sections%rowtype;
  v_id  uuid;
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  if not (public.teaches_section(p_section) or public.is_admin() or public.is_supervisor_of(public.section_branch(p_section))) then
    perform write_log('student.add_forbidden', 'security', 'section', p_section::text, '{}'::jsonb);
    raise exception using message = 'غير مصرّح لك بالإضافة لهذه الشعبة', hint = 'FORBIDDEN';
  end if;
  if char_length(v_name) < 6 or v_name !~ '\s' then
    raise exception using message = 'اكتبي اسم الطالب ثلاثياً على الأقل', hint = 'INVALID';
  end if;
  if p_national_id is not null and btrim(p_national_id) <> '' and btrim(p_national_id) !~ '^[0-9]{10}$' then
    raise exception using message = 'رقم الهوية يجب أن يكون 10 أرقام', hint = 'INVALID';
  end if;
  if p_national_id is not null and exists (select 1 from students where national_id = btrim(p_national_id)) then
    raise exception using message = 'رقم الهوية مسجّل مسبقاً لطالب آخر — ارفعي طلباً للمشرفة', hint = 'DUPLICATE';
  end if;

  select * into v_sec from sections where id = p_section;
  insert into students (branch_id, grade_id, section_id, full_name, national_id, student_number,
                        gender, source, needs_review, created_by)
  values (v_sec.branch_id, v_sec.grade_id, v_sec.id, v_name,
          nullif(btrim(p_national_id), ''), nullif(btrim(p_student_number), ''),
          case when p_gender in ('male','female') then p_gender::public.gender_type end,
          case public.auth_role() when 'teacher' then 'teacher'::public.student_source
                                  when 'supervisor' then 'supervisor' else 'admin' end,
          public.auth_role() = 'teacher', auth.uid())
  returning id into v_id;

  perform write_log('student.add', 'info', 'student', v_id::text,
    jsonb_build_object('section_id', p_section, 'name', v_name));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- المعلمة تستبعد طالباً من كشف مادتها / تعيده
-- ---------------------------------------------------------------------
create or replace function public.exclude_student(
  p_student uuid, p_grade_subject uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_st students%rowtype;
  v_year text;
begin
  select * into v_st from students where id = p_student;
  select academic_year into v_year from settings where id = 1;
  if v_st.id is null or not (
       public.is_admin() or public.is_supervisor_of(v_st.branch_id)
       or (v_st.section_id is not null and public.teaches(v_st.section_id, p_grade_subject))) then
    perform write_log('student.exclude_forbidden', 'security', 'student', p_student::text, '{}'::jsonb);
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;

  insert into sheet_exclusions (student_id, grade_subject_id, academic_year, reason, excluded_by)
  values (p_student, p_grade_subject, v_year, left(p_reason, 300), auth.uid())
  on conflict do nothing;

  perform write_log('student.exclude', 'warning', 'student', p_student::text,
    jsonb_build_object('grade_subject_id', p_grade_subject, 'reason', p_reason, 'name', v_st.full_name));
end $$;

create or replace function public.restore_student(p_student uuid, p_grade_subject uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_st students%rowtype;
  v_year text;
begin
  select * into v_st from students where id = p_student;
  select academic_year into v_year from settings where id = 1;
  if v_st.id is null or not (
       public.is_admin() or public.is_supervisor_of(v_st.branch_id)
       or (v_st.section_id is not null and public.teaches(v_st.section_id, p_grade_subject))) then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  delete from sheet_exclusions
   where student_id = p_student and grade_subject_id = p_grade_subject and academic_year = v_year;
  perform write_log('student.restore', 'info', 'student', p_student::text,
    jsonb_build_object('grade_subject_id', p_grade_subject));
end $$;

-- ---------------------------------------------------------------------
-- المعلمة ترفع طلباً
-- ---------------------------------------------------------------------
create or replace function public.create_request(
  p_type text, p_section uuid default null, p_grade_subject uuid default null,
  p_student uuid default null, p_payload jsonb default '{}'::jsonb, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_term smallint;
  v_pending int;
begin
  if public.auth_role() <> 'teacher' then
    raise exception using message = 'الطلبات للمعلمات فقط', hint = 'FORBIDDEN';
  end if;
  if p_section is not null and not public.teaches_section(p_section) then
    raise exception using message = 'هذه الشعبة غير مسندة لك', hint = 'FORBIDDEN';
  end if;
  if p_type = 'unlock_sheet' and (p_section is null or p_grade_subject is null
                                  or not public.teaches(p_section, p_grade_subject)) then
    raise exception using message = 'حددي الكشف المطلوب فتحه', hint = 'INVALID';
  end if;

  select current_term into v_term from settings where id = 1;

  -- منع تكرار نفس الطلب وهو معلّق
  select count(*) into v_pending from requests
   where requested_by = auth.uid() and status = 'pending' and type = p_type::public.request_type
     and section_id is not distinct from p_section
     and grade_subject_id is not distinct from p_grade_subject
     and student_id is not distinct from p_student;
  if v_pending > 0 then
    raise exception using message = 'لديك طلب مماثل قيد المراجعة', hint = 'DUPLICATE';
  end if;

  insert into requests (type, branch_id, requested_by, section_id, grade_subject_id, term,
                        student_id, payload, note)
  values (p_type::public.request_type, public.auth_branch(), auth.uid(), p_section, p_grade_subject,
          v_term, p_student, coalesce(p_payload, '{}'::jsonb), left(p_note, 1000))
  returning id into v_id;

  perform write_log('request.create', 'info', 'request', v_id::text, jsonb_build_object('type', p_type));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- المشرفة / الأدمن: مراجعة الطلب
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

-- المعلمة تلغي طلبها المعلّق
create or replace function public.cancel_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update requests set status = 'cancelled'
   where id = p_request and requested_by = auth.uid() and status = 'pending';
  if not found then
    raise exception using message = 'لا يمكن إلغاء هذا الطلب', hint = 'INVALID';
  end if;
  perform write_log('request.cancel', 'info', 'request', p_request::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- إحصائيات لوحة التحكم (حسب صلاحية المستخدم)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_role   public.user_role := public.auth_role();
  v_branch uuid := public.auth_branch();
  v_set    settings%rowtype;
  v_total  int; v_done int; v_students int; v_teachers int; v_pending int;
begin
  if v_role is null then
    raise exception using message = 'غير مصرّح', hint = 'AUTH';
  end if;
  select * into v_set from settings where id = 1;

  -- الكشوفات المطلوبة = كل إسناد × كل نوع تقييم
  select count(*) into v_total
    from teacher_assignments ta
    join sections s on s.id = ta.section_id
    join assessment_components c on c.grade_subject_id = ta.grade_subject_id
   where (v_role = 'admin' or s.branch_id = v_branch)
     and (v_role <> 'teacher' or ta.teacher_id = auth.uid());

  select count(*) into v_done
    from teacher_assignments ta
    join sections s on s.id = ta.section_id
    join assessment_components c on c.grade_subject_id = ta.grade_subject_id
    join submissions sb on sb.section_id = ta.section_id and sb.component_id = c.id
                       and sb.term = v_set.current_term and sb.academic_year = v_set.academic_year
   where (v_role = 'admin' or s.branch_id = v_branch)
     and (v_role <> 'teacher' or ta.teacher_id = auth.uid());

  select count(*) into v_students from students st
   where st.is_active and (v_role = 'admin' or st.branch_id = v_branch)
     and (v_role <> 'teacher' or exists (select 1 from teacher_assignments ta
                                          where ta.teacher_id = auth.uid() and ta.section_id = st.section_id));

  select count(*) into v_teachers from profiles p
   where p.role = 'teacher' and p.is_active and (v_role = 'admin' or p.branch_id = v_branch);

  select count(*) into v_pending from requests r
   where r.status = 'pending'
     and (v_role = 'admin' or r.branch_id = v_branch)
     and (v_role <> 'teacher' or r.requested_by = auth.uid());

  return jsonb_build_object(
    'sheets_total', v_total, 'sheets_done', v_done,
    'students', v_students, 'teachers', v_teachers, 'pending_requests', v_pending,
    'term', v_set.current_term, 'year', v_set.academic_year, 'grading_open', v_set.grading_open
  );
end $$;

-- تقدم الرصد لكل فرع (للأدمن) أو لكل معلمة (للمشرفة)
create or replace function public.progress_breakdown()
returns table (key_id uuid, label text, total bigint, done bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_role public.user_role := public.auth_role();
  v_branch uuid := public.auth_branch();
  v_set settings%rowtype;
begin
  select * into v_set from settings where id = 1;
  if v_role = 'admin' then
    return query
      select b.id, b.name,
             count(c.id),
             count(sb.id)
        from branches b
        left join sections s on s.branch_id = b.id
        left join teacher_assignments ta on ta.section_id = s.id
        left join assessment_components c on c.grade_subject_id = ta.grade_subject_id
        left join submissions sb on sb.section_id = ta.section_id and sb.component_id = c.id
                                and sb.term = v_set.current_term and sb.academic_year = v_set.academic_year
       where b.is_active
       group by b.id, b.name
       order by b.name;
  elsif v_role = 'supervisor' then
    return query
      select p.id, p.full_name,
             count(c.id),
             count(sb.id)
        from profiles p
        left join teacher_assignments ta on ta.teacher_id = p.id
        left join assessment_components c on c.grade_subject_id = ta.grade_subject_id
        left join submissions sb on sb.section_id = ta.section_id and sb.component_id = c.id
                                and sb.term = v_set.current_term and sb.academic_year = v_set.academic_year
       where p.role = 'teacher' and p.is_active and p.branch_id = v_branch
       group by p.id, p.full_name
       order by p.full_name;
  end if;
end $$;

-- السماح للمستخدمين المسجّلين فقط بتنفيذ الدوال العامة
revoke execute on all functions in schema public from anon;
grant execute on function public.sheet_status(uuid, uuid, smallint)                 to authenticated;
grant execute on function public.save_sheet(uuid, uuid, smallint, jsonb)            to authenticated;
grant execute on function public.teacher_add_student(uuid, text, text, text, text)  to authenticated;
grant execute on function public.exclude_student(uuid, uuid, text)                  to authenticated;
grant execute on function public.restore_student(uuid, uuid)                        to authenticated;
grant execute on function public.create_request(text, uuid, uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.review_request(uuid, boolean, text)                to authenticated;
grant execute on function public.cancel_request(uuid)                               to authenticated;
grant execute on function public.dashboard_stats()                                  to authenticated;
grant execute on function public.progress_breakdown()                               to authenticated;
grant execute on function public.log_client_event(text, text, jsonb)                to authenticated;
