import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getSettings, getStats } from '@/lib/data';
import { Shell } from '@/components/shell/shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const [settings, stats] = await Promise.all([getSettings(), getStats()]);

  let branchName: string | null = null;
  if (s.profile.branch_id) {
    const { data } = await s.supabase.from('branches').select('name').eq('id', s.profile.branch_id).single();
    branchName = data?.name ?? null;
  }

  return (
    <Shell
      profile={s.profile}
      branchName={branchName}
      term={settings.current_term}
      year={settings.academic_year}
      gradingOpen={settings.grading_open}
      pendingRequests={stats?.pending_requests ?? 0}
    >
      {children}
    </Shell>
  );
}
