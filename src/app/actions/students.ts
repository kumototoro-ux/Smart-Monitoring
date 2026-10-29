'use server';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { run, must, ActionError, parseOr } from '@/lib/action';
import { gradeKey, normAr, sectionKey } from '@/lib/arabic';
import { normalizeDigits } from '@/lib/utils';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const uuid = z.string().uuid();
const studentSchema = z.object({
  id: uuid.optional(),
  full_name: z.string().trim().min(6, 'اكتبي اسم الطالب ثلاثياً على الأقل').max(150),
  national_id: z.string().trim().max(20, 'رقم الهوية طويل جداً').optional().transform((v) => (v ? normalizeDigits(v) : null)),
  student_number: z.string().trim().max(30).optional().transform((v) => (v ? normalizeDigits(v) : null)),
  name_en: z.string().trim().max(150).optional().transform((v) => v || null),
  birth_date: z.string().trim().max(30).optional().transform((v) => v || null),
  nationality: z.string().trim().max(60).optional().transform((v) => v || null),
  id_type: z.string().trim().max(40).optional().transform((v) => v || null),
  gender: z.enum(['male', 'female']).nullable().optional(),
  branch_id: uuid,
  grade_id: uuid,
  section_id: uuid.nullable().optional(),
});

function scopeBranch(profile: Profile, branchId: string) {
  if (profile.role === 'supervisor' && branchId !== profile.branch_id) throw new ActionError('لا يمكنك إدارة طلاب فرع آخر');
}

async function checkSection(supabase: SupabaseClient, sectionId: string | null | undefined, branchId: string, gradeId: string) {
  if (!sectionId) return;
  const s = must(await supabase.from('sections').select('branch_id, grade_id').eq('id', sectionId).single()) as { branch_id: string; grade_id: string };
  if (s.branch_id !== branchId || s.grade_id !== gradeId) throw new ActionError('الشعبة لا تتبع الفرع والصف المحددين');
}

export async function saveStudent(input: z.input<typeof studentSchema>) {
  return run('student.save', ['admin', 'supervisor'], async ({ supabase, profile }) => {
    const { id, ...v } = parseOr(studentSchema, input);
    scopeBranch(profile, v.branch_id);
    await checkSection(supabase, v.section_id, v.branch_id, v.grade_id);
    const row = { ...v, full_name: v.full_name.replace(/\s+/g, ' ') };
    if (id) must(await supabase.from('students').update(row).eq('id', id));
    else must(await supabase.from('students').insert({ ...row, source: profile.role === 'admin' ? 'admin' : 'supervisor', created_by: profile.id }));
    return row.full_name;
  }, { revalidate: ['/students'], log: (n) => ({ name: n, id: input.id }) });
}

export async function moveStudents(ids: string[], sectionId: string) {
  return run('student.move', ['admin', 'supervisor'], async ({ supabase, profile }) => {
    const list = parseOr(z.array(uuid).min(1, 'اختاري طالباً واحداً على الأقل'), ids);
    const sec = must(await supabase.from('sections').select('branch_id, grade_id').eq('id', parseOr(uuid, sectionId)).single()) as { branch_id: string; grade_id: string };
    scopeBranch(profile, sec.branch_id);
    must(await supabase.from('students').update({ section_id: sectionId, grade_id: sec.grade_id, branch_id: sec.branch_id }).in('id', list));
    return list.length;
  }, { revalidate: ['/students'], log: (n) => ({ count: n, sectionId }) });
}

export async function setStudentsActive(ids: string[], active: boolean) {
  return run('student.set_active', ['admin', 'supervisor'], async ({ supabase }) => {
    const list = parseOr(z.array(uuid).min(1), ids);
    const res = await supabase.from('students').update({ is_active: active }).in('id', list).select('id');
    return must(res)?.length ?? 0;
  }, { revalidate: ['/students'], log: (n) => ({ count: n, active }) });
}

export async function approveStudents(ids: string[]) {
  return run('student.approve', ['admin', 'supervisor'], async ({ supabase }) => {
    const res = await supabase.from('students').update({ needs_review: false }).in('id', parseOr(z.array(uuid).min(1), ids)).select('id');
    return must(res)?.length ?? 0;
  }, { revalidate: ['/students'], log: (n) => ({ count: n }) });
}

export async function deleteStudents(ids: string[]) {
  return run('student.delete', ['admin'], async ({ supabase }) => {
    const list = parseOr(z.array(uuid).min(1), ids);
    const { count } = await supabase.from('results').select('id', { count: 'exact', head: true }).in('student_id', list);
    if (count) throw new ActionError('يوجد رصد لبعض الطلاب المختارين. استخدمي "إيقاف" بدلاً من الحذف.');
    const res = await supabase.from('students').delete().in('id', list).select('id');
    return must(res)?.length ?? 0;
  }, { revalidate: ['/students'], log: (n) => ({ count: n }) });
}

// ===================================================================== استيراد إكسل
export interface ImportRow {
  row: number; full_name: string; national_id: string | null; student_number: string | null;
  name_en: string | null; birth_date: string | null; nationality: string | null; id_type: string | null;
  gender: 'male' | 'female' | null; branch: string; grade: string; section: string;
  branch_id?: string; grade_id?: string; section_id?: string | null; newSection?: boolean;
  existing?: boolean; error?: string;
}
export interface ImportPreview {
  total: number; valid: number; errors: number; updates: number; noNumber: number; newSections: string[];
  rows: ImportRow[]; headers: Record<string, string | null>;
}

type Col = 'student_number' | 'full_name' | 'name_en' | 'grade' | 'birth_date' | 'nationality' | 'id_type' | 'national_id' | 'gender' | 'section' | 'branch';
const HEADERS: Record<Col, string[]> = {
  student_number: ['الرقم الأكاديمي', 'رقم أكاديمي', 'الرقم الجامعي', 'رقم الطالب', 'رقم الطالبة', 'رقم القيد', 'الرقم', 'academic number', 'student id'],
  full_name: ['اسم الطالب الرباعي (عربي)', 'اسم الطالب الرباعي', 'اسم الطالب (عربي)', 'اسم الطالب عربي', 'اسم الطالب', 'اسم الطالبة', 'الاسم', 'الاسم الكامل', 'الاسم الرباعي', 'الاسم بالعربي'],
  name_en: ['اسم الطالب (إنجليزي)', 'اسم الطالب انجليزي', 'اسم الطالب بالإنجليزي', 'الاسم بالإنجليزي', 'الاسم الإنجليزي', 'name', 'english name', 'name en'],
  grade: ['الصف الدراسي', 'الصف', 'المرحلة والصف', 'grade'],
  birth_date: ['تاريخ الميلاد', 'الميلاد', 'birth date', 'date of birth'],
  nationality: ['الجنسية', 'nationality'],
  id_type: ['نوع الهوية', 'نوع الإثبات', 'id type'],
  national_id: ['رقم الهوية', 'الهوية', 'السجل المدني', 'رقم السجل', 'رقم الإقامة', 'رقم الإثبات', 'id number'],
  gender: ['الجنس', 'النوع'],
  section: ['الشعبة', 'الفصل', 'رقم الفصل', 'section'],
  branch: ['الفرع', 'المدرسة', 'اسم الفرع'],
};
const HEADER_INDEX = new Map<string, Col>();
(Object.entries(HEADERS) as [Col, string[]][]).forEach(([k, names]) => names.forEach((n) => { if (!HEADER_INDEX.has(normAr(n))) HEADER_INDEX.set(normAr(n), k); }));

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10); // تاريخ إكسل → YYYY-MM-DD
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return String(v.result ?? '');
  }
  return String(v);
}

async function buildPreview(supabase: SupabaseClient, profile: Profile, base64: string, defaultBranch: string | null): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
  } catch {
    throw new ActionError('تعذّرت قراءة الملف. تأكدي أنه بصيغة xlsx');
  }
  const ws = wb.worksheets.find((w) => w.name === 'الطلاب' && w.rowCount > 1)
    ?? wb.worksheets.find((w) => w.state === 'visible' && w.name !== 'التعليمات' && w.rowCount > 1);
  if (!ws) throw new ActionError('الملف فارغ');

  // اكتشاف صف العناوين في أول 10 صفوف
  let headerRow = 1; let colMap: Record<string, number> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const m: Record<string, number> = {};
    ws.getRow(r).eachCell((c, col) => {
      const k = HEADER_INDEX.get(normAr(cellText(c.value)));
      if (k && !m[k]) m[k] = col;
    });
    if (m.full_name && Object.keys(m).length >= 2) { headerRow = r; colMap = m; break; }
  }
  if (!colMap.full_name) throw new ActionError('لم أجد عمود «اسم الطالب» في أول 10 صفوف من الملف');
  if (!colMap.grade) throw new ActionError('لم أجد عمود «الصف الدراسي» في الملف');

  // الأرقام الأكاديمية في الملف — للتحقق من الموجود مسبقاً على دفعات
  const fileNumbers: string[] = [];
  if (colMap.student_number) for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const n = normalizeDigits(cellText(ws.getRow(r).getCell(colMap.student_number).value)).trim();
    if (n) fileNumbers.push(n);
  }
  // بصلاحية الخادم: لنعرف الرقم حتى لو كان مسجّلاً في فرع لا تراه المشرفة
  const existingNumbers = new Map<string, string>(); // الرقم → الفرع
  const admin = createAdminClient();
  for (let i = 0; i < fileNumbers.length; i += 300) {
    const { data } = await admin.from('students').select('student_number, branch_id').in('student_number', fileNumbers.slice(i, i + 300));
    (data ?? []).forEach((d) => existingNumbers.set(d.student_number as string, d.branch_id as string));
  }

  const [branches, grades, sections] = await Promise.all([
    supabase.from('branches').select('id, name, code'),
    supabase.from('grades').select('id, name'),
    supabase.from('sections').select('id, branch_id, grade_id, name').limit(5000),
  ]);
  const bList = (branches.data ?? []) as { id: string; name: string; code: string | null }[];
  const gList = (grades.data ?? []) as { id: string; name: string }[];
  const sList = (sections.data ?? []) as { id: string; branch_id: string; grade_id: string; name: string }[];
  const bFind = (t: string) => { const k = normAr(t); return bList.find((b) => normAr(b.name) === k || normAr(b.name).replace(/^فرع /, '') === k.replace(/^فرع /, '') || (b.code && normAr(b.code) === k)); };
  const gIndex = new Map(gList.map((g) => [gradeKey(g.name), g]));

  const rows: ImportRow[] = [];
  const seenIds = new Set<string>();
  const newSections = new Set<string>();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: string) => (colMap[k] ? cellText(row.getCell(colMap[k]).value).trim() : '');
    const name = get('full_name').replace(/\s+/g, ' ');
    if (!name) continue;
    const nid = normalizeDigits(get('national_id')).replace(/\s+/g, '') || null;
    const num = normalizeDigits(get('student_number')).trim() || null;
    const g = normAr(get('gender'));
    const item: ImportRow = {
      row: r, full_name: name, national_id: nid, student_number: num,
      name_en: get('name_en').replace(/\s+/g, ' ') || null, birth_date: get('birth_date') || null,
      nationality: get('nationality') || null, id_type: get('id_type') || null,
      gender: /ذكر|ولد|طالب$|male|^m$/.test(g) ? 'male' : /انث|بنت|طالبه|female|^f$/.test(g) ? 'female' : null,
      branch: get('branch'), grade: get('grade'), section: get('section'),
    };
    const errs: string[] = [];
    if (name.split(' ').length < 2) errs.push('الاسم ناقص');
    if (nid && nid.length > 20) errs.push('رقم الهوية طويل جداً');
    if (num && num.length > 30) errs.push('الرقم الأكاديمي طويل جداً');
    if (num && seenIds.has(num)) errs.push('الرقم الأكاديمي مكرر في الملف');
    if (num) seenIds.add(num);

    const b = item.branch ? bFind(item.branch) : bList.find((x) => x.id === defaultBranch);
    if (!b) errs.push(item.branch ? `الفرع "${item.branch}" غير موجود` : 'حددي الفرع');
    else if (profile.role === 'supervisor' && b.id !== profile.branch_id) errs.push('ليس من فرعك');
    const gr = gIndex.get(gradeKey(item.grade));
    if (!gr) errs.push(`الصف "${item.grade}" غير معروف`);

    if (b && gr) {
      item.branch_id = b.id; item.grade_id = gr.id; item.branch = b.name; item.grade = gr.name;
      if (item.section) {
        const s = sList.find((x) => x.branch_id === b.id && x.grade_id === gr.id && sectionKey(x.name) === sectionKey(item.section));
        if (s) item.section_id = s.id;
        else { item.newSection = true; newSections.add(`${b.name} · ${gr.name} · ${item.section}`); }
      } else item.section_id = null;
    }
    if (num && existingNumbers.has(num)) {
      item.existing = true;
      const other = existingNumbers.get(num);
      if (profile.role === 'supervisor' && other !== profile.branch_id) errs.push('الرقم الأكاديمي مسجّل لطالب في فرع آخر');
    }
    if (errs.length) item.error = errs.join('، ');
    rows.push(item);
  }
  if (!rows.length) throw new ActionError('لا توجد صفوف بيانات تحت العناوين');

  return {
    total: rows.length,
    valid: rows.filter((r) => !r.error).length,
    errors: rows.filter((r) => r.error).length,
    updates: rows.filter((r) => !r.error && r.existing).length,
    noNumber: rows.filter((r) => !r.error && !r.student_number).length,
    newSections: [...newSections],
    rows,
    headers: Object.fromEntries((Object.keys(HEADERS) as Col[]).map((k) => [k, colMap[k] ? cellText(ws.getRow(headerRow).getCell(colMap[k]).value) : null])),
  };
}

export async function previewImport(base64: string, defaultBranch: string | null) {
  return run('student.import_preview', ['admin', 'supervisor'], async ({ supabase, profile }) => {
    if (base64.length > 11_000_000) throw new ActionError('حجم الملف أكبر من 8 ميجا');
    const p = await buildPreview(supabase, profile, base64, defaultBranch);
    // إرسال عينة فقط للواجهة: الأخطاء أولاً
    return { ...p, rows: [...p.rows.filter((r) => r.error), ...p.rows.filter((r) => !r.error)].slice(0, 300) };
  });
}

export async function commitImport(base64: string, defaultBranch: string | null, createSections: boolean) {
  return run('student.import', ['admin', 'supervisor'], async ({ supabase, profile }) => {
    const p = await buildPreview(supabase, profile, base64, defaultBranch);
    const valid = p.rows.filter((r) => !r.error);
    if (!valid.length) throw new ActionError('لا توجد صفوف صالحة للاستيراد');

    // إنشاء الشعب الناقصة
    if (p.newSections.length) {
      if (!createSections) throw new ActionError('يوجد شعب غير موجودة. فعّلي "إنشاء الشعب الناقصة" أو صحّحي الملف.');
      if (profile.role !== 'admin') throw new ActionError('إنشاء الشعب للأدمن فقط. اطلبي من الإدارة إضافتها.');
      const need = new Map<string, { branch_id: string; grade_id: string; name: string }>();
      valid.filter((r) => r.newSection).forEach((r) => need.set(`${r.branch_id}:${r.grade_id}:${sectionKey(r.section)}`, { branch_id: r.branch_id!, grade_id: r.grade_id!, name: r.section }));
      const bg = [...new Set([...need.values()].map((n) => `${n.branch_id}:${n.grade_id}`))].map((k) => { const [b, g] = k.split(':'); return { branch_id: b, grade_id: g }; });
      must(await supabase.from('branch_grades').upsert(bg, { onConflict: 'branch_id,grade_id', ignoreDuplicates: true }));
      const created = must(await supabase.from('sections').insert([...need.values()]).select('id, branch_id, grade_id, name')) as { id: string; branch_id: string; grade_id: string; name: string }[];
      valid.filter((r) => r.newSection).forEach((r) => {
        r.section_id = created.find((c) => c.branch_id === r.branch_id && c.grade_id === r.grade_id && sectionKey(c.name) === sectionKey(r.section))?.id ?? null;
      });
    }

    const base = (r: ImportRow) => ({
      full_name: r.full_name, student_number: r.student_number, national_id: r.national_id, gender: r.gender,
      name_en: r.name_en, birth_date: r.birth_date, nationality: r.nationality, id_type: r.id_type,
      branch_id: r.branch_id!, grade_id: r.grade_id!, is_active: true,
    });
    let done = 0;
    const put = async (rows: Record<string, unknown>[], mode: 'insert' | 'upsert') => {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const res = mode === 'insert'
          ? await supabase.from('students').insert(chunk).select('id')
          : await supabase.from('students').upsert(chunk, { onConflict: 'student_number' }).select('id');
        done += must(res)?.length ?? 0;
      }
    };
    // طلاب جدد
    await put(valid.filter((r) => !r.existing).map((r) => ({ ...base(r), section_id: r.section_id ?? null, source: 'import', created_by: profile.id })), 'insert');
    // موجودون: تحديث بياناتهم — والشعبة لا تتغير إلا إذا كانت محددة في الملف
    await put(valid.filter((r) => r.existing && r.section_id).map((r) => ({ ...base(r), section_id: r.section_id })), 'upsert');
    await put(valid.filter((r) => r.existing && !r.section_id).map((r) => base(r)), 'upsert');
    return { imported: done, skipped: p.errors, sections: p.newSections.length };
  }, { revalidate: ['/students', '/settings'], log: (d) => d });
}
