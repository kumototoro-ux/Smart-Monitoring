-- =====================================================================
--  مِرقاة — حفظ «ملف الفرع» (الطلاب والدرجات) دفعة واحدة مع إمكانية التراجع
--  شغّل هذا الملف مرة واحدة في SQL Editor، وإعادة تشغيله آمنة.
--   • الحفظ كله في عملية واحدة: إما تنجح كلها أو لا يتغير شيء.
--   • الدرجة الموجودة لا تُستبدل إلا إذا طُلب ذلك صراحة (p_overwrite).
--   • كل دفعة تُسجَّل في import_batches ويمكن التراجع عنها.
--   • للأدمن فقط. العمل مجمّع (set-based) فيكفي ثوانٍ لآلاف الدرجات.
-- =====================================================================

create table if not exists public.import_batches (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid references public.branches(id) on delete set null,
  branch_name         text not null,
  term                smallint not null,
  academic_year       text not null,
  file_name           text,
  overwrite           boolean not null default false,
  created_by          uuid references public.profiles(id) on delete set null,
  created_by_name     text,
  created_at          timestamptz not null default now(),
  summary             jsonb not null default '{}',
  created_sections    uuid[] not null default '{}',
  created_students    uuid[] not null default '{}',
  updated_students    jsonb  not null default '[]',   -- [{id, old:{...}}]
  created_submissions uuid[] not null default '{}',
  created_results    uuid[] not null default '{}',
  overwritten_results jsonb  not null default '[]',   -- [{id, score, verbal_level_id, is_absent, updated_by, updated_at}]
  undone_at           timestamptz,
  undone_by           uuid references public.profiles(id) on delete set null,
  undone_summary      jsonb
);
create index if not exists import_batches_created_idx on public.import_batches(created_at desc);
alter table public.import_batches enable row level security;
drop policy if exists import_batches_read on public.import_batches;
create policy import_batches_read on public.import_batches for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- الحفظ
-- p_sections: [{key, grade_id, name}]  شعب جديدة تُنشأ إن لم تكن موجودة
-- p_rows: [{kind:'new'|'update'|'adopt'|'matched', student_id, grade_id, section_id, section_key,
--           full_name, student_number, national_id, name_en, birth_date, nationality, id_type, gender,
--           results:[{component_id, score, verbal_level_id, absent}]}]
-- ---------------------------------------------------------------------
create or replace function public.branch_import_commit(
  p_branch uuid, p_term smallint, p_overwrite boolean, p_file text, p_sections jsonb, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_set    settings%rowtype;
  v_now    timestamptz := now();
  v_br     branches%rowtype;
  v_me     profiles%rowtype;
  v_batch  uuid := gen_random_uuid();
  v_bad    int;
  v_secs   uuid[] := '{}';
  v_nstu   uuid[] := '{}';
  v_upd    jsonb  := '[]';
  v_subs   uuid[] := '{}';
  v_nres   uuid[] := '{}';
  v_over   jsonb  := '[]';
  n_new int := 0; n_upd int := 0; n_res_new int := 0; n_same int := 0; n_conf int := 0; n_over int := 0; n_abs int := 0;
begin
  if not public.is_admin() then
    raise exception using message = 'حفظ ملف الفرع للمسؤول فقط', hint = 'FORBIDDEN';
  end if;
  if p_term not in (1, 2) then raise exception using message = 'الفصل غير صحيح', hint = 'VALIDATION'; end if;
  select * into v_set from settings where id = 1;
  select * into v_br from branches where id = p_branch;
  if v_br.id is null then raise exception using message = 'الفرع غير موجود', hint = 'NOT_FOUND'; end if;
  select * into v_me from profiles where id = auth.uid();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception using message = 'لا توجد صفوف للحفظ', hint = 'VALIDATION';
  end if;
  if jsonb_array_length(p_rows) > 4000 then
    raise exception using message = 'الدفعة كبيرة (أكثر من 4000 صف). قسّمي الملف.', hint = 'VALIDATION';
  end if;

  -- ===== الصفوف =====
  create temp table _rows on commit drop as
  select (r.ord - 1)::int as idx,
         r.v->>'kind' as kind,
         nullif(r.v->>'student_id', '')::uuid as sid,
         gen_random_uuid() as new_id,
         (r.v->>'grade_id')::uuid as grade_id,
         nullif(r.v->>'section_id', '')::uuid as section_id,
         nullif(r.v->>'section_key', '') as section_key,
         btrim(regexp_replace(coalesce(r.v->>'full_name', ''), '\s+', ' ', 'g')) as full_name,
         nullif(btrim(coalesce(r.v->>'student_number', '')), '') as student_number,
         nullif(btrim(coalesce(r.v->>'national_id', '')), '') as national_id,
         nullif(btrim(coalesce(r.v->>'name_en', '')), '') as name_en,
         nullif(btrim(coalesce(r.v->>'birth_date', '')), '') as birth_date,
         nullif(btrim(coalesce(r.v->>'nationality', '')), '') as nationality,
         nullif(btrim(coalesce(r.v->>'id_type', '')), '') as id_type,
         nullif(r.v->>'gender', '') as gender,
         coalesce(r.v->'results', '[]'::jsonb) as res
  from jsonb_array_elements(p_rows) with ordinality r(v, ord);

  if exists (select 1 from _rows where kind not in ('new', 'update', 'adopt', 'matched') or full_name = '' or grade_id is null) then
    raise exception using message = 'بيانات الصفوف غير صحيحة', hint = 'VALIDATION';
  end if;
  if exists (select 1 from _rows where kind <> 'new' and sid is null) then
    raise exception using message = 'صف موجود بلا معرّف طالب', hint = 'VALIDATION';
  end if;
  -- الصف مفتوح في الفرع
  select count(*) into v_bad from _rows r where not exists (select 1 from branch_grades bg where bg.branch_id = p_branch and bg.grade_id = r.grade_id);
  if v_bad > 0 then raise exception using message = 'يوجد صف دراسي غير مفتوح في هذا الفرع', hint = 'VALIDATION'; end if;
  -- الطلاب الموجودون يتبعون الفرع والصف نفسهما
  select count(*) into v_bad from _rows r join students s on s.id = r.sid where s.branch_id <> p_branch or s.grade_id <> r.grade_id;
  if v_bad > 0 then raise exception using message = 'يوجد طالب لا يتبع هذا الفرع/الصف', hint = 'VALIDATION'; end if;
  select count(*) into v_bad from _rows r where kind <> 'new' and not exists (select 1 from students s where s.id = r.sid);
  if v_bad > 0 then raise exception using message = 'يوجد طالب غير موجود. أعيدي رفع الملف.', hint = 'VALIDATION'; end if;

  -- ===== الشعب الجديدة =====
  create temp table _sec on commit drop as
  select x->>'key' as key, (x->>'grade_id')::uuid as grade_id, btrim(x->>'name') as name, null::uuid as id
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) x;
  update _sec s set id = (select id from sections where branch_id = p_branch and grade_id = s.grade_id and name = s.name limit 1);
  insert into branch_grades (branch_id, grade_id)
    select distinct p_branch, grade_id from _sec where id is null
    on conflict do nothing;
  with ins as (
    insert into sections (branch_id, grade_id, name, sort_order)
    select p_branch, grade_id, name, 1 from _sec where id is null
    returning id
  ) select coalesce(array_agg(id), '{}') into v_secs from ins;
  update _sec s set id = (select id from sections where branch_id = p_branch and grade_id = s.grade_id and name = s.name limit 1) where id is null;
  update _rows r set section_id = s.id from _sec s where r.section_key is not null and r.section_id is null and s.key = r.section_key;
  if exists (select 1 from _rows where section_key is not null and section_id is null) then
    raise exception using message = 'تعذّر إنشاء شعبة', hint = 'VALIDATION';
  end if;
  -- الشعبة المحددة تتبع الفرع والصف
  select count(*) into v_bad from _rows r join sections sc on sc.id = r.section_id where sc.branch_id <> p_branch or sc.grade_id <> r.grade_id;
  if v_bad > 0 then raise exception using message = 'شعبة لا تتبع الفرع والصف', hint = 'VALIDATION'; end if;

  -- ===== الطلاب الجدد =====
  begin
    with ins as (
      insert into students (id, branch_id, grade_id, section_id, full_name, student_number, national_id, name_en, birth_date, nationality, id_type, gender, source, created_by, is_active)
      select new_id, p_branch, grade_id, section_id, full_name, student_number, national_id, name_en, birth_date, nationality, id_type, gender::gender_type, 'import', auth.uid(), true
      from _rows where kind = 'new'
      returning id
    ) select coalesce(array_agg(id), '{}') into v_nstu from ins;
  exception when unique_violation then
    raise exception using message = 'رقم أكاديمي مسجّل مسبقاً لطالب آخر. أعيدي المعاينة ثم الحفظ.', hint = 'CONFLICT';
  end;
  n_new := coalesce(array_length(v_nstu, 1), 0);
  update _rows set sid = new_id where kind = 'new';

  -- ===== تحديث الموجودين (القيم الفارغة في الملف لا تمسح ما في النظام) =====
  create temp table _upd on commit drop as
  select s.id,
         jsonb_build_object('full_name', s.full_name, 'student_number', s.student_number, 'national_id', s.national_id, 'name_en', s.name_en,
                            'birth_date', s.birth_date, 'nationality', s.nationality, 'id_type', s.id_type, 'gender', s.gender, 'section_id', s.section_id) as old,
         r.full_name as n_name, coalesce(r.student_number, s.student_number) as n_num, coalesce(r.national_id, s.national_id) as n_nid,
         coalesce(r.name_en, s.name_en) as n_en, coalesce(r.birth_date, s.birth_date) as n_bd, coalesce(r.nationality, s.nationality) as n_nat,
         coalesce(r.id_type, s.id_type) as n_idt, coalesce(r.gender::gender_type, s.gender) as n_gender, coalesce(r.section_id, s.section_id) as n_sec
  from _rows r join students s on s.id = r.sid
  where r.kind in ('update', 'adopt');
  delete from _upd u using students s
   where s.id = u.id
     and (s.full_name, s.student_number, s.national_id, s.name_en, s.birth_date, s.nationality, s.id_type, s.gender, s.section_id)
         is not distinct from (u.n_name, u.n_num, u.n_nid, u.n_en, u.n_bd, u.n_nat, u.n_idt, u.n_gender, u.n_sec);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'old', old)), '[]'::jsonb) into v_upd from _upd;
  begin
    update students s set full_name = u.n_name, student_number = u.n_num, national_id = u.n_nid, name_en = u.n_en,
           birth_date = u.n_bd, nationality = u.n_nat, id_type = u.n_idt, gender = u.n_gender, section_id = u.n_sec
    from _upd u where s.id = u.id;
  exception when unique_violation then
    raise exception using message = 'رقم أكاديمي مسجّل مسبقاً لطالب آخر. أعيدي المعاينة ثم الحفظ.', hint = 'CONFLICT';
  end;
  n_upd := jsonb_array_length(v_upd);

  -- ===== الدرجات =====
  create temp table _res on commit drop as
  select r.idx, r.sid, r.grade_id,
         (x->>'component_id')::uuid as component_id,
         nullif(x->>'score', '')::numeric as score,
         nullif(x->>'verbal_level_id', '')::uuid as verbal_level_id,
         coalesce((x->>'absent')::boolean, false) as absent
  from _rows r cross join lateral jsonb_array_elements(r.res) x;

  if exists (select 1 from _res group by sid, component_id having count(*) > 1) then
    raise exception using message = 'يوجد تكرار في درجات الملف', hint = 'VALIDATION';
  end if;
  -- نوع التقييم يتبع صف الطالب ومادة فعّالة في هذا الفرع
  select count(*) into v_bad from _res x
    left join assessment_components c on c.id = x.component_id
    left join grade_subjects gs on gs.id = c.grade_subject_id
   where c.id is null or gs.grade_id <> x.grade_id
      or exists (select 1 from branch_subject_exclusions e where e.branch_id = p_branch and e.grade_subject_id = gs.id);
  if v_bad > 0 then raise exception using message = 'يوجد نوع تقييم لا يتبع صف الطالب أو مادة موقوفة للفرع. حمّلي ملفاً جديداً.', hint = 'VALIDATION'; end if;
  -- صحة القيم
  select count(*) into v_bad from _res x join assessment_components c on c.id = x.component_id
   where not x.absent and (
         (x.score is null and x.verbal_level_id is null) or (x.score is not null and x.verbal_level_id is not null)
      or (x.score is not null and (x.score < 0 or c.max_score is null or x.score > c.max_score or x.score * 4 <> trunc(x.score * 4)))
      or (x.verbal_level_id is not null and not exists (select 1 from verbal_levels vl where vl.id = x.verbal_level_id and vl.grade_id = x.grade_id)));
  if v_bad > 0 then raise exception using message = 'يوجد درجات غير صحيحة في الملف. أعيدي المعاينة.', hint = 'VALIDATION'; end if;
  -- كل طالب له درجات يلزم أن تكون له شعبة
  if exists (select 1 from _res x join students s on s.id = x.sid where s.section_id is null) then
    raise exception using message = 'يوجد طالب له درجات وبلا شعبة. حدّدي شعبته في الملف.', hint = 'VALIDATION';
  end if;

  -- الكشوف (واحد لكل شعبة × نوع تقييم × فصل)
  with need as (
    select distinct s.section_id, c.grade_subject_id, x.component_id
    from _res x join students s on s.id = x.sid join assessment_components c on c.id = x.component_id
  ), ins as (
    insert into submissions (section_id, grade_subject_id, component_id, term, academic_year, submitted_by, edit_until)
    select section_id, grade_subject_id, component_id, p_term, v_set.academic_year, auth.uid(), v_now + make_interval(days => v_set.edit_window_days)
    from need
    on conflict (section_id, component_id, term, academic_year) do nothing
    returning id
  ) select coalesce(array_agg(id), '{}') into v_subs from ins;

  create temp table _cls on commit drop as
  select x.sid, x.component_id, x.score, x.verbal_level_id, x.absent, sb.id as submission_id,
         ex.id as ex_id, ex.score as o_score, ex.verbal_level_id as o_vl, ex.is_absent as o_abs, ex.updated_by as o_by, ex.updated_at as o_at,
         case when ex.id is null then 'new'
              when (ex.is_absent, ex.score, ex.verbal_level_id) is not distinct from (x.absent, case when x.absent then null else x.score end, case when x.absent then null else x.verbal_level_id end) then 'same'
              else 'conflict' end as cls
  from _res x
  join students st on st.id = x.sid
  join assessment_components c on c.id = x.component_id
  join submissions sb on sb.section_id = st.section_id and sb.component_id = x.component_id and sb.term = p_term and sb.academic_year = v_set.academic_year
  left join results ex on ex.student_id = x.sid and ex.component_id = x.component_id and ex.term = p_term and ex.academic_year = v_set.academic_year;

  with ins as (
    insert into results (student_id, component_id, submission_id, term, academic_year, score, verbal_level_id, is_absent, updated_by, updated_at)
    select sid, component_id, submission_id, p_term, v_set.academic_year,
           case when absent then null else score end, case when absent then null else verbal_level_id end, absent, auth.uid(), v_now
    from _cls where cls = 'new'
    returning id
  ) select coalesce(array_agg(id), '{}') into v_nres from ins;
  n_res_new := coalesce(array_length(v_nres, 1), 0);
  select count(*) into n_same from _cls where cls = 'same';
  select count(*) into n_conf from _cls where cls = 'conflict';
  select count(*) into n_abs from _res where absent;

  if p_overwrite and n_conf > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('id', ex_id, 'score', o_score, 'verbal_level_id', o_vl, 'is_absent', o_abs, 'updated_by', o_by, 'updated_at', o_at)), '[]'::jsonb)
      into v_over from _cls where cls = 'conflict';
    update results r set score = case when c.absent then null else c.score end,
           verbal_level_id = case when c.absent then null else c.verbal_level_id end,
           is_absent = c.absent, updated_by = auth.uid(), updated_at = v_now
    from _cls c where c.cls = 'conflict' and r.id = c.ex_id;
    n_over := n_conf; n_conf := 0;
  end if;

  insert into import_batches (id, branch_id, branch_name, term, academic_year, file_name, overwrite, created_by, created_by_name, created_at, summary,
                              created_sections, created_students, updated_students, created_submissions, created_results, overwritten_results)
  values (v_batch, p_branch, v_br.name, p_term, v_set.academic_year, left(p_file, 200), coalesce(p_overwrite, false), v_me.id, v_me.full_name, v_now,
          jsonb_build_object('students_new', n_new, 'students_updated', n_upd, 'results_new', n_res_new, 'results_same', n_same,
                             'results_overwritten', n_over, 'results_skipped', n_conf, 'absent', n_abs, 'sections_created', coalesce(array_length(v_secs, 1), 0),
                             'rows', jsonb_array_length(p_rows)),
          v_secs, v_nstu, v_upd, v_subs, v_nres, v_over);

  perform write_log('import.branch', 'warning', 'branch', p_branch::text, jsonb_build_object(
    'batch_id', v_batch, 'file', left(p_file, 120), 'students_new', n_new, 'students_updated', n_upd,
    'results_new', n_res_new, 'results_overwritten', n_over, 'results_skipped', n_conf, 'term', p_term));

  return jsonb_build_object('batch_id', v_batch, 'students_new', n_new, 'students_updated', n_upd, 'results_new', n_res_new,
    'results_same', n_same, 'results_overwritten', n_over, 'results_skipped', n_conf, 'sections_created', coalesce(array_length(v_secs, 1), 0));
end $$;
revoke all on function public.branch_import_commit(uuid, smallint, boolean, text, jsonb, jsonb) from public, anon;
grant execute on function public.branch_import_commit(uuid, smallint, boolean, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- التراجع عن دفعة. يحمي أي تعديل جاء بعد الاستيراد (معلمة عدّلت درجة، أو أُضيفت درجات لطالب أُنشئ بالدفعة):
--   • لا يحذف ولا يستعيد إلا ما بقي كما كتبته الدفعة. والباقي يُترك ويُذكر في النتيجة.
-- ---------------------------------------------------------------------
create or replace function public.branch_import_undo(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b import_batches%rowtype;
  d_res int := 0; r_res int := 0; k_res int := 0;
  d_stu int := 0; k_stu int := 0; r_stu int := 0; k_upd int := 0;
  d_sub int := 0; d_sec int := 0;
  rec record;
begin
  if not public.is_admin() then
    raise exception using message = 'التراجع للمسؤول فقط', hint = 'FORBIDDEN';
  end if;
  select * into b from import_batches where id = p_batch for update;
  if b.id is null then raise exception using message = 'الدفعة غير موجودة', hint = 'NOT_FOUND'; end if;
  if b.undone_at is not null then raise exception using message = 'تم التراجع عن هذه الدفعة سابقاً', hint = 'VALIDATION'; end if;

  -- 1) الدرجات المستبدلة: تُعاد لقيمها القديمة إن بقيت كما كتبتها الدفعة
  for rec in select * from jsonb_to_recordset(b.overwritten_results) as x(id uuid, score numeric, verbal_level_id uuid, is_absent boolean, updated_by uuid, updated_at timestamptz) loop
    update results set score = rec.score, verbal_level_id = rec.verbal_level_id, is_absent = rec.is_absent,
           updated_by = rec.updated_by, updated_at = coalesce(rec.updated_at, now())
     where id = rec.id and updated_at = b.created_at;
    if found then r_res := r_res + 1; else k_res := k_res + 1; end if;
  end loop;

  -- 2) الدرجات الجديدة: تُحذف إن لم يعدّلها أحد بعد الدفعة
  delete from results where id = any(b.created_results) and updated_at = b.created_at;
  get diagnostics d_res = row_count;
  k_res := k_res + (coalesce(array_length(b.created_results, 1), 0) - d_res);

  -- 3) الكشوف التي أنشأتها الدفعة وبقيت بلا درجات
  delete from submissions s where s.id = any(b.created_submissions) and not exists (select 1 from results r where r.submission_id = s.id);
  get diagnostics d_sub = row_count;

  -- 4) الطلاب المحدَّثون: تُستعاد بياناتهم إن لم تتغير بعد الدفعة
  for rec in select * from jsonb_to_recordset(b.updated_students) as x(id uuid, old jsonb) loop
    update students set full_name = rec.old->>'full_name', student_number = rec.old->>'student_number', national_id = rec.old->>'national_id',
           name_en = rec.old->>'name_en', birth_date = rec.old->>'birth_date', nationality = rec.old->>'nationality', id_type = rec.old->>'id_type',
           gender = nullif(rec.old->>'gender', '')::gender_type, section_id = nullif(rec.old->>'section_id', '')::uuid
     where id = rec.id and updated_at = b.created_at;
    if found then r_stu := r_stu + 1; else k_upd := k_upd + 1; end if;
  end loop;

  -- 5) الطلاب الجدد: يُحذفون فقط إن لم تبقَ لهم أي درجات (حتى لا نمسح رصد معلمة أُضيف بعد الاستيراد)
  delete from students s where s.id = any(b.created_students) and not exists (select 1 from results r where r.student_id = s.id);
  get diagnostics d_stu = row_count;
  k_stu := coalesce(array_length(b.created_students, 1), 0) - d_stu;

  -- 6) الشعب الجديدة: تُحذف إن بقيت فارغة تماماً
  delete from sections sc where sc.id = any(b.created_sections)
     and not exists (select 1 from students s where s.section_id = sc.id)
     and not exists (select 1 from submissions s where s.section_id = sc.id)
     and not exists (select 1 from teacher_assignments t where t.section_id = sc.id);
  get diagnostics d_sec = row_count;

  update import_batches set undone_at = now(), undone_by = auth.uid(),
    undone_summary = jsonb_build_object('results_deleted', d_res, 'results_restored', r_res, 'results_kept', k_res,
                                       'students_deleted', d_stu, 'students_kept', k_stu, 'students_restored', r_stu, 'students_kept_changed', k_upd,
                                       'sections_deleted', d_sec, 'submissions_deleted', d_sub)
   where id = p_batch;

  perform write_log('import.branch_undo', 'warning', 'branch', coalesce(b.branch_id::text, ''), jsonb_build_object(
    'batch_id', p_batch, 'results_deleted', d_res, 'results_restored', r_res, 'students_deleted', d_stu, 'students_kept', k_stu));

  return jsonb_build_object('results_deleted', d_res, 'results_restored', r_res, 'results_kept', k_res,
    'students_deleted', d_stu, 'students_kept', k_stu, 'students_restored', r_stu, 'students_kept_changed', k_upd, 'sections_deleted', d_sec);
end $$;
revoke all on function public.branch_import_undo(uuid) from public, anon;
grant execute on function public.branch_import_undo(uuid) to authenticated;

notify pgrst, 'reload schema';
