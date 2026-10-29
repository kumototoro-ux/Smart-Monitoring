'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/** يلتقط أخطاء الواجهة ويرسلها لسجل التتبع */
export function ErrorReporter() {
  useEffect(() => {
    const supabase = createClient();
    let sent = 0;
    const report = (message: string, extra: Record<string, unknown>) => {
      if (sent++ > 20) return;
      void supabase.rpc('log_client_event', {
        p_action: 'ui.error',
        p_severity: 'error',
        p_details: { message: message.slice(0, 500), path: location.pathname, ...extra },
      });
    };
    const onError = (e: ErrorEvent) => report(e.message, { source: e.filename, line: e.lineno });
    const onRejection = (e: PromiseRejectionEvent) => report(String(e.reason?.message ?? e.reason), { kind: 'promise' });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
