-- =====================================================================
--  نقل كل بيانات السنة الدراسية من 1447هـ إلى 1448هـ (مرة واحدة)
--  ما يفعله، في عملية واحدة (إما تنجح كلها أو لا يتغير شيء):
--   1) يتوقف بخطأ واضح إذا وُجدت بيانات مسجّلة أصلاً تحت 1448هـ.
--   2) يأخذ نسخة احتياطية في schema backup_year_move.
--   3) ينقل الرصد والكشوف والاستثناءات والمسودات وسجل الإشعارات إلى 1448هـ.
--   4) يضبط السنة في الإعدادات على 1448هـ.
--  لا يحذف أي درجة ولا يعدّل قيمتها.
-- =====================================================================
do $$
declare
  v_old text := '1447هـ';
  v_new text := '1448هـ';
  n_res bigint; n_sub bigint; n_exc bigint; n_drf bigint; n_iss bigint;
begin
  select count(*) into n_res from public.results           where academic_year = v_new;
  select count(*) into n_sub from public.submissions       where academic_year = v_new;
  select count(*) into n_exc from public.sheet_exclusions  where academic_year = v_new;
  if n_res + n_sub + n_exc > 0 then
    raise exception 'توجد بيانات مسجّلة أصلاً تحت % (درجات: %، كشوف: %، استثناءات: %). لا ننقل حتى نراجعها معاً.', v_new, n_res, n_sub, n_exc;
  end if;

  create schema if not exists backup_year_move;
  revoke all on schema backup_year_move from public, anon, authenticated;
  create table if not exists backup_year_move.settings          as select * from public.settings;
  create table if not exists backup_year_move.results           as select * from public.results;
  create table if not exists backup_year_move.submissions       as select * from public.submissions;
  create table if not exists backup_year_move.sheet_exclusions  as select * from public.sheet_exclusions;
  revoke all on all tables in schema backup_year_move from public, anon, authenticated;

  update public.results          set academic_year = v_new where academic_year = v_old; get diagnostics n_res = row_count;
  update public.submissions      set academic_year = v_new where academic_year = v_old; get diagnostics n_sub = row_count;
  update public.sheet_exclusions set academic_year = v_new where academic_year = v_old; get diagnostics n_exc = row_count;
  if to_regclass('public.sheet_drafts') is not null then
    execute format('update public.sheet_drafts set academic_year = %L where academic_year = %L', v_new, v_old);
    get diagnostics n_drf = row_count;
  end if;
  if to_regclass('public.notice_issues') is not null then
    execute format('update public.notice_issues set academic_year = %L where academic_year = %L', v_new, v_old);
    get diagnostics n_iss = row_count;
  end if;
  update public.settings set academic_year = v_new where id = 1;

  raise notice 'تم النقل إلى %: درجات %، كشوف %، استثناءات %، مسودات %، سجل إشعارات %', v_new, n_res, n_sub, n_exc, coalesce(n_drf, 0), coalesce(n_iss, 0);
end $$;

-- تحقق بعد التشغيل (المطلوب: لا شيء تحت 1447هـ، والإعدادات 1448هـ)
select 'results' as t, academic_year, count(*) from public.results group by 2
union all select 'submissions', academic_year, count(*) from public.submissions group by 2
union all select 'settings', academic_year, 1 from public.settings;
