'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitMerge, Search, Undo2, X, Check, AlertTriangle, Users } from 'lucide-react';
import {
  findDuplicateStudents, searchStudentsForMerge, previewStudentMerge, mergeStudents, undoStudentMerge, listStudentMerges,
  type MergePerson, type SimilarItem, type MergePreview, type MergeLogRow, type MergeConflict,
} from '@/app/actions/merge';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty';
import { useAction } from '@/lib/use-action';
import { cn, fmtDateTime, secLabel } from '@/lib/utils';

type Tab = 'auto' | 'manual' | 'history';
const DISMISS_KEY = 'mirqat:dup-dismissed';
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
const readDismissed = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]')); } catch { return new Set(); } };

function Person({ p, active, onClick }: { p: MergePerson; active?: boolean; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('min-w-0 rounded-xl border p-3 text-start', active ? 'border-black bg-surface ring-1 ring-black' : 'border-line bg-white', onClick && 'hover:border-ink-faint')}>
      <p className="break-words text-[14px] font-medium leading-6">{p.name}</p>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">{p.grade}{p.section ? ` · ${secLabel(p.section)}` : ''}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="text-ink-muted">الرقم الأكاديمي:</span>
        {p.number ? <bdi dir="ltr" className="num rounded-md bg-surface px-2 py-0.5 text-[13.5px] font-semibold tracking-wide">{p.number}</bdi> : <span className="text-rose">بلا رقم</span>}
        {p.number && /^TMP-\d+$/.test(p.number) && <Badge tone="warning">رقم مؤقت</Badge>}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={p.results ? 'success' : 'neutral'}>{p.results} رصد</Badge>
        {(p.source === 'teacher' || p.needsReview) && <Badge tone="warning">أضافته معلمة</Badge>}
      </div>
    </Tag>
  );
}

const show = (s: MergeConflict['keep']) => (s.verbal ? s.verbal : s.absent ? 'غائب' : s.score ?? '—');

// ------------------------------------------------------------------ نافذة الدمج
function MergeDialog({ a, b, suggest, onClose, onDone }: { a: MergePerson; b: MergePerson; suggest: 'a' | 'b'; onClose: () => void; onDone: (removedId: string) => void }) {
  const { exec, busy } = useAction();
  const [keepSide, setKeepSide] = useState<'a' | 'b'>(suggest);
  const keep = keepSide === 'a' ? a : b, remove = keepSide === 'a' ? b : a;
  const [pv, setPv] = useState<MergePreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, 'keep' | 'remove'>>({});
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let live = true;
    setPv(null); setErr(null); setChoice({}); setOk(false);
    void previewStudentMerge(keep.id, remove.id).then((r) => {
      if (!live) return;
      if (r.ok && r.data) setPv(r.data); else setErr(r.message ?? 'تعذّرت المعاينة');
    });
    return () => { live = false; };
  }, [keep.id, remove.id]);

  const ck = (c: MergeConflict) => `${c.component_id}|${c.term}|${c.year}`;
  const unresolved = pv ? pv.conflicts.filter((c) => !choice[ck(c)]).length : 0;
  const canMerge = !!pv && !err && unresolved === 0 && ok;

  const submit = async () => {
    if (!pv) return;
    const r = await exec(() => mergeStudents(keep.id, remove.id, pv.conflicts.map((c) => ({ component_id: c.component_id, term: c.term, year: c.year, use: choice[ck(c)] }))), {
      success: (d) => `تم الدمج ونُقل ${d?.moved ?? 0} رصد`, refresh: false,
    });
    if (r?.ok) onDone(remove.id);
  };

  return (
    <Dialog open onClose={onClose} title="مقارنة ودمج الاسمين" size="lg" dismissible={!busy}
      description="اختاري الاسم الصحيح الذي سيبقى؛ يُنقل إليه رصد الآخر ثم يُحذف الاسم الآخر (محفوظ في الأرشيف ويمكن التراجع)."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button variant="danger" onClick={submit} disabled={!canMerge} loading={busy}><GitMerge className="h-4 w-4" />دمج وحذف المكرر</Button>
        </div>
      }>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[13px] font-medium">أيّ الاسمين هو الصحيح (يبقى)؟</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([['a', a], ['b', b]] as const).map(([side, p]) => (
              <div key={side} className="min-w-0">
                <Person p={p} active={keepSide === side} onClick={() => setKeepSide(side)} />
                <p className={cn('mt-1 px-1 text-[12px]', keepSide === side ? 'font-medium text-mint' : 'text-rose')}>{keepSide === side ? '✓ يبقى' : 'يُحذف بعد نقل رصده'}</p>
              </div>
            ))}
          </div>
        </div>

        {!pv && !err && <div className="space-y-2" role="status"><Skeleton className="h-4 w-40" /><Skeleton className="h-16" /></div>}
        {err && <div className="flex items-start gap-2 rounded-xl bg-rose-soft p-3 text-[13px] leading-6 text-rose"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{err}</div>}

        {pv && (
          <>
            <ul className="grid grid-cols-3 gap-2 text-center text-[12.5px]">
              {([['سيُنقل', pv.movable, 'رصد'], ['تعارضات', pv.conflicts.length, 'تحتاج قرارك'], ['استبعادات', pv.exclusions, 'تُنقل']] as const).map(([t, n, s]) => (
                <li key={t} className="rounded-xl border border-line p-2.5"><p className="num text-[18px] font-semibold">{n}</p><p className="text-ink-muted">{t} · {s}</p></li>
              ))}
            </ul>

            {pv.conflicts.length > 0 && (
              <div>
                <p className="mb-1 text-[13px] font-medium">تعارضات: درجة لنفس المادة عند الاسمين — اختاري أيها تبقى</p>
                <p className="mb-2 text-[12px] text-ink-muted">لا يتم الدمج قبل حسم كل تعارض.</p>
                <ul className="space-y-2">
                  {pv.conflicts.map((c) => {
                    const k = ck(c);
                    const opt = (use: 'keep' | 'remove', title: string, s: MergeConflict['keep']) => (
                      <button type="button" onClick={() => setChoice((o) => ({ ...o, [k]: use }))}
                        className={cn('min-w-0 rounded-lg border p-2.5 text-start text-[12.5px]', choice[k] === use ? 'border-black bg-surface ring-1 ring-black' : 'border-line hover:border-ink-faint')}>
                        <span className="text-ink-muted">{title}</span>
                        <b className="num block text-[18px]">{show(s)}</b>
                        <span className="block truncate text-ink-muted">{s.by ?? '—'} · {fmtDateTime(s.at)}</span>
                      </button>
                    );
                    return (
                      <li key={k} className="rounded-xl border border-line p-3">
                        <p className="mb-2 text-[13px] font-medium">{c.subject} · {c.component} <span className="font-normal text-ink-muted">· الفصل {c.term === 1 ? 'الأول' : 'الثاني'}</span></p>
                        <div className="grid grid-cols-2 gap-2">
                          {opt('keep', 'درجة الاسم الصحيح', c.keep)}
                          {opt('remove', 'درجة الاسم المكرر', c.remove)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface p-3 text-[13px] leading-6">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1.5 h-4 w-4 accent-black" />
              <span>أؤكد أن «<b>{remove.name}</b>» (الرقم <bdi dir="ltr" className="num">{remove.number ?? '—'}</bdi>) و«<b>{keep.name}</b>» (الرقم <bdi dir="ltr" className="num">{keep.number ?? '—'}</bdi>) هما نفس الطالب، وسيُحذف الاسم الأول بعد نقل رصده.{unresolved > 0 && <span className="text-rose"> (بقي {unresolved} تعارض)</span>}</span>
            </label>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ الاقتراحات التلقائية
function AutoTab({ branches, grades, onMerge }: { branches: { id: string; name: string }[]; grades: { id: string; name: string }[]; onMerge: (a: MergePerson, b: MergePerson, s: 'a' | 'b') => void }) {
  const [branch, setBranch] = useState(''); const [grade, setGrade] = useState('');
  const [items, setItems] = useState<SimilarItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => setDismissed(readDismissed()), []);

  const load = useCallback(async () => {
    setItems(null); setErr(null);
    const r = await findDuplicateStudents({ branch: branch || undefined, grade: grade || undefined });
    if (!r.ok || !r.data) { setErr(r.message ?? 'تعذّر التحميل'); return; }
    setItems(r.data.items); setTotal(r.data.total);
  }, [branch, grade]);
  useEffect(() => { void load(); }, [load]);

  const dismiss = (a: string, b: string) => {
    const n = new Set(dismissed); n.add(pairKey(a, b)); setDismissed(n);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...n].slice(-500))); } catch { /* اختياري */ }
  };
  const list = (items ?? []).filter((i) => !dismissed.has(pairKey(i.a.id, i.b.id)));

  return (
    <div>
      <div className="card mb-4 grid grid-cols-2 gap-3 p-3 sm:flex sm:items-end">
        <label className="min-w-0 sm:w-52"><span className="mb-1 block text-[12px] text-ink-muted">الفرع</span>
          <select className="field w-full min-w-0" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="min-w-0 sm:w-52"><span className="mb-1 block text-[12px] text-ink-muted">الصف</span>
          <select className="field w-full min-w-0" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">كل الصفوف</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      </div>
      {err && <div className="card"><EmptyState icon={<AlertTriangle className="h-6 w-6" />} title={err} /></div>}
      {!err && !items && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-card" />)}</div>}
      {items && (
        list.length === 0 ? (
          <div className="card"><EmptyState icon={<Users className="h-6 w-6" />} title="لا توجد أسماء متشابهة" hint={`فُحص ${total} طالب نشط. إن كنتِ تعرفين اسمين مكررين لم يظهرا فاستخدمي «بحث يدوي».`} /></div>
        ) : (
          <>
            <p className="num mb-2 text-[12.5px] text-ink-muted">{list.length} احتمال من {total} طالب — اقتراحات فقط، والقرار لكِ</p>
            <ul className="space-y-3">
              {list.map((i) => (
                <li key={pairKey(i.a.id, i.b.id)} className="card p-3.5">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={i.score >= 0.95 ? 'danger' : 'warning'}>{i.reason}</Badge>
                    <span className="text-[12px] text-ink-muted">{i.a.branch}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2"><Person p={i.a} /><Person p={i.b} /></div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button onClick={() => dismiss(i.a.id, i.b.id)} className="text-[12.5px] text-ink-muted hover:text-ink">ليسا نفس الطالب</button>
                    <Button size="sm" onClick={() => onMerge(i.a, i.b, i.suggestKeep)}><GitMerge className="h-4 w-4" />مقارنة ودمج</Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </div>
  );
}

// ------------------------------------------------------------------ بحث يدوي
function Picker({ label, value, onChange, exclude }: { label: string; value: MergePerson | null; onChange: (p: MergePerson | null) => void; exclude?: string }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState<MergePerson[] | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (q.trim().length < 2) { setRows(null); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchStudentsForMerge(q);
      if (n === seq.current) setRows(r.ok ? r.data ?? [] : []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return (
    <div className="min-w-0"><p className="mb-1 text-[12px] text-ink-muted">{label}</p>
      <div className="relative"><Person p={value} /><button aria-label="تغيير" onClick={() => onChange(null)} className="absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-surface text-ink-muted hover:text-ink"><X className="h-4 w-4" /></button></div></div>
  );
  return (
    <div className="min-w-0"><p className="mb-1 text-[12px] text-ink-muted">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3"><Search className="h-4 w-4 shrink-0 text-ink-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الطالب أو رقمه" className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-faint" /></div>
      {q.trim().length >= 2 && (
        <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
          {rows === null ? <li><Skeleton className="h-16" /></li> : rows.filter((r) => r.id !== exclude).length === 0 ? <li className="px-1 py-2 text-[13px] text-ink-muted">لا نتائج</li>
            : rows.filter((r) => r.id !== exclude).map((r) => <li key={r.id}><Person p={r} onClick={() => onChange(r)} /></li>)}
        </ul>
      )}
    </div>
  );
}
function ManualTab({ onMerge }: { onMerge: (a: MergePerson, b: MergePerson, s: 'a' | 'b') => void }) {
  const [a, setA] = useState<MergePerson | null>(null); const [b, setB] = useState<MergePerson | null>(null);
  return (
    <div className="card p-4">
      <p className="mb-3 text-[13px] leading-6 text-ink-muted">ابحثي عن الاسمين (من نفس الفرع والصف) ثم قارني وادمجي.</p>
      <div className="grid gap-4 sm:grid-cols-2"><Picker label="الاسم الأول" value={a} onChange={setA} exclude={b?.id} /><Picker label="الاسم الثاني" value={b} onChange={setB} exclude={a?.id} /></div>
      <div className="mt-4 flex justify-end">
        <Button disabled={!a || !b} onClick={() => a && b && onMerge(a, b, (a.results >= b.results ? 'a' : 'b'))}><GitMerge className="h-4 w-4" />مقارنة ودمج</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ السجل
function HistoryTab({ version }: { version: number }) {
  const { exec, busy } = useAction();
  const [rows, setRows] = useState<MergeLogRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await listStudentMerges(); if (r.ok && r.data) { setRows(r.data); setErr(null); } else setErr(r.message ?? 'تعذّر التحميل'); }, []);
  useEffect(() => { void load(); }, [load, version]);
  if (err) return <div className="card"><EmptyState icon={<AlertTriangle className="h-6 w-6" />} title={err} /></div>;
  if (!rows) return <div className="card space-y-2 p-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (!rows.length) return <div className="card"><EmptyState icon={<GitMerge className="h-6 w-6" />} title="لا توجد عمليات دمج بعد" /></div>;
  return (
    <div className="card overflow-hidden"><ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-[13.5px] leading-6"><b>{r.removed_name}</b>{r.removed_number ? <bdi dir="ltr" className="num mx-1 text-[12px] text-ink-muted">({r.removed_number})</bdi> : null}<span className="text-ink-muted"> ← دُمج في </span> <b>{r.kept_name}</b></p>
            <p className="num text-[12px] text-ink-muted">{r.merged_by_name ?? '—'} · {fmtDateTime(r.merged_at)} · {r.moved} رصد منقول</p>
          </div>
          {r.undone_at ? <Badge tone="neutral">تم التراجع</Badge> : (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void exec(() => undoStudentMerge(r.id), {
              confirm: { title: 'التراجع عن الدمج', message: <>سيعود الاسم «<b>{r.removed_name}</b>» ويعود إليه رصده الذي نُقل. هل تريدين التراجع؟</>, confirmText: 'تراجع', tone: 'danger' },
              success: (d) => `أُعيد الاسم ${d?.restored ?? ''}${d?.skipped ? ` (تعذّر استرجاع ${d.skipped} رصد لتعديله بعد الدمج)` : ''}`, refresh: false,
            }).then(() => load())}><Undo2 className="h-4 w-4" />تراجع</Button>
          )}
        </li>
      ))}
    </ul></div>
  );
}

// ------------------------------------------------------------------ الصفحة
export function DuplicatesClient({ branches, grades }: { branches: { id: string; name: string }[]; grades: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<Tab>('auto');
  const [dlg, setDlg] = useState<{ a: MergePerson; b: MergePerson; s: 'a' | 'b' } | null>(null);
  const [version, setVersion] = useState(0);
  const [autoKey, setAutoKey] = useState(0);
  const tabs = useMemo(() => [['auto', 'اقتراحات تلقائية'], ['manual', 'بحث يدوي'], ['history', 'السجل والتراجع']] as const, []);
  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('whitespace-nowrap rounded-full border px-4 py-2 text-[13.5px]', tab === k ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>{l}</button>
        ))}
      </div>
      {tab === 'auto' && <AutoTab key={autoKey} branches={branches} grades={grades} onMerge={(a, b, s) => setDlg({ a, b, s })} />}
      {tab === 'manual' && <ManualTab onMerge={(a, b, s) => setDlg({ a, b, s })} />}
      {tab === 'history' && <HistoryTab version={version} />}
      {dlg && (
        <MergeDialog a={dlg.a} b={dlg.b} suggest={dlg.s} onClose={() => setDlg(null)}
          onDone={() => { setDlg(null); setVersion((v) => v + 1); setAutoKey((k) => k + 1); }} />
      )}
    </div>
  );
}
