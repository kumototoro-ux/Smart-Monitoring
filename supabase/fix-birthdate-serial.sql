-- تصحيح تواريخ الميلاد التي حُفظت أرقام إكسل تسلسلية (مثل 42020) إلى تاريخ ميلادي YYYY-MM-DD
-- (أ) معاينة فقط (لا تغيّر شيئاً): عمود «ملاحظة» يبيّن ما لن يُصحَّح لأنه تاريخ مستقبلي أو قديم جداً ويحتاج مراجعة يدوية
select student_number, full_name, birth_date as قبل,
       to_char(date '1899-12-30' + birth_date::int, 'YYYY-MM-DD') as بعد,
       case when date '1899-12-30' + birth_date::int > current_date then 'مستقبلي — راجعيه'
            when date '1899-12-30' + birth_date::int < date '1995-01-01' then 'قديم جداً — راجعيه'
            else 'سيُصحَّح' end as ملاحظة
from public.students
where birth_date ~ '^\d{5}$'
order by ملاحظة desc, full_name
limit 200;

-- (ب) التصحيح: شغّليه بعد التأكد من المعاينة. لا يلمس إلا التواريخ المنطقية (من 1995 حتى اليوم)
update public.students
set birth_date = to_char(date '1899-12-30' + birth_date::int, 'YYYY-MM-DD')
where birth_date ~ '^\d{5}$'
  and birth_date::int between 10000 and 80000
  and date '1899-12-30' + birth_date::int between date '1995-01-01' and current_date;
