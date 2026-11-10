-- =====================================================================
-- 0011: مسودات الرصد على السيرفر
--  - نسخة احتياطية من مسودة المعلمة (تنتقل معها بين الأجهزة وتنجو من مسح المتصفح)
--  - صف واحد لكل (معلمة × كشف × ترم) يُحدَّث ولا يتراكم، ويُحذف عند الحفظ النهائي
--  - صاحبة المسودة وحدها تقرأ وتكتب مسودتها؛ الأدمن يقرأ ويحذف الكل؛
--    المشرفة ترى ملخصاً فقط (بدون الدرجات) عبر branch_sheet_drafts
--  - المسودة ليست درجات معتمدة: لا تدخل في أي نتيجة أو تقرير
-- =====================================================================

create table if not exists public.sheet_drafts (
  teacher_id       uuid not null references public.profiles(id) on delete cascade,
  section_id       uuid not null references public.sections(id) on delete cascade,
  grade_subject_id uuid not null references public.grade_subjects(id) on delete cascade,
  term             smallint not null check (term in (1, 2)),
  academic_year    text not null,
  payload          jsonb not null,
  filled           int not null default 0 check (filled >= 0),
  total            int not null default 0 check (total >= 0),
  base_sig         text,          -- بصمة الكشف الرسمي وقت كتابة المسودة (لكشف تغيّره بعدها)
  device_id        text,          -- معرّف عشوائي للمتصفح (لمعرفة أن المسودة من جهاز آخر)
  device_label     text,          -- «جوال» / «حاسوب»
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (teacher_id, section_id, grade_subject_id, term),
  constraint sheet_drafts_size check (pg_column_size(payload) < 262144)
);
create index if not exists sheet_drafts_section_idx on public.sheet_drafts (section_id);
create index if not exists sheet_drafts_updated_idx on public.sheet_drafts (updated_at);

create or replace function public._sheet_drafts_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists sheet_drafts_touch on public.sheet_drafts;
create trigger sheet_drafts_touch before update on public.sheet_drafts
  for each row execute function public._sheet_drafts_touch();

alter table public.sheet_drafts enable row level security;

drop policy if exists drafts_select on public.sheet_drafts;
create policy drafts_select on public.sheet_drafts for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists drafts_insert on public.sheet_drafts;
create policy drafts_insert on public.sheet_drafts for insert to authenticated
  with check (teacher_id = auth.uid() and public.teaches(section_id, grade_subject_id));

drop policy if exists drafts_update on public.sheet_drafts;
create policy drafts_update on public.sheet_drafts for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid() and public.teaches(section_id, grade_subject_id));

drop policy if exists drafts_delete on public.sheet_drafts;
create policy drafts_delete on public.sheet_drafts for delete to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.sheet_drafts to authenticated;
grant all on public.sheet_drafts to service_role;

-- ---------------------------------------------------------------------
-- ملخص مسودات فرع (بدون الدرجات) للأدمن والمشرفة
-- ---------------------------------------------------------------------
create or replace function public.branch_sheet_drafts(p_branch uuid)
returns table (
  teacher_id uuid, section_id uuid, grade_subject_id uuid, term smallint,
  filled int, total int, updated_at timestamptz, device_label text
)
language sql stable security definer set search_path = public as $$
  select d.teacher_id, d.section_id, d.grade_subject_id, d.term, d.filled, d.total, d.updated_at, d.device_label
    from public.sheet_drafts d
    join public.sections s on s.id = d.section_id
   where s.branch_id = p_branch
     and d.term = (select current_term from public.settings where id = 1)
     and d.academic_year = (select academic_year from public.settings where id = 1)
     and (public.is_admin() or public.is_supervisor_of(p_branch))
$$;
revoke all on function public.branch_sheet_drafts(uuid) from public;
grant execute on function public.branch_sheet_drafts(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- تنظيف: مسودات أقدم من 45 يوماً، أو كشف اكتمل حفظه بعد آخر تحديث للمسودة
-- (تُستدعى من مهمة cron اليومية بصلاحية service_role فقط)
-- ---------------------------------------------------------------------
create or replace function public.cleanup_sheet_drafts() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with doomed as (
    select d.teacher_id, d.section_id, d.grade_subject_id, d.term
      from public.sheet_drafts d
     where d.updated_at < now() - interval '45 days'
        or (
          (select count(*) from public.assessment_components c where c.grade_subject_id = d.grade_subject_id) > 0
          and (select count(*) from public.submissions s
                where s.section_id = d.section_id and s.term = d.term and s.academic_year = d.academic_year
                  and s.component_id in (select c.id from public.assessment_components c where c.grade_subject_id = d.grade_subject_id))
              = (select count(*) from public.assessment_components c where c.grade_subject_id = d.grade_subject_id)
          and (select max(coalesce(s.last_edited_at, s.submitted_at)) from public.submissions s
                where s.section_id = d.section_id and s.term = d.term and s.academic_year = d.academic_year
                  and s.component_id in (select c.id from public.assessment_components c where c.grade_subject_id = d.grade_subject_id)) > d.updated_at
        )
  )
  delete from public.sheet_drafts d using doomed x
   where d.teacher_id = x.teacher_id and d.section_id = x.section_id
     and d.grade_subject_id = x.grade_subject_id and d.term = x.term;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.cleanup_sheet_drafts() from public, authenticated;
grant execute on function public.cleanup_sheet_drafts() to service_role;

-- ---------------------------------------------------------------------
-- تنبيه الدخول (يستبدل نسخة 0010): يضيف مسودات السيرفر كمصدر ثالث
-- ---------------------------------------------------------------------
drop function if exists public.my_unsaved_sheets(jsonb);
create or replace function public.my_unsaved_sheets(p_drafts jsonb default '[]'::jsonb)
returns table (
  section_id uuid, grade_subject_id uuid, kind text, on_device boolean, server_draft boolean,
  last_event timestamptz, filled int, total int,
  section_name text, grade_name text, subject_name text
)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  cfg as (select current_term as t, academic_year as y from public.settings where id = 1),
  act as (
    select (a.details->>'section_id')::uuid as sid, (a.details->>'grade_subject_id')::uuid as gid,
           max(a.created_at) as last_event,
           (array_agg(case when a.details->>'filled' ~ '^[0-9]{1,6}$' then (a.details->>'filled')::int end order by a.created_at desc))[1] as filled,
           (array_agg(case when a.details->>'total'  ~ '^[0-9]{1,6}$' then (a.details->>'total')::int  end order by a.created_at desc))[1] as total
      from public.audit_logs a, me, cfg
     where a.actor_id = me.uid
       and a.action in ('client.sheet.started', 'client.sheet.abandoned')
       and a.created_at >= now() - interval '90 days'
       and a.details->>'section_id'       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and a.details->>'grade_subject_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (case when a.details->>'term' ~ '^[12]$' then (a.details->>'term')::int else cfg.t end) = cfg.t
     group by 1, 2
  ),
  dr as (
    select (e->>'section_id')::uuid as sid, (e->>'grade_subject_id')::uuid as gid,
           max(to_timestamp((e->>'at')::bigint / 1000.0)) as at
      from jsonb_array_elements(case when jsonb_typeof(p_drafts) = 'array' then p_drafts else '[]'::jsonb end) e, cfg
     where e->>'section_id'       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and e->>'grade_subject_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and e->>'at' ~ '^[0-9]{10,14}$'
       and (e->>'term') = cfg.t::text
     group by 1, 2
  ),
  sd as (
    select d.section_id as sid, d.grade_subject_id as gid, d.updated_at as at, d.filled, d.total
      from public.sheet_drafts d, me, cfg
     where d.teacher_id = me.uid and d.term = cfg.t and d.academic_year = cfg.y
  ),
  keys as (select sid, gid from act union select sid, gid from dr union select sid, gid from sd),
  calc as (
    select k.sid, k.gid, act.last_event as ev, act.filled as a_filled, act.total as a_total,
           dr.at as local_at, sd.at as srv_at, sd.filled as s_filled, sd.total as s_total,
           (select count(*) from public.assessment_components c where c.grade_subject_id = k.gid) as n_comps,
           (select count(*) from public.submissions s, cfg
             where s.section_id = k.sid and s.term = cfg.t and s.academic_year = cfg.y
               and s.component_id in (select c.id from public.assessment_components c where c.grade_subject_id = k.gid)) as n_saved,
           (select max(coalesce(s.last_edited_at, s.submitted_at)) from public.submissions s, cfg
             where s.section_id = k.sid and s.term = cfg.t and s.academic_year = cfg.y
               and s.component_id in (select c.id from public.assessment_components c where c.grade_subject_id = k.gid)) as last_save
      from keys k
      left join act on act.sid = k.sid and act.gid = k.gid
      left join dr  on dr.sid  = k.sid and dr.gid  = k.gid
      left join sd  on sd.sid  = k.sid and sd.gid  = k.gid
  )
  select c.sid, c.gid,
         case when c.n_saved = 0 then 'unsaved' else 'edit' end,
         (c.local_at is not null and c.local_at > coalesce(c.last_save, '-infinity'::timestamptz)),
         (c.srv_at   is not null and c.srv_at   > coalesce(c.last_save, '-infinity'::timestamptz)),
         greatest(c.ev, c.local_at, c.srv_at),
         coalesce(c.s_filled, c.a_filled), coalesce(nullif(c.s_total, 0), c.a_total),
         s.name, g.name, sub.name
    from calc c
    join me on true
    join public.teacher_assignments ta on ta.teacher_id = me.uid and ta.section_id = c.sid and ta.grade_subject_id = c.gid
    join public.sections s on s.id = c.sid
    join public.grades g on g.id = s.grade_id
    join public.grade_subjects gs on gs.id = c.gid
    join public.subjects sub on sub.id = gs.subject_id
   where c.n_comps > 0
     and ( coalesce(c.ev,       '-infinity'::timestamptz) > coalesce(c.last_save, '-infinity'::timestamptz)
        or coalesce(c.local_at, '-infinity'::timestamptz) > coalesce(c.last_save, '-infinity'::timestamptz)
        or coalesce(c.srv_at,   '-infinity'::timestamptz) > coalesce(c.last_save, '-infinity'::timestamptz) )
   order by greatest(c.ev, c.local_at, c.srv_at) desc
   limit 30
$$;
revoke all on function public.my_unsaved_sheets(jsonb) from public;
grant execute on function public.my_unsaved_sheets(jsonb) to authenticated;

notify pgrst, 'reload schema';
