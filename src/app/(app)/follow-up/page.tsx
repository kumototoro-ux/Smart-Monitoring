import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CircleDashed, DoorOpen, PencilLine, Search, Hourglass, DatabaseZap } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { cn, fmtDateTime, secLabel } from '@/lib/utils';

export const metadata = { title: 'متابعة الرصد' };

type St = 'abandoned' | 'edit_unsaved' | 'started' | 'none' | 'done';
type Asg = {
  teacher_id: string; section_id: string; grade_subject_id: string;
  teacher: { full_name: string; is_active: boolean } | null;
  section: { id: string; name: string; sort_order: number; grade: { name: string; sort_order: number } | null } | null;
  gs: { id: string; subject: { name: string } | null; comps: { id: string }[] } | null;
};
type Act = {
  actor_id: string; section_id: string; grade_subject_id: string; term: number;
  first_started: string | null; last_event: string; last_kind: string;
  last_filled: number | null; last_total: number | null; abandoned_count: number;
};
type Row = {
  key: string; teacherId: string; teacher: string; sheet: string; where: string; st: St;
  saved: number; comps: number; act?: Act; lastSave: string | null; order: number;
};

const META: Record<St, { label: string; tone: 'danger' | 'warning' | 'info' | 'neutral' | 'success'; icon: React.ReactNode; hint: string }> = {
  abandoned: { label: 'غادرت دون حفظ', tone: 'danger', icon: <DoorOpen className="h-3.5 w-3.5" />, hint: 'رصدت درجات ثم غادرت الكشف قبل الحفظ النهائي' },
  edit_unsaved: { label: 'عدّلت ولم تحفظ التعديل', tone: 'warning', icon: <PencilLine className="h-3.5 w-3.5" />, hint: 'الكشف محفوظ، لكنها عدّلت ثم غادرت دون حفظ التعديل' },
  started: { label: 'بدأت ولم تحفظ', tone: 'warning', icon: <Hourglass className="h-3.5 w-3.5" />, hint: 'بدأت الرصد ولا يوجد حفظ بعده (قد تكون ما زالت تعمل)' },
  none: { label: 'لم تبدأ', tone: 'neutral', icon: <CircleDashed className="h-3.5 w-3.5" />, hint: 'لا حفظ ولا بدء رصد مسجّل' },
  done: { label: 'مكتمل', tone: 'success', icon: <CheckCircle2 className="h-3.5 w-3.5" />, hint: 'الكشف محفوظ بالكامل' },
};
const ORDER: St[] = ['abandoned', 'edit_unsaved', 'started', 'none', 'done'];
const WEIGHT: Record<St, number> = { abandoned: 0, edit_unsaved: 1, started: 2, none: 3, done: 4 };

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

export default async function FollowUpPage({ searchParams }: { searchParams: Promise<{ branch?: string; status?: string; q?: string }> }) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const settings = await getSettings();
  const sp = await searchParams;
  const { data: branches } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name');
  const branchId = profile.role === 'supervisor' ? profile.branch_id! : (sp.branch ?? branches?.[0]?.id ?? '');
  const term = settings.current_term;
  const status = (sp.status ?? 'attention') as St | 'attention' | 'all';
  const q = (sp.q ?? '').trim();

  // ---- الإسنادات + الاستبعادات + الحفظ + نشاط الرصد
  const [asg, excl] = await Promise.all([
    all<Asg>((a, b) => supabase.from('teacher_assignments')
      .select(`teacher_id, section_id, grade_subject_id,
        teacher:profiles(full_name, is_active),
        section:sections!inner(id, name, sort_order, branch_id, grade:grades(name, sort_order)),
        gs:grade_subjects(id, subject:subjects(name), comps:assessment_components(id))`)
      .eq('section.branch_id', branchId).range(a, b).returns<Asg[]>()),
    supabase.from('branch_subject_exclusions').select('grade_subject_id').eq('branch_id', branchId),
  ]);
  const excluded = new Set((excl.data ?? []).map((e) => e.grade_subject_id));
  const rows0 = asg.filter((r) => r.section && r.gs && r.teacher?.is_active && !excluded.has(r.grade_subject_id) && r.gs.comps.length > 0);

  const secIds = [...new Set(rows0.map((r) => r.section_id))];
  const subs: { section_id: string; component_id: string; submitted_at: string; last_edited_at: string | null }[] = [];
  for (let i = 0; i < secIds.length; i += 40) {
    const { data } = await supabase.from('submissions').select('section_id, component_id, submitted_at, last_edited_at')
      .in('section_id', secIds.slice(i, i + 40)).eq('term', term).eq('academic_year', settings.academic_year);
    subs.push(...(data ?? []));
  }
  const subMap = new Map(subs.map((s) => [`${s.section_id}:${s.component_id}`, s]));

  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const actRes = await supabase.rpc('sheet_activity', { p_since: since, p_branch: branchId });
  const activityOk = !actRes.error;
  const actMap = new Map(((actRes.data ?? []) as Act[]).filter((a) => a.term === term).map((a) => [`${a.actor_id}:${a.section_id}:${a.grade_subject_id}`, a]));

  const rows: Row[] = rows0.map((r) => {
    const comps = r.gs!.comps;
    const have = comps.map((c) => subMap.get(`${r.section_id}:${c.id}`)).filter(Boolean) as typeof subs;
    const lastSave = have.reduce<string | null>((m, s) => {
      const t = s.last_edited_at ?? s.submitted_at;
      return !m || t > m ? t : m;
    }, null);
    const act = actMap.get(`${r.teacher_id}:${r.section_id}:${r.grade_subject_id}`);
    const complete = have.length === comps.length;
    let st: St;
    if (complete) st = act && act.last_kind === 'client.sheet.abandoned' && lastSave && act.last_event > lastSave ? 'edit_unsaved' : 'done';
    else if (act) st = act.last_kind === 'client.sheet.abandoned' ? 'abandoned' : 'started';
    else st = 'none';
    return {
      key: `${r.teacher_id}:${r.section_id}:${r.grade_subject_id}`, teacherId: r.teacher_id, teacher: r.teacher!.full_name,
      sheet: r.gs!.subject?.name ?? '—', where: `${r.section!.grade?.name ?? ''} ${secLabel(r.section!.name)}`.trim(),
      st, saved: have.length, comps: comps.length, act, lastSave,
      order: (r.section!.grade?.sort_order ?? 0) * 1000 + r.section!.sort_order,
    };
  });

  const counts = Object.fromEntries(ORDER.map((s) => [s, rows.filter((r) => r.st === s).length])) as Record<St, number>;
  const attention = rows.length - counts.done;
  const shown = rows
    .filter((r) => (status === 'all' ? true : status === 'attention' ? r.st !== 'done' : r.st === status))
    .filter((r) => !q || r.teacher.includes(q));

  const byTeacher = new Map<string, { name: string; worst: number; items: Row[] }>();
  shown.forEach((r) => {
    const g = byTeacher.get(r.teacherId) ?? { name: r.teacher, worst: 9, items: [] };
    g.worst = Math.min(g.worst, WEIGHT[r.st]); g.items.push(r); byTeacher.set(r.teacherId, g);
  });
  const groups = [...byTeacher.values()].sort((a, b) => a.worst - b.worst || a.name.localeCompare(b.name, 'ar'));
  groups.forEach((g) => g.items.sort((a, b) => WEIGHT[a.st] - WEIGHT[b.st] || a.order - b.order));

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const m = { branch: profile.role === 'admin' ? branchId : undefined, status: sp.status, q: sp.q, ...patch };
    Object.entries(m).forEach(([k, v]) => { if (v) p.set(k, v); });
    const s = p.toString();
    return `/follow-up${s ? `?${s}` : ''}`;
  };

  return (
    <div>
      <PageHeader title="متابعة الرصد" subtitle={`الترم ${term === 1 ? 'الأول' : 'الثاني'} · من حفظ ومن لم يحفظ، ومن بدأ الرصد وغادر دون حفظ`} />

      {!activityOk && (
        <div className="mb-4 flex items-start gap-3 rounded-card bg-rose-soft p-4 text-rose">
          <DatabaseZap className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-[13.5px] leading-6">قاعدة البيانات تحتاج تشغيل الملف <code dir="ltr" className="rounded bg-white px-1.5 font-mono text-[12.5px] text-ink">0009_sheet_activity.sql</code> ليظهر «بدأت / غادرت دون حفظ». الآن تظهر فقط الكشوف المحفوظة وغير المحفوظة.</p>
        </div>
      )}

      {profile.role === 'admin' && (branches?.length ?? 0) > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {(branches ?? []).map((b) => (
            <Link key={b.id} href={href({ branch: b.id })}
              className={cn('rounded-full border px-3.5 py-1.5 text-[13px]', b.id === branchId ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>{b.name}</Link>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {([['attention', 'تحتاج متابعة', attention, 'bg-rose-soft text-rose'] as const, ...ORDER.map((s) => [s, META[s].label, counts[s], 'bg-white text-ink'] as const)]).map(([key, label, n, tone]) => (
          <Link key={key} href={href({ status: key === 'attention' ? undefined : key })}
            className={cn('rounded-card border px-3.5 py-3 transition', tone, status === key ? 'border-black ring-1 ring-black' : 'border-line hover:border-ink-faint')}>
            <p className="num text-[22px] font-semibold leading-tight">{n}</p>
            <p className="mt-0.5 text-[12.5px] opacity-80">{label}</p>
          </Link>
        ))}
      </div>

      <form action="/follow-up" className="card mb-4 flex items-center gap-2 p-3">
        {profile.role === 'admin' && <input type="hidden" name="branch" value={branchId} />}
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <Search className="h-4 w-4 shrink-0 text-ink-muted" />
        <input name="q" defaultValue={q} placeholder="ابحثي باسم المعلمة" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-faint" />
        <button className="rounded-full bg-black px-4 py-1.5 text-[13px] text-white">بحث</button>
      </form>

      <p className="mb-3 flex items-start gap-2 text-[12.5px] leading-6 text-ink-muted">
        <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" />
        هذه وقائع مسجّلة بالوقت (متى بدأت، ومتى غادرت). لا يمكن للموقع معرفة السبب: سهو أم انقطاع إنترنت أم غير ذلك — والتقدير يعود لك.
      </p>

      {groups.length === 0 ? (
        <div className="card"><EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={rows.length ? 'لا توجد كشوف في هذه الحالة' : 'لا توجد إسنادات في هذا الفرع'} hint={rows.length && status === 'attention' ? 'كل الكشوف المسندة محفوظة.' : undefined} /></div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.items[0].teacherId} className="card p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[15.5px] font-semibold">{g.name}</h2>
                <Link href={`/logs?view=all&range=30d&q=${encodeURIComponent(g.name)}`} className="text-[12px] text-ink-muted hover:text-ink">سجل نشاطها</Link>
              </div>
              <ul className="divide-y divide-line">
                {g.items.map((r) => {
                  const m = META[r.st];
                  const a = r.act;
                  return (
                    <li key={r.key} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">{r.sheet}</p>
                        <p className="truncate text-[12.5px] text-ink-muted">{r.where}{r.comps > 1 && ` · محفوظ ${r.saved} من ${r.comps} أنواع تقييم`}</p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                          {a ? <>
                            بدأت: {fmtDateTime(a.first_started ?? a.last_event)} · آخر نشاط: {fmtDateTime(a.last_event)}
                            {a.last_total ? ` · رصدت ${a.last_filled ?? 0} من ${a.last_total} خانة` : ''}
                            {a.abandoned_count > 0 && ` · غادرت ${a.abandoned_count} ${a.abandoned_count > 2 ? 'مرات' : 'مرة'}`}
                          </> : r.st === 'done' ? `آخر حفظ: ${fmtDateTime(r.lastSave)}` : 'لا نشاط مسجّل'}
                          {a && r.lastSave && ` · آخر حفظ: ${fmtDateTime(r.lastSave)}`}
                        </p>
                      </div>
                      <Badge tone={m.tone} icon={m.icon} className="self-start sm:self-center">{m.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
