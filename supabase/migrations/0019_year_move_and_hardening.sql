-- =====================================================================
--  مِرقاة — (1) نقل بيانات عام دراسي إلى عام آخر بأمان، (2) إغلاق ثغرة تعرّض الدوال لغير المسجّلين
--  شغّل هذا الملف مرة واحدة في SQL Editor، وإعادة تشغيله آمنة.
--
--  (1) year_move(من، إلى، هل يصبح الحالي):
--      • للأدمن فقط، ويشترط إغلاق الرصد حتى لا يحفظ معلّم أثناء النقل.
--      • يرفض إن وُجدت بيانات أصلاً في العام الهدف (لا دمج ولا استبدال).
--      • عملية واحدة: إما تنجح كلها أو لا يتغير شيء. لا يحذف ولا يعدّل أي درجة.
--      • التراجع: نقل عكسي (من الهدف إلى المصدر) بنفس الدالة.
--  (2) إلغاء صلاحية تنفيذ دوال النظام عن الزائر غير المسجّل (anon) وعن PUBLIC،
--      مع إبقائها للمسجّلين كما كانت. لا يتغير أي سلوك للمستخدمات.
-- =====================================================================

create or replace function public.year_move(p_from text, p_to text, p_make_current boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f text := btrim(coalesce(p_from, '')); t text := btrim(coalesce(p_to, ''));
  n_res bigint; n_sub bigint; n_exc bigint := 0; n_drf bigint := 0; n_iss bigint := 0;
  has_drf boolean := to_regclass('public.sheet_drafts') is not null;
  has_iss boolean := to_regclass('public.notice_issues') is not null;
  busy bigint;
begin
  if not public.is_admin() then raise exception 'غير مصرّح' using hint = 'FORBIDDEN'; end if;
  if f = '' or t = '' or char_length(f) > 20 or char_length(t) > 20 then raise exception 'اكتبي العامين بشكل صحيح' using hint = 'VALIDATION'; end if;
  if f = t then raise exception 'العامان متطابقان' using hint = 'VALIDATION'; end if;
  if exists (select 1 from public.settings where id = 1 and grading_open) then
    raise exception 'أغلقي الرصد من الإعدادات أولاً ثم أعيدي المحاولة' using hint = 'CONFLICT';
  end if;

  -- قفل الجداول المعنية حتى لا يتداخل حفظ آخر مع النقل
  lock table public.results, public.submissions, public.sheet_exclusions in share row exclusive mode;

  select count(*) into busy from public.results where academic_year = t;
  select busy + count(*) into busy from public.submissions where academic_year = t;
  select busy + count(*) into busy from public.sheet_exclusions where academic_year = t;
  if has_drf then execute format('select count(*) from public.sheet_drafts where academic_year = %L', t) into n_drf; busy := busy + n_drf; end if;
  if has_iss then execute format('select count(*) from public.notice_issues where academic_year = %L', t) into n_iss; busy := busy + n_iss; end if;
  if busy > 0 then
    raise exception 'توجد بيانات مسجّلة أصلاً تحت % ولا يمكن الدمج معها. انقلي العام الهدف أولاً أو اختاري عاماً فارغاً.', t using hint = 'CONFLICT';
  end if;

  select count(*) into n_res from public.results where academic_year = f;
  select count(*) into n_sub from public.submissions where academic_year = f;
  if n_res + n_sub = 0 then raise exception 'لا توجد درجات أو كشوف تحت العام %', f using hint = 'NOT_FOUND'; end if;

  update public.results          set academic_year = t where academic_year = f;
  update public.submissions      set academic_year = t where academic_year = f;
  update public.sheet_exclusions set academic_year = t where academic_year = f; get diagnostics n_exc = row_count;
  n_drf := 0; n_iss := 0;
  if has_drf then execute format('update public.sheet_drafts set academic_year = %L where academic_year = %L', t, f); get diagnostics n_drf = row_count; end if;
  if has_iss then execute format('update public.notice_issues set academic_year = %L where academic_year = %L', t, f); get diagnostics n_iss = row_count; end if;
  if p_make_current then update public.settings set academic_year = t where id = 1; end if;

  perform write_log('year.move', 'warning', 'settings', '1', jsonb_build_object(
    'from', f, 'to', t, 'make_current', p_make_current, 'results', n_res, 'submissions', n_sub, 'exclusions', n_exc, 'drafts', n_drf, 'notice_issues', n_iss));
  return jsonb_build_object('results', n_res, 'submissions', n_sub, 'exclusions', n_exc, 'drafts', n_drf, 'notice_issues', n_iss, 'made_current', p_make_current);
end $$;

revoke all on function public.year_move(text, text, boolean) from public, anon;
grant execute on function public.year_move(text, text, boolean) to authenticated;

-- ---------- (2) إغلاق التنفيذ عن الزائر غير المسجّل ----------
do $$
declare r record; had_auth boolean; had_srv boolean; sig text;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    sig := format('public.%I(%s)', r.proname, r.args);
    had_auth := has_function_privilege('authenticated', r.oid, 'execute');
    had_srv  := coalesce(has_function_privilege('service_role', r.oid, 'execute'), false);
    execute format('revoke all on function %s from public, anon', sig);
    if had_auth then execute format('grant execute on function %s to authenticated', sig); end if;
    if had_srv  then execute format('grant execute on function %s to service_role', sig); end if;
  end loop;
end $$;

-- أي دالة تُنشأ مستقبلاً لا تُمنح للزائر ولا لـPUBLIC تلقائياً
alter default privileges in schema public revoke execute on functions from public, anon;
