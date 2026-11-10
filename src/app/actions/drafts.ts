'use server';
import { z } from 'zod';
import { run, ActionError, parseOr } from '@/lib/action';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import type { DraftValues } from '@/lib/draft-sync';

const uuid = z.string().uuid();
const key = z.object({ teacherId: uuid, sectionId: uuid, gradeSubjectId: uuid, term: z.union([z.literal(1), z.literal(2)]) });

export interface AdminDraft { values: DraftValues; teacherId: string; teacherName: string; updatedAt: string; deviceLabel: string | null; filled: number; total: number }

/** الأدمن: قراءة مسودة معلمة (تُسجَّل في سجل التتبع) */
export async function loadTeacherDraft(input: z.input<typeof key>) {
  return run('draft.view', ['admin'], async ({ profile }) => {
    const v = parseOr(key, input);
    const admin = createAdminClient();
    const { data, error } = await admin.from('sheet_drafts')
      .select('payload, filled, total, device_label, updated_at, teacher:profiles(full_name)')
      .eq('teacher_id', v.teacherId).eq('section_id', v.sectionId).eq('grade_subject_id', v.gradeSubjectId).eq('term', v.term)
      .maybeSingle<{ payload: DraftValues; filled: number; total: number; device_label: string | null; updated_at: string; teacher: { full_name: string } | null }>();
    if (error) throw error;
    if (!data) throw new ActionError('لا توجد مسودة لهذا الكشف (ربما حُفظ أو حُذفت)');
    await audit({ action: 'draft.view', actor: profile, entity: 'sheet_draft', details: { teacher_id: v.teacherId, teacher: data.teacher?.full_name, section_id: v.sectionId, grade_subject_id: v.gradeSubjectId, term: v.term, filled: data.filled } });
    return { values: data.payload, teacherId: v.teacherId, teacherName: data.teacher?.full_name ?? '—', updatedAt: data.updated_at, deviceLabel: data.device_label, filled: data.filled, total: data.total } satisfies AdminDraft;
  }, { context: { op: 'view' } });
}

/** الأدمن: حذف مسودة معلمة */
export async function deleteTeacherDraft(input: z.input<typeof key>) {
  return run('draft.delete', ['admin'], async () => {
    const v = parseOr(key, input);
    const { error } = await createAdminClient().from('sheet_drafts').delete()
      .eq('teacher_id', v.teacherId).eq('section_id', v.sectionId).eq('grade_subject_id', v.gradeSubjectId).eq('term', v.term);
    if (error) throw error;
  }, { log: () => ({ op: 'admin_delete', ...input }), revalidate: ['/follow-up'] });
}

/** بعد أن يحفظ الأدمن الكشف من مسودة المعلمة: تُحذف المسودة ويُسجَّل أنه اعتمدها نيابةً عنها */
export async function adoptDraftDone(input: z.input<typeof key>) {
  return run('draft.adopt', ['admin'], async () => {
    const v = parseOr(key, input);
    const { error } = await createAdminClient().from('sheet_drafts').delete()
      .eq('teacher_id', v.teacherId).eq('section_id', v.sectionId).eq('grade_subject_id', v.gradeSubjectId).eq('term', v.term);
    if (error) throw error;
  }, { log: () => ({ ...input }), revalidate: ['/follow-up'] });
}
