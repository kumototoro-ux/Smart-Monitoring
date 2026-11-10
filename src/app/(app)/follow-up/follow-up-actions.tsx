'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Eye, Loader2, Copy, Check, FileClock, Trash2 } from 'lucide-react';
import { loadSheet, type SheetData } from '@/app/actions/grading';
import { SheetEditor, type DraftPreload } from '@/components/sheet/sheet-editor';
import { loadTeacherDraft, deleteTeacherDraft } from '@/app/actions/drafts';
import { useConfirm } from '@/components/ui/confirm';
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

type DKey = { teacherId: string; sectionId: string; gradeSubjectId: string; term: 1 | 2 };

/** الأدمن: فتح مسودة المعلمة داخل الكشف لمراجعتها واعتمادها نيابةً عنها (يُسجَّل في السجل) */
export function OpenDraftButton({ teacherId, sectionId, gradeSubjectId, term }: DKey) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ sheet: SheetData; pre: DraftPreload } | null>(null);

  const open = async () => {
    setBusy(true);
    try {
      const [d, s] = await Promise.all([loadTeacherDraft({ teacherId, sectionId, gradeSubjectId, term }), loadSheet(sectionId, gradeSubjectId, term)]);
      if (!d.ok || !d.data) toast.error(d.message ?? 'تعذّر فتح المسودة');
      else if (!s.ok || !s.data) toast.error(s.message ?? 'تعذّر فتح الكشف');
      else setState({ sheet: s.data, pre: { values: d.data.values, teacherId, teacherName: d.data.teacherName, updatedAt: d.data.updatedAt, deviceLabel: d.data.deviceLabel } });
    } catch { toast.error('تعذّر الاتصال بالخادم'); }
    setBusy(false);
  };

  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [state]);

  return (
    <>
      <button type="button" onClick={open} disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#BFE3D0] bg-[#F1FAF5] px-3 py-1.5 text-[12.5px] text-[#2E7D5B] transition hover:border-[#8CCBAE] disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileClock className="h-3.5 w-3.5" />}فتح المسودة
      </button>
      {state && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-surface" dir="rtl">
          <div className="mx-auto max-w-6xl p-3 sm:p-6">
            <SheetEditor initial={state.sheet} scope="all" role="admin" preload={state.pre}
              onBack={() => { setState(null); router.refresh(); }} />
          </div>
        </div>, document.body)}
    </>
  );
}

export function DeleteDraftButton({ teacherId, sectionId, gradeSubjectId, term, teacher }: DKey & { teacher: string }) {
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!(await confirm({ title: 'حذف المسودة', message: `ستُحذف مسودة ${teacher} من الحساب نهائياً ولن تستطيع استعادتها. الدرجات المحفوظة رسمياً لا تتأثر.`, confirmText: 'حذف المسودة', tone: 'danger' }))) return;
    setBusy(true);
    const r = await deleteTeacherDraft({ teacherId, sectionId, gradeSubjectId, term });
    setBusy(false);
    if (r.ok) { toast.success('تم حذف المسودة'); router.refresh(); } else toast.error(r.message ?? 'تعذّر الحذف');
  };
  return (
    <button type="button" onClick={del} disabled={busy} aria-label="حذف المسودة" title="حذف المسودة"
      className="inline-flex items-center rounded-full border border-line bg-white p-2 text-ink-faint transition hover:border-rose hover:text-rose disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
