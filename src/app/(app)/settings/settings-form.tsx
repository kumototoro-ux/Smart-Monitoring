'use client';
import { useState } from 'react';
import { DoorOpen, DoorClosed } from 'lucide-react';
import { updateSettings } from '@/app/actions/admin';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import type { Settings } from '@/lib/types';

export function SettingsForm({ initial }: { initial: Settings }) {
  const [v, setV] = useState(initial);
  const { exec, busy } = useAction();
  const set = <K extends keyof Settings>(k: K, val: Settings[K]) => setV((s) => ({ ...s, [k]: val }));

  const save = () => {
    const changes: string[] = [];
    if (v.grading_open !== initial.grading_open) changes.push(v.grading_open ? 'فتح الرصد لكل المعلمات' : 'إغلاق الرصد عن كل المعلمات');
    if (v.current_term !== initial.current_term) changes.push(`تحويل الترم الحالي إلى ${v.current_term === 1 ? 'الأول' : 'الثاني'}`);
    if (v.academic_year !== initial.academic_year) changes.push(`تغيير العام الدراسي إلى ${v.academic_year}`);
    exec(() => updateSettings(v), {
      success: 'تم حفظ الإعدادات',
      confirm: changes.length ? {
        title: 'تأكيد تغيير الإعدادات',
        message: <ul className="list-disc space-y-1 pr-4">{changes.map((c) => <li key={c}>{c}</li>)}</ul>,
        confirmText: 'نعم، احفظ',
      } : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className={cn('card flex items-center gap-4 p-5 transition-colors sm:p-6', v.grading_open ? 'ring-2 ring-mint/30' : '')}>
        <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', v.grading_open ? 'bg-mint-soft text-mint' : 'bg-rose-soft text-rose')}>
          {v.grading_open ? <DoorOpen className="h-6 w-6" /> : <DoorClosed className="h-6 w-6" />}
        </span>
        <div className="flex-1">
          <p className="text-[16px] font-semibold">{v.grading_open ? 'الرصد مفتوح' : 'الرصد مغلق'}</p>
          <p className="text-[13px] text-ink-muted">عند الإغلاق لا تستطيع أي معلمة الرصد أو التعديل.</p>
        </div>
        <Switch checked={v.grading_open} onChange={(x) => set('grading_open', x)} label="فتح الرصد" />
      </div>

      <div className="card grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <Field label="اسم المدرسة" className="sm:col-span-2">
          <Input value={v.school_name} onChange={(e) => set('school_name', e.target.value)} />
        </Field>
        <Field label="العام الدراسي" hint="يظهر في الكشوفات، ويفصل رصد كل عام عن غيره">
          <Input value={v.academic_year} onChange={(e) => set('academic_year', e.target.value)} />
        </Field>
        <Field label="الترم الحالي">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-surface p-1">
            {([1, 2] as const).map((t) => (
              <button key={t} type="button" onClick={() => set('current_term', t)}
                className={cn('rounded-full py-2 text-[14px] transition', v.current_term === t ? 'bg-white font-medium shadow-soft' : 'text-ink-muted')}>
                {t === 1 ? 'الأول' : 'الثاني'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="مدة التعديل بعد الحفظ (أيام)" hint="بعدها يُقفل الكشف وتحتاج المعلمة طلب فتح">
          <Input type="number" min={0} max={60} value={v.edit_window_days} onChange={(e) => set('edit_window_days', Number(e.target.value))} />
        </Field>
        <Field label="مدة الفتح عند قبول الطلب (ساعات)">
          <Input type="number" min={1} max={720} value={v.unlock_hours} onChange={(e) => set('unlock_hours', Number(e.target.value))} />
        </Field>
      </div>
      <Button onClick={save} loading={busy} size="lg">حفظ الإعدادات</Button>
    </div>
  );
}
