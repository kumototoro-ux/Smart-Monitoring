import Link from 'next/link';
import { ClipboardCheck, GraduationCap, Inbox, Users, ArrowLeft, Lock, CheckCircle2, Clock, Wrench, UserCheck } from 'lucide-react';
import { diagnose } from '@/lib/diagnose';
import { requireRole } from '@/lib/auth';
import { firstName, secLabel } from '@/lib/utils';
import { getSettings, getStats } from '@/lib/data';
import { getTeacherSheets, isEditable } from '@/lib/teacher';
import { StatTile } from '@/components/ui/tile';
import { Badge } from '@/components/ui/badge';
import { Ring } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty';
import { ProgressChart } from '@/components/progress-chart';

export default async function Dashboard() {
  const s = await requireRole();
  const [settings, stats] = await Promise.all([getSettings(), getStats()]);
  const done = stats?.sheets_done ?? 0;
  const total = stats?.sheets_total ?? 0;

  if (s.profile.role === 'teacher') {
    const sheets = await getTeacherSheets(s.supabase, s.profile.id, settings.current_term, settings.academic_year);
    return (
      <div className="space-y-5">
        <h1 className="text-[22px] font-semibold lg:hidden">أهلاً، {firstName(s.profile.full_name)}</h1>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile tone="rose" icon={<ClipboardCheck className="h-5 w-5" />} label="الكشوفات المرصودة" value={`${done}/${total}`} unit="كشف" />
          <StatTile tone="lilac" icon={<GraduationCap className="h-5 w-5" />} label="طلابي" value={stats?.students ?? 0} unit="طالب" />
          <StatTile tone="peri" icon={<Inbox className="h-5 w-5" />} label="طلبات قيد المراجعة" value={stats?.pending_requests ?? 0} />
        </div>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold">كشوفاتي</h2>
            <Link href="/grading" className="inline-flex items-center gap-1 rounded-full bg-black px-4 py-2 text-[13px] text-white">ابدئي الرصد <ArrowLeft className="h-4 w-4" /></Link>
          </div>
          {sheets.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="لم تُسند لك أي مادة بعد" hint="تواصلي مع مشرفة الفرع لإسناد الصفوف والمواد." />
          ) : (
            <ul className="divide-y divide-line">
              {sheets.map((sh) => {
                const sub = sh.components.filter((c) => c.submission).length;
                const pct = Math.round((sub / Math.max(sh.components.length, 1)) * 100);
                const locked = sh.components.some((c) => c.submission && !isEditable(c.submission));
                return (
                  <li key={sh.section_id + sh.grade_subject_id}>
                    <Link href={`/grading?section=${sh.section_id}&subject=${sh.grade_subject_id}`} className="flex items-center gap-4 py-3.5 transition hover:opacity-80">
                      <Ring value={pct} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium">{sh.subject_name}</p>
                        <p className="truncate text-[12.5px] text-ink-muted">{sh.grade_name} · {secLabel(sh.section_name)}</p>
                      </div>
                      {pct === 100 ? <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>مكتمل</Badge>
                        : pct > 0 ? <Badge tone="info" icon={<Clock className="h-3.5 w-3.5" />}>{sub} من {sh.components.length}</Badge>
                        : <Badge tone="danger">لم يُرصد</Badge>}
                      {locked && <Lock className="h-4 w-4 text-ink-faint" aria-label="مقفل" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // الأدمن والمشرفة
  const { data: breakdown } = await s.supabase.rpc('progress_breakdown');
  const chart = ((breakdown ?? []) as { label: string; done: number; total: number }[]).map((r) => ({
    label: s.profile.role === 'supervisor' ? r.label.split(' ').slice(0, 2).join(' ') : r.label,
    done: Number(r.done), total: Number(r.total),
  }));
  const pct = total ? Math.round((done / total) * 100) : 0;

  // مشاكل تحتاج تدخل خلال آخر 24 ساعة
  const { data: recent } = await s.supabase.from('audit_logs')
    .select('action, severity, actor_name, details').in('severity', ['warning', 'error', 'security'])
    .gte('created_at', new Date(Date.now() - 86400_000).toISOString()).order('created_at', { ascending: false }).limit(500);
  const urgent = new Map<string, { title: string; count: number }>();
  (recent ?? []).forEach((r) => {
    const dg = diagnose(r as { action: string; severity: string; actor_name: string | null; details: Record<string, unknown> });
    if (!dg.needsAction) return;
    const g = urgent.get(dg.key) ?? { title: dg.group, count: 0 };
    g.count++; urgent.set(dg.key, g);
  });
  const urgentList = [...urgent.values()].sort((a, b) => b.count - a.count);

  const reviewCounts = await Promise.all((['added', 'released', 'excluded'] as const).map((k) =>
    s.supabase.from('student_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('kind', k).then((r) => r.count ?? 0)));
  const reviewTotal = reviewCounts.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {reviewTotal > 0 && (
        <Link href="/reviews" className="flex items-start gap-3 rounded-card bg-amber-soft p-4 text-amber transition hover:bg-[#F7E7C6]">
          <UserCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">{reviewTotal} طالب بانتظار مراجعتك</p>
            <p className="mt-0.5 text-[13px] text-amber/80">
              {[reviewCounts[0] && `${reviewCounts[0]} أضافتهم المعلمات`, reviewCounts[1] && `${reviewCounts[1]} أُرجعوا لقائمة الصف`, reviewCounts[2] && `${reviewCounts[2]} استُبعدوا من مواد`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="shrink-0 self-center text-[13px] font-medium">مراجعة ←</span>
        </Link>
      )}
      {urgentList.length > 0 && (
        <Link href="/logs" className="flex items-start gap-3 rounded-card bg-rose-soft p-4 text-rose transition hover:bg-rose-tile">
          <Wrench className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">{urgentList.length === 1 ? 'مشكلة تحتاج تدخلك' : `${urgentList.length} مشاكل تحتاج تدخلك`} — آخر 24 ساعة</p>
            <p className="mt-0.5 truncate text-[13px] text-rose/80">{urgentList.slice(0, 3).map((u) => `${u.title} (${u.count})`).join(' · ')}</p>
          </div>
          <span className="shrink-0 self-center text-[13px] font-medium">عرض الحلول ←</span>
        </Link>
      )}
      <h1 className="text-[22px] font-semibold lg:hidden">أهلاً، {firstName(s.profile.full_name)}</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile tone="rose" icon={<ClipboardCheck className="h-5 w-5" />} label="إنجاز الرصد" value={`${pct}%`} unit={`${done} من ${total} كشف`} />
        <StatTile tone="lilac" icon={<Users className="h-5 w-5" />} label="المعلمات" value={stats?.teachers ?? 0} unit="معلمة" />
        <StatTile tone="peri" icon={<GraduationCap className="h-5 w-5" />} label="الطلاب" value={(stats?.students ?? 0).toLocaleString('en')} unit="طالب" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card min-w-0 p-5 sm:p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold">{s.profile.role === 'admin' ? 'تقدم الرصد حسب الفرع' : 'تقدم الرصد حسب المعلمة'}</h2>
            <span className="text-[13px] text-ink-muted">الترم {settings.current_term === 1 ? 'الأول' : 'الثاني'}</span>
          </div>
          {chart.length ? <ProgressChart data={chart} /> : (
            <EmptyState title="لا توجد بيانات بعد" hint="ستظهر هنا نسبة الإنجاز بعد إسناد المواد للمعلمات." />
          )}
        </section>

        <section className="card min-w-0 p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold">الطلبات</h2>
            <Link href="/requests" className="text-[13px] text-ink-muted hover:text-ink">عرض الكل</Link>
          </div>
          <PendingRequests />
        </section>
      </div>
    </div>
  );
}

async function PendingRequests() {
  const s = await requireRole('admin', 'supervisor');
  const { data } = await s.supabase
    .from('requests')
    .select('id, type, created_at, requester:profiles!requests_requested_by_fkey(full_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5)
    .returns<{ id: string; type: string; created_at: string; requester: { full_name: string } | null }[]>();
  const labels: Record<string, string> = { unlock_sheet: 'فتح كشف للتعديل', add_student: 'إضافة طالب', remove_student: 'حذف طالب', other: 'طلب آخر' };
  if (!data?.length) return <EmptyState className="py-8" icon={<Inbox className="h-6 w-6" />} title="لا توجد طلبات معلّقة" />;
  return (
    <ul className="divide-y divide-line">
      {data.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface"><Inbox className="h-4 w-4 text-ink-muted" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{r.requester?.full_name ?? '—'}</p>
            <p className="truncate text-[12px] text-ink-muted">{labels[r.type] ?? r.type}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
