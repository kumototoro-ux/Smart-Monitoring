-- =====================================================================
-- 0008: رقم تعريف مؤقت تلقائي للطالب الذي ليس له رقم أكاديمي
--  - أي طالب يُضاف بدون رقم (من معلمة أو مشرفة أو إكسل أو طلب) يأخذ رقماً مثل TMP-000123
--  - الطلاب المضافون سابقاً بدون رقم يأخذون أرقاماً مؤقتة الآن
--  - الرقم المؤقت يُستبدل بالرقم الأكاديمي الحقيقي بتعديل الطالب، أو باستيراد ملف يحمل نفس الاسم
-- =====================================================================

create sequence if not exists public.student_temp_seq;

-- هل هذا رقم مؤقت أنشأه النظام؟
create or replace function public.is_temp_student_number(p text)
returns boolean language sql immutable as $$ select coalesce(p ~ '^TMP-[0-9]+$', false) $$;

-- يملأ الرقم تلقائياً عند الإضافة أو عند مسح الرقم
create or replace function public.students_fill_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.student_number is null or btrim(new.student_number) = '' then
    new.student_number := 'TMP-' || lpad(nextval('public.student_temp_seq')::text, 6, '0');
  else
    new.student_number := btrim(new.student_number);
  end if;
  return new;
end $$;

drop trigger if exists students_fill_number on public.students;
create trigger students_fill_number
  before insert or update of student_number on public.students
  for each row execute function public.students_fill_number();

-- الطلاب الموجودون بدون رقم: بترتيب الإضافة
with todo as (
  select id, row_number() over (order by created_at, id) as rn
  from public.students
  where student_number is null or btrim(student_number) = ''
), base as (select coalesce(max(substring(student_number from 5)::bigint), 0) as m
            from public.students where public.is_temp_student_number(student_number))
update public.students s
   set student_number = 'TMP-' || lpad((base.m + todo.rn)::text, 6, '0')
  from todo, base
 where s.id = todo.id;

-- المتسلسلة تكمل بعد أكبر رقم مؤقت موجود (ولا ترجع للخلف أبداً حتى لا يُعاد رقم استُخدم من قبل)
do $$
declare m bigint;
begin
  select max(substring(student_number from 5)::bigint) into m
    from public.students where public.is_temp_student_number(student_number);
  if m is not null and m >= (select last_value from public.student_temp_seq) then
    perform setval('public.student_temp_seq', m, true);
  end if;
end $$;

notify pgrst, 'reload schema';
