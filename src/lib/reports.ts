import 'server-only';
import type ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { XL, box, newSheet, styleBodyRow, titleBlock } from './excel';
import type { AssessmentMode } from './types';

export interface SectionReport {
  school: string; year: string; term: 1 | 2;
  branch: string; grade: string; section: string; mode: AssessmentMode;
  subjects: { id: string; name: string; comps: { id: string; name: string; max: number | null }[]; teacher: string | null }[];
  students: { id: string; name: string; national_id: string | null }[];
  results: Map<string, { score: number | null; level: string | null; absent: boolean }>;
}

export async function loadSectionReport(supabase: SupabaseClient, sectionId: string, term: 1 | 2, onlySubject?: string): Promise<SectionReport | null> {
  const [{ data: settings }, { data: sec }] = await Promise.all([
    supabase.from('settings').select('school_name, academic_year').eq('id', 1).single(),
    supabase.from('sections').select('id, name, grade_id, branch_id, branch:branches(name), grade:grades(name, assessment_mode)').eq('id', sectionId).single(),
  ]);
  if (!sec || !settings) return null;
  const s = sec as unknown as { id: string; name: string; grade_id: string; branch_id: string; branch: { name: string }; grade: { name: string; assessment_mode: AssessmentMode } };

  let gsQ = supabase.from('grade_subjects')
    .select('id, sort_order, subject:subjects(name, sort_order), comps:assessment_components(id, name, max_score, sort_order)')
    .eq('grade_id', s.grade_id).order('sort_order');
  if (onlySubject) gsQ = gsQ.eq('id', onlySubject);
  const [{ data: gs }, { data: excl }, { data: studs }, { data: levels }, { data: assigns }] = await Promise.all([
    gsQ,
    supabase.from('branch_subject_exclusions').select('grade_subject_id').eq('branch_id', s.branch_id),
    supabase.from('students').select('id, full_name, national_id').eq('section_id', sectionId).eq('is_active', true).order('full_name'),
    supabase.from('verbal_levels').select('id, label').eq('grade_id', s.grade_id),
    supabase.from('teacher_assignments').select('grade_subject_id, teacher:profiles(full_name)').eq('section_id', sectionId),
  ]);
  const excluded = new Set((excl ?? []).map((e) => e.grade_subject_id));
  const teacherOf = new Map(((assigns ?? []) as unknown as { grade_subject_id: string; teacher: { full_name: string } | null }[]).map((a) => [a.grade_subject_id, a.teacher?.full_name ?? null]));
  const subjects = ((gs ?? []) as unknown as { id: string; subject: { name: string } | null; comps: { id: string; name: string; max_score: number | null; sort_order: number }[] }[])
    .filter((g) => !excluded.has(g.id))
    .map((g) => ({
      id: g.id, name: g.subject?.name ?? '—', teacher: teacherOf.get(g.id) ?? null,
      comps: [...g.comps].sort((a, b) => a.sort_order - b.sort_order).map((c) => ({ id: c.id, name: c.name, max: c.max_score === null ? null : Number(c.max_score) })),
    }));

  const levelName = new Map((levels ?? []).map((l) => [l.id, l.label as string]));
  const students = (studs ?? []).map((x) => ({ id: x.id, name: x.full_name, national_id: x.national_id }));
  const results = new Map<string, { score: number | null; level: string | null; absent: boolean }>();
  const compIds = subjects.flatMap((x) => x.comps.map((c) => c.id));
  for (let i = 0; i < students.length && compIds.length; i += 120) {
    const ids = students.slice(i, i + 120).map((x) => x.id);
    const { data } = await supabase.from('results').select('student_id, component_id, score, verbal_level_id, is_absent')
      .in('student_id', ids).in('component_id', compIds).eq('term', term).eq('academic_year', settings.academic_year);
    (data ?? []).forEach((r) => results.set(`${r.student_id}:${r.component_id}`, {
      score: r.score === null ? null : Number(r.score), level: r.verbal_level_id ? levelName.get(r.verbal_level_id) ?? null : null, absent: r.is_absent,
    }));
  }

  return {
    school: settings.school_name, year: settings.academic_year, term,
    branch: s.branch.name, grade: s.grade.name, section: s.name, mode: s.grade.assessment_mode,
    subjects, students, results,
  };
}

const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

/** ورقة كشف درجات شعبة: الطلاب × المواد (وأنواع التقييم) */
export function writeSectionSheet(wb: ExcelJS.Workbook, r: SectionReport, opts: { detailed: boolean; sheetName?: string }) {
  const numeric = r.mode === 'numeric';
  const detailed = numeric && opts.detailed;
  // أعمدة كل مادة: تفصيلي = أنواع التقييم + المجموع، مختصر = المجموع فقط
  const groups = r.subjects.map((s) => ({
    s,
    cols: !numeric ? [{ label: 'التقدير', comp: s.comps[0]?.id ?? null }]
      : detailed ? [...s.comps.map((c) => ({ label: `${c.name}\n(${c.max ?? '-'})`, comp: c.id })), { label: `المجموع\n(${s.comps.reduce((a, c) => a + (c.max ?? 0), 0)})`, comp: null }]
      : [{ label: `${s.comps.reduce((a, c) => a + (c.max ?? 0), 0)}`, comp: null }],
  }));
  const fixed = 3; // م، الاسم، الهوية
  const totalCols = fixed + groups.reduce((a, g) => a + g.cols.length, 0) + (numeric ? 2 : 0);

  const ws = newSheet(wb, opts.sheetName ?? `${r.grade} ${r.section}`, true);
  const start = titleBlock(ws, totalCols, [
    { text: r.school, size: 15, bold: true },
    { text: `كشف ${numeric ? 'درجات' : 'تقييم'} ${r.term === 1 ? 'الترم الأول' : 'الترم الثاني'} — العام الدراسي ${r.year}`, size: 12, bold: true },
    { text: `${r.branch}  ·  ${r.grade}  ·  شعبة ${r.section}  ·  عدد الطلاب ${r.students.length}`, size: 11, color: XL.muted },
  ]);

  // صفا العناوين
  const h1 = ws.getRow(start); const h2 = ws.getRow(start + 1);
  const heads: [number, string][] = [[1, 'م'], [2, 'اسم الطالب'], [3, 'رقم الهوية']];
  heads.forEach(([c, t]) => { ws.mergeCells(start, c, start + 1, c); h1.getCell(c).value = t; });
  let col = fixed + 1;
  for (const g of groups) {
    const from = col; const to = col + g.cols.length - 1;
    if (g.cols.length > 1 || detailed || !numeric) {
      if (to > from) ws.mergeCells(start, from, start, to);
      h1.getCell(from).value = g.s.name;
      g.cols.forEach((c, i) => { h2.getCell(from + i).value = c.label; });
    } else {
      h1.getCell(from).value = g.s.name; h2.getCell(from).value = `من ${g.cols[0].label}`;
    }
    col = to + 1;
  }
  if (numeric) {
    const grand = r.subjects.reduce((a, s) => a + s.comps.reduce((b, c) => b + (c.max ?? 0), 0), 0);
    ws.mergeCells(start, col, start + 1, col); h1.getCell(col).value = `المجموع الكلي\n(${grand})`;
    ws.mergeCells(start, col + 1, start + 1, col + 1); h1.getCell(col + 1).value = 'النسبة';
  }
  [h1, h2].forEach((row, i) => {
    row.height = i === 0 ? 34 : 40;
    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', bold: true, size: i === 0 ? 11 : 9.5, color: { argb: XL.headText } };
      cell.fill = fill(i === 0 ? XL.head : 'FF3A3A48');
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = box;
    }
  });

  // البيانات
  const grandMax = r.subjects.reduce((a, s) => a + s.comps.reduce((b, c) => b + (c.max ?? 0), 0), 0);
  r.students.forEach((st, i) => {
    const row = ws.getRow(start + 2 + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = st.name;
    row.getCell(3).value = st.national_id ?? '';
    let c = fixed + 1; let grand = 0; let missing = false;
    for (const g of groups) {
      let subTotal = 0; let subMissing = false;
      for (const s of g.s.comps) {
        const v = r.results.get(`${st.id}:${s.id}`);
        if (!v) subMissing = true;
        else if (!v.absent && v.score !== null) subTotal += v.score;
      }
      for (const col of g.cols) {
        const cell = row.getCell(c++);
        if (!numeric) {
          const v = col.comp ? r.results.get(`${st.id}:${col.comp}`) : undefined;
          cell.value = !v ? '' : v.absent ? 'غائب' : v.level ?? '';
          if (v?.absent) cell.fill = fill(XL.amber);
        } else if (col.comp) {
          const v = r.results.get(`${st.id}:${col.comp}`);
          cell.value = !v ? '' : v.absent ? 'غ' : v.score;
          if (v?.absent) cell.fill = fill(XL.amber);
          else if (v?.score === 0) cell.fill = fill(XL.rose);
        } else {
          cell.value = subMissing ? '' : subTotal;
          cell.font = { name: 'Arial', bold: true, size: 11 };
        }
      }
      if (subMissing) missing = true;
      grand += subTotal;
    }
    if (numeric) {
      row.getCell(c).value = missing ? '' : grand;
      row.getCell(c + 1).value = missing || !grandMax ? '' : Math.round((grand / grandMax) * 10000) / 10000;
      row.getCell(c + 1).numFmt = '0.0%';
    }
    styleBodyRow(row, i);
    row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    if (numeric) { row.getCell(c).font = { name: 'Arial', bold: true, size: 11 }; row.getCell(c + 1).font = { name: 'Arial', bold: true, size: 11 }; }
  });

  // العرض
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 34; ws.getColumn(3).width = 13;
  for (let c = fixed + 1; c <= totalCols; c++) ws.getColumn(c).width = numeric ? (detailed ? 9.5 : 11) : 14;
  if (numeric) { ws.getColumn(totalCols - 1).width = 12; ws.getColumn(totalCols).width = 9; }
  ws.views = [{ rightToLeft: true, state: 'frozen', xSplit: 2, ySplit: start + 1 }];
  ws.pageSetup.printTitlesRow = `${start}:${start + 1}`;

  // التوقيعات
  const end = start + 2 + r.students.length + 1;
  const sig = ws.getRow(end + 1);
  const third = Math.max(1, Math.floor(totalCols / 3));
  const spots: [number, number, string][] = [[1, third, 'معلمة المادة: ................'], [third + 1, third * 2, 'المشرفة: ................'], [third * 2 + 1, totalCols, 'مدير المدرسة: ................']];
  spots.forEach(([a, b, t]) => { if (b > a) ws.mergeCells(sig.number, a, sig.number, b); const cell = sig.getCell(a); cell.value = t; cell.font = { name: 'Arial', size: 11 }; cell.alignment = { horizontal: 'center' }; });
  sig.height = 28;
  const legend = ws.getRow(end + 3);
  ws.mergeCells(legend.number, 1, legend.number, totalCols);
  legend.getCell(1).value = numeric ? 'غ = غائب  ·  الخانات الفارغة = لم يُرصد بعد' : 'الخانات الفارغة = لم يُرصد بعد';
  legend.getCell(1).font = { name: 'Arial', size: 9, color: { argb: XL.muted } };
  return ws;
}

/** تقرير متابعة الرصد: كل إسناد × نوع تقييم وحالته */
export async function writeProgressSheet(wb: ExcelJS.Workbook, supabase: SupabaseClient, branchId: string | null, term: 1 | 2) {
  const { data: settings } = await supabase.from('settings').select('school_name, academic_year').eq('id', 1).single();
  let q = supabase.from('teacher_assignments').select(`
    section_id, grade_subject_id,
    teacher:profiles(full_name),
    section:sections!inner(name, branch_id, branch:branches(name), grade:grades(name, sort_order)),
    gs:grade_subjects(subject:subjects(name), comps:assessment_components(id, name))`);
  if (branchId) q = q.eq('section.branch_id', branchId);
  const { data } = await q;
  type Row = { section_id: string; teacher: { full_name: string } | null; section: { name: string; branch: { name: string }; grade: { name: string; sort_order: number } }; gs: { subject: { name: string } | null; comps: { id: string; name: string }[] } };
  const rows = ((data ?? []) as unknown as Row[]);
  const sectionIds = [...new Set(rows.map((r) => r.section_id))];
  const subs: { section_id: string; component_id: string; submitted_at: string; last_edited_at: string | null }[] = [];
  for (let i = 0; i < sectionIds.length; i += 150) {
    const { data: s } = await supabase.from('submissions').select('section_id, component_id, submitted_at, last_edited_at')
      .in('section_id', sectionIds.slice(i, i + 150)).eq('term', term).eq('academic_year', settings?.academic_year ?? '');
    subs.push(...(s ?? []));
  }
  const subMap = new Map(subs.map((s) => [`${s.section_id}:${s.component_id}`, s]));

  const ws = newSheet(wb, 'متابعة الرصد', true);
  const cols = ['م', 'الفرع', 'المعلمة', 'الصف', 'الشعبة', 'المادة', 'التقييم', 'الحالة', 'تاريخ الحفظ'];
  ws.columns = [5, 16, 28, 18, 8, 26, 20, 12, 18].map((width) => ({ width }));
  const start = titleBlock(ws, cols.length, [
    { text: `${settings?.school_name ?? ''} — تقرير متابعة الرصد`, size: 14, bold: true },
    { text: `${term === 1 ? 'الترم الأول' : 'الترم الثاني'} · ${settings?.academic_year ?? ''} · ${new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}`, size: 11, color: XL.muted },
  ]);
  const head = ws.getRow(start); head.values = cols;
  head.eachCell((c) => { c.font = { name: 'Arial', bold: true, color: { argb: XL.headText } }; c.fill = fill(XL.head); c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = box; });
  head.height = 28;

  const flat = rows.flatMap((r) => r.gs.comps.map((c) => ({ r, c, sub: subMap.get(`${r.section_id}:${c.id}`) })))
    .sort((a, b) => a.r.section.branch.name.localeCompare(b.r.section.branch.name, 'ar') || (a.r.teacher?.full_name ?? '').localeCompare(b.r.teacher?.full_name ?? '', 'ar') || a.r.section.grade.sort_order - b.r.section.grade.sort_order);
  flat.forEach((x, i) => {
    const row = ws.getRow(start + 1 + i);
    row.values = [i + 1, x.r.section.branch.name, x.r.teacher?.full_name ?? '—', x.r.section.grade.name, x.r.section.name, x.r.gs.subject?.name ?? '', x.c.name,
      x.sub ? 'مرصود' : 'لم يُرصد', x.sub ? new Date(x.sub.last_edited_at ?? x.sub.submitted_at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn') : ''];
    styleBodyRow(row, i);
    row.getCell(8).fill = fill(x.sub ? XL.mint : XL.rose);
    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
  });
  ws.autoFilter = { from: { row: start, column: 1 }, to: { row: start + flat.length, column: cols.length } };
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: start }];
  const done = flat.filter((x) => x.sub).length;
  const sum = ws.getRow(start + flat.length + 2);
  ws.mergeCells(sum.number, 1, sum.number, cols.length);
  sum.getCell(1).value = `الإنجاز: ${done} من ${flat.length} (${flat.length ? Math.round((done / flat.length) * 100) : 0}%)`;
  sum.getCell(1).font = { name: 'Arial', bold: true, size: 12 };
  return { done, total: flat.length };
}
