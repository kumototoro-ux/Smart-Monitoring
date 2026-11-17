'use server';
import { z } from 'zod';
import { run, must, ActionError } from '@/lib/action';
import { parseBranchFile, compareResult, shownOld, ImportError } from '@/lib/branch-import';

const uuid = z.string().uuid();

export interface BranchPreview {
  branch: string; year: string; term: 1 | 2;
  totals: { rows: number; valid: number; errors: number; warnings: number; newStudents: number; updated: number; adopted: number; matched: number; newSections: number;
    resNew: number; resSame: number; resConflict: number; absent: number };
  sheets: { name: string; rows: number; errors: number; newStudents: number; results: number }[];
  newSections: string[];
  problems: { sheet: string; row: number; name: string; messages: string[] }[];
  warnings: { sheet: string; row: number; name: string; messages: string[] }[];
  conflicts: { sheet: string; row: number; name: string; label: string; old: string; incoming: string }[];
  conflictTotal: number;
}

export async function previewBranchImport(base64: string, branchId: string, term: 1 | 2) {
  return run('student.branch_import_preview', ['admin'], async ({ supabase }) => {
    if (base64.length > 14_000_000) throw new ActionError('حجم الملف أكبر من 10 ميجا');
    const b = uuid.safeParse(branchId); if (!b.success) throw new ActionError('اختاري الفرع');
    const t = term === 2 ? 2 : 1;
    let m;
    try { m = await parseBranchFile(supabase, base64, b.data, t); }
    catch (e) { if (e instanceof ImportError) throw new ActionError(e.message); throw e; }

    const ok = m.rows.filter((r) => !r.errors.length);
    let resNew = 0, resSame = 0, resConflict = 0, absent = 0;
    const conflicts: BranchPreview['conflicts'] = [];
    for (const r of ok) for (const x of r.results) {
      if (x.value.absent) absent++;
      const c = compareResult(m, r, x);
      if (c === 'new') resNew++; else if (c === 'same') resSame++; else {
        resConflict++;
        if (conflicts.length < 60) conflicts.push({ sheet: r.sheet, row: r.row, name: r.full_name, label: x.label, old: shownOld(m, m.existing.get(`${r.studentId}|${x.component_id}`)!), incoming: x.shown });
      }
    }
    const sheetNames = [...new Set(m.rows.map((r) => r.sheet))];
    const pick = (list: typeof m.rows, key: 'errors' | 'warnings', cap: number) =>
      list.filter((r) => r[key].length).slice(0, cap).map((r) => ({ sheet: r.sheet, row: r.row, name: r.full_name, messages: r[key] }));
    const out: BranchPreview = {
      branch: m.branch.name, year: m.year, term: m.term,
      totals: {
        rows: m.rows.length, valid: ok.length, errors: m.rows.length - ok.length, warnings: ok.filter((r) => r.warnings.length).length,
        newStudents: ok.filter((r) => r.kind === 'new').length, updated: ok.filter((r) => r.kind === 'update').length,
        adopted: ok.filter((r) => r.kind === 'adopt').length, matched: ok.filter((r) => r.kind === 'matched').length,
        newSections: m.newSections.length, resNew, resSame, resConflict, absent,
      },
      sheets: sheetNames.map((n) => {
        const rs = m.rows.filter((r) => r.sheet === n);
        return { name: n, rows: rs.length, errors: rs.filter((r) => r.errors.length).length, newStudents: rs.filter((r) => !r.errors.length && r.kind === 'new').length, results: rs.filter((r) => !r.errors.length).reduce((a, r) => a + r.results.length, 0) };
      }),
      newSections: m.newSections.map((s) => s.label),
      problems: pick(m.rows, 'errors', 150),
      warnings: pick(ok, 'warnings', 100),
      conflicts, conflictTotal: resConflict,
    };
    return out;
  });
}

// ------------------------------------------------------------------ الحفظ والتراجع
export interface BranchImportResult { batch_id: string; students_new: number; students_updated: number; results_new: number; results_same: number; results_overwritten: number; results_skipped: number; sections_created: number }
export interface BranchImportLog {
  id: string; branch_name: string; term: number; academic_year: string; file_name: string | null; overwrite: boolean;
  created_by_name: string | null; created_at: string; undone_at: string | null;
  summary: { students_new?: number; students_updated?: number; results_new?: number; results_overwritten?: number; results_skipped?: number; sections_created?: number };
  undone_summary: { results_deleted?: number; results_restored?: number; results_kept?: number; students_deleted?: number; students_kept?: number } | null;
}

export async function commitBranchImport(base64: string, branchId: string, term: 1 | 2, overwrite: boolean, fileName: string) {
  return run('student.branch_import', ['admin'], async ({ supabase }) => {
    if (base64.length > 14_000_000) throw new ActionError('حجم الملف أكبر من 10 ميجا');
    const b = uuid.safeParse(branchId); if (!b.success) throw new ActionError('اختاري الفرع');
    const t = term === 2 ? 2 : 1;
    let m;
    try { m = await parseBranchFile(supabase, base64, b.data, t); }
    catch (e) { if (e instanceof ImportError) throw new ActionError(e.message); throw e; }

    // صفوف صالحة فقط؛ وصفوف «موجود بلا رقم وبلا درجات» لا تحمل تغييراً فلا تُرسل
    const valid = m.rows.filter((r) => !r.errors.length && !(r.kind === 'matched' && !r.results.length));
    if (!valid.length) throw new ActionError('لا توجد صفوف صالحة للحفظ');
    const payload = valid.map((r) => ({
      kind: r.kind, student_id: r.studentId, grade_id: r.grade_id, section_id: r.section_id, section_key: r.sectionKey,
      full_name: r.full_name, student_number: r.student_number, national_id: r.national_id, name_en: r.name_en, birth_date: r.birth_date,
      nationality: r.nationality, id_type: r.id_type, gender: r.gender,
      results: r.results.map((x) => ({ component_id: x.component_id, score: x.value.score, verbal_level_id: x.value.verbal_level_id, absent: x.value.absent })),
    }));
    const usedKeys = new Set(valid.map((r) => r.sectionKey).filter(Boolean));
    const sections = m.newSections.filter((s) => usedKeys.has(s.key)).map((s) => ({ key: s.key, grade_id: s.grade_id, name: s.name }));

    const data = must(await supabase.rpc('branch_import_commit', {
      p_branch: b.data, p_term: t, p_overwrite: !!overwrite, p_file: fileName.slice(0, 200), p_sections: sections, p_rows: payload,
    }));
    return { ...(data as BranchImportResult), skipped_rows: m.rows.length - valid.length };
  }, { revalidate: ['/students'], log: (d) => d });
}

export async function listBranchImports() {
  return run('student.branch_import_list', ['admin'], async ({ supabase }) => {
    const data = must(await supabase.from('import_batches')
      .select('id, branch_name, term, academic_year, file_name, overwrite, created_by_name, created_at, undone_at, summary, undone_summary')
      .order('created_at', { ascending: false }).limit(30));
    return (data ?? []) as BranchImportLog[];
  });
}

export async function undoBranchImport(id: string) {
  return run('student.branch_import_undo', ['admin'], async ({ supabase }) => {
    const b = uuid.safeParse(id); if (!b.success) throw new ActionError('دفعة غير صحيحة');
    const data = must(await supabase.rpc('branch_import_undo', { p_batch: b.data }));
    return data as { results_deleted: number; results_restored: number; results_kept: number; students_deleted: number; students_kept: number; students_restored: number; sections_deleted: number };
  }, { revalidate: ['/students'], log: (d) => d });
}
