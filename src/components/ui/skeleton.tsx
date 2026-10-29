import { cn } from '@/lib/utils';

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-[#EDEDF3]', className)} style={style} aria-hidden>
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

// ------------------------------------------------------------- هياكل الصفحات
function Header({ actions = 1 }: { actions?: number }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-64 max-w-full" /></div>
      <div className="flex gap-2">{Array.from({ length: actions }).map((_, i) => <Skeleton key={i} className="h-10 w-28 rounded-full" />)}</div>
    </div>
  );
}

function FilterBar({ fields = 3 }: { fields?: number }) {
  return (
    <div className="card mb-4 flex flex-col gap-3 p-4 lg:flex-row">
      <Skeleton className="h-11 flex-1" />
      <div className="grid grid-cols-2 gap-2 sm:flex">{Array.from({ length: fields }).map((_, i) => <Skeleton key={i} className="h-11 sm:w-36" />)}</div>
    </div>
  );
}

function Rows({ rows = 8, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4"><Skeleton className="h-5 w-32" /></div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            {avatar && <Skeleton className="h-9 w-9 rounded-full" />}
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3 min-w-32" /><Skeleton className="h-3 w-1/5 min-w-20" /></div>
            <Skeleton className="hidden h-6 w-20 rounded-full md:block" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardGrid({ count = 6, cols = 'md:grid-cols-2 xl:grid-cols-3' }: { count?: number; cols?: string }) {
  return (
    <div className={cn('grid gap-3', cols)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <div className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>
          <Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export const PageSkeletons = {
  dashboard: () => (
    <div className="space-y-5">
      <TilesSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card p-6">
          <Skeleton className="mb-6 h-6 w-48" />
          <div className="flex h-56 items-end gap-3">{[55, 40, 70, 95, 65, 50, 30].map((h, i) => <Skeleton key={i} className="flex-1 rounded-2xl" style={{ height: `${h}%` }} />)}</div>
        </div>
        <div className="card space-y-4 p-6"><Skeleton className="h-6 w-24" />{Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>)}</div>
      </div>
    </div>
  ),
  list: () => (<div><Header actions={2} /><FilterBar /><Rows /></div>),
  cards: () => (<div><Header /><CardGrid /></div>),
  requests: () => (<div><Header actions={0} /><Skeleton className="mb-4 h-11 w-80 max-w-full rounded-full" /><CardGrid count={4} cols="" /></div>),
  assignments: () => (
    <div><Header actions={0} /><Skeleton className="mb-4 h-11 w-72 rounded-full" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]"><Rows rows={7} /><div className="card space-y-4 p-5"><Skeleton className="h-11 w-1/2" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-4/5" /></div></div>
    </div>
  ),
  results: () => (
    <div><Header actions={0} />
      <div className="card mb-4 space-y-3 p-4"><div className="flex gap-2"><Skeleton className="h-11 w-44" /><Skeleton className="h-11 w-48" /><Skeleton className="h-11 w-36" /></div><div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}</div></div>
      <Skeleton className="mb-4 h-24 rounded-card" /><CardGrid />
    </div>
  ),
  form: () => (<div className="max-w-3xl"><Header actions={0} /><Skeleton className="mb-4 h-24 rounded-card" /><div className="card grid gap-5 p-6 sm:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-11 w-full" /></div>)}</div></div>),
  grading: () => (<div className="mx-auto max-w-3xl"><Header actions={0} /><div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="card p-5"><Skeleton className="mb-4 h-6 w-28" /><div className="flex flex-wrap gap-2">{Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-11 w-32 rounded-full" />)}</div></div>)}</div></div>),
};
