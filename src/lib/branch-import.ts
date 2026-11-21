import 'server-only';
import ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normAr, sectionKey } from './arabic';
import { normalizeDigits, isTempNumber } from './utils';
import { compareNames } from './similar-names';
import { META_SHEET, META_MAGIC } from './branch-template';
import { createAdminClient } from './supabase/admin';

export class ImportError extends Error {}

export interface ParsedResult { component_id: string; label: string; value: { score: number | null; verbal_level_id: string | null; absent: boolean }; shown: string }
export interface ParsedRow {
  sheet: string; row: number; grade_id: string;
  full_name: string; student_number: string | null; national_id: string | null; name_en: string | null;
  birth_date: string | null; nationality: string | null; id_type: string | null; gender: 'male' | 'female' | null; section: string;
  section_id: string | null; newSection: boolean; sectionKey: string | null;
  /** new = طالب جديد، update = موجود بنفس الرقم، adopt = برقم مؤقت يأخذ الحقيقي، matched = موجود بنفس الاسم وبلا رقم في الملف */
  kind: 'new' | 'update' | 'adopt' | 'matched'; studentId: string | null;
  results: ParsedResult[];
  /** المواظبة والسلوك (0–100) — تُحفظ كرصد أدمن منفصل */
  conduct?: { attendance: number | null; behavior: number | null; shown: { attendance: string; behavior: string } };
  errors: string[]; warnings: string[];
}
export interface ExistingResult { score: number | null; verbal_level_id: string | null; is_absent: boolean }
export interface BranchModel {
  branch: { id: string; name: string }; year: string; term: 1 | 2;
  rows: ParsedRow[]; newSections: { key: string; grade_id: string; name: string; label: string }[];
  existing: Map<string, ExistingResult>; // studentId|componentId
  existingConduct: Map<string, { attendance: number; behavior: number }>; // رصد الأدمن/الملف الحالي لكل طالب
  compLabel: Map<string, string>; levelLabel: Map<string, string>;
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return String(v.result ?? '');
  }
  return String(v);
};

import { dateCellText } from './excel-date';

const ABSENT = new Set(['غ', 'غائب', 'غائبه', 'غياب'].map(normAr));

/** يحلّل ملف الفرع الموحّد دون أي كتابة. نفس الدالة يعتمد عليها الحفظ لاحقاً فلا يختلف ما عُرض عمّا يُحفظ. */
export async function parseBranchFile(supabase: SupabaseClient, base64: string, branchId: string, term: 1 | 2): Promise<BranchModel> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer); }
  catch { throw new ImportError('تعذّرت قراءة الملف. تأكدي أنه ملف الفرع بصيغة xlsx'); }

  const meta = wb.getWorksheet(META_SHEET);
  const head = meta?.getRow(1);
  if (!meta || cellText(head?.getCell(1).value ?? null) !== META_MAGIC) throw new ImportError('هذا ليس ملف الفرع المولَّد من النظام. حمّلي الملف من صفحة «ملف الفرع» واستخدميه.');
  if (cellText(head!.getCell(2).value) !== branchId) throw new ImportError('الملف مولَّد لفرع آخر. اختاري الفرع الصحيح أو حمّلي ملف هذا الفرع.');

  const [{ data: branch }, { data: set }] = await Promise.all([
    supabase.from('branches').select('id, name').eq('id', branchId).single(),
    supabase.from('settings').select('academic_year').eq('id', 1).single(),
  ]);
  if (!branch) throw new ImportError('الفرع غير موجود');
  const year = (set?.academic_year as string) ?? '';
  if (cellText(head!.getCell(3).value) && cellText(head!.getCell(3).value) !== year) throw new ImportError('الملف مولَّد لسنة دراسية أخرى. حمّلي ملفاً جديداً.');

  // خريطة الأعمدة من ورقة meta
  const dataStart = Number(cellText(head!.getCell(6).value)) || 2;
  const colsBySheet = new Map<string, { col: number; component_id: string; grade_id: string; label: string }[]>();
  const gradeBySheet = new Map<string, string>();
  const condBySheet = new Map<string, { attendance?: number; behavior?: number }>();
  for (let r = 2; r <= meta.rowCount; r++) {
    const row = meta.getRow(r);
    const sheet = cellText(row.getCell(1).value);
    if (!sheet) continue;
    const comp = cellText(row.getCell(3).value);
    gradeBySheet.set(sheet, cellText(row.getCell(4).value));
    if (comp.startsWith('conduct:')) {
      const k = comp.slice(8) as 'attendance' | 'behavior';
      condBySheet.set(sheet, { ...(condBySheet.get(sheet) ?? {}), [k]: Number(row.getCell(2).value) });
      continue;
    }
    if (comp) colsBySheet.set(sheet, [...(colsBySheet.get(sheet) ?? []), { col: Number(row.getCell(2).value), component_id: comp, grade_id: cellText(row.getCell(4).value), label: cellText(row.getCell(5).value) }]);
  }
  const gradeOfSheet = new Map<string, string>();
  const sheetsInfo = wb.worksheets.filter((w) => w.name !== META_SHEET && w.name !== 'lists' && w.name !== 'التعليمات');

  // المرجع الحالي من القاعدة: لضمان أن الملف ما زال مطابقاً (لم تتغير المواد/الأنواع/الدرجات العظمى)
  const [bg, grades] = await Promise.all([
    supabase.from('branch_grades').select('grade_id').eq('branch_id', branchId),
    supabase.from('grades').select('id, name, assessment_mode'),
  ]);
  const openGrades = new Set((bg.data ?? []).map((r) => r.grade_id as string));
  const gradeName = new Map((grades.data ?? []).map((g) => [g.id as string, g.name as string]));
  const gradeMode = new Map((grades.data ?? []).map((g) => [g.id as string, g.assessment_mode as string]));

  const allCompIds = [...colsBySheet.values()].flat().map((c) => c.component_id);
  const compRows = allCompIds.length ? ((await supabase.from('assessment_components').select('id, grade_subject_id, max_score').in('id', allCompIds)).data ?? []) : [];
  const compInfo = new Map(compRows.map((c) => [c.id as string, { gs: c.grade_subject_id as string, max: c.max_score === null ? null : Number(c.max_score) }]));
  const excl = new Set(((await supabase.from('branch_subject_exclusions').select('grade_subject_id').eq('branch_id', branchId)).data ?? []).map((e) => e.grade_subject_id as string));
  const levelsRaw = (await supabase.from('verbal_levels').select('id, grade_id, label').in('grade_id', [...openGrades])).data ?? [];
  const levelsByGrade = new Map<string, Map<string, string>>();
  const levelLabel = new Map<string, string>();
  levelsRaw.forEach((l) => {
    const m = levelsByGrade.get(l.grade_id as string) ?? new Map<string, string>();
    m.set(normAr(l.label as string), l.id as string); levelsByGrade.set(l.grade_id as string, m);
    levelLabel.set(l.id as string, l.label as string);
  });

  // الطلاب الموجودون (بصلاحية الخادم) في هذا الفرع
  const admin = createAdminClient();
  const stu: { id: string; full_name: string; student_number: string | null; grade_id: string; section_id: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('students').select('id, full_name, student_number, grade_id, section_id').eq('branch_id', branchId).range(from, from + 999);
    stu.push(...((data ?? []) as typeof stu)); if (!data || data.length < 1000) break;
  }
  const byNumber = new Map(stu.filter((s) => s.student_number).map((s) => [s.student_number as string, s]));
  const sections = ((await supabase.from('sections').select('id, grade_id, name').eq('branch_id', branchId)).data ?? []) as { id: string; grade_id: string; name: string }[];

  const rows: ParsedRow[] = [];
  const newSec = new Map<string, { key: string; grade_id: string; name: string; label: string }>();
  const fileNums = new Map<string, string>();
  const takenExisting = new Set<string>();
  const compLabel = new Map<string, string>();

  for (const ws of sheetsInfo) {
    const gradeId = gradeBySheet.get(ws.name);
    if (!gradeId) continue; // ورقة لا تخص النظام
    const cols = colsBySheet.get(ws.name) ?? [];
    gradeOfSheet.set(ws.name, gradeId);
    if (!openGrades.has(gradeId)) throw new ImportError(`الصف «${gradeName.get(gradeId) ?? ws.name}» لم يعد مفتوحاً في هذا الفرع. حمّلي ملفاً جديداً.`);
    // الملف قديم؟ المادة أُوقفت أو تغيّرت درجتها العظمى
    for (const c of cols) {
      const info = compInfo.get(c.component_id);
      if (!info) throw new ImportError(`تغيّرت مواد الصف «${gradeName.get(gradeId)}» بعد تحميل الملف. حمّلي ملفاً جديداً.`);
      if (excl.has(info.gs)) throw new ImportError(`المادة «${c.label}» أُوقفت لهذا الفرع بعد تحميل الملف. حمّلي ملفاً جديداً.`);
      compLabel.set(c.component_id, c.label);
    }
    const verbal = gradeMode.get(gradeId) === 'verbal';
    const levels = levelsByGrade.get(gradeId) ?? new Map<string, string>();
    const sameGrade = stu.filter((s) => s.grade_id === gradeId);

    for (let r = dataStart; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const g = (i: number) => cellText(row.getCell(i).value).trim();
      const name = g(2).replace(/\s+/g, ' ');
      const cc = condBySheet.get(ws.name);
      const hasRes = cols.some((c) => g(c.col) !== '') || (!!cc?.attendance && g(cc.attendance) !== '') || (!!cc?.behavior && g(cc.behavior) !== '');
      const num0 = normalizeDigits(g(1)).trim();
      if (!name && !num0 && !hasRes) continue;

      const errors: string[] = []; const warnings: string[] = [];
      const num = num0 || null;
      const gender = normAr(g(8));
      const item: ParsedRow = {
        sheet: ws.name, row: r, grade_id: gradeId, full_name: name, student_number: num,
        national_id: normalizeDigits(g(7)).replace(/\s+/g, '') || null, name_en: g(3).replace(/\s+/g, ' ') || null,
        birth_date: dateCellText(row.getCell(4), cellText).trim() || null, nationality: g(5) || null, id_type: g(6) || null,
        gender: /ذكر|ولد|طالب$|male|^m$/.test(gender) ? 'male' : /انث|بنت|طالبه|female|^f$/.test(gender) ? 'female' : null,
        section: g(9), section_id: null, newSection: false, sectionKey: null, kind: 'new', studentId: null, results: [], errors, warnings,
      };
      if (!name) errors.push('اسم الطالب مفقود');
      else if (name.split(' ').length < 2) errors.push('الاسم ناقص');
      if (item.national_id && item.national_id.length > 20) errors.push('رقم الهوية طويل جداً');
      if (num && num.length > 30) errors.push('الرقم الأكاديمي طويل جداً');
      if (num) {
        if (fileNums.has(num)) errors.push(`الرقم الأكاديمي مكرر في الملف (${fileNums.get(num)})`);
        else fileNums.set(num, `${ws.name} صف ${r}`);
      }

      // الشعبة
      if (item.section) {
        const sec = sections.find((x) => x.grade_id === gradeId && sectionKey(x.name) === sectionKey(item.section));
        if (sec) item.section_id = sec.id;
        else { const key = `${gradeId}:${sectionKey(item.section)}`; item.newSection = true; item.sectionKey = key; if (!newSec.has(key)) newSec.set(key, { key, grade_id: gradeId, name: item.section, label: `${gradeName.get(gradeId)} · ${item.section}` }); }
      } else {
        const only = sections.filter((x) => x.grade_id === gradeId);
        if (only.length === 1) { item.section_id = only[0].id; item.section = only[0].name; }
      }

      // هوية الطالب: رقم أكاديمي ← رقم مؤقت بنفس الاسم ← نفس الاسم بلا رقم ← جديد
      if (name && !errors.length) {
        const byNum = num ? byNumber.get(num) : undefined;
        if (byNum) {
          if (byNum.grade_id !== gradeId) errors.push('الرقم الأكاديمي مسجّل لطالب في صف آخر');
          else { item.kind = 'update'; item.studentId = byNum.id; takenExisting.add(byNum.id); }
        } else {
          const sameName = sameGrade.filter((s) => normAr(s.full_name) === normAr(name) && !takenExisting.has(s.id));
          if (num && sameName.length) {
            const temp = sameName.filter((s) => isTempNumber(s.student_number));
            if (temp.length === 1) { item.kind = 'adopt'; item.studentId = temp[0].id; takenExisting.add(temp[0].id); }
            else warnings.push('يوجد طالب بنفس الاسم ورقم أكاديمي مختلف — سيُنشأ طالب جديد، راجعي أنه ليس مكرراً');
          } else if (!num && sameName.length) { item.kind = 'matched'; item.studentId = sameName[0].id; takenExisting.add(sameName[0].id); }
          if (item.kind === 'new') {
            const sim = sameGrade.find((s) => compareNames(s.full_name, name));
            if (sim) warnings.push(`اسم مشابه لطالب موجود: ${sim.full_name}`);
            if (!num) warnings.push('بلا رقم أكاديمي — لن تُمنع إعادة التكرار عند إعادة الرفع');
          }
        }
      }

      // الدرجات تُحفظ على كشف الشعبة، فلا بد للطالب من شعبة (من الملف أو موجودة له)
      if (hasRes && name && !errors.length && !item.section_id && !item.newSection) {
        const cur = item.studentId ? stu.find((x) => x.id === item.studentId)?.section_id : null;
        if (!cur) errors.push('له درجات وبلا شعبة — اكتبي شعبته في الملف');
      }

      // الدرجات
      for (const c of cols) {
        const raw = g(c.col);
        if (raw === '') continue;
        const info = compInfo.get(c.component_id)!;
        const t = normalizeDigits(raw).replace(/[٫,،]/g, '.').trim();
        if (ABSENT.has(normAr(raw))) { item.results.push({ component_id: c.component_id, label: c.label, value: { score: null, verbal_level_id: null, absent: true }, shown: 'غائب' }); continue; }
        if (verbal) {
          const id = levels.get(normAr(raw));
          if (!id) errors.push(`«${c.label}»: التقدير «${raw}» غير معروف`);
          else item.results.push({ component_id: c.component_id, label: c.label, value: { score: null, verbal_level_id: id, absent: false }, shown: raw });
          continue;
        }
        const n = Number(t);
        if (!/^\d+(\.\d+)?$/.test(t) || Number.isNaN(n)) errors.push(`«${c.label}»: القيمة «${raw}» ليست رقماً`);
        else if (info.max === null) errors.push(`«${c.label}»: لم تُحدد الدرجة العظمى لهذا النوع في النظام`);
        else if (n > info.max) errors.push(`«${c.label}»: ${n} أكبر من العظمى ${info.max}`);
        else if (n * 4 !== Math.trunc(n * 4)) errors.push(`«${c.label}»: الكسور المسموحة .25 و .5 و .75 فقط`);
        else item.results.push({ component_id: c.component_id, label: c.label, value: { score: n, verbal_level_id: null, absent: false }, shown: String(n) });
      }
      if (cc && name) {
        const posNeg = (kind: 'attendance' | 'behavior') => ({
          pos: normAr(kind === 'attendance' ? 'انتظام في الحضور' : 'التزام بالسلوك الإيجابي'),
          neg: normAr(kind === 'attendance' ? 'عدم الانتظام في الحضور' : 'الحاجة إلى تحسين السلوك'),
        });
        const val = (kind: 'attendance' | 'behavior', title: string): number | null => {
          const col = cc[kind]; if (!col) return null;
          const raw = g(col); if (raw === '') return null;
          if (verbal) {
            const k = normAr(raw); const pn = posNeg(kind);
            if (k === pn.pos) return 100; if (k === pn.neg) return 0;
            errors.push(`«${title}»: القيمة «${raw}» غير معروفة — اختاري من القائمة`); return null;
          }
          const t = normalizeDigits(raw).replace(/[٫,،]/g, '.').trim();
          const n = Number(t);
          if (!/^\d+(\.\d+)?$/.test(t) || Number.isNaN(n)) { errors.push(`«${title}»: القيمة «${raw}» ليست رقماً`); return null; }
          if (n > 100) { errors.push(`«${title}»: ${n} أكبر من 100`); return null; }
          if (n * 100 !== Math.trunc(n * 100)) { errors.push(`«${title}»: خانتان عشريتان كحد أقصى`); return null; }
          return n;
        };
        const attendance = val('attendance', 'المواظبة'), behavior = val('behavior', 'السلوك');
        if (attendance !== null || behavior !== null) item.conduct = { attendance, behavior, shown: { attendance: cc.attendance ? g(cc.attendance) : '', behavior: cc.behavior ? g(cc.behavior) : '' } };
      }
      if ((item.results.length || item.conduct) && !name) errors.push('درجات بلا اسم طالب');
      rows.push(item);
    }
  }
  if (!rows.length) throw new ImportError('لا توجد بيانات تحت العناوين');

  // رقم أكاديمي مسجّل لطالب في فرع آخر: لا يُسمح (الرقم فريد في النظام كله)
  const unknownNums = [...fileNums.keys()].filter((n) => !byNumber.has(n));
  const taken = new Map<string, string>();
  for (let i = 0; i < unknownNums.length; i += 300) {
    const { data } = await admin.from('students').select('student_number, full_name').in('student_number', unknownNums.slice(i, i + 300));
    (data ?? []).forEach((d) => taken.set(d.student_number as string, d.full_name as string));
  }
  rows.forEach((r) => { if (r.student_number && taken.has(r.student_number)) r.errors.push(`الرقم الأكاديمي مسجّل لطالب في فرع آخر (${taken.get(r.student_number)})`); });

  // الدرجات الموجودة لهؤلاء الطلاب في هذا الفصل والسنة
  const existing = new Map<string, ExistingResult>();
  const ids = [...new Set(rows.map((r) => r.studentId).filter((x): x is string => !!x))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from('results').select('student_id, component_id, score, verbal_level_id, is_absent')
      .in('student_id', ids.slice(i, i + 200)).eq('term', term).eq('academic_year', year);
    (data ?? []).forEach((d) => existing.set(`${d.student_id}|${d.component_id}`, { score: d.score === null ? null : Number(d.score), verbal_level_id: d.verbal_level_id as string | null, is_absent: !!d.is_absent }));
  }
  // رصد المواظبة والسلوك الحالي (كشوف الأدمن/الملف) لتصنيف الجديد/المطابق/المتعارض
  const existingConduct = new Map<string, { attendance: number; behavior: number }>();
  if (ids.length && [...condBySheet.values()].length) {
    const secIds = sections.map((x) => x.id);
    const { data: sh, error: she } = secIds.length ? await admin.from('conduct_sheets').select('id').is('teacher_id', null).in('section_id', secIds).eq('term', term).eq('academic_year', year) : { data: [], error: null };
    if (!she && (sh ?? []).length) {
      const sheetIds = (sh ?? []).map((x) => x.id as string);
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await admin.from('conduct_scores').select('student_id, attendance, behavior').in('sheet_id', sheetIds).in('student_id', ids.slice(i, i + 200));
        (data ?? []).forEach((d) => existingConduct.set(d.student_id as string, { attendance: Number(d.attendance), behavior: Number(d.behavior) }));
      }
    }
  }
  return { branch: branch as { id: string; name: string }, year, term, rows, newSections: [...newSec.values()], existing, existingConduct, compLabel, levelLabel };
}

/** مقارنة قيمة الملف بما في النظام */
export function compareResult(model: BranchModel, row: ParsedRow, r: ParsedResult): 'new' | 'same' | 'conflict' {
  const old = row.studentId ? model.existing.get(`${row.studentId}|${r.component_id}`) : undefined;
  if (!old) return 'new';
  const same = old.is_absent === r.value.absent && (old.score ?? null) === (r.value.score ?? null) && (old.verbal_level_id ?? null) === (r.value.verbal_level_id ?? null);
  return same ? 'same' : 'conflict';
}
export const shownOld = (model: BranchModel, old: ExistingResult) => (old.is_absent ? 'غائب' : old.verbal_level_id ? model.levelLabel.get(old.verbal_level_id) ?? '—' : String(old.score ?? '—'));

/** مقارنة المواظبة والسلوك بالرصد الحالي: new = لا رصد، same = مطابق، conflict = يختلف (يُستبدل بخيار الاستبدال فقط) */
export function compareConduct(model: BranchModel, row: ParsedRow): 'new' | 'same' | 'conflict' | null {
  if (!row.conduct) return null;
  const old = row.studentId ? model.existingConduct.get(row.studentId) : undefined;
  if (!old) return 'new';
  const a = row.conduct.attendance, b = row.conduct.behavior;
  return (a === null || a === old.attendance) && (b === null || b === old.behavior) ? 'same' : 'conflict';
}
