import Link from 'next/link';
import { Search, UserX, UserMinus } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { ExportButton } from '@/components/ui/export-button';
import { FilterBar } from '@/components/ui/filter-bar';
import { cn, fmtDate, secLabel } from '@/lib/utils';
import type { ExcludedRow } from '@/lib/issue-reports';

export const metadata = { title: 'الطلاب المستبعدون' };

type SP = { branch?: string; grade?: string; kind?: string; q?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const MAX = 300;

interface Person {
  id: string; name: string; number: string | null; branch: string; grade: string; gradeId: string; section: string; sort: number;
  subjects: { subject: string; reason: string | null; by: string | null; at: string }[]; inactive: boolean; note: string | null; at: string;
}

export default async function ExcludedPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const sp = await searchParams;
  const { data, error } = await supabase.rpc('excluded_students');
  if (error) {
    return (
      <div className="card max-w-xl p-6 text-[14px] leading-7">
        <p className="font-semibold">تقرير المستبعدين غير مفعّل بعد</p>
        <p className="text-ink-muted">يلزم تشغيل ملف التحديث 0014 في Supabase ثم تحديث الصفحة.</p>
      </div>
    );
  }
  const all = (data ?? []) as ExcludedRow[];
  const branches = [...new Map(all.map((r) => [r.branch_id, r.branch])).entries()];
  const branchId = profile.role === 'supervisor' ? (profile.branch_id ?? '') : UUID.test(sp.branch ?? '') ? sp.branch! : '';
  const inBranch = all.filter((r) => !branchId || r.branch_id === branchId);
  const grades = [...new Map([...inBranch].sort((a, b) => a.grade_sort - b.grade_sort).map((r) => [r.grade_id, r.grade])).entries()];
  const gradeId = UUID.test(sp.grade ?? '') && grades.some(([id]) => id === sp.grade) ? sp.grade! : '';
  const kind = sp.kind === 'inactive' ? 'inactive' : 'subject';
  const q = (sp.q ?? '').trim();

  const scoped = inBranch.filter((r) => !gradeId || r.grade_id === gradeId);
  const subjectRows = scoped.filter((r) => r.kind === 'subject');
  const inactiveRows = scoped.filter((r) => r.kind === 'inactive');
  const subjectStudents = new Set(subjectRows.map((r) => r.student_id)).size;

  // تجميع حسب الطالب
  const people = new Map<string, Person>();
  for (const r of (kind === 'subject' ? subjectRows : inactiveRows)) {
    if (q && !r.student_name.includes(q) && !(r.student_number ?? '').includes(q)) continue;
    const p = people.get(r.student_id) ?? { id: r.student_id, name: r.student_name, number: r.student_number, branch: r.branch, grade: r.grade, gradeId: r.grade_id, section: r.section, sort: r.grade_sort, subjects: [], inactive: r.kind === 'inactive', note: r.reason, at: r.at };
    if (r.kind === 'subject') p.subjects.push({ subject: r.subject ?? '', reason: r.reason, by: r.by_name, at: r.at });
    people.set(r.student_id, p);
  }
  const list = [...people.values()].sort((a, b) => a.branch.localeCompare(b.branch, 'ar') || a.sort - b.sort || a.section.localeCompare(b.section, 'ar') || a.name.localeCompare(b.name, 'ar'));
  const shown = list.slice(0, MAX);

  const href = (o: Partial<SP>) => {
    const n = { branch: branchId || undefined, grade: gradeId || undefined, kind: kind === 'inactive' ? 'inactive' : undefined, q: q || undefined, ...o } as Record<string, string | undefined>;
    const qs = new URLSearchParams(Object.entries(n).filter(([, v]) => v) as [string, string][]);
    return `/excluded${qs.size ? `?${qs}` : ''}`;
  };

  return (
    <div>
      <PageHeader title="الطلاب المستبعدون" subtitle="الطلاب المستبعدون من كشوف مواد (منقول/معفى/منقطع…) والطلاب غير النشطين، لكل فرع وصف وشعبة — مع تقرير إكسل"
        actions={<ExportButton params={{ type: 'excluded', branch: branchId, grade: gradeId }} label="تقرير إكسل" />} />

      <FilterBar keep={{ kind: kind === 'inactive' ? 'inactive' : undefined, q: q || undefined }} fields={[
        ...(profile.role === 'admin' && branches.length > 1 ? [{ name: 'branch', label: 'الفرع', value: branchId, options: [['', 'كل الفروع'] as const, ...branches] }] : []),
        ...(grades.length > 1 ? [{ name: 'grade', label: 'الصف', value: gradeId, options: [['', 'كل الصفوف'] as const, ...grades] }] : []),
      ]} />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {([['subject', 'مستبعدون من مواد', subjectStudents, 'bg-amber-soft text-amber'], ['inactive', 'غير نشطين', new Set(inactiveRows.map((r) => r.student_id)).size, 'bg-rose-soft text-rose']] as const).map(([key, label, n, tone]) => (
          <Link key={key} href={href({ kind: key === 'inactive' ? 'inactive' : undefined })}
            className={cn('rounded-card border px-3.5 py-3 transition', tone, kind === key ? 'border-black ring-1 ring-black' : 'border-line hover:border-ink-faint')}>
            <p className="num text-[22px] font-semibold leading-tight">{n}</p>
            <p className="mt-0.5 text-[12.5px] opacity-80">{label}</p>
          </Link>
        ))}
        <div className="rounded-card border border-line bg-white px-3.5 py-3 text-ink">
          <p className="num text-[22px] font-semibold leading-tight">{subjectRows.length}</p>
          <p className="mt-0.5 text-[12.5px] opacity-80">حالة استبعاد من مواد</p>
        </div>
      </div>

      <form action="/excluded" className="card mb-4 flex items-center gap-2 p-3">
        {branchId && profile.role === 'admin' && <input type="hidden" name="branch" value={branchId} />}
        {gradeId && <input type="hidden" name="grade" value={gradeId} />}
        {kind === 'inactive' && <input type="hidden" name="kind" value="inactive" />}
        <Search className="h-4 w-4 shrink-0 text-ink-muted" />
        <input name="q" defaultValue={q} placeholder="ابحثي باسم الطالب أو رقمه" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-faint" />
        <button className="rounded-full bg-black px-4 py-1.5 text-[13px] text-white">بحث</button>
      </form>

      {list.length === 0 ? (
        <div className="card"><EmptyState icon={kind === 'subject' ? <UserX className="h-6 w-6" /> : <UserMinus className="h-6 w-6" />}
          title={kind === 'subject' ? 'لا يوجد طلاب مستبعدون من مواد' : 'لا يوجد طلاب غير نشطين'}
          hint="يظهر هنا من تستبعده المعلمة من كشف مادتها، ومن يُعطَّل من قائمة الصف." /></div>
      ) : (
        <>
          <p className="num mb-2 text-[12.5px] text-ink-muted">{list.length} طالب{list.length > MAX ? ` — نعرض أول ${MAX}، والتقرير الكامل في ملف الإكسل` : ''}</p>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {shown.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{p.name}</p>
                      <p className="truncate text-[12.5px] text-ink-muted">{profile.role === 'admin' && !branchId ? `${p.branch} · ` : ''}{p.grade}{p.section ? ` · ${secLabel(p.section)}` : ''}{p.number ? ` · ${p.number}` : ''}</p>
                    </div>
                    {p.inactive ? <Badge tone="danger">غير نشط · {fmtDate(p.at)}</Badge> : <Badge tone="warning">{p.subjects.length} {p.subjects.length === 1 ? 'مادة' : 'مواد'}</Badge>}
                  </div>
                  {p.inactive && p.note && <p className="mt-1 text-[12.5px] text-ink-muted">{p.note}</p>}
                  {p.subjects.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {p.subjects.map((s, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-6 text-ink-soft">
                          <b className="font-medium text-ink">{s.subject}</b>
                          {s.reason && <span>— {s.reason}</span>}
                          <span className="text-ink-muted">· {s.by ?? '—'} · {fmtDate(s.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
