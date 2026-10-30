import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { diagnose, type Diagnosis } from '@/lib/diagnose';
import { secLabel } from '@/lib/utils';
import { LogsClient, type LogRow, type ProblemGroup } from './logs-client';
import type { Branch } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const metadata = { title: 'سجل التتبع' };
const PAGE = 50;
const PROBLEM = ['warning', 'error', 'security'];

type Raw = Omit<LogRow, 'diag' | 'context'>;
const COLS = 'id, created_at, actor_id, actor_name, actor_role, branch_id, action, severity, entity, entity_id, details, ip, user_agent';

const CATEGORY: Record<string, string> = {
  auth: 'auth.%', grade: 'grade.%', sheet: 'sheet.%', account: 'account.%', request: 'request.%',
  student: 'student.%', settings: 'settings.%', export: 'export.%', client: 'client.%',
};

/** أسماء الشعب والمواد المذكورة في الأحداث: «الرياضيات · الأول المتوسط شعبة أ» */
async function contextNames(supabase: SupabaseClient, rows: Raw[]) {
  const secIds = new Set<string>(); const gsIds = new Set<string>();
  rows.forEach((r) => {
    const d = r.details ?? {};
    if (typeof d.section_id === 'string') secIds.add(d.section_id);
    if (typeof d.grade_subject_id === 'string') gsIds.add(d.grade_subject_id);
    if (r.entity === 'section' && r.entity_id) secIds.add(r.entity_id);
  });
  const [secs, gss] = await Promise.all([
    secIds.size ? supabase.from('sections').select('id, name, grade:grades(name), branch:branches(name)').in('id', [...secIds]) : Promise.resolve({ data: [] }),
    gsIds.size ? supabase.from('grade_subjects').select('id, subject:subjects(name)').in('id', [...gsIds]) : Promise.resolve({ data: [] }),
  ]);
  const sec = new Map(((secs.data ?? []) as unknown as { id: string; name: string; grade: { name: string } | null; branch: { name: string } | null }[])
    .map((s) => [s.id, `${s.grade?.name ?? ''} ${secLabel(s.name)}`.trim()]));
  const sub = new Map(((gss.data ?? []) as unknown as { id: string; subject: { name: string } | null }[]).map((g) => [g.id, g.subject?.name ?? '']));
  return (r: Raw) => {
    const d = r.details ?? {};
    const s = typeof d.section_id === 'string' ? sec.get(d.section_id) : r.entity === 'section' && r.entity_id ? sec.get(r.entity_id) : undefined;
    const g = typeof d.grade_subject_id === 'string' ? sub.get(d.grade_subject_id) : undefined;
    return [g, s].filter(Boolean).join(' · ') || undefined;
  };
}

export default async function LogsPage({ searchParams }: {
  searchParams: Promise<{ view?: string; cat?: string; q?: string; range?: string; branch?: string; page?: string; actor?: string; action?: string; hint?: string }>;
}) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const view = sp.view ?? 'problems';
  const hours = sp.range === '7d' ? 168 : sp.range === '30d' ? 720 : sp.range === 'all' ? 0 : 24;
  const since = hours ? new Date(Date.now() - hours * 3600_000).toISOString() : null;
  const branch = profile.role === 'admin' ? sp.branch : undefined;

  // ------------------------------------------------ قائمة الأحداث
  let q = supabase.from('audit_logs').select(COLS, { count: 'exact' })
    .order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (since) q = q.gte('created_at', since);
  if (view === 'problems') q = q.in('severity', PROBLEM);
  else if (view === 'security') q = q.eq('severity', 'security');
  else if (view === 'errors') q = q.eq('severity', 'error');
  if (sp.cat && CATEGORY[sp.cat]) q = q.like('action', CATEGORY[sp.cat]);
  if (sp.action) q = q.eq('action', sp.action);
  if (sp.hint) q = q.eq('details->>hint', sp.hint);
  if (sp.actor) q = q.eq('actor_id', sp.actor);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ' '); q = q.or(`actor_name.ilike.%${t}%,details->>username.ilike.%${t}%,details->>digest.eq.${t.trim()}`); }
  if (branch) q = q.eq('branch_id', branch);

  // ------------------------------------------------ مصدر ملخص المشاكل
  let pq = supabase.from('audit_logs').select(COLS).in('severity', PROBLEM).order('created_at', { ascending: false }).limit(3000);
  if (since) pq = pq.gte('created_at', since);
  if (branch) pq = pq.eq('branch_id', branch);

  const [logs, problems, branches, actorRow] = await Promise.all([
    q, pq,
    supabase.from('branches').select('id, name, code, is_active').order('name'),
    sp.actor ? supabase.from('profiles').select('full_name').eq('id', sp.actor).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = (logs.data ?? []) as Raw[];
  const probRows = (problems.data ?? []) as Raw[];

  // التجميع
  const groups = new Map<string, ProblemGroup & { users: Map<string, string> }>();
  for (const r of probRows) {
    const dg = diagnose(r);
    if (dg.kind === 'ok') continue;
    const g = groups.get(dg.key) ?? {
      key: dg.key, kind: dg.kind, title: dg.group, cause: dg.cause, fix: dg.fix, needsAction: dg.needsAction,
      count: 0, last: r.created_at, people: [], peopleCount: 0, users: new Map(),
      filter: { action: r.action, hint: typeof r.details?.hint === 'string' ? r.details.hint : undefined },
      sample: r.id,
    };
    g.count++;
    if (dg.needsAction) g.needsAction = true;
    const name = r.actor_name ?? (typeof r.details?.username === 'string' ? `«${r.details.username}»` : null);
    if (name) g.users.set(r.actor_id ?? name, name);
    groups.set(dg.key, g);
  }
  const summary: ProblemGroup[] = [...groups.values()]
    .map(({ users, ...g }) => ({ ...g, people: [...users.values()].slice(0, 4), peopleCount: users.size }))
    .sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || b.count - a.count)
    .slice(0, 8);

  const ctx = await contextNames(supabase, rows);
  const withDiag: LogRow[] = rows.map((r) => {
    const context = ctx(r);
    return { ...r, context, diag: diagnose(r, context) as Diagnosis };
  });

  const counts = {
    needsAction: [...groups.values()].filter((g) => g.needsAction).reduce((a, g) => a + g.count, 0),
    user: [...groups.values()].filter((g) => g.kind === 'user').reduce((a, g) => a + g.count, 0),
    security: [...groups.values()].filter((g) => g.kind === 'security').reduce((a, g) => a + g.count, 0),
    system: [...groups.values()].filter((g) => g.kind === 'system').reduce((a, g) => a + g.count, 0),
  };

  return (
    <div>
      <PageHeader title="سجل التتبع" subtitle="كل مشكلة مشروحة: ماذا حدث، ولماذا، وما الحل" />
      <LogsClient
        isAdmin={profile.role === 'admin'}
        rows={withDiag} total={logs.count ?? 0} page={page} pageSize={PAGE}
        filters={{ view, cat: sp.cat ?? '', q: sp.q ?? '', range: sp.range ?? '24h', branch: sp.branch ?? '', actor: sp.actor ?? '', action: sp.action ?? '', hint: sp.hint ?? '' }}
        actorName={(actorRow.data as { full_name: string } | null)?.full_name ?? null}
        summary={summary} counts={counts} truncated={probRows.length >= 3000}
        branches={(branches.data ?? []) as Branch[]}
      />
    </div>
  );
}
