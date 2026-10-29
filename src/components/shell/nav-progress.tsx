'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/** إشارة بدء التنقل — تُستخدم أيضاً مع router.push */
export function startNavProgress() {
  window.dispatchEvent(new Event('mirqat:nav-start'));
}

function Bar() {
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  // بدء الشريط عند الضغط على أي رابط داخلي
  useEffect(() => {
    const start = () => {
      clearInterval(timer.current);
      setState('loading');
      setWidth(12);
      timer.current = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.08 : w)), 180);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('mirqat:nav-start', start);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('mirqat:nav-start', start);
      clearInterval(timer.current);
    };
  }, []);

  // اكتمال الشريط عند وصول الصفحة الجديدة
  useEffect(() => {
    if (state !== 'loading') return;
    clearInterval(timer.current);
    setWidth(100);
    setState('done');
    const t = setTimeout(() => { setState('idle'); setWidth(0); }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px]">
      <div
        className="h-full rounded-l-full bg-gradient-to-l from-peri-deep to-peri shadow-[0_0_10px_rgba(125,130,216,.7)]"
        style={{
          width: `${width}%`,
          marginRight: 0,
          opacity: state === 'idle' ? 0 : 1,
          transition: state === 'done' ? 'width .2s ease, opacity .3s ease .1s' : 'width .35s ease, opacity .1s',
        }}
      />
    </div>
  );
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}

/** مؤشر صغير داخل الرابط أثناء تحميل صفحته */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className={className ?? 'h-3.5 w-3.5 animate-spin text-ink-muted'} aria-label="جارٍ التحميل" />;
}
