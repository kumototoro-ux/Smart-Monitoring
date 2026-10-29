'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * قائمة منبثقة تُرسم فوق كل شيء (خارج أي بطاقة)،
 * وتفتح للأعلى تلقائياً إذا لم تكفِ المساحة تحت الزر.
 */
export function FloatingMenu({ anchor, onClose, children, width = 232 }: {
  anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; up: boolean } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!anchor) { setPos(null); return; }
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 260;
      const vw = window.innerWidth, vh = window.innerHeight;
      const left = Math.min(Math.max(8, r.left), vw - width - 8);
      const below = vh - r.bottom;
      const up = below < h + 16 && r.top > below;
      setPos(up ? { bottom: vh - r.top + 6, left, up } : { top: r.bottom + 6, left, up });
    };
    place();
    const id = requestAnimationFrame(place); // بعد معرفة الارتفاع الفعلي
    return () => cancelAnimationFrame(id);
  }, [anchor, width]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => closeRef.current();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [anchor]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {anchor && (
        <motion.div
          ref={ref}
          role="menu"
          initial={{ opacity: 0, scale: 0.96, y: pos?.up ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.14 }}
          style={{ position: 'fixed', top: pos?.top, bottom: pos?.bottom, left: pos?.left ?? -9999, width, transformOrigin: pos?.up ? 'bottom left' : 'top left' }}
          className="z-[55] overflow-hidden rounded-2xl bg-white p-1.5 shadow-pop ring-1 ring-line"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function MenuItem({ icon, children, onClick, tone }: {
  icon: React.ReactElement<{ className?: string }>; children: React.ReactNode; onClick: () => void; tone?: 'danger';
}) {
  return (
    <button role="menuitem" onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-[13.5px] transition-colors hover:bg-surface',
        tone === 'danger' ? 'text-rose' : 'text-ink')}>
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {children}
    </button>
  );
}
