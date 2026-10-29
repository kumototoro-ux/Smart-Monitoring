import { cn } from '@/lib/utils';

/** حلقة تقدم صغيرة مثل عمود Progress في الصورة */
export function Ring({ value, size = 30, className }: { value: number; size?: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = v >= 100 ? '#2E8B6A' : v >= 50 ? '#7D82D8' : '#C4365E';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('-rotate-90', className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECECF2" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} style={{ transition: 'stroke-dashoffset .6s ease' }} />
    </svg>
  );
}

export function Bar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-[#ECECF2]', className)}>
      <div className="h-full rounded-full bg-peri transition-all duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}
