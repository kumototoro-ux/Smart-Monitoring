'use client';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// قفل التمرير بعدّاد: يدعم فتح أكثر من نافذة فوق بعض بدون أن يبقى الموقع مقفلاً
let locks = 0;
function lockScroll() {
  if (locks++ === 0) document.documentElement.style.overflow = 'hidden';
}
function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) document.documentElement.style.overflow = '';
}

/** نافذة منبثقة: من الأسفل في الجوال، ووسط الشاشة في الكمبيوتر */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissible?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // نحفظ آخر onClose في ref حتى لا يُعاد تشغيل الإعداد مع كل ضغطة زر
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;

  useEffect(() => {
    if (!open) return;
    lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissRef.current && closeRef.current();
    window.addEventListener('keydown', onKey);
    // التركيز مرة واحدة فقط عند الفتح
    const t = setTimeout(() => {
      const root = panel.current;
      // الأولوية: عنصر محدد ← أول حقل كتابة ← أول زر غير زر الإغلاق
      const el = root?.querySelector<HTMLElement>('[data-autofocus]')
        ?? root?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), textarea, select')
        ?? root?.querySelector<HTMLElement>('button:not([aria-label="إغلاق"])');
      el?.focus();
    }, 80);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-[#1b1b2b]/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissible && onClose()}
          />
          <motion.div
            ref={panel}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col rounded-t-[26px] bg-white shadow-pop sm:rounded-[24px]',
              widths[size],
            )}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-4 sm:pt-6">
              <div>
                <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
                {description && <div className="mt-1 text-[13.5px] leading-6 text-ink-muted">{description}</div>}
              </div>
              {dismissible && (
                <button onClick={onClose} className="-m-1 rounded-full p-2 text-ink-faint hover:bg-surface hover:text-ink" aria-label="إغلاق">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            {children && <div className="scrollbar-thin overflow-y-auto px-6 py-3">{children}</div>}
            {footer && <div className="flex flex-col-reverse gap-2 px-6 pb-6 pt-3 sm:flex-row sm:justify-start pb-safe sm:pb-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
