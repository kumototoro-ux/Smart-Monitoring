import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { BranchesClient } from './branches-client';
import type { Branch, Grade, Stage } from '@/lib/types';

export const metadata = { title: 'الفروع' };

export default async function BranchesPage() {
  const { supabase } = await requireRole('admin');
  const [{ data: branches }, { data: stages }, { data: grades }, { data: bg }, { data: teachers }] = await Promise.all([
    supabase.from('branches').select('id, name, code, is_active').order('name'),
    supabase.from('stages').select('id, name, sort_order').order('sort_order'),
    supabase.from('grades').select('id, stage_id, name, sort_order, assessment_mode, is_active').order('sort_order'),
    supabase.from('branch_grades').select('branch_id, grade_id'),
    supabase.from('profiles').select('branch_id').eq('role', 'teacher').eq('is_active', true),
  ]);
  const teacherCount: Record<string, number> = {};
  (teachers ?? []).forEach((t) => { if (t.branch_id) teacherCount[t.branch_id] = (teacherCount[t.branch_id] ?? 0) + 1; });
  const gradesByBranch: Record<string, string[]> = {};
  (bg ?? []).forEach((r) => (gradesByBranch[r.branch_id] ??= []).push(r.grade_id));

  return (
    <div>
      <PageHeader title="الفروع" subtitle="أضيفي الفروع وحددي الصفوف الموجودة في كل فرع" />
      <BranchesClient
        branches={(branches ?? []) as Branch[]}
        stages={(stages ?? []) as Stage[]}
        grades={(grades ?? []) as Grade[]}
        gradesByBranch={gradesByBranch}
        teacherCount={teacherCount}
      />
    </div>
  );
}
