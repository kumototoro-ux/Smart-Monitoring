'use client';
import { useEffect } from 'react';
import { RotateCcw, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { createClient } from '@/lib/supabase/client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void createClient().rpc('log_client_event', {
      p_action: 'page.error', p_severity: 'error',
      p_details: { message: error.message?.slice(0, 500), digest: error.digest, path: location.pathname },
    });
  }, [error]);
  return (
    <div className="card">
      <EmptyState
        icon={<ServerCrash className="h-6 w-6" />}
        title="تعذّر تحميل هذه الصفحة"
        hint="تم تسجيل المشكلة تلقائياً. أعيدي المحاولة، وإذا تكررت تواصلي مع الإدارة."
        action={<Button onClick={reset}><RotateCcw className="h-4 w-4" />إعادة المحاولة</Button>}
      />
    </div>
  );
}
