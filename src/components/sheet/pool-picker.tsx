'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, Users, CheckSquare, Square } from 'lucide-react';
import { loadPool, claimStudents, type PoolStudent } from '@/app/actions/grading';
import { useAction } from '@/lib/use-action';
import { useToast } from '@/components/ui/toast';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty';
import { normAr } from '@/lib/arabic';
import { cn } from '@/lib/utils';

/** اختيار طلاب الشعبة من طلاب الصف الذين ليس لهم شعبة */
export function PoolPicker({ open, onClose, sectionId, sectionName, gradeName, onClaimed }: {
  open: boolean; onClose: () => void; sectionId: string; sectionName: string; gradeName: string; onClaimed: () => void;
}) {
  const [list, setList] = useState<PoolStudent[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { exec, busy } = useAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setList(null); setSel(new Set()); setQ('');
    void loadPool(sectionId).then((r) => {
      if (r.ok && r.data) setList(r.data);
      else { toast.error(r.message ?? 'تعذّر تحميل الطلاب'); setList([]); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sectionId]);

  const shown = useMemo(() => {
    const k = normAr(q);
    return (list ?? []).filter((s) => !k || normAr(s.full_name).includes(k) || (s.student_number ?? '').includes(q) || (s.national_id ?? '').includes(q));
  }, [list, q]);
  const allShown = shown.length > 0 && shown.every((s) => sel.has(s.id));

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel((p) => {
    const n = new Set(p);
    if (allShown) shown.forEach((s) => n.delete(s.id)); else shown.forEach((s) => n.add(s.id));
    return n;
  });

  const claim = async () => {
    const ids = [...sel];
    const r = await exec(() => claimStudents(sectionId, ids), {
      confirm: {
        title: 'ضم الطلاب لشعبتك',
        message: <>سيُنقل <b>{ids.length}</b> طالب إلى {gradeName} شعبة {sectionName}، ويختفون من قائمة باقي الشعب. يمكنك إرجاع أي طالب لاحقاً.</>,
        confirmText: 'ضم الطلاب',
      },
      refresh: false,
    });
    if (r?.ok && r.data) {
      if (r.data.skipped) toast.warning(`تم ضم ${r.data.claimed} طالب`, `${r.data.skipped} طالب سبقتك معلمة أخرى بضمهم لشعبتها.`);
      else toast.success(`تم ضم ${r.data.claimed} طالب لشعبتك`);
      onClaimed(); onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="اختيار طلاب شعبتي"
      description={<>طلاب {gradeName} في فرعك الذين لم تُحدد شعبتهم بعد. حدّدي طلاب شعبة {sectionName} فقط.</>}
      footer={<>
        <Button loading={busy} disabled={!sel.size} onClick={claim}><Users className="h-4 w-4" />ضم {sel.size || ''} طالب لشعبتي</Button>
        <Button variant="secondary" onClick={onClose}>إغلاق</Button>
      </>}>
      {list === null ? (
        <div className="space-y-2 pb-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="لا يوجد طلاب بدون شعبة" hint="كل طلاب هذا الصف موزّعون على الشعب." />
      ) : (
        <div className="pb-2">
          <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-2 bg-white px-1 pb-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحثي بالاسم أو رقم الطالب" className="pr-10" />
            </div>
            <button onClick={toggleAll} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] text-ink-soft hover:border-ink-faint">
              {allShown ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}{allShown ? 'إلغاء' : 'تحديد'} الظاهر
            </button>
          </div>
          <p className="num mb-2 text-[12.5px] text-ink-muted">{shown.length} طالب{sel.size ? ` · تم تحديد ${sel.size}` : ''}</p>
          <ul className="space-y-1">
            {shown.map((s) => {
              const on = sel.has(s.id);
              return (
                <li key={s.id}>
                  <button onClick={() => toggle(s.id)}
                    className={cn('flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-right transition',
                      on ? 'border-black bg-black/[.03]' : 'border-transparent hover:bg-surface')}>
                    <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition', on ? 'border-black bg-black text-white' : 'border-ink-faint')}>
                      {on && <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.5l2.5 2.5 4.5-5" /></svg>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{s.full_name}</span>
                      {(s.student_number || s.national_id) && (
                        <span className="num block text-[12px] text-ink-muted" dir="ltr" style={{ textAlign: 'right' }}>{s.student_number ?? s.national_id}</span>
                      )}
                    </span>
                    {s.gender && <span className="text-[12px] text-ink-muted">{s.gender === 'male' ? 'طالب' : 'طالبة'}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
