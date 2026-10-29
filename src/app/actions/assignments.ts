'use server';
import { z } from 'zod';
import { run, must, ActionError, parseOr } from '@/lib/action';

const ids = z.array(z.string().uuid());

export async function addAssignments(teacherId: string, sectionIds: string[], gradeSubjectIds: string[]) {
  return run('assignment.add', ['admin', 'supervisor'], async ({ supabase, profile }) => {
    const t = parseOr(z.string().uuid(), teacherId);
    const secs = parseOr(ids.min(1, 'اختاري شعبة واحدة على الأقل'), sectionIds);
    const subs = parseOr(ids.min(1, 'اختاري مادة واحدة على الأقل'), gradeSubjectIds);

    const teacher = must(await supabase.from('profiles').select('id, role, branch_id, is_active').eq('id', t).single()) as
      { id: string; role: string; branch_id: string; is_active: boolean };
    if (teacher.role !== 'teacher') throw new ActionError('الإسناد للمعلمات فقط');
    if (profile.role === 'supervisor' && teacher.branch_id !== profile.branch_id) throw new ActionError('المعلمة ليست من فرعك');

    const sections = must(await supabase.from('sections').select('id, branch_id, grade_id').in('id', secs)) as { id: string; branch_id: string; grade_id: string }[];
    if (sections.length !== secs.length) throw new ActionError('شعبة غير موجودة');
    if (sections.some((s) => s.branch_id !== teacher.branch_id)) throw new ActionError('الشعب يجب أن تكون من فرع المعلمة');

    const gs = must(await supabase.from('grade_subjects').select('id, grade_id').in('id', subs)) as { id: string; grade_id: string }[];
    const rows = sections.flatMap((s) => gs.filter((g) => g.grade_id === s.grade_id).map((g) => ({ teacher_id: t, section_id: s.id, grade_subject_id: g.id })));
    if (!rows.length) throw new ActionError('المواد المختارة لا تتبع صف الشعب المختارة');
    const res = await supabase.from('teacher_assignments').upsert(rows, { onConflict: 'teacher_id,section_id,grade_subject_id', ignoreDuplicates: true }).select('id');
    return must(res)?.length ?? 0;
  }, { revalidate: ['/assignments'], log: (n) => ({ teacherId, sectionIds, gradeSubjectIds, created: n }) });
}

export async function removeAssignment(id: string) {
  return run('assignment.remove', ['admin', 'supervisor'], async ({ supabase }) => {
    const res = await supabase.from('teacher_assignments').delete().eq('id', parseOr(z.string().uuid(), id)).select('id');
    if (!must(res)?.length) throw new ActionError('تعذّر الحذف أو غير مصرّح');
  }, { revalidate: ['/assignments'], log: () => ({ id }) });
}

/** نقل كل إسنادات معلمة لمعلمة أخرى (عند الاستبدال) */
export async function transferAssignments(fromId: string, toId: string) {
  return run('assignment.transfer', ['admin', 'supervisor'], async ({ supabase }) => {
    const from = parseOr(z.string().uuid(), fromId); const to = parseOr(z.string().uuid(), toId);
    if (from === to) throw new ActionError('اختاري معلمة مختلفة');
    const list = must(await supabase.from('teacher_assignments').select('section_id, grade_subject_id').eq('teacher_id', from)) as { section_id: string; grade_subject_id: string }[];
    if (!list.length) throw new ActionError('لا توجد إسنادات للنقل');
    const p = must(await supabase.from('profiles').select('id, branch_id').in('id', [from, to])) as { id: string; branch_id: string }[];
    if (p.length !== 2 || p[0].branch_id !== p[1].branch_id) throw new ActionError('النقل ممكن بين معلمات نفس الفرع فقط');
    must(await supabase.from('teacher_assignments').upsert(list.map((l) => ({ ...l, teacher_id: to })), { onConflict: 'teacher_id,section_id,grade_subject_id', ignoreDuplicates: true }));
    must(await supabase.from('teacher_assignments').delete().eq('teacher_id', from));
    return list.length;
  }, { revalidate: ['/assignments'], log: (n) => ({ fromId, toId, moved: n }) });
}
