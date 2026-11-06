'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, Copy, Check } from 'lucide-react';
import { loadSheet, type SheetData } from '@/app/actions/grading';
import { SheetEditor } from '@/components/sheet/sheet-editor';
import { useToast } from '@/components/ui/toast';

/** فتح كشف المعلمة (المحفوظ فقط) للاطلاع — للقراءة فقط */
export function ViewSheetButton({ sectionId, gradeSubjectId, label = 'عرض الكشف', disabled }: {
  sectionId: string; gradeSubjectId: string; label?: string; disabled?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetData | null>(null);

  const open = async () => {
    setBusy(true);
    try {
      const r = await loadSheet(sectionId, gradeSubjectId);
      if (r.ok && r.data) setSheet(r.data); else toast.error(r.message ?? 'تعذّر فتح الكشف');
    } catch { toast.error('تعذّر الاتصال بالخادم'); }
    setBusy(false);
  };

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [sheet]);

  return (
    <>
      <button type="button" onClick={open} disabled={busy || disabled}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-ink-soft transition hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}{label}
      </button>
      {sheet && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-surface" dir="rtl">
          <div className="mx-auto max-w-6xl p-3 sm:p-6">
            <p className="mb-3 rounded-card bg-peri-soft px-4 py-2.5 text-[13px] text-peri-deep">عرض للاطلاع فقط — يظهر ما حُفظ في الموقع. الدرجات التي لم تُحفظ بعد لا تصل للموقع.</p>
            <SheetEditor initial={sheet} scope="all" role="supervisor" onBack={() => setSheet(null)} />
          </div>
        </div>, document.body)}
    </>
  );
}

/** نسخ نص تذكير جاهز للإرسال للمعلمة */
export function CopyReminderButton({ text }: { text: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true); toast.success('تم نسخ رسالة التذكير'); setTimeout(() => setDone(false), 2500);
    } catch { toast.error('تعذّر النسخ'); }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-ink-soft transition hover:border-ink-faint hover:text-ink">
      {done ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}نسخ تذكير
    </button>
  );
}
