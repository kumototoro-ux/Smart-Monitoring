-- =====================================================================
--  مِرقاة — سجل إصدار الإشعارات + تقرير الطلاب المستبعدين
--  (يتطلب تشغيل 0012 و0013 قبله) — شغّله مرة واحدة في SQL Editor، وإعادة تشغيله آمنة.
--
--  1) notice_issues: سجل دائم لكل إشعار صدر (من أصدره، متى، لأي طالب/فرع/صف/شعبة)
--     - الكتابة فقط عبر الدالة notice_log_issue (تتحقق من الصلاحية وتأخذ البيانات من القاعدة لا من المتصفح)
--     - القراءة: الأدمن للكل، والمشرفة لفرعها فقط
--  2) notice_issue_summary: ملخص لكل شعبة (طلاب / صدر لهم / آخر إصدار / مربية الفصل)
--  3) excluded_students: الطلاب المستبعدون من مواد + الطلاب غير النشطين، لتقرير الأدمن والمشرفة
-- =====================================================================

create table if not exists public.notice_issues (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid references public.students(id) on delete set null,
  student_name   text not null,
  student_number text,
  branch_id      uuid not null references public.branches(id) on delete cascade,
  grade_id       uuid references public.grades(id) on delete set null,
  section_id     uuid references public.sections(id) on delete set null,
  term           smallint not null check (term in (1, 2)),
  academic_year  text not null,
  kind           text not null check (kind in ('pdf', 'png', 'share', 'zip')),
  complete       boolean not null default true,
  issued_by      uuid references public.profiles(id) on delete set null,
  issuer_name    text,
  issuer_role    text,
  created_at     timestamptz not null default now()
);
create index if not exists notice_issues_branch_idx  on public.notice_issues(branch_id, created_at desc);
create index if not exists notice_issues_section_idx on public.notice_issues(section_id, term, academic_year);
create index if not exists notice_issues_student_idx on public.notice_issues(student_id, term);
create index if not exists notice_issues_issuer_idx  on public.notice_issues(issued_by, created_at desc);

alter table public.notice_issues enable row level security;
drop policy if exists notice_issues_read on public.notice_issues;
create policy notice_issues_read on public.notice_issues for select to authenticated
  using (public.is_admin() or public.is_supervisor_of(branch_id));
-- لا سياسات كتابة: الإدخال من الدالة فقط

-- ---------------------------------------------------------------------
-- تسجيل إصدار (طالب أو عدة طلاب). تتحقق من صلاحية كل طالب وتسجّل بياناته من القاعدة
-- ---------------------------------------------------------------------
create or replace function public.notice_log_issue(p_students uuid[], p_term smallint, p_kind text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_year text;
  v_me   profiles%rowtype;
  v_n    integer := 0;
  r      record;
begin
  if p_kind not in ('pdf', 'png', 'share', 'zip') or p_term not in (1, 2) then
    raise exception using message = 'بيانات غير صحيحة', hint = 'VALIDATION';
  end if;
  if p_students is null or coalesce(array_length(p_students, 1), 0) = 0 then return 0; end if;
  if array_length(p_students, 1) > 300 then
    raise exception using message = 'عدد الطلاب كبير', hint = 'VALIDATION';
  end if;
  select * into v_me from profiles where id = auth.uid();
  if v_me.id is null then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  select academic_year into v_year from settings where id = 1;

  for r in
    select s.id, s.full_name, s.student_number, s.branch_id, s.grade_id, s.section_id
    from students s where s.id = any (p_students)
  loop
    if r.section_id is null or not public.notice_can(r.section_id) then
      perform write_log('notice.log_forbidden', 'security', 'student', r.id::text, '{}'::jsonb);
      raise exception using message = 'غير مصرّح لك بإصدار هذا الإشعار', hint = 'FORBIDDEN';
    end if;
    -- منع التكرار الفوري (نقرتان متتاليتان/إعادة محاولة) لنفس الشخص والطالب والنوع
    if exists (
      select 1 from notice_issues i
      where i.student_id = r.id and i.issued_by = v_me.id and i.term = p_term
        and i.kind = p_kind and i.created_at > now() - interval '20 seconds'
    ) then continue; end if;
    insert into notice_issues (student_id, student_name, student_number, branch_id, grade_id, section_id,
                               term, academic_year, kind, complete, issued_by, issuer_name, issuer_role, created_at)
    values (r.id, r.full_name, r.student_number, r.branch_id, r.grade_id, r.section_id,
            p_term, v_year, p_kind, jsonb_array_length(public.notice_missing(r.id, p_term)) = 0,
            v_me.id, v_me.full_name, v_me.role::text, clock_timestamp()); -- وقت فريد لكل صف ليعمل ترقيم الصفحات بدقة
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.notice_log_issue(uuid[], smallint, text) from public, anon;
grant execute on function public.notice_log_issue(uuid[], smallint, text) to authenticated;

-- ---------------------------------------------------------------------
-- ملخص الإصدار لكل شعبة (أدمن: كل الفروع، مشرفة: فرعها)
-- ---------------------------------------------------------------------
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
           g.sort_order as grade_sort, sec.name as section, ct.full_name as homeroom,
           coalesce(st.n, 0)::int as students,
           coalesce(i.issued, 0)::int as issued, coalesce(i.total, 0)::int as total,
           i.last_at, i.last_by
    from sections sec
    join branches b on b.id = sec.branch_id
    join grades g on g.id = sec.grade_id
    left join class_teachers c on c.section_id = sec.id
    left join profiles ct on ct.id = c.teacher_id
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

-- ---------------------------------------------------------------------
-- الطلاب المستبعدون: من مواد (للعام الحالي) + غير النشطين
--   kind = subject | inactive
-- ---------------------------------------------------------------------
create or replace function public.excluded_students()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_year text; v_out jsonb;
begin
  if coalesce(public.auth_role() in ('admin', 'supervisor'), false) is not true then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  select academic_year into v_year from settings where id = 1;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.branch, q.grade_sort, q.section, q.student_name), '[]'::jsonb) into v_out
  from (
    select 'subject'::text as kind, s.id as student_id, s.full_name as student_name, s.student_number, s.national_id,
           b.id as branch_id, b.name as branch, g.id as grade_id, g.name as grade, g.sort_order as grade_sort,
           sec.id as section_id, coalesce(sec.name, '') as section,
           sub.name as subject, x.reason, p.full_name as by_name, x.created_at as at
    from sheet_exclusions x
    join students s on s.id = x.student_id
    join branches b on b.id = s.branch_id
    join grades g on g.id = s.grade_id
    left join sections sec on sec.id = s.section_id
    join grade_subjects gs on gs.id = x.grade_subject_id
    join subjects sub on sub.id = gs.subject_id
    left join profiles p on p.id = x.excluded_by
    where x.academic_year = v_year and s.is_active
      and (public.is_admin() or s.branch_id = public.auth_branch())
    union all
    select 'inactive', s.id, s.full_name, s.student_number, s.national_id,
           b.id, b.name, g.id, g.name, g.sort_order, sec.id, coalesce(sec.name, ''),
           null, rv.note, null, s.updated_at
    from students s
    join branches b on b.id = s.branch_id
    join grades g on g.id = s.grade_id
    left join sections sec on sec.id = s.section_id
    left join lateral (
      select coalesce(r.note, r.reason) as note from student_reviews r
      where r.student_id = s.id and r.resolution = 'deactivated' order by r.resolved_at desc nulls last limit 1
    ) rv on true
    where not s.is_active and (public.is_admin() or s.branch_id = public.auth_branch())
  ) q;
  return v_out;
end $$;
revoke all on function public.excluded_students() from public, anon;
grant execute on function public.excluded_students() to authenticated;

-- ---------------------------------------------------------------------
-- فهارس تسريع (آمنة وتُنشأ مرة واحدة)
-- ---------------------------------------------------------------------
create index if not exists sheet_exclusions_year_idx  on public.sheet_exclusions(academic_year);
create index if not exists students_grade_idx         on public.students(grade_id);
create index if not exists students_inactive_idx      on public.students(branch_id) where not is_active;
create index if not exists assignments_section_gs_idx on public.teacher_assignments(section_id, grade_subject_id);
