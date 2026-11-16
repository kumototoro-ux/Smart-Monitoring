'use client';
import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface FilterField { name: string; label: string; value: string; options: readonly (readonly [string, string])[] }

/** شريط تصفية مضغوط (قوائم منسدلة) يحدّث العنوان فيُعاد رسم الصفحة من الخادم؛ يحفظ بقية المعاملات */
export function FilterBar({ fields, keep = {}, className }: { fields: FilterField[]; keep?: Record<string, string | undefined>; className?: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const change = (name: string, value: string) => {
    const qs = new URLSearchParams(Object.entries({ ...keep, ...Object.fromEntries(fields.map((f) => [f.name, f.value])), [name]: value }).filter(([, v]) => v) as [string, string][]);
    // تغيير الفرع يصفّر الصف
    if (name === 'branch') qs.delete('grade');
    start(() => router.push(`${path}${qs.size ? `?${qs}` : ''}`, { scroll: false }));
  };
  return (
    <div className={cn('card mb-4 grid grid-cols-2 gap-3 p-3 transition-opacity sm:flex sm:flex-wrap sm:items-end', pending && 'opacity-60', className)} aria-busy={pending}>
      {fields.map((f) => (
        <label key={f.name} className="min-w-0 sm:w-52">
          <span className="mb-1 block text-[12px] text-ink-muted">{f.label}</span>
          <select value={f.value} onChange={(e) => change(f.name, e.target.value)} className="field w-full min-w-0">
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
