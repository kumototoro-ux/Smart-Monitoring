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
  const cols = [
    { h: 'اسم الطالب', w: 36, note: 'مطلوب — الاسم ثلاثياً على الأقل' },
    { h: 'رقم الهوية', w: 16, note: 'اختياري — 10 أرقام' },
    { h: 'رقم الطالب', w: 14, note: 'اختياري' },
    { h: 'الجنس', w: 10, note: 'اختاري من القائمة' },
    { h: 'الفرع', w: 22, note: 'اختاري من القائمة' },
    { h: 'الصف', w: 22, note: 'مطلوب — اختاري من القائمة' },
    { h: 'الشعبة', w: 10, note: 'اختياري — اتركيه فارغاً إذا لا تعرفين' },
  ];
  ws.columns = cols.map((c) => ({ width: c.w }));
  const head = ws.getRow(1);
  head.values = cols.map((c) => c.h);
  head.height = 30;
  head.eachCell((c, i) => {
    c.font = { name: 'Arial', bold: true, size: 12, color: { argb: XL.headText } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: [1, 6].includes(i) ? XL.head : 'FF3A3A48' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = box;
    c.note = cols[i - 1].note;
  });
  // تنسيق النص لرقم الهوية حتى لا يحذف الإكسل الأصفار
  ws.getColumn(2).numFmt = '@';
  ws.getColumn(3).numFmt = '@';

  // القوائم في ورقة مخفية
  const lists = wb.addWorksheet('lists', { state: 'hidden' });
  bNames.forEach((n, i) => (lists.getCell(i + 1, 1).value = n));
  gNames.forEach((n, i) => (lists.getCell(i + 1, 2).value = n));
  lists.getCell(1, 3).value = 'طالب';
  lists.getCell(2, 3).value = 'طالبة';

  const ROWS = 5000;
  // متاحة في exceljs لكن غير معرّفة في أنواعه
  const dv = (ws as unknown as { dataValidations: { add: (range: string, v: Record<string, unknown>) => void } }).dataValidations;
  const list = (range: string, formula: string, title: string) =>
    dv.add(range, {
      type: 'list', allowBlank: true, formulae: [formula],
      showErrorMessage: true, errorStyle: 'stop', errorTitle: title, error: 'اختاري قيمة من القائمة المنسدلة',
    });
  list(`D2:D${ROWS}`, 'lists!$C$1:$C$2', 'الجنس');
  if (bNames.length) list(`E2:E${ROWS}`, `lists!$A$1:$A$${bNames.length}`, 'الفرع');
  if (gNames.length) list(`F2:F${ROWS}`, `lists!$B$1:$B$${gNames.length}`, 'الصف');
  dv.add(`B2:B${ROWS}`, {
    type: 'textLength', operator: 'equal', allowBlank: true, formulae: [10],
    showErrorMessage: true, errorTitle: 'رقم الهوية', error: 'رقم الهوية يجب أن يكون 10 أرقام',
  });
  // تعبئة الفرع تلقائياً للمشرفة
  if (branchId && bNames.length === 1) {
    for (let r = 2; r <= 1000; r++) ws.getCell(r, 5).value = bNames[0];
  }

  // التعليمات
  const help = wb.addWorksheet('التعليمات', { views: [{ rightToLeft: true }] });
  help.getColumn(1).width = 4; help.getColumn(2).width = 95;
  const lines: [string, 'title' | 'h' | 'p'][] = [
    [`${settings?.school_name ?? ''} — نموذج استيراد الطلاب`, 'title'],
    ['طريقة الاستخدام', 'h'],
    ['1. انسخي بيانات الطلاب والصقيها في ورقة «الطلاب» بدءاً من الصف الثاني (لا تغيّري صف العناوين).', 'p'],
    ['2. عمودا «اسم الطالب» و«الصف» مطلوبان، وباقي الأعمدة اختيارية.', 'p'],
    ['3. الفرع والصف والجنس: اختاري من القائمة المنسدلة، أو الصقي الاسم مطابقاً لما في القائمة.', 'p'],
    ['4. إذا لا تعرفين شعبة الطالب اتركي «الشعبة» فارغاً — المعلمات يخترن طلاب شعباتهن من النظام.', 'p'],
    ['5. احفظي الملف بصيغة xlsx ثم ارفعيه من: الطلاب ← استيراد إكسل. ستظهر معاينة قبل الحفظ.', 'p'],
    ['كيف يعرف النظام الفرع؟', 'h'],
    ['• من عمود «الفرع» في الملف (بالاسم أو بالرمز).', 'p'],
    ['• أو تختارين «الفرع الافتراضي» في نافذة الاستيراد، فيُستخدم لكل صف عمود الفرع فيه فارغ.', 'p'],
    ['• الأسهل: ملف لكل فرع مع اختيار الفرع الافتراضي، بدون عمود فرع.', 'p'],
    ['ملاحظات', 'h'],
    ['• رقم الهوية يمنع التكرار: إذا كان الطالب موجوداً مسبقاً تُحدّث بياناته بدل إضافته مرة ثانية.', 'p'],
    ['• الصف يُقبل بأكثر من صيغة: «الأول الابتدائي» أو «أول ابتدائي» أو «1 ابتدائي».', 'p'],
    ['• الشعبة تُقبل: أ، ب، ج أو 1، 2، 3 أو «شعبة أ».', 'p'],
    ['الفروع المتاحة: ' + (bNames.join('، ') || '—'), 'p'],
    ['الصفوف المتاحة: ' + (gNames.join('، ') || '—'), 'p'],
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
