'use client';
import { useActionState, useEffect, useRef } from 'react';
import { changeOwnPassword } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, null);
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) { toast.success(state.message ?? 'تم'); form.current?.reset(); }
    else toast.error(state.message ?? 'تعذّر الحفظ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="كلمة المرور الحالية" className="sm:col-span-2"><Input name="current" type="password" autoComplete="current-password" dir="ltr" required /></Field>
      <Field label="كلمة المرور الجديدة" hint="8 أحرف على الأقل"><Input name="next" type="password" autoComplete="new-password" dir="ltr" required /></Field>
      <Field label="تأكيد كلمة المرور"><Input name="confirm" type="password" autoComplete="new-password" dir="ltr" required /></Field>
      <div className="sm:col-span-2"><Button loading={pending}>حفظ كلمة المرور</Button></div>
    </form>
  );
}
