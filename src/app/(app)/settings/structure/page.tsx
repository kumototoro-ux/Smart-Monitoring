import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { StructureClient } from './structure-client';
import type { Branch, Grade, Section, Stage, VerbalLevel } from '@/lib/types';

export const metadata = { title: 'الصفوف والشعب' };

export default async function StructurePage() {
  const { supabase } = await requireRole('admin');
  const [stages, grades, branches, bg, sections, levels, students] = await Promise.all([
    supabase.from('stages').select('id, name, sort_order').order('sort_order'),
    supabase.from('grades').select('id, stage_id, name, sort_order, assessment_mode, is_active').order('sort_order'),
    supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name'),
    supabase.from('branch_grades').select('branch_id, grade_id'),
    supabase.from('sections').select('id, branch_id, grade_id, name, sort_order, is_active').order('sort_order'),
    supabase.from('verbal_levels').select('id, grade_id, label, sort_order').order('sort_order'),
    supabase.from('students').select('section_id').eq('is_active', true).not('section_id', 'is', null),
  ]);
  const studentCount: Record<string, number> = {};
  (students.data ?? []).forEach((s) => { studentCount[s.section_id!] = (studentCount[s.section_id!] ?? 0) + 1; });

  return (
    <div>
      <PageHeader title="الصفوف والشعب" subtitle="نوع الرصد لكل صف، ومستويات الرصد اللفظي، وشعب كل فرع" />
      <StructureClient
        stages={(stages.data ?? []) as Stage[]}
        grades={(grades.data ?? []) as Grade[]}
        branches={(branches.data ?? []) as Branch[]}
        branchGrades={(bg.data ?? []) as { branch_id: string; grade_id: string }[]}
        sections={(sections.data ?? []) as Section[]}
        levels={(levels.data ?? []) as VerbalLevel[]}
        studentCount={studentCount}
      />
    </div>
  );
}
