-- =====================================================================
--  مِرقاة — ربط الشعب مباشرة بالصفوف والفروع
--  بدونه تفشل الصفحات التي تجلب «الشعبة مع اسم صفها/فرعها»
--  (رئيسية المعلمة، الكشف، الطلبات، التقارير).
--  شغّل هذا الملف مرة واحدة في SQL Editor
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sections_grade_id_fkey') then
    alter table public.sections
      add constraint sections_grade_id_fkey foreign key (grade_id) references public.grades(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sections_branch_id_fkey') then
    alter table public.sections
      add constraint sections_branch_id_fkey foreign key (branch_id) references public.branches(id) on delete cascade;
  end if;
end $$;

create index if not exists sections_grade_idx on public.sections(grade_id);

-- تحديث ذاكرة الواجهة البرمجية في Supabase لتتعرف على الروابط الجديدة فوراً
notify pgrst, 'reload schema';
