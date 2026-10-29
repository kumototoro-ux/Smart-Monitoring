import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface text-ink-soft border-line',
  success: 'bg-mint-soft text-mint border-mint/20',
  danger: 'bg-rose-soft text-rose border-rose/20',
  warning: 'bg-amber-soft text-amber border-amber/20',
  info: 'bg-peri-soft text-peri-deep border-peri/20',
};

export function Badge({ tone = 'neutral', icon, children, className }: {
  tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
