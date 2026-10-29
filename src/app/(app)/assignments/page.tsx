import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { AssignmentsClient } from './assignments-client';
import type { Branch, Grade, Section } from '@/lib/types';

export const metadata = { title: 'الإسناد' };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const sp = await searchParams;
  const { data: branches } = await supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name');
  const branchId = profile.role === 'supervisor' ? profile.branch_id! : (sp.branch ?? branches?.[0]?.id ?? '');

  const [teachers, grades, sections, gs, excl, assigns] = await Promise.all([
    supabase.from('profiles').select('id, full_name, username').eq('role', 'teacher').eq('is_active', true).eq('branch_id', branchId).order('full_name'),
    supabase.from('grades').select('id, stage_id, name, sort_order, assessment_mode, is_active, branch_grades!inner(branch_id)').eq('branch_grades.branch_id', branchId).order('sort_order'),
    supabase.from('sections').select('id, branch_id, grade_id, name, sort_order, is_active').eq('branch_id', branchId).order('sort_order'),
    supabase.from('grade_subjects').select('id, grade_id, subject:subjects(name, sort_order)').order('sort_order'),
    supabase.from('branch_subject_exclusions').select('grade_subject_id').eq('branch_id', branchId),
    supabase.from('teacher_assignments').select('id, teacher_id, section_id, grade_subject_id, section:sections!inner(branch_id)').eq('section.branch_id', branchId),
  ]);
  const excluded = new Set((excl.data ?? []).map((e) => e.grade_subject_id));

  return (
    <div>
      <PageHeader title="إسناد المواد" subtitle="حددي لكل معلمة الصفوف والشعب والمواد التي ترصدها" />
      <AssignmentsClient
        isAdmin={profile.role === 'admin'}
        branches={(branches ?? []) as Branch[]}
        branchId={branchId}
        teachers={(teachers.data ?? []) as { id: string; full_name: string; username: string }[]}
        grades={(grades.data ?? []) as unknown as Grade[]}
        sections={(sections.data ?? []) as Section[]}
        gradeSubjects={((gs.data ?? []) as unknown as { id: string; grade_id: string; subject: { name: string; sort_order: number } | null }[])
          .filter((g) => !excluded.has(g.id)).map((g) => ({ id: g.id, grade_id: g.grade_id, name: g.subject?.name ?? '—' }))}
        assignments={(assigns.data ?? []).map((a) => ({ id: a.id, teacher_id: a.teacher_id, section_id: a.section_id, grade_subject_id: a.grade_subject_id }))}
      />
    </div>
  );
}
