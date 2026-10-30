'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldAlert, Bug, UserRound, Search, ChevronRight, ChevronLeft, ChevronDown, ScrollText, Loader2,
  Lightbulb, HelpCircle, Wrench, X, CheckCircle2, Settings2, Filter,
} from 'lucide-react';
import { startNavProgress } from '@/components/shell/nav-progress';
import { Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { KIND, type Diagnosis, type Kind } from '@/lib/diagnose';
import { cn, fmtDateTime } from '@/lib/utils';
import { ROLE_LABEL, type Branch, type Role } from '@/lib/types';

export interface LogRow {
  id: number; created_at: string; actor_id: string | null; actor_name: string | null; actor_role: Role | null; branch_id: string | null;
  action: string; severity: 'info' | 'warning' | 'error' | 'security'; entity: string | null; entity_id: string | null;
  details: Record<string, unknown>; ip: string | null; user_agent: string | null;
  context?: string; diag: Diagnosis;
}
export interface ProblemGroup {
  key: string; kind: Kind; title: string; cause?: string; fix?: string; needsAction: boolean;
  count: number; last: string; people: string[]; peopleCount: number; sample: number;
  filter: { action: string; hint?: string };
}
type Filters = { view: string; cat: string; q: string; range: string; branch: string; actor: string; action: string; hint: string };

const RANGE: Record<string, string> = { '24h': 'آخر 24 ساعة', '7d': 'آخر 7 أيام', '30d': 'آخر 30 يوم', all: 'كل الفترة' };

export function LogsClient({ isAdmin, rows, total, page, pageSize, filters, actorName, summary, counts, truncated, branches }: {
  isAdmin: boolean; rows: LogRow[]; total: number; page: number; pageSize: number; filters: Filters; actorName: string | null;
  summary: ProblemGroup[]; counts: { needsAction: number; user: number; security: number; system: number }; truncated: boolean; branches: Branch[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState(filters.q);

  const nav = (patch: Partial<Filters> & { page?: number }) => {
    const f = { ...filters, page: '', ...patch } as Record<string, string | number>;
    startNavProgress();
    start(() => router.push(`/logs?${new URLSearchParams(Object.entries(f).filter(([k, v]) => v !== '' && v !== 1 && !(k === 'view' && v === 'problems') && !(k === 'range' && v === '24h')).map(([k, v]) => [k, String(v)]))}`));
  };
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => nav({ q }), 400);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const focused = filters.action || filters.actor;
  const focusGroup = filters.action ? summary.find((g) => g.filter.action === filters.action && (g.filter.hint ?? '') === filters.hint) : undefined;

  return (
    <div className={cn('transition-opacity', pending && 'opacity-70')}>
      {/* المؤشرات */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Wrench className="h-5 w-5" />} label="تحتاج تدخلك" value={counts.needsAction} tone="rose" hint={RANGE[filters.range]} />
        <Stat icon={<Bug className="h-5 w-5" />} label="أخطاء تقنية" value={counts.system} tone="lilac" hint="تحتاج المطوّر" />
        <Stat icon={<UserRound className="h-5 w-5" />} label="أخطاء مستخدمين" value={counts.user} tone="peri" hint="النظام منعها" />
        <Stat icon={<ShieldAlert className="h-5 w-5" />} label="تنبيهات أمنية" value={counts.security} tone="dark" hint="محاولات غير مصرّح بها" />
      </div>

      {/* أبرز المشاكل */}
      {!focused && (
        <section className="mb-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">أبرز المشاكل · {RANGE[filters.range]}</h2>
            <Select value={filters.range} onChange={(e) => nav({ range: e.target.value })} className="h-9 w-36 text-[13px]">
              {Object.entries(RANGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>
          {summary.length === 0 ? (
            <div className="card flex items-center gap-3 p-5 text-[14px]">
              <CheckCircle2 className="h-6 w-6 text-mint" />
              <span>لا توجد مشاكل في هذه الفترة. كل شيء يعمل بشكل طبيعي.</span>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {summary.map((g) => <GroupCard key={g.key} g={g} onShow={() => nav({ action: g.filter.action, hint: g.filter.hint ?? '', view: 'all' })} />)}
            </div>
          )}
          {truncated && <p className="mt-2 text-[12px] text-ink-muted">الملخص مبني على آخر 3000 حدث في الفترة.</p>}
        </section>
      )}

      {/* فلتر نشط */}
      {focused && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card bg-white p-3 shadow-soft">
          <Filter className="h-4 w-4 text-ink-muted" />
          {filters.actor && <Chip onClear={() => nav({ actor: '' })}>أحداث: {actorName ?? 'مستخدم'}</Chip>}
          {filters.action && <Chip onClear={() => nav({ action: '', hint: '' })}>{focusGroup?.title ?? filters.action}</Chip>}
          <button onClick={() => nav({ actor: '', action: '', hint: '', view: 'problems' })} className="mr-auto text-[13px] text-ink-muted hover:text-ink">عرض الكل</button>
        </div>
      )}
      {focusGroup && <Explain cause={focusGroup.cause} fix={focusGroup.fix} className="mb-4" />}

      {/* الفلاتر */}
      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحثي باسم الشخص أو اسم المستخدم" className="pr-10" />
            {pending && <Loader2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={filters.view} onChange={(e) => nav({ view: e.target.value })} className="sm:w-40">
              <option value="problems">المشاكل فقط</option>
              <option value="all">كل الأحداث</option>
              <option value="errors">أخطاء تقنية</option>
              <option value="security">تنبيهات أمنية</option>
            </Select>
            <Select value={filters.cat} onChange={(e) => nav({ cat: e.target.value })} className="sm:w-40">
              <option value="">كل العمليات</option><option value="auth">الدخول</option><option value="grade">حفظ الرصد</option><option value="sheet">الكشوفات</option>
              <option value="student">الطلاب</option><option value="request">الطلبات</option><option value="account">الحسابات</option><option value="settings">الإعدادات</option>
              <option value="export">التصدير</option><option value="client">أخطاء الواجهة</option>
            </Select>
            {focused && (
              <Select value={filters.range} onChange={(e) => nav({ range: e.target.value })} className="sm:w-36">
                {Object.entries(RANGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            )}
            {isAdmin && (
              <Select value={filters.branch} onChange={(e) => nav({ branch: e.target.value })} className="sm:w-40">
                <option value="">كل الفروع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* الأحداث */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">الأحداث <span className="num text-ink-muted">({total.toLocaleString('en')})</span></h2>
          <Legend />
        </div>
        {rows.length === 0 ? <EmptyState icon={<ScrollText className="h-6 w-6" />} title="لا توجد أحداث" hint="غيّري الفترة أو اختاري «كل الأحداث»." /> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const k = KIND[r.diag.kind];
              const isOpen = open === r.id;
              return (
                <li key={r.id}>
                  <button onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-start gap-3 px-4 py-3.5 text-right sm:px-5">
                    <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', k.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[14px] leading-6', r.diag.kind !== 'ok' && 'font-medium')}>{r.diag.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-muted">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', k.tone)}>{k.label}</span>
                        <span>{fmtDateTime(r.created_at)}</span>
                        {r.actor_role && <span>· {ROLE_LABEL[r.actor_role]}</span>}
                        {r.diag.needsAction && <span className="font-medium text-rose">· يحتاج تدخل</span>}
                      </p>
                    </div>
                    <ChevronDown className={cn('mt-1.5 h-4 w-4 shrink-0 text-ink-faint transition', isOpen && 'rotate-180')} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mx-4 mb-4 space-y-3 sm:mx-5">
                          <Explain cause={r.diag.cause} fix={r.diag.fix} kind={r.diag.kind} />
                          <div className="flex flex-wrap gap-2">
                            {r.actor_id && r.actor_id !== filters.actor && (
                              <Button size="sm" variant="secondary" onClick={() => nav({ actor: r.actor_id!, view: 'all', action: '', hint: '' })}>
                                <UserRound className="h-4 w-4" />كل أحداث {r.actor_name?.split(' ')[0] ?? 'المستخدم'}
                              </Button>
                            )}
                            {r.diag.kind !== 'ok' && filters.action !== r.action && (
                              <Button size="sm" variant="secondary" onClick={() => nav({ action: r.action, hint: typeof r.details?.hint === 'string' ? r.details.hint : '', view: 'all', actor: '' })}>
                                <Filter className="h-4 w-4" />نفس المشكلة عند الآخرين
                              </Button>
                            )}
                          </div>
                          <Technical r={r} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => nav({ page: page - 1 })}><ChevronRight className="h-4 w-4" />الأحدث</Button>
            <span className="num text-[13px] text-ink-muted">صفحة {page} من {pages}</span>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => nav({ page: page + 1 })}>الأقدم<ChevronLeft className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================================
function Stat({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: number; hint: string; tone: 'rose' | 'lilac' | 'peri' | 'dark' }) {
  const bg = { rose: 'bg-gradient-to-l from-rose-tile to-[#F3E1EC]', lilac: 'bg-gradient-to-l from-lilac-tile to-[#E6E2F3]', peri: 'bg-gradient-to-l from-peri-tile to-[#E4E6F6]', dark: 'bg-[#2A2A35] text-white' }[tone];
  return (
    <div className={cn('flex items-center gap-3 rounded-card px-4 py-3.5', bg)}>
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', tone === 'dark' ? 'bg-white/10' : 'bg-white')}>{icon}</span>
      <div className="min-w-0">
        <p className={cn('truncate text-[12.5px]', tone === 'dark' ? 'text-white/70' : 'text-ink-soft')}>{label}</p>
        <p className="num text-[21px] font-semibold leading-tight">{value.toLocaleString('en')}</p>
        <p className={cn('truncate text-[11px]', tone === 'dark' ? 'text-white/50' : 'text-ink-muted')}>{hint}</p>
      </div>
    </div>
  );
}

function GroupCard({ g, onShow }: { g: ProblemGroup; onShow: () => void }) {
  const k = KIND[g.kind];
  return (
    <div className={cn('card flex flex-col p-4', g.needsAction && 'ring-1 ring-rose/25')}>
      <div className="mb-2 flex items-start gap-3">
        <span className="num grid h-11 min-w-11 shrink-0 place-items-center rounded-2xl bg-surface px-2 text-[16px] font-semibold">{g.count}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-6">{g.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', k.tone)}>{k.label}</span>
            {g.needsAction && <span className="rounded-full bg-rose-soft px-2 py-0.5 text-[11px] font-medium text-rose">يحتاج تدخلك</span>}
            <span>آخرها {fmtDateTime(g.last)}</span>
          </p>
        </div>
      </div>
      {g.peopleCount > 0 && (
        <p className="mb-2 text-[12.5px] text-ink-soft">
          {g.people.join('، ')}{g.peopleCount > g.people.length ? ` و${g.peopleCount - g.people.length} آخرين` : ''}
        </p>
      )}
      <Explain cause={g.cause} fix={g.fix} compact />
      <button onClick={onShow} className="mt-3 self-start text-[13px] font-medium text-peri-deep hover:underline">عرض الأحداث ←</button>
    </div>
  );
}

function Explain({ cause, fix, kind, compact, className }: { cause?: string; fix?: string; kind?: Kind; compact?: boolean; className?: string }) {
  if (!cause && !fix) return kind === 'ok' ? <p className={cn('text-[13px] text-ink-muted', className)}>عملية عادية مسجّلة للمتابعة — لا تحتاج أي إجراء.</p> : null;
  return (
    <div className={cn('grid gap-2', !compact && 'sm:grid-cols-2', className)}>
      {cause && (
        <div className="flex gap-2.5 rounded-2xl bg-surface p-3">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <div><p className="text-[12px] font-medium text-ink-muted">السبب</p><p className="text-[13px] leading-6">{cause}</p></div>
        </div>
      )}
      {fix && (
        <div className="flex gap-2.5 rounded-2xl bg-mint-soft/70 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
          <div><p className="text-[12px] font-medium text-mint">الحل</p><p className="text-[13px] leading-6">{fix}</p></div>
        </div>
      )}
    </div>
  );
}

function Technical({ r }: { r: LogRow }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink">
        <Settings2 className="h-3.5 w-3.5" />{show ? 'إخفاء' : 'عرض'} التفاصيل التقنية (للمطوّر)
      </button>
      {show && (
        <div className="mt-2 space-y-1.5 rounded-2xl bg-surface p-4 text-[12.5px]">
          <p className="text-ink-muted">رمز العملية: <span dir="ltr" className="font-mono text-ink">{r.action}</span></p>
          {r.context && <p className="text-ink-muted">الكشف: <span className="text-ink">{r.context}</span></p>}
          {r.ip && <p className="text-ink-muted">IP: <span dir="ltr" className="font-mono text-ink">{r.ip}</span></p>}
          {r.user_agent && <p className="truncate text-ink-muted" dir="ltr" title={r.user_agent}>{r.user_agent}</p>}
          {Object.keys(r.details ?? {}).length > 0 && (
            <pre dir="ltr" className="scrollbar-thin mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-white p-3 text-left font-mono text-[11.5px]">{JSON.stringify(r.details, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black py-1 pl-1 pr-3 text-[12.5px] text-white">
      {children}
      <button onClick={onClear} className="rounded-full p-1 hover:bg-white/20" aria-label="إزالة"><X className="h-3.5 w-3.5" /></button>
    </span>
  );
}

function Legend() {
  return (
    <div className="hidden flex-wrap items-center gap-3 text-[11.5px] text-ink-muted md:flex">
      {(['system', 'config', 'user', 'security'] as Kind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5" title={KIND[k].hint}><span className={cn('h-2 w-2 rounded-full', KIND[k].dot)} />{KIND[k].label}</span>
      ))}
    </div>
  );
}
