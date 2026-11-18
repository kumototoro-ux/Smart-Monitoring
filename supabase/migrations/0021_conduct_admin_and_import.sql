-- =====================================================================
--  مِرقاة — المواظبة والسلوك: رصد الأدمن للكل + ملف الفرع (استيراد/نسخ احتياطي/تراجع)
--  شغّل هذا الملف مرة واحدة بعد 0020. وإعادة تشغيله آمنة.
--
--  • رصد الأدمن للكل: يعطي الدرجة الكاملة لمن رُصدت لهم درجات في (الحد الأدنى من المواد)،
--    ويُحفظ في «كشف الأدمن» (بلا معلمة). متى رصدت معلمة طالباً اعتُمد متوسط المعلمات
--    وتُجاهل رصد الأدمن له. ويمكن حذف رصد الأدمن كله بأمر واحد.
--  • ملف الفرع: أعمدة المواظبة والسلوك تُحفظ في كشف الأدمن وتُسجَّل في دفعة الاستيراد
--    ويمكن التراجع عنها مع باقي الدفعة. لا يُعدَّل أي كود من 0017.
-- =====================================================================

alter table public.conduct_scores add column if not exists source text not null default 'teacher';

-- الإشعار: متوسط المعلمات إن وُجد، وإلا رصد الأدمن/الملف
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
    with rws as (
      select cs.student_id, cs.attendance, cs.behavior, (sh.teacher_id is not null) as by_teacher
        from conduct_scores cs
        join conduct_sheets sh on sh.id = cs.sheet_id
        join students st on st.id = cs.student_id
       where cs.student_id = any (p_students) and sh.term = p_term and sh.academic_year = v_set.academic_year
         and (public.is_admin() or public.can_view_branch(st.branch_id))
    ), pick as (
      select student_id, bool_or(by_teacher) as has_t from rws group by student_id
    )
    select r.student_id, round(avg(r.attendance), 2) as att, round(avg(r.behavior), 2) as beh, count(*) as n
      from rws r join pick p on p.student_id = r.student_id and r.by_teacher = p.has_t
     group by r.student_id
  ) q;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- رصد الأدمن للكل (فرع محدد أو كل الفروع إن كان null)
-- ---------------------------------------------------------------------
create or replace function public.conduct_fill_all(p_branch uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_set settings%rowtype; n_students int := 0; n_sections int := 0; n_low int := 0; n_already int := 0;
begin
  if not public.is_admin() then raise exception using message = 'للمسؤول فقط', hint = 'FORBIDDEN'; end if;
  select * into v_set from settings where id = 1;
  if not v_set.conduct_enabled then raise exception using message = 'فعّلي كشف المواظبة والسلوك أولاً', hint = 'CONFLICT'; end if;

  create temp table _el on commit drop as
  select s.id as student_id, s.section_id, s.branch_id, s.grade_id,
         (select count(distinct c.grade_subject_id) from results r
            join assessment_components c on c.id = r.component_id
           where r.student_id = s.id and r.term = v_set.current_term and r.academic_year = v_set.academic_year) as graded
    from students s
   where s.is_active and s.section_id is not null and (p_branch is null or s.branch_id = p_branch);

  select count(*) into n_low from _el where graded < v_set.conduct_min_subjects;
  delete from _el where graded < v_set.conduct_min_subjects;

  -- كشف الأدمن لكل شعبة
  insert into conduct_sheets (section_id, teacher_id, term, academic_year, submitted_by, edit_until)
  select distinct e.section_id, null::uuid, v_set.current_term, v_set.academic_year, auth.uid(), now()
    from _el e
   where not exists (select 1 from conduct_sheets x where x.section_id = e.section_id and x.teacher_id is null
                      and x.term = v_set.current_term and x.academic_year = v_set.academic_year);

  with ins as (
    insert into conduct_scores (sheet_id, student_id, attendance, behavior, source)
    select x.id, e.student_id, 100, 100, 'admin_fill'
      from _el e join conduct_sheets x on x.section_id = e.section_id and x.teacher_id is null
                                      and x.term = v_set.current_term and x.academic_year = v_set.academic_year
    on conflict (sheet_id, student_id) do nothing
    returning student_id
  ) select count(*) into n_students from ins;
  select count(*) into n_already from _el;
  n_already := n_already - n_students;
  select count(distinct section_id) into n_sections from _el;

  perform write_log('conduct.fill_all', 'warning', 'branch', coalesce(p_branch::text, 'all'),
    jsonb_build_object('filled', n_students, 'already', n_already, 'below_min', n_low, 'term', v_set.current_term));
  return jsonb_build_object('filled', n_students, 'already', n_already, 'below_min', n_low, 'sections', n_sections);
end $$;

-- حذف رصد الأدمن (الذي أُضيف بـ «رصد الكل» فقط) للفصل الحالي
create or replace function public.conduct_clear_fill(p_branch uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_set settings%rowtype; n int := 0;
begin
  if not public.is_admin() then raise exception using message = 'للمسؤول فقط', hint = 'FORBIDDEN'; end if;
  select * into v_set from settings where id = 1;
  delete from conduct_scores cs using conduct_sheets sh, students st
   where sh.id = cs.sheet_id and st.id = cs.student_id and sh.teacher_id is null and cs.source = 'admin_fill'
     and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year
     and (p_branch is null or st.branch_id = p_branch);
  get diagnostics n = row_count;
  delete from conduct_sheets sh where sh.teacher_id is null and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year
     and not exists (select 1 from conduct_scores c where c.sheet_id = sh.id);
  perform write_log('conduct.clear_fill', 'warning', 'branch', coalesce(p_branch::text, 'all'), jsonb_build_object('deleted', n));
  return jsonb_build_object('deleted', n);
end $$;

-- أرقام للأدمن: لكل فرع كم طالب مؤهل، وكم رصدته المعلمات، وكم رصده الأدمن
create or replace function public.conduct_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_set settings%rowtype; v_out jsonb;
begin
  if not public.is_admin() then raise exception using message = 'للمسؤول فقط', hint = 'FORBIDDEN'; end if;
  select * into v_set from settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object('branch_id', b.id, 'branch', b.name, 'students', q.students, 'eligible', q.eligible,
                                               'teacher', q.t, 'admin', q.a) order by b.name), '[]'::jsonb)
    into v_out
  from branches b
  join lateral (
    select count(*) as students,
           count(*) filter (where g >= v_set.conduct_min_subjects) as eligible,
           count(*) filter (where t) as t, count(*) filter (where a and not t) as a
      from (
        select s.id,
               (select count(distinct c.grade_subject_id) from results r join assessment_components c on c.id = r.component_id
                 where r.student_id = s.id and r.term = v_set.current_term and r.academic_year = v_set.academic_year) as g,
               exists (select 1 from conduct_scores cs join conduct_sheets sh on sh.id = cs.sheet_id
                        where cs.student_id = s.id and sh.teacher_id is not null and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year) as t,
               exists (select 1 from conduct_scores cs join conduct_sheets sh on sh.id = cs.sheet_id
                        where cs.student_id = s.id and sh.teacher_id is null and sh.term = v_set.current_term and sh.academic_year = v_set.academic_year) as a
          from students s where s.branch_id = b.id and s.is_active
      ) z
  ) q on true;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- ملف الفرع: حفظ الدرجات (0017) ثم المواظبة والسلوك في المعاملة نفسها
-- p_rows[i].conduct = {attendance, behavior}  (القيم 0–100، اللفظي 0 أو 100)
-- ---------------------------------------------------------------------
create table if not exists public.import_conduct_log (
  batch_id       uuid primary key references public.import_batches(id) on delete cascade,
  created_sheets uuid[] not null default '{}',
  created_scores jsonb  not null default '[]',   -- [{sheet_id, student_id}]
  overwritten    jsonb  not null default '[]'    -- [{sheet_id, student_id, attendance, behavior, updated_at, source}]
);
alter table public.import_conduct_log enable row level security;
drop policy if exists import_conduct_log_read on public.import_conduct_log;
create policy import_conduct_log_read on public.import_conduct_log for select to authenticated using (public.is_admin());

create or replace function public.branch_import_commit2(
  p_branch uuid, p_term smallint, p_overwrite boolean, p_file text, p_sections jsonb, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb; v_batch uuid; v_set settings%rowtype; v_now timestamptz; v_bad int;
  n_new int := 0; n_same int := 0; n_conf int := 0; n_over int := 0;
  v_sheets uuid[] := '{}'; v_created jsonb := '[]'; v_over jsonb := '[]';
begin
  v := public.branch_import_commit(p_branch, p_term, p_overwrite, p_file, p_sections, p_rows);
  v_batch := (v->>'batch_id')::uuid;
  select * into v_set from settings where id = 1;
  select created_at into v_now from import_batches where id = v_batch;

  -- _rows أنشأتها الدالة الداخلية وتبقى حتى نهاية المعاملة (idx يطابق ترتيب p_rows، وsid معرّف الطالب بعد إنشاء الجدد)
  create temp table _cd on commit drop as
  select r.sid as student_id, st.section_id, g.assessment_mode as mode,
         nullif(x.v->'conduct'->>'attendance', '')::numeric as att, nullif(x.v->'conduct'->>'behavior', '')::numeric as beh
    from _rows r
    join jsonb_array_elements(p_rows) with ordinality x(v, ord) on x.ord - 1 = r.idx
    join students st on st.id = r.sid
    join grades g on g.id = st.grade_id
   where jsonb_typeof(x.v->'conduct') = 'object'
     and (nullif(x.v->'conduct'->>'attendance', '') is not null or nullif(x.v->'conduct'->>'behavior', '') is not null);

  if not exists (select 1 from _cd) then
    return v || jsonb_build_object('conduct_new', 0, 'conduct_same', 0, 'conduct_overwritten', 0, 'conduct_skipped', 0);
  end if;

  if exists (select 1 from _cd where section_id is null) then
    raise exception using message = 'يوجد طالب له مواظبة/سلوك وبلا شعبة. حدّدي شعبته في الملف.', hint = 'VALIDATION';
  end if;
  select count(*) into v_bad from _cd where (att is not null and (att < 0 or att > 100)) or (beh is not null and (beh < 0 or beh > 100));
  if v_bad > 0 then raise exception using message = 'قيمة المواظبة أو السلوك خارج 0–100', hint = 'VALIDATION'; end if;
  select count(*) into v_bad from _cd where mode = 'verbal' and ((att is not null and att not in (0, 100)) or (beh is not null and beh not in (0, 100)));
  if v_bad > 0 then raise exception using message = 'المواظبة والسلوك لفظيان في هذا الصف: اختاري من القائمة', hint = 'VALIDATION'; end if;

  create temp table _cs on commit drop as
  select distinct section_id, null::uuid as sheet_id, false as made from _cd;
  update _cs c set sheet_id = (select x.id from conduct_sheets x where x.section_id = c.section_id and x.teacher_id is null
                                  and x.term = p_term and x.academic_year = v_set.academic_year);
  update _cs set made = (sheet_id is null) where true; -- Supabase (pg_safeupdate) يرفض UPDATE بلا WHERE
  insert into conduct_sheets (section_id, teacher_id, term, academic_year, submitted_by, edit_until)
    select section_id, null::uuid, p_term, v_set.academic_year, auth.uid(), v_now from _cs where sheet_id is null;
  update _cs c set sheet_id = (select x.id from conduct_sheets x where x.section_id = c.section_id and x.teacher_id is null
                                  and x.term = p_term and x.academic_year = v_set.academic_year) where sheet_id is null;
  select coalesce(array_agg(sheet_id), '{}') into v_sheets from _cs where made;

  create temp table _cc on commit drop as
  select cs.sheet_id, d.student_id, d.att, d.beh, ex.attendance as o_att, ex.behavior as o_beh, ex.updated_at as o_at, ex.source as o_src,
         case when ex.student_id is null then 'new'
              when (ex.attendance, ex.behavior) is not distinct from (coalesce(d.att, ex.attendance), coalesce(d.beh, ex.behavior)) then 'same'
              else 'conflict' end as cls
    from _cd d join _cs cs on cs.section_id = d.section_id
    left join conduct_scores ex on ex.sheet_id = cs.sheet_id and ex.student_id = d.student_id;

  select coalesce(jsonb_agg(jsonb_build_object('sheet_id', sheet_id, 'student_id', student_id)), '[]'::jsonb) into v_created from _cc where cls = 'new';
  insert into conduct_scores (sheet_id, student_id, attendance, behavior, updated_at, source)
    select sheet_id, student_id, att, beh, v_now, 'import' from _cc where cls = 'new';
  select count(*) into n_new from _cc where cls = 'new';
  select count(*) into n_same from _cc where cls = 'same';
  select count(*) into n_conf from _cc where cls = 'conflict';

  if p_overwrite and n_conf > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('sheet_id', sheet_id, 'student_id', student_id, 'attendance', o_att, 'behavior', o_beh, 'updated_at', o_at, 'source', o_src)), '[]'::jsonb)
      into v_over from _cc where cls = 'conflict';
    update conduct_scores s set attendance = coalesce(c.att, s.attendance), behavior = coalesce(c.beh, s.behavior), updated_at = v_now, source = 'import'
      from _cc c where c.cls = 'conflict' and s.sheet_id = c.sheet_id and s.student_id = c.student_id;
    n_over := n_conf; n_conf := 0;
  end if;

  insert into import_conduct_log (batch_id, created_sheets, created_scores, overwritten) values (v_batch, v_sheets, v_created, v_over);
  update import_batches set summary = summary || jsonb_build_object('conduct_new', n_new, 'conduct_same', n_same, 'conduct_overwritten', n_over, 'conduct_skipped', n_conf)
   where id = v_batch;
  return v || jsonb_build_object('conduct_new', n_new, 'conduct_same', n_same, 'conduct_overwritten', n_over, 'conduct_skipped', n_conf);
end $$;

create or replace function public.branch_import_undo2(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b import_batches%rowtype; l import_conduct_log%rowtype; v jsonb; rec record;
  d_new int := 0; r_over int := 0; k_c int := 0; d_sh int := 0;
begin
  if not public.is_admin() then raise exception using message = 'التراجع للمسؤول فقط', hint = 'FORBIDDEN'; end if;
  select * into b from import_batches where id = p_batch for update;
  if b.id is null then raise exception using message = 'الدفعة غير موجودة', hint = 'NOT_FOUND'; end if;
  select * into l from import_conduct_log where batch_id = p_batch;
  if l.batch_id is not null and b.undone_at is null then
    for rec in select * from jsonb_to_recordset(l.overwritten) as x(sheet_id uuid, student_id uuid, attendance numeric, behavior numeric, updated_at timestamptz, source text) loop
      update conduct_scores set attendance = rec.attendance, behavior = rec.behavior, updated_at = coalesce(rec.updated_at, now()), source = coalesce(rec.source, 'teacher')
       where sheet_id = rec.sheet_id and student_id = rec.student_id and updated_at = b.created_at;
      if found then r_over := r_over + 1; else k_c := k_c + 1; end if;
    end loop;
    for rec in select * from jsonb_to_recordset(l.created_scores) as x(sheet_id uuid, student_id uuid) loop
      delete from conduct_scores where sheet_id = rec.sheet_id and student_id = rec.student_id and updated_at = b.created_at;
      if found then d_new := d_new + 1; else k_c := k_c + 1; end if;
    end loop;
    delete from conduct_sheets sh where sh.id = any (l.created_sheets) and not exists (select 1 from conduct_scores c where c.sheet_id = sh.id);
    get diagnostics d_sh = row_count;
  end if;
  v := public.branch_import_undo(p_batch);
  update import_batches set undone_summary = coalesce(undone_summary, '{}'::jsonb) || jsonb_build_object('conduct_deleted', d_new, 'conduct_restored', r_over, 'conduct_kept', k_c)
   where id = p_batch;
  return v || jsonb_build_object('conduct_deleted', d_new, 'conduct_restored', r_over, 'conduct_kept', k_c);
end $$;

revoke all on function public.conduct_fill_all(uuid)                                        from public, anon;
revoke all on function public.conduct_clear_fill(uuid)                                      from public, anon;
revoke all on function public.conduct_admin_stats()                                         from public, anon;
revoke all on function public.branch_import_commit2(uuid, smallint, boolean, text, jsonb, jsonb) from public, anon;
revoke all on function public.branch_import_undo2(uuid)                                     from public, anon;
grant execute on function public.conduct_fill_all(uuid)                                        to authenticated;
grant execute on function public.conduct_clear_fill(uuid)                                      to authenticated;
grant execute on function public.conduct_admin_stats()                                         to authenticated;
grant execute on function public.branch_import_commit2(uuid, smallint, boolean, text, jsonb, jsonb) to authenticated;
grant execute on function public.branch_import_undo2(uuid)                                     to authenticated;
notify pgrst, 'reload schema';
