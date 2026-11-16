import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type ExcelJS from 'exceljs';
import { newSheet, titleBlock, styleBodyRow, styleHeaderRow, XL } from './excel';

export interface ExcludedRow {
  kind: 'subject' | 'inactive'; student_id: string; student_name: string; student_number: string | null; national_id: string | null;
  branch_id: string; branch: string; grade_id: string; grade: string; grade_sort: number; section_id: string | null; section: string;
  subject: string | null; reason: string | null; by_name: string | null; at: string;
}
export interface SummaryRow {
  section_id: string; branch_id: string; branch: string; grade_id: string; grade: string; grade_sort: number; section: string;
  homeroom: string | null; students: number; issued: number; total: number; last_at: string | null; last_by: string | null;
}

const KIND_AR: Record<string, string> = { pdf: 'PDF', png: 'صورة', share: 'مشاركة', zip: 'ملف مضغوط' };
const dt = (d?: string | null) => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Riyadh' }) : '');
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

export async function loadExcluded(supabase: SupabaseClient, f: { branch?: string; grade?: string; section?: string } = {}) {
  const { data, error } = await supabase.rpc('excluded_students');
  if (error) throw error;
  return ((data ?? []) as ExcludedRow[]).filter((r) => (!f.branch || r.branch_id === f.branch) && (!f.grade || r.grade_id === f.grade) && (!f.section || r.section_id === f.section));
}

/** تقرير الطلاب المستبعدين: ملخص + تفصيل المواد + غير النشطين */
export async function writeExcludedSheets(wb: ExcelJS.Workbook, supabase: SupabaseClient, f: { branch?: string; grade?: string; section?: string }) {
  const [{ data: st }, rows] = await Promise.all([
    supabase.from('settings').select('school_name, academic_year').eq('id', 1).single(),
    loadExcluded(supabase, f),
  ]);
  const sub = rows.filter((r) => r.kind === 'subject');
  const off = rows.filter((r) => r.kind === 'inactive');
  const stamp = `${st?.academic_year ?? ''} · ${new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}`;

  // ---- الملخص: لكل فرع وصف
  const ws = newSheet(wb, 'ملخص', false);
  const cols = ['الفرع', 'الصف', 'طلاب مستبعدون من مواد', 'عدد حالات الاستبعاد', 'طلاب غير نشطين'];
  ws.columns = [20, 24, 20, 18, 16].map((width) => ({ width }));
  const start = titleBlock(ws, cols.length, [
    { text: `${st?.school_name ?? ''} — تقرير الطلاب المستبعدين`, size: 14, bold: true },
    { text: stamp, size: 11, color: XL.muted },
  ]);
  ws.getRow(start).values = cols; styleHeaderRow(ws.getRow(start));
  const groups = new Map<string, { branch: string; grade: string; sort: number; stu: Set<string>; cases: number; off: Set<string> }>();
  for (const r of rows) {
    const k = `${r.branch_id}|${r.grade_id}`;
    const g = groups.get(k) ?? { branch: r.branch, grade: r.grade, sort: r.grade_sort, stu: new Set(), cases: 0, off: new Set() };
    if (r.kind === 'subject') { g.stu.add(r.student_id); g.cases++; } else g.off.add(r.student_id);
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => a.branch.localeCompare(b.branch, 'ar') || a.sort - b.sort);
  list.forEach((g, i) => { const row = ws.getRow(start + 1 + i); row.values = [g.branch, g.grade, g.stu.size, g.cases, g.off.size]; styleBodyRow(row, i); });
  const tot = ws.getRow(start + 1 + list.length);
  tot.values = ['الإجمالي', '', new Set(sub.map((r) => r.student_id)).size, sub.length, off.length];
  tot.eachCell({ includeEmpty: true }, (c) => { c.font = { name: 'Arial', bold: true, size: 11 }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = fill(XL.peri); });

  const detail = (name: string, data: ExcludedRow[], heads: string[], widths: number[], map: (r: ExcludedRow, i: number) => (string | number)[], tone: string) => {
    const w = newSheet(wb, name, true);
    w.columns = widths.map((width) => ({ width }));
    const s = titleBlock(w, heads.length, [{ text: `${st?.school_name ?? ''} — ${name}`, size: 14, bold: true }, { text: `${stamp} · ${data.length} حالة`, size: 11, color: XL.muted }]);
    w.getRow(s).values = heads; styleHeaderRow(w.getRow(s));
    data.forEach((r, i) => { const row = w.getRow(s + 1 + i); row.values = map(r, i); styleBodyRow(row, i); row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' }; row.getCell(heads.length).fill = fill(tone); });
    w.autoFilter = { from: { row: s, column: 1 }, to: { row: s, column: heads.length } };
    w.views = [{ rightToLeft: true, state: 'frozen', ySplit: s }];
  };
  detail('المستبعدون من مواد', sub, ['م', 'اسم الطالب', 'الرقم الأكاديمي', 'الفرع', 'الصف', 'الشعبة', 'المادة', 'السبب', 'استبعدته', 'التاريخ'],
    [5, 34, 14, 16, 20, 10, 22, 28, 20, 18],
    (r, i) => [i + 1, r.student_name, r.student_number ?? '', r.branch, r.grade, r.section, r.subject ?? '', r.reason ?? '', r.by_name ?? '', dt(r.at)], XL.amber);
  detail('غير النشطين', off, ['م', 'اسم الطالب', 'الرقم الأكاديمي', 'الفرع', 'الصف', 'الشعبة', 'ملاحظة', 'آخر تحديث'],
    [5, 34, 14, 16, 20, 10, 36, 18],
    (r, i) => [i + 1, r.student_name, r.student_number ?? '', r.branch, r.grade, r.section, r.reason ?? '', dt(r.at)], XL.rose);
}

/** تقرير الإصدار: ملخص الشعب + سجل كل إشعار صدر في الفصل */
export async function writeIssuesSheets(wb: ExcelJS.Workbook, supabase: SupabaseClient, term: 1 | 2, f: { branch?: string; grade?: string }) {
  const [{ data: st }, { data: sum, error }] = await Promise.all([
    supabase.from('settings').select('school_name, academic_year').eq('id', 1).single(),
    supabase.rpc('notice_issue_summary', { p_term: term }),
  ]);
  if (error) throw error;
  const rows = ((sum ?? []) as SummaryRow[]).filter((r) => (!f.branch || r.branch_id === f.branch) && (!f.grade || r.grade_id === f.grade));
  const stamp = `${term === 1 ? 'الفصل الأول' : 'الفصل الثاني'} · ${st?.academic_year ?? ''} · ${new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}`;

  const ws = newSheet(wb, 'ملخص الشعب', true);
  const cols = ['الفرع', 'الصف', 'الشعبة', 'مربية الفصل', 'عدد الطلاب', 'صدر لهم إشعار', 'لم يصدر', 'النسبة', 'عدد مرات الإصدار', 'آخر إصدار', 'آخر مُصدِرة'];
  ws.columns = [18, 22, 10, 24, 12, 14, 10, 10, 14, 18, 24].map((width) => ({ width }));
  const start = titleBlock(ws, cols.length, [{ text: `${st?.school_name ?? ''} — متابعة إصدار إشعارات الدرجات`, size: 14, bold: true }, { text: stamp, size: 11, color: XL.muted }]);
  ws.getRow(start).values = cols; styleHeaderRow(ws.getRow(start));
  rows.forEach((r, i) => {
    const row = ws.getRow(start + 1 + i);
    const pct = r.students ? Math.round((Math.min(r.issued, r.students) / r.students) * 100) : 0;
    row.values = [r.branch, r.grade, r.section, r.homeroom ?? '— لم تُسنَد —', r.students, r.issued, Math.max(0, r.students - r.issued), `${pct}%`, r.total, dt(r.last_at), r.last_by ?? ''];
    styleBodyRow(row, i);
    row.getCell(8).fill = fill(pct >= 100 ? XL.mint : pct > 0 ? XL.amber : XL.rose);
  });

  // ---- السجل التفصيلي (حتى 5000 سجل، صفحات من 1000)
  type Log = { student_name: string; student_number: string | null; term: number; kind: string; complete: boolean; issuer_name: string | null; issuer_role: string | null; created_at: string; branch: { name: string } | null; grade: { name: string } | null; section: { name: string } | null };
  const logs: Log[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    let q = supabase.from('notice_issues')
      .select('student_name, student_number, term, kind, complete, issuer_name, issuer_role, created_at, branch:branches(name), grade:grades(name), section:sections(name)')
      .eq('term', term).order('created_at', { ascending: false }).range(from, from + 999);
    if (f.branch) q = q.eq('branch_id', f.branch);
    if (f.grade) q = q.eq('grade_id', f.grade);
    const { data, error: e } = await q;
    if (e) throw e;
    logs.push(...((data ?? []) as unknown as Log[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  const w = newSheet(wb, 'سجل الإصدار', true);
  const heads = ['م', 'اسم الطالب', 'الرقم الأكاديمي', 'الفرع', 'الصف', 'الشعبة', 'الطريقة', 'الرصد', 'المُصدِرة', 'صفتها', 'التاريخ'];
  w.columns = [5, 34, 14, 16, 20, 10, 12, 10, 24, 12, 18].map((width) => ({ width }));
  const s2 = titleBlock(w, heads.length, [{ text: `${st?.school_name ?? ''} — سجل إصدار الإشعارات`, size: 14, bold: true }, { text: `${stamp} · ${logs.length} سجل`, size: 11, color: XL.muted }]);
  w.getRow(s2).values = heads; styleHeaderRow(w.getRow(s2));
  const ROLE: Record<string, string> = { admin: 'أدمن', supervisor: 'مشرفة', teacher: 'مربية فصل' };
  logs.forEach((r, i) => {
    const row = w.getRow(s2 + 1 + i);
    row.values = [i + 1, r.student_name, r.student_number ?? '', r.branch?.name ?? '', r.grade?.name ?? '', r.section?.name ?? '', KIND_AR[r.kind] ?? r.kind, r.complete ? 'مكتمل' : 'ناقص', r.issuer_name ?? '', ROLE[r.issuer_role ?? ''] ?? '', dt(r.created_at)];
    styleBodyRow(row, i); row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(8).fill = fill(r.complete ? XL.mint : XL.amber);
  });
  w.autoFilter = { from: { row: s2, column: 1 }, to: { row: s2, column: heads.length } };
  w.views = [{ rightToLeft: true, state: 'frozen', ySplit: s2 }];
}
