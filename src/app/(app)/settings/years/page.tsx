import Link from 'next/link';
import { Download, ChevronDown, ArchiveRestore } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { YearMove } from './year-move';

export const metadata = { title: 'الأعوام الدراسية' };
export const dynamic = 'force-dynamic';

interface Row { academic_year: string; branch_id: string; grade_id: string; term: 1 | 2; submissions: number; results: number; students_graded: number }

export default async function YearsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { supabase } = await requireRole('admin');
  const sp = await searchParams;
  const [ov, set, branches, grades, bg] = await Promise.all([
    supabase.rpc('year_overview'),
    supabase.from('settings').select('academic_year, current_term, grading_open').eq('id', 1).single(),
    supabase.from('branches').select('id, name').order('name'),
    supabase.from('grades').select('id, name, sort_order').order('sort_order'),
    supabase.from('branch_grades').select('branch_id, grade_id'),
  ]);
  const current = (set.data?.academic_year as string) ?? '';
  const rows = ((ov.data ?? []) as Row[]).map((r) => ({ ...r, submissions: Number(r.submissions), results: Number(r.results), students_graded: Number(r.students_graded) }));
  const years = [...new Set([current, ...rows.map((r) => r.academic_year)].filter(Boolean))].sort().reverse();
  const year = sp.year && years.includes(sp.year) ? sp.year : current || years[0] || '';

  // عدد الطلاب الفعّالين لكل (فرع، صف)
  const count = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('students').select('branch_id, grade_id').eq('is_active', true).range(from, from + 999);
    (data ?? []).forEach((s) => { const k = `${s.branch_id}|${s.grade_id}`; count.set(k, (count.get(k) ?? 0) + 1); });
    if ((data ?? []).length < 1000) break;
  }
  const gName = new Map((grades.data ?? []).map((g) => [g.id as string, g.name as string]));
  const gOrder = new Map((grades.data ?? []).map((g) => [g.id as string, g.sort_order as number]));
  const yr = rows.filter((r) => r.academic_year === year);
  const sum = (f: (r: Row) => number, t?: 1 | 2) => yr.filter((r) => !t || r.term === t).reduce((a, r) => a + f(r), 0);
  const dl = (branch: string, term: 1 | 2) => `/api/export?type=year-backup&branch=${branch}&year=${encodeURIComponent(year)}&term=${term}`;

  return (
    <div className="max-w-4xl">
      <PageHeader title="الأعوام الدراسية" subtitle="كل فرع بصفوفه وعدد طلابه ودرجاته لكل عام، مع نسخة احتياطية بصيغة إكسل" />
      {ov.error ? (
        <div className="card p-5 text-[13.5px] leading-7">لم تُفعَّل هذه الصفحة بعد: شغّلي الملف <b>0018_year_overview.sql</b> في Supabase (SQL Editor) مرة واحدة ثم حدّثي الصفحة.</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {years.map((y) => (
              <Link key={y} href={`/settings/years?year=${encodeURIComponent(y)}`} className={cn('num inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[14px]', y === year ? 'border-black bg-black text-white' : 'border-line bg-white hover:border-ink-faint')}>
                {y}{y === current && <span className={cn('rounded-full px-2 py-0.5 text-[11px]', y === year ? 'bg-white/20' : 'bg-mint-soft text-mint')}>الحالي</span>}
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['الدرجات (الفصل 1)', sum((r) => r.results, 1)], ['الدرجات (الفصل 2)', sum((r) => r.results, 2)], ['تسليمات المعلمات', Math.round(sum((r) => r.submissions) )], ['الفروع المرصودة', new Set(yr.map((r) => r.branch_id)).size]].map(([l, v]) => (
              <div key={l as string} className="card p-4"><p className="text-[12px] text-ink-muted">{l}</p><p className="num mt-1 text-[22px] font-semibold">{(v as number).toLocaleString('en')}</p></div>
            ))}
          </div>

          <div className="card flex items-start gap-3 p-4 text-[13px] leading-6">
            <ArchiveRestore className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
            <p>النسخة الاحتياطية ملف إكسل لكل فرع وفصل، فيه كل طلاب الفرع (ورقة لكل صف) ودرجاتهم لهذا العام. هو بنفس تنسيق «ملف الفرع»، فيمكن رفعه من <Link href="/students/import-branch" className="underline">الطلاب ← ملف الفرع</Link> للاستعادة عندما يكون عامه هو العام الحالي، وبمعاينة قبل الحفظ وإمكانية التراجع. احتفظي بنسخة بعد كل أسبوع رصد.</p>
          </div>

          {rows.length > 0 && <YearMove years={[...new Set(rows.map((r) => r.academic_year))].sort().reverse()} current={current} gradingOpen={!!set.data?.grading_open} />}

          {(branches.data ?? []).map((b) => {
            const gids = (bg.data ?? []).filter((x) => x.branch_id === b.id).map((x) => x.grade_id as string).sort((a, c) => (gOrder.get(a) ?? 0) - (gOrder.get(c) ?? 0));
            const mine = yr.filter((r) => r.branch_id === b.id);
            const total = gids.reduce((a, g) => a + (count.get(`${b.id}|${g}`) ?? 0), 0);
            return (
              <details key={b.id as string} className="card group overflow-hidden" open={mine.length > 0}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                  <ChevronDown className="h-4 w-4 text-ink-muted transition group-open:rotate-180" />
                  <span className="text-[15px] font-semibold">{b.name}</span>
                  <span className="num text-[12.5px] text-ink-muted">{total} طالب · {gids.length} صف</span>
                  <span className="flex-1" />
                  {mine.length === 0 && <Badge tone="neutral">لا درجات في {year}</Badge>}
                </summary>
                <div className="border-t border-line">
                  <div className="flex flex-wrap gap-2 p-3">
                    {([1, 2] as const).map((t) => (
                      <a key={t} href={dl(b.id as string, t)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-[13px] hover:border-ink-faint"><Download className="h-4 w-4" />نسخة احتياطية · الفصل {t === 1 ? 'الأول' : 'الثاني'}</a>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[13px]">
                      <thead><tr className="bg-surface text-ink-muted"><th className="px-4 py-2 text-start font-medium">الصف</th><th className="px-3 py-2 text-center font-medium">الطلاب</th><th className="px-3 py-2 text-center font-medium">مرصود لهم ف1</th><th className="px-3 py-2 text-center font-medium">درجات ف1</th><th className="px-3 py-2 text-center font-medium">مرصود لهم ف2</th><th className="px-3 py-2 text-center font-medium">درجات ف2</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {gids.map((g) => {
                          const n = count.get(`${b.id}|${g}`) ?? 0;
                          const t1 = mine.find((r) => r.grade_id === g && r.term === 1), t2 = mine.find((r) => r.grade_id === g && r.term === 2);
                          return (
                            <tr key={g}>
                              <td className="px-4 py-2.5">{gName.get(g)}</td>
                              <td className="num px-3 py-2.5 text-center">{n}</td>
                              <td className="num px-3 py-2.5 text-center">{t1 ? `${t1.students_graded}${n ? ` (${Math.round((t1.students_graded / n) * 100)}%)` : ''}` : '—'}</td>
                              <td className="num px-3 py-2.5 text-center">{t1?.results ?? '—'}</td>
                              <td className="num px-3 py-2.5 text-center">{t2 ? `${t2.students_graded}${n ? ` (${Math.round((t2.students_graded / n) * 100)}%)` : ''}` : '—'}</td>
                              <td className="num px-3 py-2.5 text-center">{t2?.results ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
