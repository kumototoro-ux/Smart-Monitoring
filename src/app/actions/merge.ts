'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { run, must, ActionError } from '@/lib/action';
import { findSimilar } from '@/lib/similar-names';

const uuid = z.string().uuid();
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const r = s.safeParse(v);
  if (!r.success) throw new ActionError(r.error.issues[0].message);
  return r.data;
};

export interface MergePerson {
  id: string; name: string; number: string | null; branch: string; grade: string; section: string;
  source: string | null; needsReview: boolean; createdAt: string; results: number;
}
export interface SimilarItem { a: MergePerson; b: MergePerson; score: number; reason: string; suggestKeep: 'a' | 'b' }
export interface MergeConflict {
  component_id: string; term: number; year: string; component: string; subject: string;
  keep: { score: number | null; verbal: string | null; absent: boolean; by: string | null; at: string };
  remove: { score: number | null; verbal: string | null; absent: boolean; by: string | null; at: string };
}
export interface MergePreview { year: string; conflicts: MergeConflict[]; movable: number; exclusions: number; issues: number }
export interface MergeLogRow { id: string; kept_id: string | null; kept_name: string; removed_name: string; removed_number: string | null; merged_by_name: string | null; merged_at: string; undone_at: string | null; moved: number }

const COLS = 'id, full_name, student_number, branch_id, grade_id, section_id, source, needs_review, created_at';
type Row = { id: string; full_name: string; student_number: string | null; branch_id: string; grade_id: string; section_id: string | null; source: string | null; needs_review: boolean; created_at: string };

/** يحوّل صفوف الطلاب لبطاقات عرض (مع أسماء الفرع والصف والشعبة وعدد الدرجات) */
async function people(supabase: import('@supabase/supabase-js').SupabaseClient, rows: Row[]): Promise<Map<string, MergePerson>> {
  const [br, gr, se, counts] = await Promise.all([
    supabase.from('branches').select('id, name'),
    supabase.from('grades').select('id, name'),
    supabase.from('sections').select('id, name'),
    supabase.rpc('student_result_counts'),
  ]);
  if (counts.error) throw counts.error;
  const nm = (d: { id: string; name: string }[] | null) => new Map((d ?? []).map((x) => [x.id, x.name]));
  const B = nm(br.data), G = nm(gr.data), S = nm(se.data);
  const C = new Map(((counts.data ?? []) as { student_id: string; n: number }[]).map((c) => [c.student_id, c.n]));
  return new Map(rows.map((r) => [r.id, {
    id: r.id, name: r.full_name, number: r.student_number, branch: B.get(r.branch_id) ?? '', grade: G.get(r.grade_id) ?? '',
    section: r.section_id ? S.get(r.section_id) ?? '' : '', source: r.source, needsReview: r.needs_review, createdAt: r.created_at, results: C.get(r.id) ?? 0,
  }]));
}

/** أيّ الاسمين يُقترح إبقاؤه: الأكثر درجات، ثم غير المضاف من معلمة، ثم الأقدم */
function suggest(a: MergePerson, b: MergePerson): 'a' | 'b' {
  if (a.results !== b.results) return a.results > b.results ? 'a' : 'b';
  const ta = a.source === 'teacher' || a.needsReview, tb = b.source === 'teacher' || b.needsReview;
  if (ta !== tb) return ta ? 'b' : 'a';
  return a.createdAt <= b.createdAt ? 'a' : 'b';
}

/** اقتراح الأسماء المتشابهة (نفس الفرع والصف). اقتراح فقط: لا دمج تلقائي أبداً */
export async function findDuplicateStudents(f: { branch?: string; grade?: string }) {
  return run('students.duplicates', ['admin'], async ({ supabase }) => {
    const rows: Row[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      let q = supabase.from('students').select(COLS).eq('is_active', true).order('id').range(from, from + 999);
      if (f.branch) q = q.eq('branch_id', parse(uuid, f.branch));
      if (f.grade) q = q.eq('grade_id', parse(uuid, f.grade));
      const page = must(await q) as Row[];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const pairs = findSimilar(rows.map((r) => ({ id: r.id, name: r.full_name, branch_id: r.branch_id, grade_id: r.grade_id })), 200);
    const used = new Set(pairs.flatMap((p) => [p.a, p.b]));
    const P = await people(supabase, rows.filter((r) => used.has(r.id)));
    const items: SimilarItem[] = pairs.map((p) => {
      const a = P.get(p.a)!, b = P.get(p.b)!;
      return { a, b, score: p.score, reason: p.reason, suggestKeep: suggest(a, b) };
    });
    return { items, total: rows.length };
  });
}

/** بحث يدوي بالاسم أو الرقم لاختيار الاسمين */
export async function searchStudentsForMerge(q: string, branch?: string) {
  return run('students.merge_search', ['admin'], async ({ supabase }) => {
    const s = q.replace(/[%,()_]/g, ' ').trim().slice(0, 60);
    if (s.length < 2) return [] as MergePerson[];
    let query = supabase.from('students').select(COLS).eq('is_active', true)
      .or(`full_name.ilike.%${s}%,student_number.ilike.%${s}%,national_id.ilike.%${s}%`).order('full_name').limit(15);
    if (branch) query = query.eq('branch_id', parse(uuid, branch));
    const rows = must(await query) as Row[];
    const P = await people(supabase, rows);
    return rows.map((r) => P.get(r.id)!);
  });
}

export async function previewStudentMerge(keep: string, remove: string) {
  return run('students.merge_preview', ['admin'], async ({ supabase }) => {
    return must(await supabase.rpc('student_merge_preview', { p_keep: parse(uuid, keep), p_remove: parse(uuid, remove) })) as MergePreview;
  });
}

const choiceSchema = z.array(z.object({ component_id: uuid, term: z.number().int().min(1).max(2), year: z.string().max(40), use: z.enum(['keep', 'remove']) })).max(500);

export async function mergeStudents(keep: string, remove: string, choices: { component_id: string; term: number; year: string; use: 'keep' | 'remove' }[]) {
  return run('students.merge', ['admin'], async ({ supabase }) => {
    const r = must(await supabase.rpc('student_merge', { p_keep: parse(uuid, keep), p_remove: parse(uuid, remove), p_choices: parse(choiceSchema, choices) })) as { merge_id: string; moved: number };
    revalidatePath('/students'); revalidatePath('/students/duplicates');
    return r;
  }, { log: (d) => d });
}

export async function undoStudentMerge(id: string) {
  return run('students.merge_undo', ['admin'], async ({ supabase }) => {
    const r = must(await supabase.rpc('student_merge_undo', { p_merge: parse(uuid, id) })) as { restored: string; skipped: number };
    revalidatePath('/students'); revalidatePath('/students/duplicates');
    return r;
  }, { log: (d) => d });
}

export async function listStudentMerges() {
  return run('students.merge_list', ['admin'], async ({ supabase }) => {
    const rows = must(await supabase.from('student_merges')
      .select('id, kept_id, kept_name, removed_name, removed_number, merged_by_name, merged_at, undone_at, moved_results')
      .order('merged_at', { ascending: false }).limit(40)) as (Omit<MergeLogRow, 'moved'> & { moved_results: string[] })[];
    return rows.map(({ moved_results, ...r }) => ({ ...r, moved: moved_results?.length ?? 0 })) as MergeLogRow[];
  });
}
