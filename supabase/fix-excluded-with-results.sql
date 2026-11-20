-- تنظيف: طلاب مستبعدون من كشف مادة مع أن لهم درجات مرصودة فيها (العام الحالي).
-- شغّلي (أ) أولًا وحده لمعرفة الحجم، ثم (ب) لإعادة الطلاب إلى كشوفهم.

-- (أ) معاينة: كم حالة، وفي أي صف/فرع؟
select b.name as الفرع, g.name as الصف, count(*) as عدد_الحالات, count(distinct x.student_id) as عدد_الطلاب
from sheet_exclusions x
join students s on s.id = x.student_id
join branches b on b.id = s.branch_id
join grades g on g.id = s.grade_id
where x.academic_year = (select academic_year from settings where id = 1)
  and exists (
    select 1 from results r join assessment_components c on c.id = r.component_id
    where c.grade_subject_id = x.grade_subject_id and r.student_id = x.student_id
      and r.academic_year = x.academic_year)
group by b.name, g.name
order by b.name, g.name;

-- (ب) الإصلاح: يحذف الاستبعاد فقط حيث توجد درجات مرصودة (لا يمس الدرجات)
delete from sheet_exclusions x
where x.academic_year = (select academic_year from settings where id = 1)
  and exists (
    select 1 from results r join assessment_components c on c.id = r.component_id
    where c.grade_subject_id = x.grade_subject_id and r.student_id = x.student_id
      and r.academic_year = x.academic_year);
