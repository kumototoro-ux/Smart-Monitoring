import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { RequestsClient, type RequestRow } from './requests-client';

export const metadata = { title: 'الطلبات' };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase, profile } = await requireRole();
  const sp = await searchParams;
  const status = sp.status ?? 'pending';
  let q = supabase.from('requests').select(`
      id, type, status, note, payload, term, created_at, reviewed_at, review_note, student_id,
      requester:profiles!requests_requested_by_fkey(full_name),
      reviewer:profiles!requests_reviewed_by_fkey(full_name),
      branch:branches(name),
      section:sections(name, grade:grades(name)),
      grade_subject:grade_subjects(subject:subjects(name)),
      student:students(full_name)
    `).order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') q = q.eq('status', status);
  if (profile.role === 'teacher') q = q.eq('requested_by', profile.id);
  const { data } = await q;
  return (
    <div>
      <PageHeader title={profile.role === 'teacher' ? 'طلباتي' : 'الطلبات'}
        subtitle={profile.role === 'teacher' ? 'طلبات فتح الكشوفات وإضافة الطلاب' : 'مراجعة طلبات المعلمات'} />
      <RequestsClient role={profile.role} status={status} rows={(data ?? []) as unknown as RequestRow[]} />
    </div>
  );
}
