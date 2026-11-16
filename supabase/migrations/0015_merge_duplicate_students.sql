-- =====================================================================
--  مِرقاة — دمج الطلاب المكرّرين (للأدمن فقط)
--  شغّل هذا الملف مرة واحدة في SQL Editor، وإعادة تشغيله آمنة.
--
--  الفكرة: اسمان لنفس الطالب → تُنقل درجات الاسم المكرر إلى الاسم الصحيح ثم يُحذف المكرر.
--   • الاسمان في نفس الفرع ونفس الصف (أنواع التقييم تتبع الصف).
--   • أي تعارض (درجة لنفس المادة والفصل عند الاثنين) يحسمه الأدمن صراحةً قبل الدمج.
--   • كل عملية تُحفظ في أرشيف student_merges ويمكن التراجع عنها (إعادة الاسم المحذوف ودرجاته).
--   • الكتابة عبر الدوال فقط، والقراءة للأدمن فقط.
-- =====================================================================

create table if not exists public.student_merges (
  id                  uuid primary key default gen_random_uuid(),
  kept_id             uuid references public.students(id) on delete set null,
  kept_name           text not null,
  removed_id          uuid not null,                 -- معرّف الاسم المحذوف الأصلي (يُعاد به عند التراجع)
  removed_name        text not null,
  removed_number      text,
  branch_id           uuid references public.branches(id) on delete cascade,
  removed_row         jsonb not null,                -- نسخة كاملة من سجل الطالب المحذوف
  moved_results       uuid[] not null default '{}',  -- درجات نُقلت إلى الاسم الصحيح
  overwritten_results jsonb  not null default '[]',  -- درجات الاسم الصحيح التي حُسم التعارض لصالح غيرها
  dropped_results     jsonb  not null default '[]',  -- درجات المكرر التي حُسم التعارض ضدها
  moved_exclusions    jsonb  not null default '[]',
  dropped_exclusions  jsonb  not null default '[]',
  moved_issues        uuid[] not null default '{}',
  merged_by           uuid references public.profiles(id) on delete set null,
  merged_by_name      text,
  merged_at           timestamptz not null default now(),
  undone_at           timestamptz,
  undone_by           uuid references public.profiles(id) on delete set null
);
create index if not exists student_merges_at_idx on public.student_merges(merged_at desc);
create index if not exists student_merges_kept_idx on public.student_merges(kept_id);

alter table public.student_merges enable row level security;
drop policy if exists student_merges_read on public.student_merges;
create policy student_merges_read on public.student_merges for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- عدد درجات كل طالب في العام الحالي (لتقرير المتشابهين)
-- ---------------------------------------------------------------------
create or replace function public.student_result_counts()
returns table (student_id uuid, n integer) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  return query
    select r.student_id, count(*)::int from results r
    where r.academic_year = (select academic_year from settings where id = 1)
    group by r.student_id;
end $$;
revoke all on function public.student_result_counts() from public, anon;
grant execute on function public.student_result_counts() to authenticated;

-- ---------------------------------------------------------------------
-- معاينة الدمج: ما سيُنقل وما يتعارض
-- ---------------------------------------------------------------------
create or replace function public._merge_check(p_keep uuid, p_remove uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare k students%rowtype; r students%rowtype;
begin
  if not public.is_admin() then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then
    raise exception using message = 'اختاري اسمين مختلفين', hint = 'VALIDATION';
  end if;
  select * into k from students where id = p_keep;
  select * into r from students where id = p_remove;
  if k.id is null or r.id is null then
    raise exception using message = 'أحد الاسمين غير موجود', hint = 'NOT_FOUND';
  end if;
  if k.branch_id <> r.branch_id then
    raise exception using message = 'الاسمان في فرعين مختلفين', hint = 'VALIDATION';
  end if;
  if k.grade_id <> r.grade_id then
    raise exception using message = 'الاسمان في صفّين مختلفين: انقلي أحدهما إلى الصف الصحيح من صفحة الطلاب ثم ادمجي', hint = 'VALIDATION';
  end if;
end $$;
revoke all on function public._merge_check(uuid, uuid) from public, anon, authenticated;

create or replace function public.student_merge_preview(p_keep uuid, p_remove uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_year text; v_conf jsonb; v_mov int; v_exc int; v_iss int;
begin
  perform public._merge_check(p_keep, p_remove);
  select academic_year into v_year from settings where id = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'component_id', rr.component_id, 'term', rr.term, 'year', rr.academic_year,
      'component', c.name, 'subject', sub.name,
      'keep',   jsonb_build_object('score', rk.score, 'verbal', vk.label, 'absent', rk.is_absent, 'by', pk.full_name, 'at', rk.updated_at),
      'remove', jsonb_build_object('score', rr.score, 'verbal', vr.label, 'absent', rr.is_absent, 'by', pr.full_name, 'at', rr.updated_at)
    ) order by sub.name, rr.term, c.name), '[]'::jsonb)
  into v_conf
  from results rr
  join results rk on rk.student_id = p_keep and rk.component_id = rr.component_id and rk.term = rr.term and rk.academic_year = rr.academic_year
  join assessment_components c on c.id = rr.component_id
  join grade_subjects gs on gs.id = c.grade_subject_id
  join subjects sub on sub.id = gs.subject_id
  left join verbal_levels vk on vk.id = rk.verbal_level_id
  left join verbal_levels vr on vr.id = rr.verbal_level_id
  left join profiles pk on pk.id = rk.updated_by
  left join profiles pr on pr.id = rr.updated_by
  where rr.student_id = p_remove;

  select count(*)::int into v_mov from results rr
   where rr.student_id = p_remove and not exists (
     select 1 from results rk where rk.student_id = p_keep and rk.component_id = rr.component_id and rk.term = rr.term and rk.academic_year = rr.academic_year);
  select count(*)::int into v_exc from sheet_exclusions x where x.student_id = p_remove and not exists (
     select 1 from sheet_exclusions y where y.student_id = p_keep and y.grade_subject_id = x.grade_subject_id and y.academic_year = x.academic_year);
  select count(*)::int into v_iss from notice_issues where student_id = p_remove;

  return jsonb_build_object('year', v_year, 'conflicts', v_conf, 'movable', v_mov, 'exclusions', v_exc, 'issues', v_iss);
end $$;
revoke all on function public.student_merge_preview(uuid, uuid) from public, anon;
grant execute on function public.student_merge_preview(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- الدمج. p_choices: [{component_id, term, year, use: 'keep' | 'remove'}] لكل تعارض
--   keep   = تبقى درجة الاسم الصحيح (تُهمل درجة المكرر)
--   remove = تحلّ درجة المكرر محلّ درجة الاسم الصحيح
-- ---------------------------------------------------------------------
create or replace function public.student_merge(p_keep uuid, p_remove uuid, p_choices jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k students%rowtype; r students%rowtype; me profiles%rowtype;
  rr results%rowtype; rk results%rowtype; x sheet_exclusions%rowtype;
  v_use text; v_id uuid;
  v_moved uuid[] := '{}'; v_over jsonb := '[]'; v_drop jsonb := '[]';
  v_mx jsonb := '[]'; v_dx jsonb := '[]'; v_iss uuid[] := '{}';
  v_missing int := 0;
begin
  perform public._merge_check(p_keep, p_remove);
  select * into me from profiles where id = auth.uid();
  -- قفل الاسمين لمنع تعديلات متزامنة أثناء الدمج
  select * into k from students where id = p_keep for update;
  select * into r from students where id = p_remove for update;

  -- كل تعارض يجب أن يكون محسوماً
  for rr in select * from results where student_id = p_remove loop
    select * into rk from results where student_id = p_keep and component_id = rr.component_id and term = rr.term and academic_year = rr.academic_year;
    if rk.id is not null then
      select c->>'use' into v_use from jsonb_array_elements(coalesce(p_choices, '[]'::jsonb)) c
       where (c->>'component_id')::uuid = rr.component_id and (c->>'term')::int = rr.term and c->>'year' = rr.academic_year limit 1;
      if v_use is null or v_use not in ('keep', 'remove') then v_missing := v_missing + 1; end if;
      v_use := null;
    end if;
    rk := null;
  end loop;
  if v_missing > 0 then
    raise exception using message = format('بقي %s تعارض لم يُحسم', v_missing), hint = 'CONFLICTS';
  end if;

  -- الدرجات
  for rr in select * from results where student_id = p_remove order by id loop
    select * into rk from results where student_id = p_keep and component_id = rr.component_id and term = rr.term and academic_year = rr.academic_year;
    if rk.id is null then
      update results set student_id = p_keep where id = rr.id;
      v_moved := v_moved || rr.id;
    else
      select c->>'use' into v_use from jsonb_array_elements(p_choices) c
       where (c->>'component_id')::uuid = rr.component_id and (c->>'term')::int = rr.term and c->>'year' = rr.academic_year limit 1;
      if v_use = 'remove' then
        v_over := v_over || to_jsonb(rk);
        delete from results where id = rk.id;
        update results set student_id = p_keep where id = rr.id;
        v_moved := v_moved || rr.id;
      else
        v_drop := v_drop || to_jsonb(rr);
      end if;
    end if;
    rk := null;
  end loop;

  -- الاستبعاد من المواد
  for x in select * from sheet_exclusions where student_id = p_remove loop
    if exists (select 1 from sheet_exclusions y where y.student_id = p_keep and y.grade_subject_id = x.grade_subject_id and y.academic_year = x.academic_year) then
      v_dx := v_dx || to_jsonb(x);
    else
      update sheet_exclusions set student_id = p_keep where student_id = p_remove and grade_subject_id = x.grade_subject_id and academic_year = x.academic_year;
      v_mx := v_mx || jsonb_build_object('grade_subject_id', x.grade_subject_id, 'academic_year', x.academic_year);
    end if;
  end loop;

  -- سجل الإشعارات الصادرة
  select coalesce(array_agg(id), '{}') into v_iss from notice_issues where student_id = p_remove;
  update notice_issues set student_id = p_keep where student_id = p_remove;

  -- الأرشفة ثم حذف المكرر (ما بقي من مراجعات يُحذف معه)
  insert into student_merges (kept_id, kept_name, removed_id, removed_name, removed_number, branch_id, removed_row,
                              moved_results, overwritten_results, dropped_results, moved_exclusions, dropped_exclusions,
                              moved_issues, merged_by, merged_by_name)
  values (p_keep, k.full_name, p_remove, r.full_name, r.student_number, r.branch_id, to_jsonb(r),
          v_moved, v_over, v_drop, v_mx, v_dx, v_iss, me.id, me.full_name)
  returning id into v_id;
  delete from students where id = p_remove;

  perform write_log('student.merge', 'warning', 'student', p_keep::text, jsonb_build_object(
    'merge_id', v_id, 'kept', k.full_name, 'removed', r.full_name, 'moved', coalesce(array_length(v_moved, 1), 0),
    'overwritten', jsonb_array_length(v_over), 'dropped', jsonb_array_length(v_drop)));

  return jsonb_build_object('merge_id', v_id, 'moved', coalesce(array_length(v_moved, 1), 0),
    'overwritten', jsonb_array_length(v_over), 'dropped', jsonb_array_length(v_drop), 'exclusions', jsonb_array_length(v_mx));
end $$;
revoke all on function public.student_merge(uuid, uuid, jsonb) from public, anon;
grant execute on function public.student_merge(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- التراجع عن دمج: يعيد الاسم المحذوف بمعرّفه ودرجاته
-- ---------------------------------------------------------------------
create or replace function public.student_merge_undo(p_merge uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m student_merges%rowtype; me profiles%rowtype; v_skipped int := 0; v_n int;
begin
  if not public.is_admin() then
    raise exception using message = 'غير مصرّح لك', hint = 'FORBIDDEN';
  end if;
  select * into m from student_merges where id = p_merge for update;
  if m.id is null then raise exception using message = 'العملية غير موجودة', hint = 'NOT_FOUND'; end if;
  if m.undone_at is not null then raise exception using message = 'تم التراجع عن هذا الدمج من قبل', hint = 'VALIDATION'; end if;
  if m.kept_id is null or not exists (select 1 from students where id = m.kept_id) then
    raise exception using message = 'الاسم الصحيح لم يعد موجوداً، لا يمكن التراجع', hint = 'VALIDATION';
  end if;
  if exists (select 1 from students where id = m.removed_id) then
    raise exception using message = 'الاسم المحذوف موجود بالفعل', hint = 'VALIDATION';
  end if;
  select * into me from profiles where id = auth.uid();

  insert into students select (jsonb_populate_record(null::students, m.removed_row)).*;

  update results set student_id = m.removed_id where id = any (m.moved_results) and student_id = m.kept_id;
  -- درجات الاسم الصحيح التي كانت مُستبدَلة، ثم درجات المكرر التي أُهملت
  insert into results select (jsonb_populate_recordset(null::results, m.overwritten_results)).* on conflict do nothing;
  get diagnostics v_n = row_count; v_skipped := v_skipped + (jsonb_array_length(m.overwritten_results) - v_n);
  insert into results select (jsonb_populate_recordset(null::results, m.dropped_results)).* on conflict do nothing;
  get diagnostics v_n = row_count; v_skipped := v_skipped + (jsonb_array_length(m.dropped_results) - v_n);

  update sheet_exclusions e set student_id = m.removed_id
   where e.student_id = m.kept_id and exists (
     select 1 from jsonb_array_elements(m.moved_exclusions) j
      where (j->>'grade_subject_id')::uuid = e.grade_subject_id and j->>'academic_year' = e.academic_year);
  insert into sheet_exclusions select (jsonb_populate_recordset(null::sheet_exclusions, m.dropped_exclusions)).* on conflict do nothing;

  update notice_issues set student_id = m.removed_id where id = any (m.moved_issues);

  update student_merges set undone_at = now(), undone_by = me.id where id = m.id;
  perform write_log('student.merge_undo', 'warning', 'student', m.removed_id::text,
    jsonb_build_object('merge_id', m.id, 'restored', m.removed_name, 'skipped', v_skipped));
  return jsonb_build_object('restored', m.removed_name, 'skipped', v_skipped);
end $$;
revoke all on function public.student_merge_undo(uuid) from public, anon;
grant execute on function public.student_merge_undo(uuid) to authenticated;
