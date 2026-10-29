import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { LogsClient, type LogRow } from './logs-client';
import type { Branch } from '@/lib/types';

export const metadata = { title: 'سجل التتبع' };
const PAGE = 60;

const CATEGORY: Record<string, string> = {
  auth: 'auth.%', grade: '%grade.%', sheet: 'sheet.%', account: 'account.%', request: 'request.%',
  student: 'student.%', settings: 'settings.%', export: 'export.%', client: 'client.%',
};

export default async function LogsPage({ searchParams }: {
  searchParams: Promise<{ severity?: string; cat?: string; q?: string; range?: string; branch?: string; page?: string }>;
}) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const hours = sp.range === '7d' ? 168 : sp.range === '30d' ? 720 : sp.range === 'all' ? 0 : 24;

  let q = supabase.from('audit_logs')
    .select('id, created_at, actor_name, actor_role, branch_id, action, severity, entity, entity_id, details, ip, user_agent', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (hours) q = q.gte('created_at', new Date(Date.now() - hours * 3600_000).toISOString());
  if (sp.severity === 'problems') q = q.in('severity', ['warning', 'error', 'security']);
  else if (sp.severity) q = q.eq('severity', sp.severity);
  if (sp.cat && CATEGORY[sp.cat]) q = q.like('action', CATEGORY[sp.cat]);
  if (sp.q) q = q.or(`actor_name.ilike.%${sp.q.replace(/[%,()]/g, ' ')}%,details->>username.ilike.%${sp.q.replace(/[%,()]/g, ' ')}%`);
  if (profile.role === 'admin' && sp.branch) q = q.eq('branch_id', sp.branch);

  // ملخص آخر 24 ساعة
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [logs, branches, sec, err, fails] = await Promise.all([
    q,
    supabase.from('branches').select('id, name, code, is_active').order('name'),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('severity', 'security').gte('created_at', since),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('severity', 'error').gte('created_at', since),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('action', 'auth.login_failed').gte('created_at', since),
  ]);

  return (
    <div>
      <PageHeader title="سجل التتبع" subtitle="كل العمليات والأخطاء ومحاولات الدخول — للمراجعة واكتشاف المشاكل" />
      <LogsClient
        isAdmin={profile.role === 'admin'}
        rows={(logs.data ?? []) as LogRow[]}
        total={logs.count ?? 0} page={page} pageSize={PAGE}
        filters={{ severity: sp.severity ?? '', cat: sp.cat ?? '', q: sp.q ?? '', range: sp.range ?? '24h', branch: sp.branch ?? '' }}
        summary={{ security: sec.count ?? 0, errors: err.count ?? 0, failedLogins: fails.count ?? 0 }}
        branches={(branches.data ?? []) as Branch[]}
      />
    </div>
  );
}
