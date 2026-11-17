'use client';
import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAction } from '@/lib/use-action';
import { moveAcademicYear } from '@/app/actions/years';

/** يقترح العام التالي: 1447هـ ← 1448هـ */
const next = (y: string) => y.replace(/\d+/, (n) => String(Number(n) + 1));

export function YearMove({ years, current, gradingOpen }: { years: string[]; current: string; gradingOpen: boolean }) {
  const { exec, busy } = useAction();
  const [from, setFrom] = useState(years.includes(current) ? current : years[0] ?? '');
  const [to, setTo] = useState(next(years.includes(current) ? current : years[0] ?? ''));
  const [makeCurrent, setMakeCurrent] = useState(true);

  const go = () => exec(() => moveAcademicYear(from, to, makeCurrent), {
    confirm: {
      title: 'تأكيد نقل العام الدراسي',
      message: <div className="space-y-2">
        <p>سيُنقل كل ما سُجّل في <b>{from}</b> (الدرجات والكشوف والاستثناءات والمسودات وسجل الإشعارات) إلى <b>{to}</b>{makeCurrent ? <>، ويصبح <b>{to}</b> هو العام الحالي في الإعدادات</> : ''}.</p>
        <p className="text-ink-muted">لا يُحذف شيء ولا تتغير أي درجة. للتراجع انقلي من {to} إلى {from} بنفس الأداة. نزّلي نسخة احتياطية قبل المتابعة.</p>
      </div>,
      confirmText: 'نقل', tone: 'danger',
    },
    success: 'تم نقل العام',
  });

  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <div className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-ink-soft" /><h2 className="text-[15px] font-semibold">نقل درجات عام إلى عام</h2></div>
      <p className="text-[13px] leading-6 text-ink-muted">للتصحيح عند الخطأ في العام، أو لأرشفة عام منتهٍ. يرفض النقل إن وُجدت بيانات في العام الهدف، ولا يعمل إلا والرصد مغلق.</p>
      {gradingOpen && <p className="rounded-xl bg-amber-soft p-3 text-[13px]">الرصد مفتوح الآن. أغلقيه من الإعدادات العامة قبل النقل حتى لا يحفظ أحد أثناءه.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-[13px]">نقل من
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="num h-11 w-full rounded-xl border border-line bg-white px-3">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[13px]">إلى عام
          <input value={to} onChange={(e) => setTo(e.target.value)} maxLength={20} className="num h-11 w-full rounded-xl border border-line bg-white px-3" />
        </label>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} className="h-4 w-4 accent-black" />
        اجعل العام الهدف هو العام الحالي في الإعدادات
      </label>
      <Button loading={busy} disabled={!from || !to.trim() || from === to.trim()} onClick={go}>نقل</Button>
    </section>
  );
}
