'use server';
import { z } from 'zod';
import { run, ActionError } from '@/lib/action';
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
