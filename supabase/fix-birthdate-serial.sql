-- تصحيح تواريخ الميلاد التي حُفظت أرقام إكسل تسلسلية (مثل 42020) إلى تاريخ ميلادي YYYY-MM-DD
-- المعقول لطالب: من 1995-01-01 حتى 2024-12-31. ما خرج عن ذلك (مثل تواريخ سبتمبر 2026) لا يُلمس ويُراجَع من الملف الأصلي.

-- (أ1) معاينة: كم صفاً في كل حالة (لا تغيّر شيئاً)
select case when date '1899-12-30' + birth_date::int between date '1995-01-01' and date '2024-12-31' then '1 سيُصحَّح'
            else '2 غير منطقي — لن يُلمس' end as الحالة,
       count(*) as العدد
from public.students
where birth_date ~ '^\d{5}$'
group by 1 order by 1;

-- (أ2) معاينة: الطلاب الذين لن يُصحَّح تاريخهم (لمراجعتهم يدوياً من الملف الأصلي)
select student_number, full_name, birth_date as القيمة_المحفوظة,
       to_char(date '1899-12-30' + birth_date::int, 'YYYY-MM-DD') as التاريخ_الناتج
from public.students
where birth_date ~ '^\d{5}$'
  and not (date '1899-12-30' + birth_date::int between date '1995-01-01' and date '2024-12-31')
order by التاريخ_الناتج desc, full_name;

-- (ب) التصحيح: يعدّل الحالة «سيُصحَّح» فقط
update public.students
set birth_date = to_char(date '1899-12-30' + birth_date::int, 'YYYY-MM-DD')
where birth_date ~ '^\d{5}$'
  and birth_date::int between 10000 and 80000
  and date '1899-12-30' + birth_date::int between date '1995-01-01' and date '2024-12-31';
