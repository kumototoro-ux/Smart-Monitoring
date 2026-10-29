import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { StudentsClient } from './students-client';
import type { Branch, Grade, Section, Student } from '@/lib/types';

export const metadata = { title: 'الطلاب' };
const PAGE = 50;

export default async function StudentsPage({ searchParams }: {
  searchParams: Promise<{ branch?: string; grade?: string; section?: string; q?: string; flag?: string; page?: string }>;
}) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const sp = await searchParams;
  const branchId = profile.role === 'supervisor' ? profile.branch_id! : (sp.branch ?? '');
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  let q = supabase.from('students')
    .select('id, branch_id, grade_id, section_id, full_name, national_id, student_number, name_en, birth_date, nationality, id_type, gender, source, needs_review, is_active, created_at', { count: 'exact' })
    .order('full_name')
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (branchId) q = q.eq('branch_id', branchId);
  if (sp.grade) q = q.eq('grade_id', sp.grade);
  if (sp.section) q = q.eq('section_id', sp.section);
  if (sp.q) {
    const s = sp.q.replace(/[%,()]/g, ' ').trim();
    q = q.or(`full_name.ilike.%${s}%,name_en.ilike.%${s}%,national_id.ilike.%${s}%,student_number.ilike.%${s}%`);
  }
  if (sp.flag === 'review') q = q.eq('needs_review', true);
  else if (sp.flag === 'nosection') q = q.is('section_id', null);
  else if (sp.flag === 'inactive') q = q.eq('is_active', false);
  else q = q.eq('is_active', true);

  const [students, branches, grades, sections, review] = await Promise.all([
    q,
    supabase.from('branches').select('id, name, code, is_active').order('name'),
    supabase.from('grades').select('id, stage_id, name, sort_order, assessment_mode, is_active').order('sort_order'),
    (branchId ? supabase.from('sections').select('id, branch_id, grade_id, name, sort_order, is_active').eq('branch_id', branchId)
      : supabase.from('sections').select('id, branch_id, grade_id, name, sort_order, is_active')).order('sort_order'),
    (() => { let r = supabase.from('students').select('id', { count: 'exact', head: true }).eq('needs_review', true).eq('is_active', true); if (branchId) r = r.eq('branch_id', branchId); return r; })(),
  ]);

  return (
    <div>
      <PageHeader title="الطلاب" subtitle="إدارة بيانات الطلاب واستيرادها من إكسل" />
      <StudentsClient
        isAdmin={profile.role === 'admin'}
        myBranch={profile.branch_id}
        filters={{ branch: branchId, grade: sp.grade ?? '', section: sp.section ?? '', q: sp.q ?? '', flag: sp.flag ?? '' }}
        students={(students.data ?? []) as Student[]}
        total={students.count ?? 0}
        page={page}
        pageSize={PAGE}
        reviewCount={review.count ?? 0}
        branches={(branches.data ?? []) as Branch[]}
        grades={(grades.data ?? []) as Grade[]}
        sections={(sections.data ?? []) as Section[]}
      />
    </div>
  );
}
