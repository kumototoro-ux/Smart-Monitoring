import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { AccountsClient } from './accounts-client';
import type { Branch, Profile } from '@/lib/types';

export const metadata = { title: 'الحسابات' };

export default async function AccountsPage() {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  let q = supabase.from('profiles')
    .select('id, username, full_name, role, branch_id, phone, is_active, last_login_at, created_at')
    .order('full_name');
  if (profile.role === 'supervisor') q = q.eq('role', 'teacher').eq('branch_id', profile.branch_id!);
  const [{ data: accounts }, { data: branches }, { data: assigns }] = await Promise.all([
    q,
    supabase.from('branches').select('id, name, code, is_active').order('name'),
    supabase.from('teacher_assignments').select('teacher_id'),
  ]);
  const assignCount: Record<string, number> = {};
  (assigns ?? []).forEach((a) => { assignCount[a.teacher_id] = (assignCount[a.teacher_id] ?? 0) + 1; });

  return (
    <div>
      <PageHeader
        title={profile.role === 'admin' ? 'الحسابات' : 'المعلمات'}
        subtitle={profile.role === 'admin' ? 'إنشاء الحسابات وإعادة تعيين كلمات المرور والصلاحيات' : 'حسابات معلمات الفرع'}
      />
      <AccountsClient
        me={profile}
        accounts={(accounts ?? []) as Profile[]}
        branches={(branches ?? []) as Branch[]}
        assignCount={assignCount}
      />
    </div>
  );
}
