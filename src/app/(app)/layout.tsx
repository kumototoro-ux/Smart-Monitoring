import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getSettings, getStats } from '@/lib/data';
import { Shell } from '@/components/shell/shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const role = s.profile.role;
  // كل الاستعلامات معاً (بدل تتابعها): كل تنقل بين الصفحات يمرّ من هنا
  const [settings, stats, branch, reviews, access] = await Promise.all([
    getSettings(),
    getStats(),
    s.profile.branch_id
      ? s.supabase.from('branches').select('name').eq('id', s.profile.branch_id).single()
      : Promise.resolve({ data: null }),
    // طلاب ينتظرون مراجعة المشرفة/الأدمن (RLS تحصرها بفرع المشرفة)
    role !== 'teacher'
      ? s.supabase.from('student_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    // «إشعارات الدرجات» تظهر لمن يملك صلاحية إصدارها فقط (إن لم يُشغَّل 0012 تُخفى بصمت)
    role !== 'admin' ? s.supabase.rpc('notice_has_access') : Promise.resolve({ data: true }),
  ]);
  const branchName: string | null = (branch.data as { name?: string } | null)?.name ?? null;
  const pendingReviews = reviews.count ?? 0;
  const noticeAccess = role === 'admin' || access.data === true;

  return (
    <Shell
      profile={s.profile}
      branchName={branchName}
      term={settings.current_term}
      year={settings.academic_year}
      gradingOpen={settings.grading_open}
      pendingRequests={stats?.pending_requests ?? 0}
      pendingReviews={pendingReviews}
      noticeAccess={noticeAccess}
    >
      {children}
    </Shell>
  );
}
