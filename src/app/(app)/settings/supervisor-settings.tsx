'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { saveSupervisorAccounts } from '@/app/actions/accounts';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/field';

export function SupervisorSettings({ accounts, migrated }: { accounts: boolean; migrated: boolean }) {
  const { exec, busy } = useAction();
  const [on, setOn] = useState(accounts);
  return (
    <section className="card mt-4 space-y-3 p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ink-soft" /><h2 className="text-[15px] font-semibold">صلاحيات المشرفات</h2></div>
      {!migrated ? (
        <p className="text-[13px] leading-6 text-ink-muted">لتفعيل هذا الخيار شغّلي ملف <b>0025_supervisor_accounts_toggle.sql</b> في Supabase مرة واحدة ثم حدّثي الصفحة. إلى ذلك الحين إدارة الحسابات مقفلة على المشرفات.</p>
      ) : (
        <>
          <p className="text-[13px] leading-6 text-ink-muted">المشرفة تعمل داخل فرعها فقط. هنا تتحكمين بما يحتاج ثقة أعلى: إنشاء حسابات المعلمات وإعادة تعيين كلمات المرور وتغيير أسماء المستخدمين وإيقاف الحسابات وتصدير بيانات الدخول.</p>
          <Switch checked={on} onChange={setOn} label="السماح للمشرفات بإدارة حسابات المعلمات" />
          <Button loading={busy} onClick={() => exec(() => saveSupervisorAccounts(on), { success: on ? 'تم السماح للمشرفات بإدارة الحسابات' : 'أُغلقت إدارة الحسابات على المشرفات', refresh: false })}>حفظ</Button>
        </>
      )}
    </section>
  );
}
