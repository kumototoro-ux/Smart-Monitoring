import { cn } from '@/lib/utils';

export function EmptyState({ icon, title, hint, action, className }: {
  icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface text-ink-muted">{icon}</div>}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] leading-6 text-ink-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
