'use server';
import { z } from 'zod';
import { run, must, ActionError } from '@/lib/action';

const uuid = z.string().uuid('معرّف غير صحيح');

export interface ConductStudent { id: string; name: string; number: string | null; attendance: number | null; behavior: number | null; graded: number }
export interface ConductSheet {
  meta: {
    section_id: string; section_name: string; grade_name: string; mode: 'numeric' | 'verbal'; term: 1 | 2; year: string; grading_open: boolean;
    saved: boolean; edit_until: string | null; unlocked_until: string | null; editable: boolean; min_subjects: number; version: number | null;
  };
  students: ConductStudent[];
}

export async function loadConduct(sectionId: string) {
  return run('conduct.load', ['teacher'], async ({ supabase }) => {
    const id = uuid.safeParse(sectionId);
    if (!id.success) throw new ActionError(id.error.issues[0].message);
    return must(await supabase.rpc('conduct_load', { p_section: id.data })) as ConductSheet;
  }, { context: { section: sectionId } });
}

const rowSchema = z.array(z.object({
  student_id: uuid,
  attendance: z.number().min(0).max(100).nullable(),
  behavior: z.number().min(0).max(100).nullable(),
})).min(1, 'لا يوجد طلاب').max(2000);

export async function saveConduct(sectionId: string, rows: { student_id: string; attendance: number | null; behavior: number | null }[]) {
  return run('conduct.save', ['teacher'], async ({ supabase }) => {
    const id = uuid.safeParse(sectionId);
    const r = rowSchema.safeParse(rows);
    if (!id.success) throw new ActionError(id.error.issues[0].message);
    if (!r.success) throw new ActionError(r.error.issues[0].message);
    return must(await supabase.rpc('conduct_save', { p_section: id.data, p_rows: r.data })) as { saved: number };
  }, { revalidate: ['/conduct'], context: { section: sectionId } });
}

/** طلب فتح كشف المواظبة والسلوك للتعديل بعد قفله (يصل للمشرفة/الأدمن مع بقية الطلبات) */
export async function requestConductUnlock(sectionId: string, note: string) {
  return run('conduct.unlock_request', ['teacher'], async ({ supabase }) => {
    const id = uuid.safeParse(sectionId);
    if (!id.success) throw new ActionError(id.error.issues[0].message);
    must(await supabase.rpc('create_request', {
      p_type: 'other', p_section: id.data, p_grade_subject: null, p_student: null,
      p_payload: { kind: 'conduct_unlock' }, p_note: `طلب فتح كشف المواظبة والسلوك${note.trim() ? ` — ${note.trim().slice(0, 900)}` : ''}`,
    }));
  }, { revalidate: ['/requests'] });
}

/** تفعيل الميزة وحد المواد (أدمن) */
export async function saveConductSettings(enabled: boolean, minSubjects: number) {
  return run('conduct.settings', ['admin'], async ({ supabase }) => {
    const n = z.number().int().min(1, 'الحد الأدنى 1').max(30, 'الحد الأقصى 30').safeParse(minSubjects);
    if (!n.success) throw new ActionError(n.error.issues[0].message);
    must(await supabase.from('settings').update({ conduct_enabled: !!enabled, conduct_min_subjects: n.data }).eq('id', 1));
    return { enabled: !!enabled, min: n.data };
  }, { revalidate: ['/', '/settings', '/conduct'], log: (d) => ({ ...d }) });
}

export interface ConductBranchStat { branch_id: string; branch: string; students: number; eligible: number; teacher: number; admin: number }

export async function getConductStats() {
  return run('conduct.stats', ['admin'], async ({ supabase }) => must(await supabase.rpc('conduct_admin_stats')) as ConductBranchStat[]);
}

export async function setGradeConduct(gradeId: string, applies: boolean) {
  return run('conduct.grade_toggle', ['admin'], async ({ supabase }) => {
    const g = z.string().uuid().safeParse(gradeId); if (!g.success) throw new ActionError('صف غير صحيح');
    must(await supabase.rpc('set_grade_conduct', { p_grade: g.data, p_applies: !!applies }));
    return { ok: true };
  }, { revalidate: ['/settings', '/conduct'] });
}

const branchArg = z.string().uuid().nullable();

/** رصد الأدمن للكل: الدرجة الكاملة لمن رُصدت لهم درجات في الحد الأدنى من المواد (لا يمس رصد المعلمات) */
export async function conductFillAll(branchId: string | null) {
  return run('conduct.fill_all', ['admin'], async ({ supabase }) => {
    const b = branchArg.safeParse(branchId || null);
    if (!b.success) throw new ActionError('اختاري الفرع');
    return must(await supabase.rpc('conduct_fill_all', { p_branch: b.data })) as { filled: number; already: number; below_min: number; sections: number };
  }, { revalidate: ['/settings'], log: (d) => ({ ...d }) });
}

/** حذف ما أضافه «رصد الكل» فقط (لا يحذف رصد المعلمات ولا ما استُورد من ملف الفرع) */
export async function conductClearFill(branchId: string | null) {
  return run('conduct.clear_fill', ['admin'], async ({ supabase }) => {
    const b = branchArg.safeParse(branchId || null);
    if (!b.success) throw new ActionError('اختاري الفرع');
    return must(await supabase.rpc('conduct_clear_fill', { p_branch: b.data })) as { deleted: number };
  }, { revalidate: ['/settings'], log: (d) => ({ ...d }) });
}
