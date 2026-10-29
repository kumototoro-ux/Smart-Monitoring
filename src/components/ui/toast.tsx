'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Kind = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; kind: Kind; title: string; text?: string }

const Ctx = createContext<(kind: Kind, title: string, text?: string) => void>(() => {});

const icons = {
  success: <CheckCircle2 className="h-5 w-5 text-mint" />,
  error: <XCircle className="h-5 w-5 text-rose" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber" />,
  info: <Info className="h-5 w-5 text-peri-deep" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: Kind, title: string, text?: string) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, kind, title, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4200);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-start lg:pr-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-white p-4 shadow-pop ring-1 ring-line')}
              role="status"
            >
              <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink">{t.title}</p>
                {t.text && <p className="mt-0.5 text-[13px] leading-6 text-ink-muted">{t.text}</p>}
              </div>
              <button
                onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}
                className="shrink-0 rounded-full p-1 text-ink-faint hover:bg-surface hover:text-ink"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return {
    success: (t: string, x?: string) => push('success', t, x),
    error: (t: string, x?: string) => push('error', t, x),
    warning: (t: string, x?: string) => push('warning', t, x),
    info: (t: string, x?: string) => push('info', t, x),
  };
}
