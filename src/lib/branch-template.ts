import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { XL, box, newBook } from './excel';

/** أعمدة بيانات الطالب الثابتة في كل ورقة (A..I)، وبعدها أعمدة الدرجات */
export const STUDENT_COLS = [
  { key: 'student_number', h: 'الرقم الأكاديمي', w: 16, note: 'مهم جداً — يمنع تكرار الطالب عند إعادة الرفع', text: true, req: true },
  { key: 'full_name', h: 'اسم الطالب الرباعي (عربي)', w: 36, note: 'مطلوب', req: true },
  { key: 'name_en', h: 'اسم الطالب (إنجليزي)', w: 30, note: 'اختياري' },
  { key: 'birth_date', h: 'تاريخ الميلاد', w: 14, note: 'اختياري — هجري أو ميلادي', text: true },
  { key: 'nationality', h: 'الجنسية', w: 14, note: 'اختياري' },
  { key: 'id_type', h: 'نوع الهوية', w: 14, note: 'اختياري' },
  { key: 'national_id', h: 'رقم الهوية', w: 16, note: 'اختياري — يمكن أن يتكرر للإخوة', text: true },
  { key: 'gender', h: 'الجنس', w: 10, note: 'اختياري — طالب / طالبة' },
  { key: 'section', h: 'الشعبة', w: 10, note: 'اختياري — اتركيه فارغاً إذا لا تعرفين' },
] as const;
export const RESULT_START_COL = STUDENT_COLS.length + 1; // J
export const DATA_START = 4; // أول صف بيانات: 1 عنوان، 2 مجموعات، 3 عناوين الأعمدة
export const META_SHEET = 'meta';
export const META_MAGIC = 'mirqat-branch-v1';

const safeSheet = (n: string) => n.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);

/** ملف الفرع الموحّد: ورقة لكل صف مفتوح، بيانات الطلاب + أعمدة الدرجات لمواد الصف الفعّالة في هذا الفرع */
export async function buildBranchTemplate(supabase: SupabaseClient, branchId: string, opts: { grades?: boolean } = {}) {
  const withGrades = !!opts.grades;
  const [{ data: branch }, { data: set }, { data: bg }] = await Promise.all([
    supabase.from('branches').select('id, name').eq('id', branchId).single(),
    supabase.from('settings').select('academic_year, school_name').eq('id', 1).single(),
    supabase.from('branch_grades').select('grade_id').eq('branch_id', branchId),
  ]);
  if (!branch) throw new Error('الفرع غير موجود');
  const gradeIds = (bg ?? []).map((r) => r.grade_id as string);

  const [grades, gsAll, excl, secs] = await Promise.all([
    supabase.from('grades').select('id, name, sort_order, assessment_mode').in('id', gradeIds.length ? gradeIds : ['00000000-0000-0000-0000-000000000000']).order('sort_order'),
    supabase.from('grade_subjects').select('id, grade_id, subject_id, sort_order').in('grade_id', gradeIds.length ? gradeIds : ['00000000-0000-0000-0000-000000000000']).order('sort_order'),
    supabase.from('branch_subject_exclusions').select('grade_subject_id').eq('branch_id', branchId),
    supabase.from('sections').select('grade_id, name, sort_order').eq('branch_id', branchId).order('sort_order'),
  ]);
  const off = new Set((excl.data ?? []).map((e) => e.grade_subject_id as string));
  const gs = (gsAll.data ?? []).filter((x) => !off.has(x.id as string)) as { id: string; grade_id: string; subject_id: string; sort_order: number }[];
  const gsIds = gs.map((x) => x.id);
  const [subjects, comps, levels] = await Promise.all([
    supabase.from('subjects').select('id, name'),
    gsIds.length ? supabase.from('assessment_components').select('id, grade_subject_id, name, max_score, sort_order').in('grade_subject_id', gsIds).order('sort_order') : Promise.resolve({ data: [] }),
    supabase.from('verbal_levels').select('grade_id, label, sort_order').in('grade_id', gradeIds.length ? gradeIds : ['00000000-0000-0000-0000-000000000000']).order('sort_order'),
  ]);
  const sName = new Map((subjects.data ?? []).map((s) => [s.id as string, s.name as string]));
  const compsOf = new Map<string, { id: string; name: string; max_score: number | null }[]>();
  (comps.data ?? []).forEach((c) => compsOf.set(c.grade_subject_id as string, [...(compsOf.get(c.grade_subject_id as string) ?? []), { id: c.id as string, name: c.name as string, max_score: c.max_score === null ? null : Number(c.max_score) }]));

  const wb = newBook();
  const meta = wb.addWorksheet(META_SHEET, { state: 'veryHidden' });
  meta.addRow([META_MAGIC, branch.id, set?.academic_year ?? '', new Date().toISOString(), withGrades ? 'grades' : 'students', DATA_START]);
  const lists = wb.addWorksheet('lists', { state: 'hidden' });
  ['طالب', 'طالبة'].forEach((n, i) => (lists.getCell(i + 1, 1).value = n));
  ['هوية وطنية', 'إقامة', 'جواز سفر', 'هوية زائر', 'بدون'].forEach((n, i) => (lists.getCell(i + 1, 2).value = n));
  let listCol = 3;

  const dv = (ws: unknown) => (ws as { dataValidations: { add: (range: string, v: Record<string, unknown>) => void } }).dataValidations;
  const ROWS = 1500;
  const used = new Set<string>();
  let totalCols = 0;

  const PALETTE = [['FF2E8B6A', 'FFE3F4EC'], ['FF5A5FC2', 'FFDCE2F7'], ['FFB7791F', 'FFFBF1DD'], ['FFC0476A', 'FFF6DCE3']] as const;
  const STYLED_ROWS = 400;
  const fillOf = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

  for (const g of grades.data ?? []) {
    let name = safeSheet(g.name as string); while (used.has(name)) name += '_'; used.add(name);
    const ws = wb.addWorksheet(name, {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: DATA_START - 1, xSplit: 2, showGridLines: false }],
      properties: { tabColor: { argb: XL.head } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `1:${DATA_START - 1}` },
    });
    const verbal = g.assessment_mode === 'verbal';
    const gradeSubjects = gs.filter((x) => x.grade_id === g.id);

    type Col = { h: string; w: number; note?: string; text?: boolean; req?: boolean; group: string; accent: number; comp?: { id: string; max: number | null; label: string } };
    const cols: Col[] = STUDENT_COLS.map((c) => ({ h: 'req' in c && c.req ? c.h + ' *' : c.h, w: c.w, note: c.note, text: 'text' in c ? c.text : false, req: 'req' in c ? c.req : false, group: 'بيانات الطالب', accent: -1 }));
    meta.addRow([name, 0, '', g.id, '']); // علامة تربط الورقة بالصف (حتى بلا أعمدة درجات)
    let si = 0;
    for (const x of withGrades ? gradeSubjects : []) {
      const subject = sName.get(x.subject_id) ?? '—';
      const cs = compsOf.get(x.id) ?? [];
      const single = cs.length === 1;
      const accent = si++ % PALETTE.length;
      for (const c of cs) {
        const h = verbal ? (single ? 'التقدير' : c.name) : `${single ? 'الدرجة' : c.name}${c.max_score !== null ? `\n(من ${c.max_score})` : ''}`;
        cols.push({ h, w: 14, group: subject, accent, comp: { id: c.id, max: c.max_score, label: `${subject} · ${c.name}` } });
      }
    }
    const last = cols.length;
    ws.columns = cols.map((c) => ({ width: c.w }));

    // 1) شريط العنوان
    ws.mergeCells(1, 1, 1, last);
    const t = ws.getCell(1, 1);
    t.value = `${set?.school_name ?? ''} — ${branch.name} · ${g.name}`;
    t.font = { name: 'Arial', bold: true, size: 15, color: { argb: XL.headText } };
    t.fill = fillOf(XL.head); t.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 36;

    // 2) صف المجموعات (بيانات الطالب + كل مادة)
    const groups: { from: number; to: number; label: string; accent: number }[] = [];
    cols.forEach((c, i) => {
      const g0 = groups[groups.length - 1];
      if (g0 && g0.label === c.group && g0.accent === c.accent) g0.to = i + 1; else groups.push({ from: i + 1, to: i + 1, label: c.group, accent: c.accent });
    });
    for (const gr of groups) {
      if (gr.to > gr.from) ws.mergeCells(2, gr.from, 2, gr.to);
      const cell = ws.getCell(2, gr.from);
      cell.value = gr.label;
      cell.font = { name: 'Arial', bold: true, size: 11.5, color: { argb: XL.headText } };
      cell.fill = fillOf(gr.accent < 0 ? 'FF3A3A48' : PALETTE[gr.accent][0]);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      for (let c = gr.from; c <= gr.to; c++) ws.getCell(2, c).border = box;
    }
    ws.getRow(2).height = 34;

    // 3) عناوين الأعمدة
    const head = ws.getRow(3);
    head.values = cols.map((c) => c.h);
    head.height = 44;
    head.eachCell((cell, i) => {
      const col = cols[i - 1];
      const res = col.accent >= 0;
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: res ? PALETTE[col.accent][0] : XL.ink } };
      cell.fill = fillOf(res ? PALETTE[col.accent][1] : col.req ? 'FFFBF1DD' : XL.band);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = box;
      if (col.note) cell.note = col.note;
    });

    // 4) منطقة الإدخال: حدود وتظليل متبادل جاهزان
    for (let r = DATA_START; r < DATA_START + STYLED_ROWS; r++) {
      const row = ws.getRow(r);
      row.height = 22;
      for (let c = 1; c <= last; c++) {
        const cell = row.getCell(c);
        cell.border = box;
        cell.font = { name: 'Arial', size: 11, color: { argb: XL.ink } };
        cell.alignment = { horizontal: c === 2 || c === 3 ? 'right' : 'center', vertical: 'middle' };
        if ((r - DATA_START) % 2 === 1) cell.fill = fillOf(XL.band);
        if (cols[c - 1].text) cell.numFmt = '@';
      }
    }

    // القوائم والتحقق
    const D = DATA_START;
    dv(ws).add(`H${D}:H${ROWS}`, { type: 'list', allowBlank: true, formulae: ['lists!$A$1:$A$2'], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'الجنس', error: 'اختاري طالب أو طالبة' });
    dv(ws).add(`F${D}:F${ROWS}`, { type: 'list', allowBlank: true, formulae: ['lists!$B$1:$B$5'], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'نوع الهوية', error: 'القيمة غير موجودة في القائمة — يمكنك المتابعة' });
    const gSecs = (secs.data ?? []).filter((s) => s.grade_id === g.id).map((s) => s.name as string);
    if (gSecs.length) {
      const c = listCol++; gSecs.forEach((n, i) => (lists.getCell(i + 1, c).value = n));
      dv(ws).add(`I${D}:I${ROWS}`, { type: 'list', allowBlank: true, formulae: [`lists!$${lists.getColumn(c).letter}$1:$${lists.getColumn(c).letter}$${gSecs.length}`], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'الشعبة', error: 'الشعبة غير موجودة — سيُسأل عن إنشائها عند الرفع' });
    }
    let vcol: string | null = null;
    if (verbal) {
      const lv = (levels.data ?? []).filter((l) => l.grade_id === g.id).map((l) => l.label as string);
      if (lv.length) { const c = listCol++; lv.forEach((n, i) => (lists.getCell(i + 1, c).value = n)); lists.getCell(lv.length + 1, c).value = 'غ'; vcol = `lists!$${lists.getColumn(c).letter}$1:$${lists.getColumn(c).letter}$${lv.length + 1}`; }
    }
    cols.forEach((c, i) => {
      if (!c.comp) return;
      const L = ws.getColumn(i + 1).letter;
      if (verbal) {
        if (vcol) dv(ws).add(`${L}${D}:${L}${ROWS}`, { type: 'list', allowBlank: true, formulae: [vcol], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'التقدير', error: 'اختاري تقديراً من القائمة (أو غ للغائب)' });
      } else if (c.comp.max !== null) {
        dv(ws).add(`${L}${D}:${L}${ROWS}`, {
          type: 'custom', allowBlank: true, formulae: [`OR(ISBLANK(${L}${D}),${L}${D}="غ",AND(ISNUMBER(${L}${D}),${L}${D}>=0,${L}${D}<=${c.comp.max}))`],
          showErrorMessage: true, errorStyle: 'stop', errorTitle: 'درجة غير صحيحة', error: `اكتبي رقماً من 0 إلى ${c.comp.max}، أو غ للغائب`,
        });
      }
      meta.addRow([name, i + 1, c.comp.id, g.id, c.comp.label]);
      totalCols++;
    });
  }

  // التعليمات
  const help = wb.addWorksheet('التعليمات', { views: [{ rightToLeft: true }] });
  help.getColumn(1).width = 4; help.getColumn(2).width = 100;
  const lines: [string, 'title' | 'h' | 'p'][] = [
    [`${set?.school_name ?? ''} — ملف ${branch.name}: ${withGrades ? 'الطلاب والدرجات' : 'بيانات الطلاب'}`, 'title'],
    ['طريقة التعبئة', 'h'],
    ['1. في كل ورقة صف دراسي واحد. اكتبي في كل سطر طالباً واحداً: بياناته ثم درجاته. الأعمدة المعلّمة بنجمة (*) مهمة. تتسع الورقة لـ 400 طالب بتنسيقها الجاهز.', 'p'],
    ['2. المطلوب فقط: اسم الطالب الرباعي. ويُنصح بشدة بالرقم الأكاديمي لأنه يمنع تكرار الطالب عند إعادة الرفع.', 'p'],
    ...(withGrades ? [
      ['3. الأعمدة الخضراء هي الدرجات (مادة، ونوع التقييم إن تعدد، والدرجة العظمى بين قوسين). اتركي الخانة فارغة إن لم تُرصد بعد.', 'p'],
      ['4. للطالب الغائب اكتبي «غ». في الصفوف اللفظية اختاري التقدير من القائمة.', 'p'],
    ] as [string, 'p'][] : [['3. هذا الملف لبيانات الطلاب فقط، بلا أعمدة درجات.', 'p']] as [string, 'p'][]),
    ['5. لا تغيّري عناوين الأعمدة ولا أسماء الأوراق، ولا تحذفي الأعمدة.', 'p'],
    ['6. لا تضيفي مواد أو صفوفاً من عندك: الأعمدة مولّدة من النظام لهذا الفرع. وإن تغيّرت المواد في النظام حمّلي الملف من جديد.', 'p'],
    ['الرفع', 'h'],
    ['• من النظام: الطلاب ← ملف الفرع. ستظهر معاينة كاملة قبل أي حفظ، ولا يُحفظ شيء إلا بعد تأكيدكِ.', 'p'],
    ...(withGrades ? [['• الدرجات الموجودة مسبقاً في النظام لا تُستبدل إلا إذا اخترتِ ذلك صراحة.', 'p']] as [string, 'p'][] : []),
  ];
  lines.forEach(([t, kind], i) => {
    const c = help.getCell(i + 2, 2); c.value = t;
    c.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    c.font = kind === 'title' ? { name: 'Arial', size: 16, bold: true } : kind === 'h' ? { name: 'Arial', size: 12.5, bold: true, color: { argb: 'FF5A5FC2' } } : { name: 'Arial', size: 11.5, color: { argb: XL.ink } };
    help.getRow(i + 2).height = kind === 'title' ? 34 : kind === 'h' ? 30 : t.length > 95 ? 36 : 22;
  });
  return { wb, branchName: branch.name as string, resultColumns: totalCols };
}
