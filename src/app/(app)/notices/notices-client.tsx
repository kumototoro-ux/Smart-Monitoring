'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Search } from 'lucide-react';
import { getNoticeRoster, loadNotice, logNoticeIssued, type NoticeBundle } from '@/app/actions/notices';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { NoticeViewer } from '@/components/notice/notice-sheet';
import { useToast } from '@/components/ui/toast';
import { cn, secLabel } from '@/lib/utils';
import type { Role } from '@/lib/types';

export interface NoticeSection {
  id: string; name: string; branch_id: string; branch: string; grade_id: string; grade: string;
  grade_sort: number; sort: number; homeroom: string | null;
}
type Student = { id: string; full_name: string; student_number: string | null; missing: number };

export function NoticesClient({ role, sections, currentTerm }: { role: Role; sections: NoticeSection[]; currentTerm: 1 | 2 }) {
  const toast = useToast();
  const branches = useMemo(() => [...new Map(sections.map((s) => [s.branch_id, s.branch])).entries()], [sections]);
  const [branch, setBranch] = useState(branches[0]?.[0] ?? '');
  const inBranch = sections.filter((s) => s.branch_id === branch);
  const [section, setSection] = useState(inBranch[0]?.id ?? '');
  const [term, setTerm] = useState<1 | 2>(currentTerm);
  const [q, setQ] = useState('');
  const [roster, setRoster] = useState<Student[] | null>(null);
  const [rosterErr, setRosterErr] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [bundle, setBundle] = useState<NoticeBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [, start] = useTransition();
  const viewer = useRef<HTMLDivElement>(null);

  // عند تغيّر الفرع نختار أول شعبة فيه
  useEffect(() => { if (!inBranch.some((s) => s.id === section)) setSection(inBranch[0]?.id ?? ''); }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!section) { setRoster([]); return; }
    let live = true;
    setRoster(null); setRosterErr(''); setSel(null); setBundle(null);
    getNoticeRoster(section, term).then((r) => {
      if (!live) return;
      if (r.ok) setRoster(r.data ?? []); else { setRoster([]); setRosterErr(r.message ?? 'تعذّر تحميل الطلاب'); }
    });
    return () => { live = false; };
  }, [section, term]);

  const open = (id: string) => {
    setSel(id); setBundle(null); setLoading(true);
    start(async () => {
      const r = await loadNotice(id, term);
      setLoading(false);
      if (r.ok && r.data) { setBundle(r.data); setTimeout(() => viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }
      else toast.error(r.message ?? 'تعذّر تحميل الإشعار');
    });
  };

  const sec = sections.find((s) => s.id === section);
  const list = (roster ?? []).filter((s) => !q.trim() || s.full_name.includes(q.trim()) || (s.student_number ?? '').includes(q.trim()));
  const isAdmin = role === 'admin';

  if (!sections.length) {
    return <div className="card"><EmptyState icon={<FileText className="h-6 w-6" />} title="لا توجد شعب متاحة لك" hint={role === 'teacher' ? 'لم تُسند لكِ شعبة كمربية فصل بعد.' : 'لا توجد شعب نشطة.'} /></div>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="card space-y-3 p-4">
          {branches.length > 1 && (
            <Field label="الفرع">
              <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
                {branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="الشعبة">
              <Select value={section} onChange={(e) => setSection(e.target.value)}>
                {inBranch.map((s) => <option key={s.id} value={s.id}>{s.grade} · {secLabel(s.name)}</option>)}
              </Select>
            </Field>
            <Field label="الفصل">
              <Select value={term} onChange={(e) => setTerm(Number(e.target.value) as 1 | 2)}>
                <option value={1}>الأول</option><option value={2}>الثاني</option>
              </Select>
            </Field>
          </div>
          {sec?.homeroom && <p className="text-[12.5px] text-ink-muted">مربية الفصل: {sec.homeroom}</p>}
        </div>

        <div className="card overflow-hidden">
          <div className="relative border-b border-line p-3">
            <Search className="pointer-events-none absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input className="pr-9" placeholder="ابحثي باسم الطالب أو رقمه" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {roster === null && <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
            {rosterErr && <p className="p-5 text-center text-[13.5px] text-rose">{rosterErr}</p>}
            {roster && !rosterErr && list.length === 0 && <p className="p-6 text-center text-[13.5px] text-ink-muted">لا يوجد طلاب</p>}
            {list.map((s) => (
              <button key={s.id} type="button" onClick={() => open(s.id)}
                className={cn('flex w-full items-center gap-3 p-3 text-right transition hover:bg-surface', sel === s.id && 'bg-peri-soft')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{s.full_name}</span>
                  {s.student_number && <span className="block text-[12px] text-ink-muted" dir="ltr">{s.student_number}</span>}
                </span>
                {s.missing === 0
                  ? <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>جاهز</Badge>
                  : <Badge tone="warning">ناقص {s.missing}</Badge>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={viewer} className="min-w-0 scroll-mt-4">
        {!sel && (
          <div className="card"><EmptyState icon={<FileText className="h-6 w-6" />} title="اختاري طالباً" hint="يظهر إشعار درجاته هنا، وتنزّلينه PDF أو صورة." /></div>
        )}
        {sel && loading && <Skeleton className="h-[70vh] rounded-2xl" />}
        {bundle && !loading && (
          <div className="space-y-3">
            {!bundle.data.complete && (
              <div className="card flex items-start gap-3 border border-amber/30 bg-amber-soft p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
                <div className="text-[13.5px] leading-6">
                  <p className="font-semibold">{isAdmin ? 'رصد هذا الطالب ناقص — الإشعار الحالي غير مكتمل' : 'لا يمكن إصدار الإشعار قبل اكتمال الرصد'}</p>
                  <p className="text-ink-soft">المواد الناقصة:</p>
                  <ul className="mt-1 list-disc pr-5">
                    {bundle.data.missing.map((m) => <li key={m.subject}>{m.subject}{m.teacher ? ` — ${m.teacher}` : ' — بلا معلمة مسندة'}</li>)}
                  </ul>
                </div>
              </div>
            )}
            {(bundle.data.complete || isAdmin) && (
              <NoticeViewer
                data={bundle.data}
                render={bundle.render}
                onExported={(kind) => { void logNoticeIssued(bundle.data.student.id, bundle.data.term, kind); }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
