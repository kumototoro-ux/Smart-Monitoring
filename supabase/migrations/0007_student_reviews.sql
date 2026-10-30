-- =====================================================================
--  مِرقاة — مراجعة الطلاب
--  كل ما تفعله المعلمة بالطلاب يصل للمشرفة لتراجعه:
--    added     طالب أضافته المعلمة للكشف (بيانات ناقصة غالباً)
--    released  طالب أرجعته المعلمة لقائمة الصف («ليس من شعبتي»)
--    excluded  طالب استبعدته المعلمة من كشف مادة (منقول/معفى/منقطع...)
--  التسجيل والإغلاق يتمان تلقائياً بمشغّلات (triggers) أينما حدث التغيير.
--  شغّل هذا الملف مرة واحدة في SQL Editor
-- =====================================================================

create table if not exists public.student_reviews (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  branch_id        uuid not null references public.branches(id) on delete cascade,
  kind             text not null check (kind in ('added', 'released', 'excluded')),
  section_id       uuid references public.sections(id) on delete set null,        -- الشعبة وقت الحدث
  grade_subject_id uuid references public.grade_subjects(id) on delete set null,  -- للاستبعاد من مادة
  reason           text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  status           text not null default 'pending' check (status in ('pending', 'resolved')),
  resolution       text,  -- approved | moved | claimed | kept | restored | deactivated
  resolved_by      uuid references public.profiles(id) on delete set null,
  resolved_at      timestamptz,
  note             text
);
create index if not exists student_reviews_branch_status_idx on public.student_reviews(branch_id, status, created_at desc);
create index if not exists student_reviews_student_idx on public.student_reviews(student_id, status);

alter table public.student_reviews enable row level security;
drop policy if exists reviews_read on public.student_reviews;
create policy reviews_read on public.student_reviews for select to authenticated using (
  public.is_admin() or public.is_supervisor_of(branch_id) or created_by = auth.uid()
);
-- لا كتابة مباشرة: كل الكتابة عبر المشغّلات والدالة review_resolve

-- إغلاق مراجعات طالب
create or replace function public._close_reviews(p_student uuid, p_kind text, p_resolution text, p_grade_subject uuid default null)
returns void language sql security definer set search_path = public as $$
  update student_reviews
     set status = 'resolved', resolution = p_resolution, resolved_by = auth.uid(), resolved_at = now()
   where student_id = p_student and status = 'pending'
     and (p_kind is null or kind = p_kind)
     and (p_grade_subject is null or grade_subject_id = p_grade_subject);
$$;
revoke all on function public._close_reviews(uuid, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- الطلاب
create or replace function public._students_review_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_teacher boolean := coalesce(public.auth_role() = 'teacher', false);
begin
  if tg_op = 'INSERT' then
    -- طالب أضافته معلمة
    if new.source = 'teacher' then
      insert into student_reviews (student_id, branch_id, kind, section_id, created_by, reason)
      values (new.id, new.branch_id, 'added', new.section_id, coalesce(new.created_by, auth.uid()), 'أُضيف من المعلمة ببيانات قد تكون ناقصة');
    end if;
    return new;
  end if;

  -- أرجعته معلمة لقائمة الصف
  if v_teacher and old.section_id is not null and new.section_id is null then
    insert into student_reviews (student_id, branch_id, kind, section_id, created_by, reason)
    values (new.id, new.branch_id, 'released', old.section_id, auth.uid(), 'ليس من شعبتي');
  end if;

  -- الإغلاق التلقائي
  if old.is_active and not new.is_active then
    perform _close_reviews(new.id, null, 'deactivated');
  end if;
  if old.needs_review and not new.needs_review then
    perform _close_reviews(new.id, 'added', 'approved');
  end if;
  if old.section_id is null and new.section_id is not null then
    perform _close_reviews(new.id, 'released', case when v_teacher then 'claimed' else 'moved' end);
  end if;
  return new;
end $$;

drop trigger if exists students_review_ins on public.students;
create trigger students_review_ins after insert on public.students
  for each row execute function public._students_review_trg();
drop trigger if exists students_review_upd on public.students;
create trigger students_review_upd after update of section_id, is_active, needs_review on public.students
  for each row execute function public._students_review_trg();

-- ---------------------------------------------------------------- الاستبعاد من مادة
create or replace function public._exclusions_review_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_st students%rowtype;
begin
  if tg_op = 'INSERT' then
    if coalesce(public.auth_role() = 'teacher', false) then
      select * into v_st from students where id = new.student_id;
      insert into student_reviews (student_id, branch_id, kind, section_id, grade_subject_id, created_by, reason)
      values (new.student_id, v_st.branch_id, 'excluded', v_st.section_id, new.grade_subject_id, auth.uid(), new.reason);
    end if;
    return new;
  end if;
  -- أُعيد للكشف (من المعلمة أو المشرفة)
  perform _close_reviews(old.student_id, 'excluded', 'restored', old.grade_subject_id);
  return old;
end $$;

drop trigger if exists exclusions_review_ins on public.sheet_exclusions;
create trigger exclusions_review_ins after insert on public.sheet_exclusions
  for each row execute function public._exclusions_review_trg();
drop trigger if exists exclusions_review_del on public.sheet_exclusions;
create trigger exclusions_review_del after delete on public.sheet_exclusions
  for each row execute function public._exclusions_review_trg();

-- ---------------------------------------------------------------- قرار المشرفة
-- p_action: approve | move | keep | restore | deactivate
create or replace function public.review_resolve(
  p_review uuid, p_action text, p_section uuid default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_r   student_reviews%rowtype;
  v_st  students%rowtype;
  v_sec sections%rowtype;
  v_year text;
begin
  select * into v_r from student_reviews where id = p_review for update;
  if v_r.id is null then
    raise exception using message = 'المراجعة غير موجودة', hint = 'NOT_FOUND';
  end if;
  if not (public.is_admin() or public.is_supervisor_of(v_r.branch_id)) then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  if v_r.status <> 'pending' then
    raise exception using message = 'تمت مراجعة هذا الطالب مسبقاً', hint = 'DONE';
  end if;
  select * into v_st from students where id = v_r.student_id;
  select academic_year into v_year from settings where id = 1;

  if p_action = 'deactivate' then
    update students set is_active = false where id = v_st.id;               -- يغلق كل مراجعاته
  elsif p_action = 'approve' and v_r.kind = 'added' then
    update students set needs_review = false where id = v_st.id;            -- يغلق «added»
    perform _close_reviews(v_st.id, 'added', 'approved');                   -- لو كانت معتمدة مسبقاً
  elsif p_action = 'approve' and v_r.kind = 'excluded' then
    update student_reviews set status = 'resolved', resolution = 'approved', resolved_by = auth.uid(), resolved_at = now()
     where id = v_r.id;
  elsif p_action = 'restore' and v_r.kind = 'excluded' then
    delete from sheet_exclusions
     where student_id = v_st.id and grade_subject_id = v_r.grade_subject_id and academic_year = v_year;
    perform _close_reviews(v_st.id, 'excluded', 'restored', v_r.grade_subject_id);
  elsif p_action = 'move' and v_r.kind = 'released' then
    select * into v_sec from sections where id = p_section;
    if v_sec.id is null or v_sec.branch_id <> v_st.branch_id or v_sec.grade_id <> v_st.grade_id then
      raise exception using message = 'اختاري شعبة من نفس صف الطالب وفرعه', hint = 'INVALID';
    end if;
    update students set section_id = v_sec.id where id = v_st.id;          -- يغلق «released»
    perform _close_reviews(v_st.id, 'released', 'moved');
  elsif p_action = 'keep' and v_r.kind = 'released' then
    update student_reviews set status = 'resolved', resolution = 'kept', resolved_by = auth.uid(), resolved_at = now()
     where id = v_r.id;
  else
    raise exception using message = 'إجراء غير مناسب لهذا النوع', hint = 'INVALID';
  end if;

  if p_note is not null and btrim(p_note) <> '' then
    update student_reviews set note = left(p_note, 500) where id = v_r.id;
  end if;
  perform write_log('review.' || p_action, 'info', 'student', v_st.id::text,
    jsonb_build_object('kind', v_r.kind, 'name', v_st.full_name, 'section_id', coalesce(p_section, v_r.section_id), 'grade_subject_id', v_r.grade_subject_id));
end $$;

revoke execute on function public.review_resolve(uuid, text, uuid, text) from anon;
grant execute on function public.review_resolve(uuid, text, uuid, text) to authenticated;
grant select on public.student_reviews to authenticated;

-- ---------------------------------------------------------------- البيانات السابقة
insert into public.student_reviews (student_id, branch_id, kind, section_id, created_by, reason, created_at)
select s.id, s.branch_id, 'added', s.section_id, s.created_by, 'أُضيف من المعلمة ببيانات قد تكون ناقصة', s.created_at
  from public.students s
 where s.source = 'teacher' and s.needs_review and s.is_active
   and not exists (select 1 from public.student_reviews r where r.student_id = s.id and r.kind = 'added');

insert into public.student_reviews (student_id, branch_id, kind, section_id, grade_subject_id, created_by, reason, created_at)
select e.student_id, s.branch_id, 'excluded', s.section_id, e.grade_subject_id, e.excluded_by, e.reason, e.created_at
  from public.sheet_exclusions e
  join public.students s on s.id = e.student_id
  join public.profiles p on p.id = e.excluded_by and p.role = 'teacher'
 where e.academic_year = (select academic_year from public.settings where id = 1)
   and not exists (select 1 from public.student_reviews r
                    where r.student_id = e.student_id and r.kind = 'excluded' and r.grade_subject_id = e.grade_subject_id);

notify pgrst, 'reload schema';
