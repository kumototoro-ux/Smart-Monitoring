'use client';
import { useActionState, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login } from '../actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="mt-8 space-y-4" noValidate>
      <Field label="اسم المستخدم">
        <Input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" className="text-right" required />
      </Field>
      <Field label="كلمة المرور">
        <div className="relative">
          <Input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" dir="ltr" className="pl-11 text-right" required />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-muted hover:text-ink" aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <AnimatePresence>
        {state && !state.ok && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 rounded-xl bg-rose-soft px-3.5 py-3 text-[13.5px] leading-6 text-rose"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {state.message}
          </motion.p>
        )}
      </AnimatePresence>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        تسجيل الدخول
      </Button>
      <p className="text-center text-[12.5px] text-ink-muted">نسيتِ كلمة المرور؟ تواصلي مع مشرفة الفرع لإعادة تعيينها.</p>
    </form>
  );
}
