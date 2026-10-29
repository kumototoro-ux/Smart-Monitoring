-- =====================================================================
--  مِرقاة للرصد الذكي — البيانات الأساسية
--  (يمكن تعديلها كلها لاحقاً من الإعدادات)
-- =====================================================================

insert into public.settings (id) values (1) on conflict do nothing;

-- المراحل
insert into public.stages (name, sort_order) values
  ('التمهيدي', 1), ('الابتدائية', 2), ('المتوسطة', 3), ('الثانوية', 4)
on conflict (name) do nothing;

-- الصفوف (التمهيدي رصد لفظي، والباقي درجات — يغيّرها الأدمن من الإعدادات)
insert into public.grades (stage_id, name, sort_order, assessment_mode)
select s.id, g.name, g.ord, g.mode::public.assessment_mode
from (values
  ('التمهيدي',   'التمهيدي الأول',        1, 'verbal'),
  ('التمهيدي',   'التمهيدي الثاني',       2, 'verbal'),
  ('التمهيدي',   'التمهيدي الثالث',       3, 'verbal'),
  ('الابتدائية', 'الأول الابتدائي',       11, 'numeric'),
  ('الابتدائية', 'الثاني الابتدائي',      12, 'numeric'),
  ('الابتدائية', 'الثالث الابتدائي',      13, 'numeric'),
  ('الابتدائية', 'الرابع الابتدائي',      14, 'numeric'),
  ('الابتدائية', 'الخامس الابتدائي',      15, 'numeric'),
  ('الابتدائية', 'السادس الابتدائي',      16, 'numeric'),
  ('المتوسطة',   'الأول المتوسط',         21, 'numeric'),
  ('المتوسطة',   'الثاني المتوسط',        22, 'numeric'),
  ('المتوسطة',   'الثالث المتوسط',        23, 'numeric'),
  ('الثانوية',   'الأول الثانوي',         31, 'numeric'),
  ('الثانوية',   'الثاني الثانوي',        32, 'numeric'),
  ('الثانوية',   'الثالث الثانوي',        33, 'numeric')
) as g(stage, name, ord, mode)
join public.stages s on s.name = g.stage
on conflict (name) do nothing;

-- مستويات الرصد اللفظي الافتراضية للتمهيدي
insert into public.verbal_levels (grade_id, label, sort_order)
select g.id, l.label, l.ord
from public.grades g
cross join (values ('ممتاز', 1), ('جيد جداً', 2), ('جيد', 3), ('يحتاج إلى دعم', 4)) as l(label, ord)
where g.assessment_mode = 'verbal'
on conflict (grade_id, label) do nothing;

-- المواد العامة
insert into public.subjects (name, kind, sort_order) values
  ('القرآن الكريم',                        'general', 1),
  ('الدراسات الإسلامية',                   'general', 2),
  ('اللغة العربية',                        'general', 3),
  ('الدراسات الاجتماعية',                  'general', 4),
  ('الرياضيات',                            'general', 5),
  ('العلوم',                               'general', 6),
  ('اللغة الإنجليزية',                     'general', 7),
  ('المهارات الرقمية',                     'general', 8),
  ('التربية الفنية',                       'general', 9),
  ('التربية البدنية والدفاع عن النفس',     'general', 10),
  ('المهارات الحياتية والتربية الأسرية',   'general', 11),
  ('التفكير الناقد',                       'general', 12),
  ('الأحياء 1',                            'general', 13),
  ('الكيمياء 1',                           'general', 14),
  ('الفيزياء 1',                           'general', 15),
  ('الكفايات اللغوية 1',                   'general', 16),
  ('الرياضيات 1',                          'general', 17),
  ('القرآن الكريم وتفسيره',                'general', 18),
  ('التقنية الرقمية 1',                    'general', 19)
on conflict (name) do nothing;

-- مواد وتقييمات التمهيدي ("القرآن الكريم" مشتركة مع المواد العامة)
insert into public.subjects (name, kind, sort_order) values
  ('التربية الإسلامية',                    'kg', 101),
  ('الأحرف العربية',                       'kg', 102),
  ('الأحرف الإنجليزية',                    'kg', 103),
  ('الأرقام العربية',                      'kg', 104),
  ('الأرقام الإنجليزية',                   'kg', 105),
  ('أنشطة ومعارف',                         'kg', 106),
  ('القدرة على الكتابة',                   'kg', 107),
  ('القدرة على الحفظ',                     'kg', 108),
  ('التركيز والانتباه مع الآخرين',         'kg', 109),
  ('تفاعل الطفل داخل الفصل',               'kg', 110),
  ('يستجيب لمعلمته ويتعاون معها',          'kg', 111),
  ('يحرص على الحضور والانضباط',            'kg', 112)
on conflict (name) do nothing;

-- ربط مواد التمهيدي بصفوف التمهيدي تلقائياً
insert into public.grade_subjects (grade_id, subject_id, sort_order)
select g.id, s.id, s.sort_order
from public.grades g
join public.stages st on st.id = g.stage_id and st.name = 'التمهيدي'
join public.subjects s on s.kind = 'kg' or s.name = 'القرآن الكريم'
on conflict (grade_id, subject_id) do nothing;
