import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SubjectsClient } from './subjects-client';
import type { Branch, Component, Grade, GradeSubject, Stage, Subject } from '@/lib/types';

export const metadata = { title: 'المواد والتقييم' };

export default async function SubjectsPage() {
  const { supabase } = await requireRole('admin');
  const [stages, grades, subjects, gs, comps, branches, excl, used] = await Promise.all([
    supabase.from('stages').select('id, name, sort_order').order('sort_order'),
    supabase.from('grades').select('id, stage_id, name, sort_order, assessment_mode, is_active').order('sort_order'),
    supabase.from('subjects').select('id, name, kind, sort_order, is_active').order('sort_order'),
    supabase.from('grade_subjects').select('id, grade_id, subject_id, sort_order').order('sort_order'),
    supabase.from('assessment_components').select('id, grade_subject_id, name, max_score, sort_order').order('sort_order'),
    supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name'),
    supabase.from('branch_subject_exclusions').select('branch_id, grade_subject_id'),
    supabase.from('submissions').select('grade_subject_id'),
  ]);
  return (
    <div>
      <PageHeader title="المواد والتقييم" subtitle="المواد، ربطها بالصفوف، وأنواع التقييم والدرجة العظمى لكل نوع" />
      <SubjectsClient
        stages={(stages.data ?? []) as Stage[]}
        grades={(grades.data ?? []) as Grade[]}
        subjects={(subjects.data ?? []) as Subject[]}
        gradeSubjects={(gs.data ?? []) as GradeSubject[]}
        components={(comps.data ?? []).map((c) => ({ ...c, max_score: c.max_score === null ? null : Number(c.max_score) })) as Component[]}
        branches={(branches.data ?? []) as Branch[]}
        exclusions={(excl.data ?? []) as { branch_id: string; grade_subject_id: string }[]}
        usedGradeSubjects={[...new Set((used.data ?? []).map((u) => u.grade_subject_id as string))]}
      />
    </div>
  );
}
