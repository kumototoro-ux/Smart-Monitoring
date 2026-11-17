-- فحص للقراءة فقط (لا يغيّر أي شيء). شغّلي كل استعلام لوحده وأرسلي لي النتيجة.

-- ① ملخص: لكل فرع وصف — عدد الطلاب، المواد الفعلية (بعد الاستثناءات)، المواد المستثناة، عدد الدرجات المرصودة
select b.name as "الفرع", g.name as "الصف",
  (select count(*) from students s where s.branch_id = bg.branch_id and s.grade_id = bg.grade_id) as "الطلاب",
  (select count(*) from grade_subjects gs where gs.grade_id = bg.grade_id
     and not exists (select 1 from branch_subject_exclusions e where e.branch_id = bg.branch_id and e.grade_subject_id = gs.id)) as "مواد فعلية",
  (select count(*) from branch_subject_exclusions e join grade_subjects gs on gs.id = e.grade_subject_id
     where e.branch_id = bg.branch_id and gs.grade_id = bg.grade_id) as "مواد مستثناة",
  (select count(*) from results r join students s on s.id = r.student_id
     where s.branch_id = bg.branch_id and s.grade_id = bg.grade_id) as "درجات مرصودة"
from branch_grades bg
join branches b on b.id = bg.branch_id
join grades g on g.id = bg.grade_id
order by b.name, g.sort_order;

-- ② تفصيل المواد: لكل فرع وصف ومادة — هل هي مستثناة؟ أنواع التقييم، وعدد الدرجات المرصودة عليها
select b.name as "الفرع", g.name as "الصف", sj.name as "المادة",
  case when e.grade_subject_id is not null then 'مستثناة' else 'فعّالة' end as "الحالة",
  (select string_agg(c.name || coalesce(' (' || c.max_score::text || ')', ''), '، ' order by c.sort_order)
     from assessment_components c where c.grade_subject_id = gs.id) as "أنواع التقييم",
  (select count(*) from results r join students s on s.id = r.student_id
     join assessment_components c on c.id = r.component_id
     where c.grade_subject_id = gs.id and s.branch_id = bg.branch_id and s.grade_id = bg.grade_id) as "درجات"
from branch_grades bg
join branches b on b.id = bg.branch_id
join grades g on g.id = bg.grade_id
join grade_subjects gs on gs.grade_id = bg.grade_id
join subjects sj on sj.id = gs.subject_id
left join branch_subject_exclusions e on e.branch_id = bg.branch_id and e.grade_subject_id = gs.id
order by b.name, g.sort_order, gs.sort_order;

-- ③ تحذير: درجات مرصودة على مادة مستثناة من الفرع (يجب أن تكون صفرًا)
select b.name as "الفرع", sj.name as "المادة", count(*) as "درجات"
from results r
join students s on s.id = r.student_id
join branches b on b.id = s.branch_id
join assessment_components c on c.id = r.component_id
join branch_subject_exclusions e on e.branch_id = s.branch_id and e.grade_subject_id = c.grade_subject_id
join grade_subjects gs on gs.id = c.grade_subject_id
join subjects sj on sj.id = gs.subject_id
group by b.name, sj.name;
