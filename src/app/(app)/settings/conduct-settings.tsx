'use client';
import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { saveConductSettings } from '@/app/actions/conduct';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/field';

export function ConductSettings({ enabled, min, migrated }: { enabled: boolean; min: number; migrated: boolean }) {
  const { exec, busy } = useAction();
  const [on, setOn] = useState(enabled);
  const [n, setN] = useState(String(min));
  return (
    <section className="card mt-4 space-y-3 p-5">
      <div className="flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-ink-soft" /><h2 className="text-[15px] font-semibold">المواظبة والسلوك</h2></div>
      {!migrated ? (
        <p className="text-[13px] leading-6 text-ink-muted">لتفعيلها شغّلي ملف <b>0020_conduct.sql</b> في Supabase (SQL Editor) مرة واحدة ثم حدّثي الصفحة.</p>
      ) : (
        <>
          <p className="text-[13px] leading-6 text-ink-muted">تقييم منفصل لكل معلمة في كل شعبة تدرّس فيها. لا يدخل في مجموع الدرجات، ويظهر متوسطه في مربع المجاميع بالإشعار. الصفوف اللفظية (التمهيدي والأول والثاني) خياراتها لفظية، وبقية الصفوف درجة من 100.</p>
          <Switch checked={on} onChange={setOn} label="تفعيل كشف المواظبة والسلوك للمعلمات" />
          <label className="block max-w-xs space-y-1 text-[13px]">أقل عدد مواد مرصودة لتشمل «رصد الجميع بالدرجة الكاملة» الطالب
            <input type="number" min={1} max={30} value={n} onChange={(e) => setN(e.target.value)} className="num h-11 w-full rounded-xl border border-line bg-white px-3" />
          </label>
          <Button loading={busy} onClick={() => exec(() => saveConductSettings(on, Number(n)), { success: 'تم حفظ إعدادات المواظبة والسلوك' })}>حفظ</Button>
        </>
      )}
    </section>
  );
}
