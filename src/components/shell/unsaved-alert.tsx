'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, ChevronLeft, Smartphone, Clock3 } from 'lucide-react';
import { getUnsavedAlerts, type UnsavedAlert, type LocalDraft } from '@/app/actions/grading';
import { Dialog } from '@/components/ui/dialog';
import { cn, fmtDateTime, secLabel } from '@/lib/utils';

const SEEN = 'mirqat:unsaved:seen';

/** مسودات هذا الجهاز لهذه المعلمة (v:2 = كُتبت وفيها تغييرات غير محفوظة) */
function localDrafts(uid: string): LocalDraft[] {
  const out: LocalDraft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(`mirqat:draft:${uid}:`)) continue;
      const [, , , section_id, grade_subject_id, term] = k.split(':');
      const d = JSON.parse(localStorage.getItem(k) ?? 'null') as { v?: number; at?: number } | null;
      if (d?.v === 2 && typeof d.at === 'number' && Date.now() - d.at < 7 * 86400_000) out.push({ section_id, grade_subject_id, term: Number(term), at: d.at });
    }
  } catch { /* التخزين غير متاح */ }
  return out;
}

const sigOf = (items: UnsavedAlert[]) => items.map((i) => `${i.section_id}:${i.grade_subject_id}:${i.kind}`).sort().join('|');
const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* */ } };

/** تنبيه المعلمة بكشوف رصدتها ولم تحفظها: نافذة عند الدخول + شريط دائم حتى تُحفظ */
export function UnsavedAlertHost({ uid }: { uid: string }) {
  const path = usePathname();
  const [items, setItems] = useState<UnsavedAlert[]>([]);
  const [open, setOpen] = useState(false);
  const last = useRef({ at: 0, path: '' });
  const onGrading = path.startsWith('/grading');

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - last.current.at < 60_000) return;
    last.current.at = now;
    try {
      const r = await getUnsavedAlerts(localDrafts(uid));
      if (!r.ok) return;
      const list = r.data ?? [];
      setItems(list);
      if (!list.length) { setOpen(false); return; }
      if (read(SEEN) !== sigOf(list)) setOpen(true); // نافذة مرة لكل جلسة (وتتجدد إن تغيّرت القائمة)
    } catch { /* التنبيه لا يعطّل الموقع */ }
  }, [uid]);

  // عند الدخول وعند التنقل (وبعد الخروج من صفحة الرصد نجدّد فوراً لأنها قد تكون حفظت)
  useEffect(() => {
    if (onGrading) { last.current.path = path; return; }
    const cameFromGrading = last.current.path.startsWith('/grading');
    last.current.path = path;
    void refresh(cameFromGrading);
  }, [path, onGrading, refresh]);

  // عودة المعلمة للتبويب بعد فترة
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - last.current.at > 10 * 60_000 && !location.pathname.startsWith('/grading')) void refresh(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const close = () => { write(SEEN, sigOf(items)); setOpen(false); };
  if (onGrading || !items.length) return null;
  return <UnsavedAlertView items={items} open={open} onOpen={() => setOpen(true)} onClose={close} />;
}

export function UnsavedAlertView({ items, open, onOpen, onClose: close }: { items: UnsavedAlert[]; open: boolean; onOpen: () => void; onClose: () => void }) {
  const n = items.length;
  const noun = n === 1 ? 'كشف واحد' : n === 2 ? 'كشفان' : `${n} كشوف`;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center gap-3 rounded-card border border-[#F2D9A6] bg-gradient-to-l from-[#FFF8E8] to-[#FFFDF6] p-3.5 sm:p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FBE9BF] text-[#9A6A00]"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink">لديكِ {noun} لم يُحفظ بعد</p>
          <p className="text-[12.5px] leading-5 text-ink-muted">درجاتك لا تصل للمشرفة إلا بعد الضغط على «حفظ الكشف».</p>
        </div>
        <button onClick={onOpen} className="shrink-0 rounded-full bg-black px-4 py-2 text-[13px] font-medium text-white transition hover:bg-ink">عرضها</button>
      </motion.div>

      <Dialog open={open} onClose={close} title="لديكِ كشوف لم تُحفظ بعد" size="md"
        description="رصدتِ هذه الدرجات لكنها لم تُحفظ نهائياً، فلن تظهر للمشرفة قبل الحفظ."
        footer={<>
          <Link data-autofocus href={`/grading?section=${items[0].section_id}&subject=${items[0].grade_subject_id}`} onClick={close}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-6 text-[14.5px] font-medium text-white transition hover:bg-ink">
            {n === 1 ? 'إكمال الحفظ الآن' : 'فتح أول كشف'}<ChevronLeft className="h-4 w-4" />
          </Link>
          <button onClick={close} className="h-11 rounded-full px-5 text-[14px] text-ink-muted transition hover:bg-surface hover:text-ink">ذكّريني لاحقاً</button>
        </>}>
        <ul className="space-y-2.5 pb-1">
          <AnimatePresence initial>
            {items.map((it, i) => (
              <motion.li key={it.section_id + it.grade_subject_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link href={`/grading?section=${it.section_id}&subject=${it.grade_subject_id}`} onClick={close}
                  className="group flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3.5 transition hover:border-ink-faint hover:bg-white">
                  <span className={cn('h-10 w-1.5 shrink-0 rounded-full', it.kind === 'unsaved' ? 'bg-rose' : 'bg-[#E0A21A]')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14.5px] font-semibold text-ink">{it.subject_name}</p>
                      <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-medium', it.kind === 'unsaved' ? 'bg-rose-soft text-rose' : 'bg-[#FBEFD0] text-[#8A5F00]')}>
                        {it.kind === 'unsaved' ? 'لم يُحفظ' : 'تعديل لم يُحفظ'}
                      </span>
                    </div>
                    <p className="truncate text-[12.5px] text-ink-muted">{it.grade_name} {secLabel(it.section_name)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-faint">
                      {it.filled != null && it.total ? <span className="num">رصدتِ {it.filled} من {it.total} خانة</span> : null}
                      {it.last_event && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{fmtDateTime(it.last_event)}</span>}
                      {it.on_device && <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" />مسودة محفوظة على هذا الجهاز</span>}
                    </p>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-ink-faint transition group-hover:-translate-x-0.5 group-hover:text-ink" />
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Dialog>
    </>
  );
}
