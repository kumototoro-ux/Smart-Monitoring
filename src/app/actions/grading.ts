'use server';
import { z } from 'zod';
import { run, must, ActionError, parseOr } from '@/lib/action';
import type { AssessmentMode } from '@/lib/types';

const uuid = z.string().uuid();

export interface SheetData {
  meta: {
    section_id: string; section_name: string; grade_id: string; grade_name: string; mode: AssessmentMode;
    grade_subject_id: string; subject_name: string; branch_name: string;
    term: 1 | 2; year: string; grading_open: boolean; edit_window_days: number;
  };
  components: { id: string; name: string; max_score: number | null; editable: boolean; submitted_at: string | null; deadline: string | null; version: number | null }[];
  levels: { id: string; label: string }[];
  students: { id: string; full_name: string; gender: 'male' | 'female' | null; needs_review: boolean }[];
  excluded: { id: string; full_name: string; reason: string | null }[];
  results: Record<string, { score: number | null; verbal_level_id: string | null; is_absent: boolean }>; // key: studentId:componentId
  pendingUnlock: boolean;
  poolCount: number; // طلاب الصف بدون شعبة
}

export async function loadSheet(sectionId: string, gradeSubjectId: string, term?: 1 | 2) {
  return run('sheet.load', ['teacher', 'admin', 'supervisor'], async ({ supabase, profile }) => {
    const sec = parseOr(uuid, sectionId); const gs = parseOr(uuid, gradeSubjectId);

    const [settingsRes, sectionRes, gsRes] = await Promise.all([
      supabase.from('settings').select('academic_year, current_term, grading_open, edit_window_days').eq('id', 1).single(),
      supabase.from('sections').select('id, name, grade_id, branch:branches(name), grade:grades(name, assessment_mode)').eq('id', sec).single(),
      supabase.from('grade_subjects').select('id, grade_id, subject:subjects(name)').eq('id', gs).single(),
    ]);
    const settings = must(settingsRes) as { academic_year: string; current_term: 1 | 2; grading_open: boolean; edit_window_days: number };
    const section = sectionRes.data as unknown as { id: string; name: string; grade_id: string; branch: { name: string }; grade: { name: string; assessment_mode: AssessmentMode } } | null;
    const gsRow = gsRes.data as unknown as { id: string; grade_id: string; subject: { name: string } } | null;
    if (!section || !gsRow || section.grade_id !== gsRow.grade_id) throw new ActionError('الكشف غير موجود أو غير مصرّح لك');
    const t = (term ?? settings.current_term) as 1 | 2;

    const { data: status, error: stErr } = await supabase.rpc('sheet_status', { p_section: sec, p_grade_subject: gs, p_term: t });
    if (stErr) throw stErr;
    const st = status as { components: { component_id: string; editable: boolean; submitted_at: string | null; edit_until: string | null; unlocked_until: string | null; version: number | null }[] };

    const [comps, levels, studs, excl, pend, pool] = await Promise.all([
      supabase.from('assessment_components').select('id, name, max_score, sort_order').eq('grade_subject_id', gs).order('sort_order'),
      supabase.from('verbal_levels').select('id, label, sort_order').eq('grade_id', section.grade_id).order('sort_order'),
      supabase.from('students').select('id, full_name, gender, needs_review').eq('section_id', sec).eq('is_active', true).order('full_name'),
      supabase.from('sheet_exclusions').select('student_id, reason').eq('grade_subject_id', gs).eq('academic_year', settings.academic_year),
      profile.role === 'teacher'
        ? supabase.from('requests').select('id', { count: 'exact', head: true }).eq('requested_by', profile.id).eq('status', 'pending').eq('type', 'unlock_sheet').eq('section_id', sec).eq('grade_subject_id', gs)
        : Promise.resolve({ count: 0 }),
      supabase.rpc('section_pool', { p_section: sec }),
    ]);

    const exclMap = new Map((excl.data ?? []).map((e) => [e.student_id as string, e.reason as string | null]));
    const all = (studs.data ?? []) as SheetData['students'];
    const students = all.filter((s) => !exclMap.has(s.id));
    const excluded = all.filter((s) => exclMap.has(s.id)).map((s) => ({ id: s.id, full_name: s.full_name, reason: exclMap.get(s.id) ?? null }));

    const compList = (comps.data ?? []) as { id: string; name: string; max_score: number | null }[];
    const results: SheetData['results'] = {};
    if (students.length && compList.length) {
      // على دفعات لتجنب طول الرابط
      for (let i = 0; i < students.length; i += 150) {
        const ids = students.slice(i, i + 150).map((s) => s.id);
        const { data } = await supabase.from('results').select('student_id, component_id, score, verbal_level_id, is_absent')
          .in('student_id', ids).in('component_id', compList.map((c) => c.id)).eq('term', t).eq('academic_year', settings.academic_year);
        (data ?? []).forEach((r) => {
          results[`${r.student_id}:${r.component_id}`] = { score: r.score === null ? null : Number(r.score), verbal_level_id: r.verbal_level_id, is_absent: r.is_absent };
        });
      }
    }

    return {
      meta: {
        section_id: sec, section_name: section.name, grade_id: section.grade_id, grade_name: section.grade.name,
        mode: section.grade.assessment_mode, grade_subject_id: gs, subject_name: gsRow.subject.name, branch_name: section.branch.name,
        term: t, year: settings.academic_year, grading_open: settings.grading_open, edit_window_days: settings.edit_window_days,
      },
      components: compList.map((c) => {
        const s = st.components.find((x) => x.component_id === c.id);
        const deadline = s?.edit_until ? new Date(Math.max(new Date(s.edit_until).getTime(), s.unlocked_until ? new Date(s.unlocked_until).getTime() : 0)).toISOString() : null;
        return { id: c.id, name: c.name, max_score: c.max_score === null ? null : Number(c.max_score), editable: s?.editable ?? true, submitted_at: s?.submitted_at ?? null, deadline, version: s?.version ?? null };
      }),
      levels: ((levels.data ?? []) as { id: string; label: string }[]).map((l) => ({ id: l.id, label: l.label })),
      students, excluded, results,
      pendingUnlock: ((pend as { count: number | null }).count ?? 0) > 0,
      poolCount: Array.isArray(pool.data) ? pool.data.length : 0,
    } satisfies SheetData;
  }, { context: { section_id: sectionId, grade_subject_id: gradeSubjectId } });
}

const entrySchema = z.array(z.object({
  student_id: uuid,
  component_id: uuid,
  score: z.number().min(0).max(1000).nullable().optional(),
  verbal_level_id: uuid.nullable().optional(),
  is_absent: z.boolean().optional(),
})).min(1).max(20000);

export async function saveSheet(sectionId: string, gradeSubjectId: string, term: 1 | 2, entries: z.input<typeof entrySchema>) {
  return run('sheet.save', ['teacher', 'admin'], async ({ supabase }) => {
    const e = parseOr(entrySchema, entries);
    const { data, error } = await supabase.rpc('save_sheet', {
      p_section: parseOr(uuid, sectionId), p_grade_subject: parseOr(uuid, gradeSubjectId), p_term: term, p_entries: e,
    });
    if (error) throw error;
    return data as { saved: number; students: number };
  }, { revalidate: ['/'], context: { section_id: sectionId, grade_subject_id: gradeSubjectId, term, cells: Array.isArray(entries) ? entries.length : 0 } });
}

const studentSchema = z.object({
  full_name: z.string().trim().min(6, 'اكتبي اسم الطالب ثلاثياً على الأقل').max(150),
  gender: z.enum(['male', 'female']).nullable().optional(),
  national_id: z.string().trim().max(20).optional(),
  student_number: z.string().trim().max(30).optional(),
});

export async function teacherAddStudent(sectionId: string, input: z.input<typeof studentSchema>) {
  return run('sheet.add_student', ['teacher', 'admin', 'supervisor'], async ({ supabase }) => {
    const v = parseOr(studentSchema, input);
    const { data, error } = await supabase.rpc('teacher_add_student', {
      p_section: parseOr(uuid, sectionId), p_full_name: v.full_name, p_gender: v.gender ?? null,
      p_national_id: v.national_id || null, p_student_number: v.student_number || null,
    });
    if (error) throw error;
    return data as string;
  }, { context: { section_id: sectionId, name: input.full_name } });
}

export async function excludeStudent(studentId: string, gradeSubjectId: string, reason: string) {
  return run('sheet.exclude', ['teacher', 'admin', 'supervisor'], async ({ supabase }) => {
    const { error } = await supabase.rpc('exclude_student', { p_student: parseOr(uuid, studentId), p_grade_subject: parseOr(uuid, gradeSubjectId), p_reason: reason.slice(0, 300) || null });
    if (error) throw error;
  });
}

export async function restoreStudent(studentId: string, gradeSubjectId: string) {
  return run('sheet.restore', ['teacher', 'admin', 'supervisor'], async ({ supabase }) => {
    const { error } = await supabase.rpc('restore_student', { p_student: parseOr(uuid, studentId), p_grade_subject: parseOr(uuid, gradeSubjectId) });
    if (error) throw error;
  });
}

// ===================================================================== الطلبات
export async function createRequest(input: {
  type: 'unlock_sheet' | 'add_student' | 'remove_student' | 'other';
  section_id?: string | null; grade_subject_id?: string | null; student_id?: string | null;
  payload?: Record<string, unknown>; note?: string;
}) {
  return run('request.create', ['teacher'], async ({ supabase }) => {
    if (input.type === 'add_student') parseOr(studentSchema, input.payload ?? {});
    const { data, error } = await supabase.rpc('create_request', {
      p_type: input.type, p_section: input.section_id ?? null, p_grade_subject: input.grade_subject_id ?? null,
      p_student: input.student_id ?? null, p_payload: input.payload ?? {}, p_note: input.note?.slice(0, 1000) || null,
    });
    if (error) throw error;
    return data as string;
  }, { revalidate: ['/requests'], context: { type: input.type, section_id: input.section_id, grade_subject_id: input.grade_subject_id } });
}

export async function cancelRequest(id: string) {
  return run('request.cancel', ['teacher'], async ({ supabase }) => {
    const { error } = await supabase.rpc('cancel_request', { p_request: parseOr(uuid, id) });
    if (error) throw error;
  }, { revalidate: ['/requests'] });
}

export async function reviewRequest(id: string, approve: boolean, note?: string) {
  return run('request.review', ['admin', 'supervisor'], async ({ supabase }) => {
    const { error } = await supabase.rpc('review_request', { p_request: parseOr(uuid, id), p_approve: approve, p_note: note?.slice(0, 1000) || null });
    if (error) throw error;
  }, { revalidate: ['/requests', '/'] });
}

// ===================================================================== طلاب الصف بدون شعبة
export interface PoolStudent { id: string; full_name: string; national_id: string | null; student_number: string | null; gender: 'male' | 'female' | null }

export async function loadPool(sectionId: string) {
  return run('pool.load', ['teacher', 'admin', 'supervisor'], async ({ supabase }) => {
    const { data, error } = await supabase.rpc('section_pool', { p_section: parseOr(uuid, sectionId) });
    if (error) throw error;
    return (data ?? []) as PoolStudent[];
  });
}

export async function claimStudents(sectionId: string, studentIds: string[]) {
  return run('pool.claim', ['teacher', 'admin', 'supervisor'], async ({ supabase }) => {
    const ids = parseOr(z.array(uuid).min(1, 'اختاري طالباً واحداً على الأقل').max(200), studentIds);
    const { data, error } = await supabase.rpc('claim_students', { p_section: parseOr(uuid, sectionId), p_students: ids });
    if (error) throw error;
    return data as { claimed: number; already?: number; skipped: number };
  }, { revalidate: ['/students'], context: { section_id: sectionId, count: studentIds.length } });
}

export async function releaseStudents(sectionId: string, studentIds: string[]) {
  return run('pool.release', ['teacher', 'admin', 'supervisor'], async ({ supabase }) => {
    const ids = parseOr(z.array(uuid).min(1).max(200), studentIds);
    const { data, error } = await supabase.rpc('release_students', { p_section: parseOr(uuid, sectionId), p_students: ids });
    if (error) throw error;
    return data as number;
  }, { revalidate: ['/students'] });
}
