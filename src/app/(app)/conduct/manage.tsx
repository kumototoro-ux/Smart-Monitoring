'use client';
import { useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, HeartHandshake, Pencil, Save, Search, Sparkles, Undo2, Users, TriangleAlert } from 'lucide-react';
import { loadConductManage, saveConductManage, type ConductManageStudent } from '@/app/actions/conduct';
import { useAction } from '@/lib/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Bar, Ring } from '@/components/ui/progress';
import { StatTile } from '@/components/ui/tile';
import { useToast } from '@/components/ui/toast';
import { cn, secLabel } from '@/lib/utils';

export interface ManageSection { id: string; name: string; grade: string; order: number; branch: string; branch_id: string }
export interface SectionStat { students: number; done: number; manual: number; low: number }
type Val = number | null;
interface Row extends ConductManageStudent { att: Val; beh: Val; o_att: Val; o_beh: Val }
interface Meta { section_id: string; section_name: string; grade_name: string; mode: 'numeric' | 'verbal'; term: 1 | 2; year: string; min_subjects: number }

const ATT = [{ v: 100, ar: 'منتظم' }, { v: 0, ar: 'غير منتظم' }];
const BEH = [{ v: 100, ar: 'ملتزم' }, { v: 0, ar: 'يحتاج تحسين' }];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const avg = (xs: Val[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
const tone = (v: Val) => (v == null ? 'text-ink' : v < 50 ? 'text-rose' : v >= 90 ? 'text-mint' : 'text-ink');

export function ConductManage({ sections, stats, enabled, migrated }: {
  sections: ManageSection[]; stats: Record<string, SectionStat> | null; enabled: boolean; migrated: boolean;
}) {
  const toast = useToast();
  const { exec, busy } = useAction();
  const [opening, setOpening] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [branch, setBranch] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sq, setSq] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'low' | 'manual'>('all');
  const tableRef = useRef<HTMLDivElement>(null);

  const branches = useMemo(() => [...new Map(sections.map((s) => [s.branch_id, s.branch])).entries()], [sections]);

  if (!migrated) return <div className="card p-5 text-[13.5px] leading-7">هذه الميزة لم تُفعَّل بعد في النظام. شغّلي ملف التحديث الأخير في Supabase.</div>;
  if (!enabled) return <div className="card"><EmptyState icon={<HeartHandshake className="h-6 w-6" />} title="كشف المواظبة والسلوك غير مفعّل بعد" hint="فعّليه من الإعدادات العامة ← المواظبة والسلوك." /></div>;
  if (!sections.length) return <div className="card"><EmptyState icon={<HeartHandshake className="h-6 w-6" />} title="لا توجد شعب" /></div>;

  const open = async (id: string) => {
    if (dirty && !window.confirm('توجد تعديلات غير محفوظة، هل تريدين الانتقال؟')) return;
    setOpening(id);
    const r = await loadConductManage(id);
    setOpening(null);
    if (!r.ok || !r.data) { toast.error(r.message ?? 'تعذّر فتح الشعبة'); return; }
    const d = r.data;
    setMeta(d.meta);
    setRows(d.students.map((s) => ({ ...s, att: s.attendance, beh: s.behavior, o_att: s.attendance, o_beh: s.behavior })));
    setDirty(false); setSq(''); setFilter('all');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => { if (!dirty || window.confirm('توجد تعديلات غير محفوظة، هل تريدين الخروج؟')) { setMeta(null); setRows([]); setDirty(false); } };

  // ------------------------------------------------------------------ اختيار الشعبة
  if (!meta) {
    const list = sections.filter((s) => (branch === 'all' || s.branch_id === branch)
      && (!q.trim() || `${s.grade} ${secLabel(s.name)} ${s.branch}`.includes(q.trim())));
    const scope = sections.filter((s) => branch === 'all' || s.branch_id === branch);
    const sum = scope.reduce((a, s) => { const t = stats?.[s.id]; return t ? { students: a.students + t.students, done: a.done + t.done, manual: a.manual + t.manual, low: a.low + t.low } : a; }, { students: 0, done: 0, manual: 0, low: 0 });
    const byGrade = new Map<string, ManageSection[]>();
    for (const s of list) byGrade.set(`${s.branch_id}|${s.grade}`, [...(byGrade.get(`${s.branch_id}|${s.grade}`) ?? []), s]);

    return (
      <div className="space-y-5">
        {stats && (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile tone="peri" icon={<Users className="h-5 w-5" />} label="الطلاب" value={sum.students} />
            <StatTile tone="lilac" icon={<CheckCircle2 className="h-5 w-5" />} label="اكتمل رصدهم" value={`${pct(sum.done, sum.students)}%`} unit={`${sum.done} من ${sum.students}`} />
            <StatTile tone="rose" icon={<Pencil className="h-5 w-5" />} label="تعديلات يدوية" value={sum.manual} unit={sum.low ? `· ${sum.low} أقل من 50` : undefined} />
          </div>
        )}

        <div className="card flex flex-wrap items-center gap-3 p-3">
          {branches.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {[['all', 'كل الفروع'] as const, ...branches.map(([id, name]) => [id, name] as const)].map(([id, name]) => (
                <button key={id} type="button" onClick={() => setBranch(id)}
                  className={cn('h-9 rounded-full border px-4 text-[13px] transition', branch === id ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>{name}</button>
              ))}
            </div>
          )}
          <label className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحثي عن صف أو شعبة…"
              className="h-10 w-full rounded-xl border border-line bg-surface ps-9 pe-3 text-[13.5px] outline-none focus:border-peri focus:bg-white" />
          </label>
        </div>

        {!list.length && <div className="card"><EmptyState icon={<Search className="h-6 w-6" />} title="لا نتائج مطابقة" /></div>}

        {[...byGrade.entries()].map(([key, secs]) => (
          <section key={key} className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-[14.5px] font-semibold">
              {secs[0].grade}
              {(branch === 'all' && branches.length > 1) && <span className="text-[12.5px] font-normal text-ink-muted">· {secs[0].branch}</span>}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {secs.map((s) => {
                const t = stats?.[s.id];
                const p = t ? pct(t.done, t.students) : 0;
                return (
                  <button key={s.id} type="button" disabled={!!opening} onClick={() => open(s.id)}
                    className={cn('card group relative flex flex-col gap-3 p-4 text-start transition hover:-translate-y-0.5 hover:shadow-pop disabled:opacity-60', opening === s.id && 'ring-2 ring-peri')}>
                    <div className="flex items-center gap-3">
                      {t ? <Ring value={p} size={44} /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-peri-soft text-peri-deep"><HeartHandshake className="h-5 w-5" /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{secLabel(s.name)}</p>
                        <p className="text-[12.5px] text-ink-muted">{t ? <><span className="num">{t.students}</span> طالب</> : 'افتحي للتعديل'}</p>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-ink-faint transition group-hover:-translate-x-0.5 group-hover:text-ink" />
                    </div>
                    {t && (
                      <>
                        <div className="flex items-center gap-2">
                          <Bar value={p} className="flex-1" />
                          <span className="num w-10 text-end text-[12px] text-ink-muted">{p}%</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {t.done < t.students && <Badge tone="warning">{t.students - t.done} بلا رصد</Badge>}
                          {t.low > 0 && <Badge tone="danger">{t.low} أقل من 50</Badge>}
                          {t.manual > 0 && <Badge tone="info">{t.manual} تعديل يدوي</Badge>}
                          {t.done === t.students && t.low === 0 && <Badge tone="success">مكتمل</Badge>}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  // ------------------------------------------------------------------ محرر الشعبة
  const verbal = meta.mode === 'verbal';
  const set = (id: string, k: 'att' | 'beh', v: Val) => { setRows((p) => p.map((r) => (r.id === id ? { ...r, [k]: v } : r))); setDirty(true); };
  const clamp = (t: string): Val => { if (t.trim() === '') return null; const n = Number(t); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 100) / 100)) : null; };
  const isDirty = (r: Row) => r.att !== r.o_att || r.beh !== r.o_beh;
  const isLow = (r: Row) => (r.att != null && r.att < 50) || (r.beh != null && r.beh < 50);
  const isMissing = (r: Row) => r.att == null || r.beh == null;

  const changed = rows.filter(isDirty);
  const done = rows.filter((r) => !isMissing(r)).length;
  const counts = { all: rows.length, missing: rows.filter(isMissing).length, low: rows.filter(isLow).length, manual: rows.filter((r) => r.manual || isDirty(r)).length };
  const shown = rows.filter((r) => {
    if (sq.trim() && !`${r.name} ${r.number ?? ''}`.includes(sq.trim())) return false;
    return filter === 'all' ? true : filter === 'missing' ? isMissing(r) : filter === 'low' ? isLow(r) : (r.manual || isDirty(r));
  });
  const p = pct(done, rows.length);

  const fillEmpty = () => {
    const n = rows.filter(isMissing).length;
    if (!n) { toast.error('لا يوجد طلاب بلا رصد'); return; }
    setRows((x) => x.map((r) => (isMissing(r) ? { ...r, att: r.att ?? 100, beh: r.beh ?? 100 } : r)));
    setDirty(true);
    toast.success(`عُبّئت الدرجة الكاملة لـ ${n} طالب. راجعيها ثم اضغطي «حفظ التعديلات»`);
  };
  const discard = () => { setRows((x) => x.map((r) => ({ ...r, att: r.o_att, beh: r.o_beh }))); setDirty(false); };

  // يُرسل فقط ما تغيّر؛ البند الذي لم يُلمس يبقى كما هو، والبند الممسوح يعود لرصد المعلمة
  const save = () => exec(() => saveConductManage(meta.section_id, changed.map((r) => ({
    student_id: r.id,
    attendance: r.att !== r.o_att ? r.att : r.m_att,
    behavior: r.beh !== r.o_beh ? r.beh : r.m_beh,
  }))), {
    confirm: { title: 'حفظ التعديلات', message: <>سيُعدَّل رصد <b>{changed.length}</b> طالب في <b>{meta.grade_name}</b> — <b>{secLabel(meta.section_name)}</b>، ويظهر في إشعاراتهم مباشرة دون المساس برصد المعلمات.</>, confirmText: 'حفظ' },
    success: 'تم حفظ التعديلات', refresh: false,
  }).then(async (r) => {
    if (!r?.ok) return;
    setDirty(false);
    const f = await loadConductManage(meta.section_id);
    if (f.ok && f.data) setRows(f.data.students.map((s) => ({ ...s, att: s.attendance, beh: s.behavior, o_att: s.attendance, o_beh: s.behavior })));
  });

  const jump = (e: React.KeyboardEvent<HTMLInputElement>, col: 'att' | 'beh', i: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = tableRef.current?.querySelector<HTMLInputElement>(`input[data-col="${col}"][data-i="${i + 1}"]`);
    next?.focus(); next?.select();
  };

  const CHIPS: { k: typeof filter; label: string; n: number; tone?: string }[] = [
    { k: 'all', label: 'الكل', n: counts.all }, { k: 'missing', label: 'بلا رصد', n: counts.missing },
    { k: 'low', label: 'أقل من 50', n: counts.low }, { k: 'manual', label: 'تعديل يدوي', n: counts.manual },
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <Button variant="secondary" size="icon" onClick={back} aria-label="رجوع إلى الشعب"><ArrowRight className="h-4 w-4" /></Button>
        <Ring value={p} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{meta.grade_name} — {secLabel(meta.section_name)}</p>
          <p className="text-[12.5px] text-ink-muted">الفصل {meta.term === 1 ? 'الأول' : 'الثاني'} · {meta.year} · {verbal ? 'تقييم لفظي' : 'درجة من 100 لكل بند'}</p>
        </div>
        <div className="flex gap-5 text-center">
          <div><p className="num text-[18px] font-semibold">{done}<span className="text-[13px] font-normal text-ink-muted">/{rows.length}</span></p><p className="text-[11.5px] text-ink-muted">اكتمل رصدهم</p></div>
          {!verbal && <div><p className={cn('num text-[18px] font-semibold', tone(avg(rows.map((r) => r.att))))}>{avg(rows.map((r) => r.att)) ?? '—'}</p><p className="text-[11.5px] text-ink-muted">متوسط المواظبة</p></div>}
          {!verbal && <div><p className={cn('num text-[18px] font-semibold', tone(avg(rows.map((r) => r.beh))))}>{avg(rows.map((r) => r.beh)) ?? '—'}</p><p className="text-[11.5px] text-ink-muted">متوسط السلوك</p></div>}
        </div>
      </div>

      <div className="rounded-2xl bg-peri-soft px-4 py-3 text-[12.5px] leading-6 text-peri-deep">
        تعديلك هنا <b>يغلب رصد المعلمات</b> في إشعار الطالب، ولا يغيّر كشوف المعلمات، ولا يتأثر بقفل التعديل. امسحي الخانة واحفظي لتعود لرصد المعلمة.
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <label className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="ابحثي باسم الطالب أو رقمه…"
            className="h-10 w-full rounded-xl border border-line bg-surface ps-9 pe-3 text-[13.5px] outline-none focus:border-peri focus:bg-white" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.k} type="button" onClick={() => setFilter(c.k)}
              className={cn('h-9 rounded-full border px-3.5 text-[12.5px] transition', filter === c.k ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>
              {c.label} <span className="num opacity-70">{c.n}</span>
            </button>
          ))}
        </div>
        <Button variant="soft" size="sm" onClick={fillEmpty}><Sparkles className="h-4 w-4" />تعبئة الفارغ بالكامل</Button>
      </div>

      <div ref={tableRef} className="card divide-y divide-line overflow-hidden">
        <div className="hidden grid-cols-[1fr_minmax(0,220px)_minmax(0,220px)] gap-3 bg-surface px-4 py-2 text-[12px] font-medium text-ink-muted sm:grid">
          <span>الطالب</span><span className="text-center">{verbal ? 'المواظبة' : 'المواظبة (من 100)'}</span><span className="text-center">{verbal ? 'السلوك' : 'السلوك (من 100)'}</span>
        </div>
        {shown.map((r) => {
          const i = rows.indexOf(r);
          const d = isDirty(r);
          return (
            <div key={r.id} className={cn('grid gap-2 px-4 py-3 sm:grid-cols-[1fr_minmax(0,220px)_minmax(0,220px)] sm:items-center sm:gap-3', d && 'bg-peri-soft/50')}>
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold', d ? 'bg-peri text-white' : 'bg-surface text-ink-soft')}>{r.name.trim().charAt(0)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{r.name}</p>
                  <p className="num flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-muted">
                    {r.number && <span>{r.number}</span>}<span>{r.graded} مادة</span>
                    {(r.manual || d) && <span className="font-medium text-peri-deep">تعديل يدوي</span>}
                    {isLow(r) && <span className="inline-flex items-center gap-0.5 font-medium text-rose"><TriangleAlert className="h-3 w-3" />منخفض</span>}
                  </p>
                </div>
              </div>
              {(['att', 'beh'] as const).map((k) => {
                const t = k === 'att' ? r.t_att : r.t_beh;
                return (
                  <div key={k} className="flex items-center justify-between gap-2 sm:flex-col sm:justify-center sm:gap-1">
                    <span className="text-[12px] text-ink-muted sm:hidden">{k === 'att' ? 'المواظبة' : 'السلوك'}</span>
                    {verbal ? (
                      <div className="inline-flex flex-wrap justify-end gap-1 sm:justify-center">
                        {(k === 'att' ? ATT : BEH).map((o) => (
                          <button key={o.v} type="button" onClick={() => set(r.id, k, r[k] === o.v ? null : o.v)}
                            className={cn('rounded-full border px-3 py-1 text-[12px] transition', r[k] === o.v ? (o.v === 100 ? 'border-mint bg-mint-soft text-mint' : 'border-rose bg-rose-soft text-rose') : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>{o.ar}</button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input type="number" inputMode="decimal" min={0} max={100} step="any" value={r[k] ?? ''} data-col={k} data-i={i}
                          onChange={(e) => set(r.id, k, clamp(e.target.value))} onKeyDown={(e) => jump(e, k, i)} onFocus={(e) => e.target.select()}
                          className={cn('num h-10 w-20 rounded-xl border bg-white px-2 text-center text-[14px] font-medium outline-none focus:border-peri', tone(r[k]), r[k] !== (k === 'att' ? r.o_att : r.o_beh) ? 'border-peri' : 'border-line')} />
                        <button type="button" onClick={() => set(r.id, k, 100)} title="الدرجة الكاملة"
                          className="num h-10 rounded-xl border border-line bg-surface px-2.5 text-[12px] text-ink-soft transition hover:border-mint hover:bg-mint-soft hover:text-mint">100</button>
                      </div>
                    )}
                    {t != null && <span className="num text-[11px] text-ink-muted">المعلمات: {t}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!shown.length && <div className="px-4 py-10 text-center text-[13.5px] text-ink-muted">لا طلاب مطابقون</div>}
      </div>

      <div className="fixed inset-x-3 bottom-3 z-20 mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-white p-3 shadow-pop ring-1 ring-line sm:bottom-5">
        <p className="flex-1 text-[13px] text-ink-soft">
          {changed.length ? <><span className="num font-semibold text-ink">{changed.length}</span> طالب بتعديلات غير محفوظة</> : 'لا توجد تعديلات'}
        </p>
        {changed.length > 0 && <Button variant="ghost" onClick={discard} disabled={busy}><Undo2 className="h-4 w-4" />تراجع</Button>}
        <Button size="lg" loading={busy} disabled={!changed.length} onClick={save}><Save className="h-4 w-4" />حفظ التعديلات</Button>
      </div>
    </div>
  );
}
