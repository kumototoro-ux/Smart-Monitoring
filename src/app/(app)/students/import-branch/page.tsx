import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { BranchImportClient } from './branch-import-client';

export const metadata = { title: 'ملف الفرع: الطلاب والدرجات' };

export default async function BranchImportPage() {
  const { supabase } = await requireRole('admin');
  const [branches, set, bg, grades] = await Promise.all([
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    supabase.from('settings').select('current_term, academic_year').eq('id', 1).single(),
    supabase.from('branch_grades').select('branch_id, grade_id'),
    supabase.from('grades').select('id, name, sort_order').order('sort_order'),
  ]);
  return (
    <div>
      <PageHeader title="ملف الفرع: الطلاب والدرجات" subtitle="للفروع التي ترسلين لها ملف إكسل واحد تعبّئه بالطلاب ودرجاتهم، فتحمّلين الملف هنا وتراجعينه قبل أي حفظ" />
      <BranchImportClient branches={branches.data ?? []} currentTerm={(set.data?.current_term ?? 1) as 1 | 2} year={set.data?.academic_year ?? ''}
        branchGrades={(bg.data ?? []) as { branch_id: string; grade_id: string }[]} grades={(grades.data ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
