import Link from 'next/link';
import { ClipboardCheck, Search, UserX } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Bar } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty';
import { ExportButton } from '@/components/ui/export-button';
import { cn, secLabel, timeAgo } from '@/lib/utils';
import type { SummaryRow } from '@/lib/issue-reports';
import { FilterBar } from '@/components/ui/filter-bar';
import { IssueList } from './issue-list';

export const metadata = { title: 'سجل إصدار الإشعارات' };

type SP = { branch?: string; grade?: string; term?: string; status?: string; section?: string; q?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function NoticeLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const settings = await getSettings();
  const sp = await searchParams;
  const term = (sp.term === '2' ? 2 : sp.term === '1' ? 1 : settings.current_term) as 1 | 2;
  const { data, error } = await supabase.rpc('notice_issue_summary', { p_term: term });
  if (error) {
    return (
      <div className="card max-w-xl p-6 text-[14px] leading-7">
        <p className="font-semibold">سجل الإصدار غير مفعّل بعد</p>
        <p className="text-ink-muted">يلزم تشغيل ملف التحديث 0014 في Supabase ثم تحديث الصفحة.</p>
      </div>
    );
  }
  const all = (data ?? []) as SummaryRow[];
  const branches = [...new Map(all.map((r) => [r.branch_id, r.branch])).entries()];
  const branchId = profile.role === 'supervisor' ? (profile.branch_id ?? '') : UUID.test(sp.branch ?? '') ? sp.branch! : '';
  const inBranch = all.filter((r) => !branchId || r.branch_id === branchId);
  const grades = [...new Map(inBranch.sort((a, b) => a.grade_sort - b.grade_sort).map((r) => [r.grade_id, r.grade])).entries()];
  const gradeId = UUID.test(sp.grade ?? '') && grades.some(([id]) => id === sp.grade) ? sp.grade! : '';
  const scoped = inBranch.filter((r) => !gradeId || r.grade_id === gradeId);

  const st = (r: SummaryRow) => (r.students === 0 ? 'empty' : r.issued === 0 ? 'none' : r.issued >= r.students ? 'done' : 'partial');
  const counts = { done: 0, partial: 0, none: 0, empty: 0 };
  scoped.forEach((r) => { counts[st(r)]++; });
  const status = ['done', 'partial', 'none'].includes(sp.status ?? '') ? (sp.status as 'done' | 'partial' | 'none') : '';
  const rows = scoped.filter((r) => !status || st(r) === status);
  const issuedStudents = scoped.reduce((a, r) => a + Math.min(r.issued, r.students), 0);
  const totalStudents = scoped.reduce((a, r) => a + r.students, 0);
  const pct = totalStudents ? Math.round((issuedStudents / totalStudents) * 100) : 0;
  const section = UUID.test(sp.section ?? '') ? sp.section! : '';
  const groups = [...rows.reduce((m, r) => {
    const g = m.get(`${r.branch_id}|${r.grade_id}`) ?? { key: `${r.branch_id}|${r.grade_id}`, branch: r.branch, grade: r.grade, sort: r.grade_sort, students: 0, issued: 0, rows: [] as SummaryRow[] };
    g.students += r.students; g.issued += Math.min(r.issued, r.students); g.rows.push(r); m.set(g.key, g); return m;
  }, new Map<string, { key: string; branch: string; grade: string; sort: number; students: number; issued: number; rows: SummaryRow[] }>()).values()]
    .sort((a, b) => a.branch.localeCompare(b.branch, 'ar') || a.sort - b.sort);

  const href = (o: Partial<SP>) => {
    const n = { branch: branchId || undefined, grade: gradeId || undefined, term: String(term), status: status || undefined, ...o } as Record<string, string | undefined>;
    const qs = new URLSearchParams(Object.entries(n).filter(([, v]) => v) as [string, string][]);
    return `/notices/log?${qs}`;
  };
  const META = { done: ['success', 'صدر للجميع'], partial: ['warning', 'صدر لبعضهم'], none: ['danger', 'لم يصدر شيء'], empty: ['neutral', 'لا طلاب'] } as const;

  return (
    <div>
      <PageHeader title="سجل إصدار الإشعارات" subtitle="من أصدر إشعارات الدرجات ومتى، لكل فرع وصف وشعبة، مع الشعب التي لم يصدر لها شيء بعد"
        actions={<ExportButton params={{ type: 'issues', term: String(term), branch: branchId, grade: gradeId }} label="تقرير إكسل" />} />

      <FilterBar keep={{ status: status || undefined }} fields={[
        { name: 'term', label: 'الفصل', value: String(term), options: [['1', 'الفصل الأول'], ['2', 'الفصل الثاني']] },
        ...(profile.role === 'admin' && branches.length > 1 ? [{ name: 'branch', label: 'الفرع', value: branchId, options: [['', 'كل الفروع'] as const, ...branches] }] : []),
        ...(grades.length > 1 ? [{ name: 'grade', label: 'الصف', value: gradeId, options: [['', 'كل الصفوف'] as const, ...grades] }] : []),
      ]} />

      <div className="card mb-3 p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-[14px] font-medium">الطلاب الذين صدر لهم إشعار</p>
          <p className="num text-[13px] text-ink-muted"><b className="text-[18px] text-ink">{pct}%</b> · {issuedStudents} من {totalStudents} طالب</p>
        </div>
        <Bar value={pct} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {([['', 'كل الشعب', scoped.length, 'bg-white text-ink'], ['done', 'صدر للجميع', counts.done, 'bg-mint-soft text-mint'], ['partial', 'صدر لبعضهم', counts.partial, 'bg-amber-soft text-amber'], ['none', 'لم يصدر شيء', counts.none, 'bg-rose-soft text-rose']] as const).map(([key, label, n, tone]) => (
          <Link key={key || 'all'} href={href({ status: key || undefined })}
            className={cn('rounded-card border px-3.5 py-3 transition', tone, status === key ? 'border-black ring-1 ring-black' : 'border-line hover:border-ink-faint')}>
            <p className="num text-[22px] font-semibold leading-tight">{n}</p>
            <p className="mt-0.5 text-[12.5px] opacity-80">{label}</p>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="لا توجد شعب في هذا التصفية" /></div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
                <p className="min-w-0 truncate text-[14px] font-semibold">{g.grade}{profile.role === 'admin' && !branchId ? <span className="font-normal text-ink-muted"> · {g.branch}</span> : null}</p>
                <p className="num shrink-0 text-[12.5px] text-ink-muted">{g.issued} من {g.students} طالب · {g.rows.length} {g.rows.length === 1 ? 'شعبة' : 'شعب'}</p>
              </div>
              <ul className="divide-y divide-line">
                {g.rows.map((r) => {
                  const s = st(r); const [tone, label] = META[s];
                  const p = r.students ? Math.round((Math.min(r.issued, r.students) / r.students) * 100) : 0;
                  return (
                    <li key={r.section_id} className={cn('px-4 py-3', section === r.section_id && 'bg-surface')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium">{secLabel(r.section)}</p>
                          <p className="truncate text-[12.5px] text-ink-muted">{r.homeroom ? `المربية: ${r.homeroom}` : 'لم تُسنَد مربية فصل'}</p>
                        </div>
                        <Badge tone={tone}>{label}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="min-w-0 flex-1"><Bar value={p} /></div>
                        <span className="num shrink-0 text-[12.5px] text-ink-muted">{Math.min(r.issued, r.students)}/{r.students}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] text-ink-muted">
                        <span className="min-w-0 truncate">{r.last_at ? <>آخر إصدار {timeAgo(r.last_at)}{r.last_by ? ` · ${r.last_by}` : ''}</> : 'لم يصدر بعد'}</span>
                        {r.total > 0 && <Link href={`${href({})}&section=${r.section_id}#list`} className="shrink-0 text-peri-deep hover:underline">عرض السجل</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <section id="list" className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[15.5px] font-semibold">عمليات الإصدار{section ? ' — الشعبة المحددة' : ''}</h2>
          {section && <Link href={href({})} className="text-[12.5px] text-ink-muted hover:text-ink">إلغاء تحديد الشعبة</Link>}
        </div>
        <form action="/notices/log#list" className="card mb-3 flex items-center gap-2 p-3">
          <input type="hidden" name="term" value={term} />
          {branchId && <input type="hidden" name="branch" value={branchId} />}
          {gradeId && <input type="hidden" name="grade" value={gradeId} />}
          {status && <input type="hidden" name="status" value={status} />}
          {section && <input type="hidden" name="section" value={section} />}
          <Search className="h-4 w-4 shrink-0 text-ink-muted" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="ابحثي باسم الطالب" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-faint" />
          <button className="rounded-full bg-black px-4 py-1.5 text-[13px] text-white">بحث</button>
        </form>
        <IssueList key={`${term}|${branchId}|${gradeId}|${section}|${sp.q ?? ''}`} filter={{ term, branch: branchId || undefined, grade: gradeId || undefined, section: section || undefined, q: sp.q }} />
      </section>
    </div>
  );
}
