'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** مخطط أعمدة على نمط الصورة: خط متقطع للهدف، والعمود الأعلى مميز */
export function ProgressChart({ data }: { data: { label: string; done: number; total: number }[] }) {
  const rows = data.map((d) => ({ ...d, pct: d.total ? Math.round((d.done / d.total) * 100) : 0 }));
  const best = rows.reduce((m, r, i) => (r.pct > (rows[m]?.pct ?? -1) ? i : m), 0);
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="relative flex h-64 min-w-full items-end gap-2.5 pt-10 sm:gap-3" style={{ minWidth: rows.length * 64 }}>
        <div className="pointer-events-none absolute inset-x-0 top-10 flex items-center">
          <span className="z-10 rounded-full bg-rose px-2 py-0.5 text-[11px] font-medium text-white">100%</span>
          <span className="flex-1 border-t-2 border-dashed border-rose/60" />
        </div>
        {rows.map((r, i) => (
          <div key={r.label + i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="relative flex w-full flex-1 items-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(r.pct, 6)}%` }}
                transition={{ duration: 0.7, delay: i * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
                className={cn('relative w-full rounded-2xl',
                  i === best && r.pct > 0 ? 'bg-peri/80' : 'bg-[repeating-linear-gradient(135deg,#F1F1F7_0_6px,#F7F7FB_6px_12px)]')}
              >
                <span className={cn('num absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium',
                  i === best && r.pct > 0 ? 'bg-peri-deep text-white' : 'bg-[#EDEDF6] text-ink-soft')}>
                  {r.pct}%
                </span>
              </motion.div>
            </div>
            <span className={cn('max-w-full truncate text-[12px]', i === best && r.pct > 0 ? 'font-medium text-peri-deep' : 'text-ink-muted')} title={r.label}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
