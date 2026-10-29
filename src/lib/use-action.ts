'use client';
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import type { ActionResult } from './types';

type ConfirmOpts = Parameters<ReturnType<typeof useConfirm>>[0];

/**
 * استدعاء Server Action مع: تأكيد اختياري، مؤشر تحميل، رسالة نجاح/خطأ، وتحديث الصفحة
 */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const exec = useCallback(async <T,>(
    fn: () => Promise<ActionResult<T>>,
    o: { confirm?: ConfirmOpts; success?: string | ((d: T | undefined) => string); refresh?: boolean } = {},
  ): Promise<ActionResult<T> | null> => {
    if (o.confirm && !(await confirm(o.confirm))) return null;
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) {
        if (o.success) toast.success(typeof o.success === 'function' ? o.success(r.data) : o.success);
        if (o.refresh !== false) startTransition(() => router.refresh());
      } else {
        toast.error(r.message ?? 'تعذّر تنفيذ العملية');
      }
      return r;
    } catch {
      toast.error('تعذّر الاتصال بالخادم', 'تحققي من الإنترنت ثم أعيدي المحاولة');
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [confirm, router, toast]);

  return { exec, busy };
}
