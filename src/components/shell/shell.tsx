'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, MoreHorizontal, PanelRight, Bell, CalendarDays, ChevronDown, UserRound, Loader2 } from 'lucide-react';
import { FloatingMenu, MenuItem } from '@/components/ui/menu';
import { NAV, bottomItems, isActive, type NavItem } from './nav';
import { logout } from '@/app/actions/auth';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { ROLE_LABEL, type Profile } from '@/lib/types';
import { cn, firstName } from '@/lib/utils';
import { ErrorReporter } from './error-reporter';
import { NavProgress, LinkPending } from './nav-progress';

export interface ShellProps {
  profile: Pick<Profile, 'full_name' | 'username' | 'role'>;
  branchName: string | null;
  term: number;
  year: string;
  gradingOpen: boolean;
  pendingRequests: number;
  pendingReviews?: number;
  children: React.ReactNode;
}

export function Shell(p: ShellProps) {
  const realPath = usePathname();
  // تمييز الرابط فور الضغط عليه قبل اكتمال تحميل الصفحة
  const [clicked, setClicked] = useState<string | null>(null);
  useEffect(() => setClicked(null), [realPath]);
  const path = clicked ?? realPath;
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const confirm = useConfirm();
  const groups = NAV[p.profile.role];
  const bell = p.pendingRequests + (p.pendingReviews ?? 0);
  const { main, more } = bottomItems(p.profile.role);

  const [userMenu, setUserMenu] = useState<HTMLElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const doLogout = async () => {
    if (await confirm({ title: 'تسجيل الخروج', message: 'هل تريدين تسجيل الخروج من النظام؟', confirmText: 'خروج' })) {
      setLeaving(true);
      try { await logout(); } finally { setLeaving(false); }
    }
  };

  return (
    <div className="min-h-dvh lg:h-dvh lg:p-5">
      <ErrorReporter />
      <NavProgress />
      {leaving && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-surface/80">
          <span className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[14px] shadow-pop"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تسجيل الخروج…</span>
        </div>
      )}
      {/* في الكمبيوتر: إطار ثابت بارتفاع الشاشة — القائمة ثابتة والمحتوى فقط يتمرر */}
      <div className="flex min-h-dvh bg-surface lg:h-full lg:min-h-0 lg:overflow-hidden lg:rounded-shell lg:shadow-shell">
        {/* القائمة الجانبية — كمبيوتر وتابلت أفقي */}
        <aside
          className={cn(
            'hidden h-full shrink-0 flex-col border-l border-line bg-[#F7F7FB] transition-[width] duration-300 lg:flex',
            collapsed ? 'w-[84px]' : 'w-[252px]',
          )}
        >
          <div className="flex items-center justify-between px-5 pb-6 pt-6">
            <Logo compact={collapsed} />
            {!collapsed && (
              <button onClick={() => setCollapsed(true)} className="rounded-lg p-1.5 text-ink-muted hover:bg-white hover:text-ink" aria-label="طي القائمة">
                <PanelRight className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
          {collapsed && (
            <button onClick={() => setCollapsed(false)} className="mx-auto mb-4 rounded-lg p-1.5 text-ink-muted hover:bg-white hover:text-ink" aria-label="فتح القائمة">
              <PanelRight className="h-[18px] w-[18px] rotate-180" />
            </button>
          )}
          <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3">
            {groups.map((g, gi) => (
              <div key={gi} className={cn(gi > 0 && 'mt-3 border-t border-line pt-3')}>
                {g.title && !collapsed && <p className="mb-1.5 px-3 text-[12px] text-ink-faint">{g.title}</p>}
                {g.items.map((it) => (
                  <SideLink key={it.href} item={it} active={isActive(path, it.href)} collapsed={collapsed} badge={it.badge === 'reviews' ? (p.pendingReviews ?? 0) : it.badge ? p.pendingRequests : 0} onNavigate={() => setClicked(it.href)} />
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t border-line p-3">
            <div className={cn('flex items-center gap-3 rounded-2xl p-2', collapsed && 'justify-center')}>
              <Avatar name={p.profile.full_name} />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{p.profile.full_name}</p>
                  <p className="truncate text-[12px] text-ink-muted">{ROLE_LABEL[p.profile.role]}{p.branchName ? ` · ${p.branchName}` : ''}</p>
                </div>
              )}
              {!collapsed && (
                <button onClick={doLogout} title="تسجيل الخروج" className="rounded-lg p-1.5 text-ink-muted hover:bg-white hover:text-rose" aria-label="تسجيل الخروج">
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* المحتوى */}
        <div id="app-scroll" className="scrollbar-thin flex min-w-0 flex-1 flex-col lg:overflow-y-auto">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/70 bg-surface/[.97] px-4 py-3 sm:px-6 lg:bg-surface/85 lg:px-8 lg:py-5 lg:backdrop-blur-md">
            <div className="lg:hidden"><Logo compact={false} /></div>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-[22px] font-semibold tracking-tight">أهلاً، {firstName(p.profile.full_name)}</p>
            </div>
            <div className="mr-auto flex items-center gap-2 lg:mr-0">
              <span className="hidden items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-ink-soft sm:inline-flex">
                <CalendarDays className="h-4 w-4 text-ink-muted" />
                الترم {p.term === 1 ? 'الأول' : 'الثاني'} · {p.year}
              </span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium',
                p.gradingOpen ? 'bg-mint-soft text-mint' : 'bg-rose-soft text-rose')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', p.gradingOpen ? 'bg-mint' : 'bg-rose')} />
                {p.gradingOpen ? 'الرصد مفتوح' : 'الرصد مغلق'}
              </span>
              <Link href={p.pendingRequests === 0 && (p.pendingReviews ?? 0) > 0 ? '/reviews' : '/requests'} className="relative rounded-full p-2 text-ink-soft hover:bg-white" aria-label="التنبيهات">
                <Bell className="h-5 w-5" />
                {bell > 0 && (
                  <span className="absolute -top-0.5 right-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose px-1 text-[10.5px] font-semibold text-white">
                    {bell > 99 ? '99+' : bell}
                  </span>
                )}
              </Link>
              {/* قائمة الحساب: الاسم + حسابي + تسجيل الخروج — في كل الصفحات والأجهزة */}
              <button onClick={(e) => { const el = e.currentTarget; setUserMenu((m) => (m ? null : el)); }}
                className={cn('flex items-center gap-2 rounded-full p-0.5 transition hover:bg-white lg:pl-3', userMenu && 'bg-white')}
                aria-label="الحساب وتسجيل الخروج" aria-haspopup="menu" aria-expanded={!!userMenu}>
                <Avatar name={p.profile.full_name} className="h-9 w-9" />
                <ChevronDown className="hidden h-4 w-4 text-ink-muted lg:block" />
              </button>
            </div>
          </header>
          <FloatingMenu anchor={userMenu} onClose={() => setUserMenu(null)} width={250}>
            <div className="mb-1 border-b border-line px-3 pb-3 pt-2">
              <p className="truncate text-[14px] font-semibold">{p.profile.full_name}</p>
              <p className="truncate text-[12px] text-ink-muted">{ROLE_LABEL[p.profile.role]}{p.branchName ? ` · ${p.branchName}` : ''}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-faint" dir="ltr" style={{ textAlign: 'right' }}>{p.profile.username}</p>
            </div>
            <Link href="/account" onClick={() => setUserMenu(null)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] hover:bg-surface">
              <UserRound className="h-4 w-4" />حسابي وتغيير كلمة المرور
            </Link>
            <MenuItem icon={<LogOut />} tone="danger" onClick={() => { setUserMenu(null); void doLogout(); }}>تسجيل الخروج</MenuItem>
          </FloatingMenu>

          <main className="flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-4">{p.children}</main>
        </div>
      </div>

      {/* البار السفلي — جوال وتابلت */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-safe lg:hidden" aria-label="التنقل" style={{ transform: 'translateZ(0)' }}>
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-2">
          {main.map((it) => (
            <BottomLink key={it.href} item={it} active={isActive(path, it.href)} badge={it.badge === 'reviews' ? (p.pendingReviews ?? 0) : it.badge ? p.pendingRequests : 0} onNavigate={() => setClicked(it.href)} />
          ))}
          {more.length > 0 && (
            <button onClick={() => setMoreOpen(true)} className={cn('relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px]',
              more.some((m) => isActive(path, m.href)) ? 'text-ink' : 'text-ink-muted')}>
              <MoreHorizontal className="h-[22px] w-[22px]" />
              المزيد
            </button>
          )}
        </div>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="القائمة">
        <div className="grid grid-cols-3 gap-2 pb-2">
          {more.map((it) => {
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} onClick={() => { setMoreOpen(false); setClicked(it.href); }}
                className={cn('flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-[12.5px]',
                  isActive(path, it.href) ? 'border-black bg-black text-white' : 'border-line bg-surface text-ink-soft')}>
                <Icon className="h-5 w-5" />
                {it.label}
              </Link>
            );
          })}
        </div>
        <button onClick={() => { setMoreOpen(false); void doLogout(); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-[14px] text-rose">
          <LogOut className="h-4 w-4" /> تسجيل الخروج
        </button>
      </Dialog>
    </div>
  );
}

function SideLink({ item, active, collapsed, badge, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; badge: number; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-full px-3 py-2.5 text-[14px] transition',
        active ? 'bg-white font-medium text-ink shadow-soft' : 'text-ink-soft hover:bg-white/60 hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-ink' : 'text-ink-muted')} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && <LinkPending />}
      {badge > 0 && (
        <span className={cn('grid h-5 min-w-5 place-items-center rounded-full bg-rose px-1.5 text-[11px] font-semibold text-white', collapsed && 'absolute -top-0.5 left-3')}>
          {badge}
        </span>
      )}
    </Link>
  );
}

function BottomLink({ item, active, badge, onNavigate }: { item: NavItem; active: boolean; badge: number; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onNavigate} className={cn('relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] transition', active ? 'text-ink' : 'text-ink-muted')}>
      {active && (
        <motion.span layoutId="bottom-active" className="absolute inset-x-2 inset-y-0 -z-10 rounded-2xl bg-surface" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
      )}
      <span className="relative">
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
        <AnimatePresence>
          {badge > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[9.5px] font-semibold text-white">
              {badge}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className={cn(active && 'font-medium')}>{item.short ?? item.label}</span>
    </Link>
  );
}

function Logo({ compact }: { compact: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-black text-white">
        <svg viewBox="0 0 64 64" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M14 46V20h7v19h7V28h8v11h7V18h7v28z" /></svg>
      </span>
      {!compact && <span className="text-[17px] font-semibold">مِرقاة</span>}
    </Link>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  const hues = ['bg-peri-tile', 'bg-rose-tile', 'bg-lilac-tile', 'bg-mint-soft', 'bg-amber-soft'];
  const h = hues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-ink-soft', h, className)}>
      {initials}
    </span>
  );
}
