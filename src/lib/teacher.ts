import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentMode } from './types';

export interface SheetComponent {
  id: string; name: string; max_score: number | null; sort_order: number;
  submission: { id: string; submitted_at: string; edit_until: string; unlocked_until: string | null; version: number; last_edited_at: string | null } | null;
}
export interface TeacherSheet {
  section_id: string; section_name: string;
  grade_id: string; grade_name: string; grade_order: number; mode: AssessmentMode;
  grade_subject_id: string; subject_name: string; subject_order: number;
  components: SheetComponent[];
}

type Row = {
  section: { id: string; name: string; grade: { id: string; name: string; sort_order: number; assessment_mode: AssessmentMode } } | null;
  grade_subject: { id: string; subject: { name: string; sort_order: number } | null; components: { id: string; name: string; max_score: number | null; sort_order: number }[] } | null;
};

/** كل كشوفات المعلمة (شعبة × مادة) مع حالة كل نوع تقييم في الترم الحالي */
export async function getTeacherSheets(supabase: SupabaseClient, teacherId: string, term: number, year: string) {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select(`
      section:sections!inner(id, name, grade:grades!inner(id, name, sort_order, assessment_mode)),
      grade_subject:grade_subjects!inner(id, subject:subjects(name, sort_order), components:assessment_components(id, name, max_score, sort_order))
    `)
    .eq('teacher_id', teacherId)
    .returns<Row[]>();
  if (error) throw error;

  const rows = (data ?? []).filter((r) => r.section && r.grade_subject);
  const sectionIds = [...new Set(rows.map((r) => r.section!.id))];
  const { data: subs } = sectionIds.length
    ? await supabase
        .from('submissions')
        .select('id, section_id, component_id, submitted_at, edit_until, unlocked_until, version, last_edited_at')
        .in('section_id', sectionIds).eq('term', term).eq('academic_year', year)
    : { data: [] as never[] };
  const subMap = new Map((subs ?? []).map((s) => [`${s.section_id}:${s.component_id}`, s]));

  const sheets: TeacherSheet[] = rows.map((r) => ({
    section_id: r.section!.id,
    section_name: r.section!.name,
    grade_id: r.section!.grade.id,
    grade_name: r.section!.grade.name,
    grade_order: r.section!.grade.sort_order,
    mode: r.section!.grade.assessment_mode,
    grade_subject_id: r.grade_subject!.id,
    subject_name: r.grade_subject!.subject?.name ?? '—',
    subject_order: r.grade_subject!.subject?.sort_order ?? 0,
    components: [...r.grade_subject!.components]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ ...c, submission: subMap.get(`${r.section!.id}:${c.id}`) ?? null })),
  }));

  return sheets.sort((a, b) =>
    a.grade_order - b.grade_order || a.section_name.localeCompare(b.section_name, 'ar') || a.subject_order - b.subject_order);
}

export const isEditable = (s: SheetComponent['submission']) =>
  !s || Date.now() <= Math.max(new Date(s.edit_until).getTime(), s.unlocked_until ? new Date(s.unlocked_until).getTime() : 0);

export const editDeadline = (s: NonNullable<SheetComponent['submission']>) =>
  new Date(Math.max(new Date(s.edit_until).getTime(), s.unlocked_until ? new Date(s.unlocked_until).getTime() : 0)).toISOString();
