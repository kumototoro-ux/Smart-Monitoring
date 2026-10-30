'use client';
import { useEffect } from 'react';
import { RotateCcw, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { createClient } from '@/lib/supabase/client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // مهم: طلب Supabase لا يُرسل إلا عند استدعاء then
    createClient().rpc('log_client_event', {
      p_action: 'page.error', p_severity: 'error',
      p_details: { message: error.message?.slice(0, 500), digest: error.digest, path: location.pathname },
    }).then(() => {}, () => {});
  }, [error]);
  return (
    <div className="card">
      <EmptyState
        icon={<ServerCrash className="h-6 w-6" />}
        title="تعذّر تحميل هذه الصفحة"
        hint="تم تسجيل المشكلة تلقائياً في سجل التتبع. أعيدي المحاولة، وإذا تكررت تواصلي مع الإدارة."
        action={
          <div className="flex flex-col items-center gap-3">
            <Button onClick={reset}><RotateCcw className="h-4 w-4" />إعادة المحاولة</Button>
            {error.digest && <span className="text-[12px] text-ink-faint">رمز المشكلة: <span dir="ltr" className="font-mono">{error.digest}</span></span>}
          </div>
        }
      />
    </div>
  );
}
