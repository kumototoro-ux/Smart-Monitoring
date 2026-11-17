-- =====================================================================
-- 0016: تثبيت مواد كل فرع صراحةً (المرحلة 1 — إضافة فقط)
--   - لا يحذف ولا يعدّل أي صف موجود (طلاب/رصد/مواد/أنواع تقييم).
--   - الموقع لا يقرأ الجدول الجديد بعد، فلا يتغير أي سلوك.
--   - أولاً: نسخة احتياطية داخلية (schema backup_0016) تُؤخذ مرة واحدة.
--   - ثانياً: جدول branch_grade_subjects يُعبّأ من الوضع الفعلي الحالي
--       (كل فرع × صفوفه المفتوحة × مواد الصف، والمستثناة تكون is_active=false).
--   - ثالثاً: مشغّلات تُبقيه مطابقاً للوضع الفعلي إلى أن نعتمد عليه.
-- آمن للتشغيل أكثر من مرة.
-- =====================================================================

-- 1) نسخة احتياطية داخلية (تُؤخذ أول مرة فقط ولا تُستبدل عند إعادة التشغيل)
create schema if not exists backup_0016;
revoke all on schema backup_0016 from public, anon, authenticated;

create table if not exists backup_0016.results                  as select * from public.results;
create table if not exists backup_0016.submissions              as select * from public.submissions;
create table if not exists backup_0016.students                 as select * from public.students;
create table if not exists backup_0016.sections                 as select * from public.sections;
create table if not exists backup_0016.branch_grades            as select * from public.branch_grades;
create table if not exists backup_0016.grade_subjects           as select * from public.grade_subjects;
create table if not exists backup_0016.assessment_components    as select * from public.assessment_components;
create table if not exists backup_0016.branch_subject_exclusions as select * from public.branch_subject_exclusions;
create table if not exists backup_0016.teacher_assignments      as select * from public.teacher_assignments;
create table if not exists backup_0016.sheet_exclusions         as select * from public.sheet_exclusions;
revoke all on all tables in schema backup_0016 from public, anon, authenticated;

-- 2) الجدول الجديد
create table if not exists public.branch_grade_subjects (
  branch_id        uuid not null references public.branches(id)       on delete cascade,
  grade_subject_id uuid not null references public.grade_subjects(id) on delete cascade,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (branch_id, grade_subject_id)
);
create index if not exists bgs_gs_idx on public.branch_grade_subjects(grade_subject_id);

alter table public.branch_grade_subjects enable row level security;
drop policy if exists bgs_read  on public.branch_grade_subjects;
drop policy if exists bgs_write on public.branch_grade_subjects;
create policy bgs_read  on public.branch_grade_subjects for select to authenticated using (true);
create policy bgs_write on public.branch_grade_subjects for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3) التعبئة من الوضع الفعلي الحالي (لا تمس الصفوف الموجودة)
insert into public.branch_grade_subjects (branch_id, grade_subject_id, is_active)
select bg.branch_id, gs.id,
       not exists (select 1 from public.branch_subject_exclusions e
                   where e.branch_id = bg.branch_id and e.grade_subject_id = gs.id)
from public.branch_grades bg
join public.grade_subjects gs on gs.grade_id = bg.grade_id
on conflict (branch_id, grade_subject_id) do nothing;

-- 4) مشغّلات تُبقي الجدول مطابقاً حتى نعتمد عليه
create or replace function public._bgs_on_branch_grade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into branch_grade_subjects (branch_id, grade_subject_id, is_active)
  select new.branch_id, gs.id,
         not exists (select 1 from branch_subject_exclusions e where e.branch_id = new.branch_id and e.grade_subject_id = gs.id)
  from grade_subjects gs where gs.grade_id = new.grade_id
  on conflict do nothing;
  return new;
end $$;

create or replace function public._bgs_on_grade_subject() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into branch_grade_subjects (branch_id, grade_subject_id, is_active)
  select bg.branch_id, new.id, true from branch_grades bg where bg.grade_id = new.grade_id
  on conflict do nothing;
  return new;
end $$;

create or replace function public._bgs_on_exclusion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update branch_grade_subjects set is_active = true  where branch_id = old.branch_id and grade_subject_id = old.grade_subject_id;
    return old;
  end if;
  update branch_grade_subjects set is_active = false where branch_id = new.branch_id and grade_subject_id = new.grade_subject_id;
  return new;
end $$;

revoke all on function public._bgs_on_branch_grade(), public._bgs_on_grade_subject(), public._bgs_on_exclusion() from public, anon, authenticated;

drop trigger if exists bgs_branch_grade   on public.branch_grades;
drop trigger if exists bgs_grade_subject  on public.grade_subjects;
drop trigger if exists bgs_exclusion      on public.branch_subject_exclusions;
create trigger bgs_branch_grade  after insert on public.branch_grades            for each row execute function public._bgs_on_branch_grade();
create trigger bgs_grade_subject after insert on public.grade_subjects           for each row execute function public._bgs_on_grade_subject();
create trigger bgs_exclusion     after insert or delete on public.branch_subject_exclusions for each row execute function public._bgs_on_exclusion();

-- 5) فحص مطابقة (للقراءة): يجب أن تكون كل الأعداد صفراً بعد التشغيل
create or replace function public.branch_subjects_mismatch() returns table(kind text, n bigint)
language sql stable security definer set search_path = public as $$
  select 'مواد فعلية ليست في الجدول', count(*) from branch_grades bg join grade_subjects gs on gs.grade_id = bg.grade_id
   where not exists (select 1 from branch_subject_exclusions e where e.branch_id = bg.branch_id and e.grade_subject_id = gs.id)
     and not exists (select 1 from branch_grade_subjects x where x.branch_id = bg.branch_id and x.grade_subject_id = gs.id and x.is_active)
  union all
  select 'صفوف في الجدول لا تطابق الوضع الفعلي', count(*) from branch_grade_subjects x
   where x.is_active <> not exists (select 1 from branch_subject_exclusions e where e.branch_id = x.branch_id and e.grade_subject_id = x.grade_subject_id)
$$;
revoke all on function public.branch_subjects_mismatch() from public, anon;
grant execute on function public.branch_subjects_mismatch() to authenticated;

notify pgrst, 'reload schema';
