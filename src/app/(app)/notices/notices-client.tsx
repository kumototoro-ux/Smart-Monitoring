'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileArchive, FileText, Loader2, Search, Send, Share2, X } from 'lucide-react';
import { getNoticeRoster, loadNotice, loadNoticeSection, logNoticeBatch, logNoticeIssued } from '@/app/actions/notices';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { NoticeViewer } from '@/components/notice/notice-sheet';
import { OffscreenRenderer } from '@/components/notice/notice-offscreen';
import { saveBlob, shareFile, lastShareError } from '@/components/notice/notice-export';
import { useToast } from '@/components/ui/toast';
import { cn, secLabel } from '@/lib/utils';
import type { NoticeData, NoticeRender } from '@/lib/notice';
import type { Role } from '@/lib/types';

export interface NoticeSection {
  id: string; name: string; branch_id: string; branch: string; grade_id: string; grade: string;
  grade_sort: number; sort: number; homeroom: string | null;
}
type Student = { id: string; full_name: string; student_number: string | null; missing: number };
type RowState = 'preparing' | 'ready';

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
  const [view, setView] = useState<{ data: NoticeData; render: NoticeRender } | null>(null);
  const [loading, setLoading] = useState(false);
  const [, start] = useTransition();
  const viewer = useRef<HTMLDivElement>(null);
  // إعدادات الفرع وصوره (الأثقل) تُحمَّل مرة واحدة لكل فرع ثم تُعاد من الذاكرة
  const renders = useRef(new Map<string, NoticeRender>());
  // ملفات جاهزة للمشاركة من القائمة (تُجهَّز بضغطة ثم تُرسَل بضغطة، فالمشاركة تحتاج ضغطة مباشرة من المستخدم)
  const files = useRef(new Map<string, File>());
  const [rows, setRows] = useState<Record<string, RowState | undefined>>({});
  const off = useRef<OffscreenRenderer | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchKind, setBatchKind] = useState<'pdf' | 'png'>('pdf');
  const cancel = useRef(false);

  useEffect(() => () => { off.current?.destroy(); off.current = null; }, []);
  useEffect(() => { if (!inBranch.some((s) => s.id === section)) setSection(inBranch[0]?.id ?? ''); }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!section) { setRoster([]); return; }
    let live = true;
    setRoster(null); setRosterErr(''); setSel(null); setView(null); setRows({}); files.current.clear();
    getNoticeRoster(section, term).then((r) => {
      if (!live) return;
      if (r.ok) setRoster(r.data ?? []); else { setRoster([]); setRosterErr(r.message ?? 'تعذّر تحميل الطلاب'); }
    });
    return () => { live = false; };
  }, [section, term]);

  const renderer = () => (off.current ??= new OffscreenRenderer());

  /** بيانات إشعار طالب (+ إعدادات الفرع إن لم تكن محمّلة) */
  const fetchNotice = async (id: string) => {
    const have = renders.current.get(branch);
    const r = await loadNotice(id, term, !have);
    if (!r.ok || !r.data) throw new Error(r.message ?? 'تعذّر تحميل الإشعار');
    if (r.data.render) renders.current.set(branch, r.data.render);
    return { data: r.data.data, render: (r.data.render ?? have)! };
  };

  const open = (id: string) => {
    setSel(id); setView(null); setLoading(true);
    start(async () => {
      try {
        const v = await fetchNotice(id);
        setView(v);
        setTimeout(() => viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      } catch (e) { toast.error((e as Error).message); }
      setLoading(false);
    });
  };

  const makeFile = async (id: string, kind: 'pdf' | 'png') => {
    const { data, render } = await fetchNotice(id);
    return { file: await renderer().file(data, render, kind), data };
  };

  const rowDownload = async (id: string) => {
    setRows((m) => ({ ...m, [id]: 'preparing' }));
    try {
      const { file } = await makeFile(id, 'pdf');
      saveBlob(file, file.name);
      void logNoticeIssued(id, term, 'pdf');
    } catch (e) { toast.error((e as Error).message || 'تعذّر التنزيل'); }
    setRows((m) => ({ ...m, [id]: undefined }));
  };

  const rowShare = async (id: string) => {
    const ready = files.current.get(id);
    if (ready) { // الضغطة الثانية: مشاركة فورية
      const r = await shareFile(ready, `إشعار درجات الطالب ${ready.name.replace(/\.(pdf|png)$/, '')}`);
      if (r === 'fallback') toast.error('تعذّرت المشاركة المباشرة', `نُزّل الملف، أرفقيه في واتساب يدوياً (${lastShareError})`);
      if (r !== 'cancelled') void logNoticeIssued(id, term, 'png');
      files.current.delete(id);
      setRows((m) => ({ ...m, [id]: undefined }));
      return;
    }
    setRows((m) => ({ ...m, [id]: 'preparing' }));
    try {
      // المشاركة بصورة: متصفحات الجوال (مثل سامسونج) ترفض مشاركة PDF مباشرة وتقبل الصور
      const { file } = await makeFile(id, 'png');
      files.current.set(id, file);
      setRows((m) => ({ ...m, [id]: 'ready' }));
    } catch (e) {
      toast.error((e as Error).message || 'تعذّر التجهيز');
      setRows((m) => ({ ...m, [id]: undefined }));
    }
  };

  /** كل إشعار ملف مستقل داخل ملف مضغوط واحد */
  const downloadSection = async () => {
    if (!sec) return;
    cancel.current = false;
    setBatch({ done: 0, total: 0 });
    try {
      const r = await loadNoticeSection(section, term);
      if (!r.ok || !r.data) throw new Error(r.message ?? 'تعذّر تحميل إشعارات الشعبة');
      const all = r.data.list;
      const ready = all.filter((d) => d.complete);
      const skipped = all.length - ready.length;
      if (!ready.length || !r.data.render) { toast.error('لا يوجد طلاب مكتملو الرصد في هذه الشعبة'); setBatch(null); return; }
      renders.current.set(branch, r.data.render);
      setBatch({ done: 0, total: ready.length });
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const used = new Map<string, number>();
      const rd = renderer();
      let done = 0;
      for (const d of ready) {
        if (cancel.current) break;
        const f = await rd.file(d, r.data.render, batchKind);
        const base = f.name.replace(/\.(pdf|png)$/, '');
        const n = (used.get(base) ?? 0) + 1; used.set(base, n);
        zip.file(n > 1 ? `${base}-${n}.${batchKind}` : f.name, f);
        setBatch({ done: ++done, total: ready.length });
      }
      if (cancel.current) { toast.error('أُلغي التحميل'); setBatch(null); return; }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      saveBlob(blob, `إشعارات-${sec.grade}-${secLabel(sec.name)}-الفصل-${term === 1 ? 'الأول' : 'الثاني'}.zip`.replace(/\s+/g, '-'));
      void logNoticeBatch(section, term, done, skipped, batchKind);
      toast.success(`نُزّل ${done} إشعار في ملف مضغوط`, skipped ? `تخطّينا ${skipped} طالباً لنقص رصدهم` : undefined);
    } catch (e) {
      toast.error((e as Error).message || 'تعذّر التحميل');
    }
    setBatch(null);
  };

  const sec = sections.find((s) => s.id === section);
  const list = (roster ?? []).filter((s) => !q.trim() || s.full_name.includes(q.trim()) || (s.student_number ?? '').includes(q.trim()));
  const readyCount = (roster ?? []).filter((s) => s.missing === 0).length;
  const isAdmin = role === 'admin';
  const canBatch = role === 'admin' || role === 'supervisor';

  if (!sections.length) {
    return <div className="card"><EmptyState icon={<FileText className="h-6 w-6" />} title="لا توجد شعب متاحة لك" hint={role === 'teacher' ? 'لم تُسند لكِ شعبة كمربية فصل بعد.' : 'لا توجد شعب نشطة.'} /></div>;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <div className="card space-y-3 p-4">
          {branches.length > 1 && (
            <Field label="الفرع">
              <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
                {branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
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

        {canBatch && (
          <div className="card space-y-2.5 p-4">
            <div className="flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-ink-muted" />
              <p className="text-[14px] font-medium">إشعارات الشعبة كاملة</p>
            </div>
            <p className="text-[12.5px] leading-5 text-ink-muted">ملف مضغوط واحد، وكل طالب إشعاره ملف مستقل باسمه، جاهز للإرسال لولي أمره. يُستثنى من رصده ناقص.</p>
            {batch ? (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-black transition-all" style={{ width: `${batch.total ? (batch.done / batch.total) * 100 : 4}%` }} /></div>
                <div className="flex items-center justify-between text-[13px]">
                  <span>{batch.total ? `جارٍ التجهيز ${batch.done} / ${batch.total}` : 'جارٍ تحميل البيانات…'}</span>
                  <button type="button" className="inline-flex items-center gap-1 text-rose" onClick={() => { cancel.current = true; }}><X className="h-3.5 w-3.5" />إلغاء</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="w-28 shrink-0">
                  <Select value={batchKind} onChange={(e) => setBatchKind(e.target.value as 'pdf' | 'png')} aria-label="الصيغة">
                    <option value="pdf">PDF</option><option value="png">صور</option>
                  </Select>
                </div>
                <Button className="flex-1" variant="secondary" disabled={!readyCount} onClick={downloadSection}>
                  <Download className="h-4 w-4" />تحميل ({readyCount})
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="relative border-b border-line p-3">
            <Search className="pointer-events-none absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input className="pr-9" placeholder="ابحثي باسم الطالب أو رقمه" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {roster === null && <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
            {rosterErr && <p className="p-5 text-center text-[13.5px] text-rose">{rosterErr}</p>}
            {roster && !rosterErr && list.length === 0 && <p className="p-6 text-center text-[13.5px] text-ink-muted">لا يوجد طلاب</p>}
            {list.map((s) => {
              const st = rows[s.id];
              return (
                <div key={s.id} className={cn('flex items-center gap-1 pl-2 transition hover:bg-surface', sel === s.id && 'bg-peri-soft')}>
                  <button type="button" onClick={() => open(s.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-right">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{s.full_name}</span>
                      {s.student_number && <span className="block text-[12px] text-ink-muted" dir="ltr">{s.student_number}</span>}
                    </span>
                    {s.missing === 0
                      ? <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>جاهز</Badge>
                      : <Badge tone="warning">ناقص {s.missing}</Badge>}
                  </button>
                  {s.missing === 0 && (
                    <>
                      <button type="button" title="تنزيل PDF" aria-label="تنزيل PDF" disabled={st === 'preparing' || !!batch} onClick={() => rowDownload(s.id)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-white disabled:opacity-40">
                        {st === 'preparing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </button>
                      <button type="button" title={st === 'ready' ? 'اضغطي للإرسال' : 'مشاركة عبر واتساب'} aria-label="مشاركة عبر واتساب" disabled={st === 'preparing' || !!batch} onClick={() => rowShare(s.id)}
                        className={cn('grid h-9 shrink-0 place-items-center rounded-full disabled:opacity-40', st === 'ready' ? 'bg-mint px-3 text-white' : 'w-9 text-ink-soft hover:bg-white')}>
                        {st === 'ready' ? <span className="inline-flex items-center gap-1 text-[12.5px] font-medium"><Send className="h-3.5 w-3.5" />إرسال</span> : <Share2 className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div ref={viewer} className="min-w-0 scroll-mt-4">
        {!sel && (
          <div className="card"><EmptyState icon={<FileText className="h-6 w-6" />} title="اختاري طالباً" hint="يظهر إشعار درجاته هنا، وتنزّلينه أو تشاركينه عبر واتساب." /></div>
        )}
        {sel && loading && <Skeleton className="h-[70vh] rounded-2xl" />}
        {view && !loading && (
          <div className="space-y-3">
            {!view.data.complete && (
              <div className="card flex items-start gap-3 border border-amber/30 bg-amber-soft p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
                <div className="text-[13.5px] leading-6">
                  <p className="font-semibold">{isAdmin ? 'رصد هذا الطالب ناقص — الإشعار الحالي غير مكتمل' : 'لا يمكن إصدار الإشعار قبل اكتمال الرصد'}</p>
                  <p className="text-ink-soft">المواد الناقصة:</p>
                  <ul className="mt-1 list-disc pr-5">
                    {view.data.missing.map((m) => <li key={m.subject}>{m.subject}{m.teacher ? ` — ${m.teacher}` : ' — بلا معلمة مسندة'}</li>)}
                  </ul>
                </div>
              </div>
            )}
            {(view.data.complete || isAdmin) && (
              <NoticeViewer
                data={view.data}
                render={view.render}
                onExported={(kind) => { void logNoticeIssued(view.data.student.id, view.data.term, kind); }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
