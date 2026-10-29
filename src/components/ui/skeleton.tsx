import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-[#EDEDF3]', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-[-100%] animate-shimmer bg-gradient-to-l from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card p-5" role="status" aria-label="جارٍ التحميل">
      <Skeleton className="mb-5 h-6 w-40" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn('h-9', c === 0 ? 'flex-[2]' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TilesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[76px] rounded-card" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-56" />
      <TilesSkeleton />
      <TableSkeleton />
    </div>
  );
}
