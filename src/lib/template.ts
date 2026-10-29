import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { XL, box, newBook } from './excel';

/** نموذج إكسل لاستيراد الطلاب، بقوائم منسدلة من بيانات النظام الفعلية */
export async function buildStudentTemplate(supabase: SupabaseClient, branchId: string | null) {
  let bq = supabase.from('branches').select('id, name').eq('is_active', true).order('name');
  if (branchId) bq = bq.eq('id', branchId);
  const [{ data: branches }, { data: grades }, { data: settings }] = await Promise.all([
    bq,
    supabase.from('grades').select('name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('settings').select('school_name').eq('id', 1).single(),
  ]);
  const bNames = (branches ?? []).map((b) => b.name as string);
  const gNames = (grades ?? []).map((g) => g.name as string);

  const wb = newBook();
  const ws = wb.addWorksheet('الطلاب', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  // نفس ترتيب بيانات المدرسة — يمكن النسخ واللصق مباشرة. الأعمدة الثلاثة الأخيرة اختيارية
  const cols = [
    { h: 'الرقم الأكاديمي', w: 16, note: 'مهم جداً — يمنع تكرار الطالب عند إعادة الرفع', key: true, text: true },
    { h: 'اسم الطالب الرباعي (عربي)', w: 36, note: 'مطلوب', key: true },
    { h: 'اسم الطالب (إنجليزي)', w: 30, note: 'اختياري' },
    { h: 'الصف الدراسي', w: 22, note: 'مطلوب — اختاري من القائمة', key: true },
    { h: 'تاريخ الميلاد', w: 14, note: 'اختياري — هجري أو ميلادي', text: true },
    { h: 'الجنسية', w: 14, note: 'اختياري' },
    { h: 'نوع الهوية', w: 14, note: 'اختياري' },
    { h: 'رقم الهوية', w: 16, note: 'اختياري — يمكن أن يتكرر للإخوة', text: true },
    { h: 'الجنس', w: 10, note: 'اختياري — طالب / طالبة', extra: true },
    { h: 'الشعبة', w: 10, note: 'اختياري — اتركيه فارغاً إذا لا تعرفين', extra: true },
    { h: 'الفرع', w: 20, note: 'اختياري — أو اختاري الفرع الافتراضي عند الرفع', extra: true },
  ];
  ws.columns = cols.map((c) => ({ width: c.w }));
  const head = ws.getRow(1);
  head.values = cols.map((c) => c.h);
  head.height = 32;
  head.eachCell((c, i) => {
    const col = cols[i - 1];
    c.font = { name: 'Arial', bold: true, size: 11.5, color: { argb: col.extra ? XL.ink : XL.headText } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.key ? XL.head : col.extra ? XL.peri : 'FF3A3A48' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = box;
    c.note = col.note;
  });
  // نص حتى لا يحذف الإكسل الأصفار أو يحوّل الأرقام الطويلة
  cols.forEach((c, i) => { if (c.text) ws.getColumn(i + 1).numFmt = '@'; });

  // القوائم في ورقة مخفية
  const lists = wb.addWorksheet('lists', { state: 'hidden' });
  bNames.forEach((n, i) => (lists.getCell(i + 1, 1).value = n));
  gNames.forEach((n, i) => (lists.getCell(i + 1, 2).value = n));
  ['طالب', 'طالبة'].forEach((n, i) => (lists.getCell(i + 1, 3).value = n));
  ['هوية وطنية', 'إقامة', 'جواز سفر', 'هوية زائر', 'بدون'].forEach((n, i) => (lists.getCell(i + 1, 4).value = n));

  const ROWS = 5000;
  // متاحة في exceljs لكن غير معرّفة في أنواعه
  const dv = (ws as unknown as { dataValidations: { add: (range: string, v: Record<string, unknown>) => void } }).dataValidations;
  const list = (range: string, formula: string, title: string, strict = true) =>
    dv.add(range, {
      type: 'list', allowBlank: true, formulae: [formula],
      showErrorMessage: true, errorStyle: strict ? 'stop' : 'warning', errorTitle: title,
      error: strict ? 'اختاري قيمة من القائمة المنسدلة' : 'القيمة غير موجودة في القائمة — يمكنك المتابعة',
    });
  if (gNames.length) list(`D2:D${ROWS}`, `lists!$B$1:$B$${gNames.length}`, 'الصف الدراسي');
  list(`G2:G${ROWS}`, 'lists!$D$1:$D$5', 'نوع الهوية', false);
  list(`I2:I${ROWS}`, 'lists!$C$1:$C$2', 'الجنس');
  if (bNames.length) list(`K2:K${ROWS}`, `lists!$A$1:$A$${bNames.length}`, 'الفرع');
  // تعبئة الفرع تلقائياً للمشرفة
  if (branchId && bNames.length === 1) {
    for (let r = 2; r <= 1000; r++) ws.getCell(r, 11).value = bNames[0];
  }

  // التعليمات
  const help = wb.addWorksheet('التعليمات', { views: [{ rightToLeft: true }] });
  help.getColumn(1).width = 4; help.getColumn(2).width = 95;
  const lines: [string, 'title' | 'h' | 'p'][] = [
    [`${settings?.school_name ?? ''} — نموذج استيراد الطلاب`, 'title'],
    ['طريقة الاستخدام', 'h'],
    ['1. الأعمدة الثمانية الأولى بنفس ترتيب بيانات المدرسة: انسخيها كما هي والصقيها في ورقة «الطلاب» بدءاً من الصف الثاني.', 'p'],
    ['2. المطلوب فقط: اسم الطالب الرباعي (عربي) والصف الدراسي. ويُنصح بشدة بالرقم الأكاديمي.', 'p'],
    ['3. الأعمدة البنفسجية (الجنس، الشعبة، الفرع) اختيارية — اتركيها فارغة إذا لا تعرفينها.', 'p'],
    ['4. احفظي الملف بصيغة xlsx ثم ارفعيه من: الطلاب ← استيراد إكسل. ستظهر معاينة قبل الحفظ.', 'p'],
    ['الرقم الأكاديمي', 'h'],
    ['• هو المعرّف الأساسي للطالب: إذا رفعتِ الملف مرة ثانية، الطالب الموجود بنفس الرقم تُحدّث بياناته ولا يتكرر.', 'p'],
    ['• عند التحديث تبقى شعبة الطالب كما هي، إلا إذا كتبتِ شعبة جديدة في الملف.', 'p'],
    ['• رقم الهوية لا يُستخدم للتمييز، ويُسمح بتكراره (مثل الإخوة المسجّلين بهوية الأب) أو تركه فارغاً.', 'p'],
    ['كيف يعرف النظام الفرع؟', 'h'],
    ['• من عمود «الفرع» إن وُجد، وإلا من «الفرع الافتراضي» الذي تختارينه في نافذة الاستيراد.', 'p'],
    ['• الأسهل: ملف لكل فرع، مع اختيار فرعه عند الرفع.', 'p'],
    ['الطلاب بدون شعبة', 'h'],
    ['• كل معلمة تختار طلاب شعبتها من شاشة الرصد، أو توزّعهم المشرفة من صفحة الطلاب.', 'p'],
    ['الصفوف المتاحة: ' + (gNames.join('، ') || '—'), 'p'],
    ['الفروع المتاحة: ' + (bNames.join('، ') || '—'), 'p'],
  ];
  lines.forEach(([t, kind], i) => {
    const c = help.getCell(i + 2, 2);
    c.value = t;
    c.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    c.font = kind === 'title' ? { name: 'Arial', size: 16, bold: true }
      : kind === 'h' ? { name: 'Arial', size: 12.5, bold: true, color: { argb: 'FF5A5FC2' } }
      : { name: 'Arial', size: 11.5, color: { argb: XL.ink } };
    help.getRow(i + 2).height = kind === 'title' ? 34 : kind === 'h' ? 30 : t.length > 90 ? 36 : 22;
  });

  return wb;
}
