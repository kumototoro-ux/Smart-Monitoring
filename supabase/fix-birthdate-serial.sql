-- تصحيح تواريخ الميلاد التي حُفظت أرقام إكسل تسلسلية (مثل 42020) إلى تاريخ ميلادي YYYY-MM-DD
-- (أ) معاينة: شغّليها أولاً وتأكدي أن التاريخ الناتج صحيح لبعض الطلاب
select student_number, full_name, birth_date as قبل,
       to_char(date '1899-12-30' + birth_date::int, 'YYYY-MM-DD') as بعد
from public.students
where birth_date ~ '^\d{5}$'
order by full_name
limit 50;

-- (ب) التصحيح: شغّليه بعد التأكد من المعاينة
update public.students
set birth_date = to_char(date '1899-12-30' + birth_date::int, 'YYYY-MM-DD')
where birth_date ~ '^\d{5}$'
  and birth_date::int between 10000 and 80000;
