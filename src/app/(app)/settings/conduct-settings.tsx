'use client';
import { useCallback, useEffect, useState } from 'react';
import { HeartHandshake, Sparkles, Eraser } from 'lucide-react';
import { saveConductSettings, getConductStats, conductFillAll, conductClearFill, type ConductBranchStat } from '@/app/actions/conduct';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/field';

export function ConductSettings({ enabled, min, migrated }: { enabled: boolean; min: number; migrated: boolean }) {
  const { exec, busy } = useAction();
  const [on, setOn] = useState(enabled);
  const [n, setN] = useState(String(min));
  const [stats, setStats] = useState<ConductBranchStat[] | null>(null);
  const [branch, setBranch] = useState('');
  const load = useCallback(async () => { const r = await getConductStats(); setStats(r.ok && r.data ? r.data : null); }, []);
  useEffect(() => { if (migrated && enabled) void load(); }, [migrated, enabled, load]);
  const target = branch ? stats?.find((s) => s.branch_id === branch)?.branch ?? 'الفرع المحدد' : 'كل الفروع';

  return (
    <section className="card mt-4 space-y-3 p-5">
      <div className="flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-ink-soft" /><h2 className="text-[15px] font-semibold">المواظبة والسلوك</h2></div>
      {!migrated ? (
        <p className="text-[13px] leading-6 text-ink-muted">لتفعيلها شغّلي ملف <b>0020_conduct.sql</b> في Supabase (SQL Editor) مرة واحدة ثم حدّثي الصفحة.</p>
      ) : (
        <>
          <p className="text-[13px] leading-6 text-ink-muted">تقييم منفصل لكل معلمة في كل شعبة تدرّس فيها. لا يدخل في مجموع الدرجات، ويظهر متوسطه في مربع المجاميع بالإشعار. الصفوف اللفظية (التمهيدي والأول والثاني) خياراتها لفظية، وبقية الصفوف درجة من 100.</p>
          <Switch checked={on} onChange={setOn} label="تفعيل كشف المواظبة والسلوك للمعلمات" />
          <label className="block max-w-xs space-y-1 text-[13px]">أقل عدد مواد مرصودة لتشمل «رصد الكل بالدرجة الكاملة» الطالب
            <input type="number" min={1} max={30} value={n} onChange={(e) => setN(e.target.value)} className="num h-11 w-full rounded-xl border border-line bg-white px-3" />
          </label>
          <Button loading={busy} onClick={() => exec(() => saveConductSettings(on, Number(n)), { success: 'تم حفظ إعدادات المواظبة والسلوك', refresh: false }).then(() => load())}>حفظ</Button>

          {enabled && (
            <div className="space-y-3 border-t border-line pt-4">
              <h3 className="text-[14px] font-semibold">رصد الأدمن للكل</h3>
              <p className="text-[13px] leading-6 text-ink-muted">بدل أن ترصد المعلمات: يعطي الدرجة الكاملة لكل طالب رُصدت له درجات في <b className="num">{min}</b> مواد فأكثر. إن رصدت معلمة طالبًا لاحقًا اعتُمد رصدها وتُجوهل رصد الأدمن له. ويمكن حذف رصد الأدمن بأمر واحد.</p>
              {stats && (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[420px] text-[13px]">
                    <thead><tr className="bg-surface text-ink-muted"><th className="px-3 py-2 text-start font-medium">الفرع</th><th className="px-3 py-2 text-center font-medium">الطلاب</th><th className="px-3 py-2 text-center font-medium">مؤهلون</th><th className="px-3 py-2 text-center font-medium">رصدته المعلمات</th><th className="px-3 py-2 text-center font-medium">رصد الأدمن</th></tr></thead>
                    <tbody className="divide-y divide-line">{stats.map((s) => (
                      <tr key={s.branch_id}><td className="px-3 py-2">{s.branch}</td><td className="num px-3 py-2 text-center">{s.students}</td><td className="num px-3 py-2 text-center">{s.eligible}</td><td className="num px-3 py-2 text-center">{s.teacher}</td><td className="num px-3 py-2 text-center">{s.admin}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <label className="block max-w-xs space-y-1 text-[13px]">الفرع
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-white px-3">
                  <option value="">كل الفروع</option>
                  {(stats ?? []).map((s) => <option key={s.branch_id} value={s.branch_id}>{s.branch}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button loading={busy} onClick={() => exec(() => conductFillAll(branch || null), {
                  confirm: { title: 'رصد المواظبة والسلوك للكل', message: <>سيُرصد <b>{target}</b> بالدرجة الكاملة لكل طالب رُصدت له درجات في {min} مواد فأكثر في الفصل الحالي، دون المساس بما رصدته المعلمات. يمكنك حذف هذا الرصد لاحقًا.</>, confirmText: 'رصد الكل' },
                  success: (d) => `تم رصد ${d?.filled ?? 0} طالب (${d?.already ?? 0} مرصودون سابقًا، ${d?.below_min ?? 0} غير مؤهلين)`, refresh: false,
                }).then(() => load())}><Sparkles className="h-4 w-4" />رصد الكل بالدرجة الكاملة</Button>
                <Button variant="secondary" disabled={busy} onClick={() => exec(() => conductClearFill(branch || null), {
                  confirm: { title: 'حذف رصد الأدمن', message: <>سيُحذف ما أضافه «رصد الكل» في <b>{target}</b> للفصل الحالي فقط. رصد المعلمات وما استُورد من ملف الفرع لا يُمسّان.</>, confirmText: 'حذف', tone: 'danger' },
                  success: (d) => `تم حذف ${d?.deleted ?? 0} رصد`, refresh: false,
                }).then(() => load())}><Eraser className="h-4 w-4" />حذف رصد الأدمن</Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
