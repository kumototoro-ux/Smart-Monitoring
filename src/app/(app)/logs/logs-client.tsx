'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Bug, KeyRound, Search, ChevronRight, ChevronLeft, ChevronDown, ScrollText, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/tile';
import { EmptyState } from '@/components/ui/empty';
import { cn, fmtDateTime } from '@/lib/utils';
import { ROLE_LABEL, type Branch, type Role } from '@/lib/types';

export interface LogRow {
  id: number; created_at: string; actor_name: string | null; actor_role: Role | null; branch_id: string | null;
  action: string; severity: 'info' | 'warning' | 'error' | 'security'; entity: string | null; entity_id: string | null;
  details: Record<string, unknown>; ip: string | null; user_agent: string | null;
}

const LABELS: Record<string, string> = {
  'auth.login': 'تسجيل دخول', 'auth.logout': 'تسجيل خروج', 'auth.login_failed': 'محاولة دخول فاشلة', 'auth.login_blocked': 'إيقاف مؤقت بسبب محاولات متكررة',
  'auth.login_inactive': 'محاولة دخول لحساب موقوف', 'auth.password_changed': 'تغيير كلمة المرور', 'auth.password_change_failed': 'فشل تغيير كلمة المرور',
  'grade.submit': 'حفظ كشف لأول مرة', 'grade.edit': 'تعديل كشف', 'sheet.save.failed': 'رفض حفظ الكشف', 'sheet.load.failed': 'تعذّر فتح كشف',
  'student.add': 'إضافة طالب من المعلمة', 'student.exclude': 'استبعاد طالب من كشف', 'student.restore': 'إعادة طالب لكشف',
  'student.save': 'حفظ بيانات طالب', 'student.import': 'استيراد طلاب', 'student.move': 'نقل طلاب', 'student.delete': 'حذف طلاب', 'student.set_active': 'تغيير حالة طلاب',
  'request.create': 'طلب جديد', 'request.approve': 'قبول طلب', 'request.reject': 'رفض طلب', 'request.cancel': 'إلغاء طلب',
  'account.create': 'إنشاء حساب', 'account.reset_password': 'إعادة تعيين كلمة مرور', 'account.change_username': 'تغيير اسم مستخدم',
  'account.update': 'تعديل حساب', 'account.activate': 'تفعيل حساب', 'account.deactivate': 'إيقاف حساب', 'account.delete': 'حذف حساب',
  'settings.update': 'تعديل الإعدادات', 'page.forbidden': 'محاولة فتح صفحة غير مصرّح بها', 'client.ui.error': 'خطأ في الواجهة', 'client.page.error': 'خطأ في صفحة',
  'export.section': 'تصدير كشف شعبة', 'export.subject': 'تصدير كشف مادة', 'export.branch': 'تصدير كشوفات فرع', 'export.progress': 'تصدير متابعة الرصد', 'export.failed': 'فشل التصدير',
};
const label = (a: string) => LABELS[a] ?? (a.endsWith('.forbidden') ? 'محاولة عملية غير مصرّح بها' : a.endsWith('.failed') ? 'عملية فشلت' : a);
const SEV = {
  info: 'bg-surface text-ink-soft', warning: 'bg-amber-soft text-amber', error: 'bg-rose-soft text-rose', security: 'bg-black text-white',
};
const SEV_LABEL = { info: 'عادي', warning: 'تنبيه', error: 'خطأ', security: 'أمني' };

export function LogsClient({ isAdmin, rows, total, page, pageSize, filters, summary, branches }: {
  isAdmin: boolean; rows: LogRow[]; total: number; page: number; pageSize: number;
  filters: { severity: string; cat: string; q: string; range: string; branch: string };
  summary: { security: number; errors: number; failedLogins: number }; branches: Branch[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState(filters.q);
  const nav = (patch: Partial<typeof filters> & { page?: number }) => {
    const f = { ...filters, page: '', ...patch } as Record<string, string | number>;
    start(() => router.push(`/logs?${new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== 1).map(([k, v]) => [k, String(v)]))}`));
  };
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => nav({ q }), 400);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button onClick={() => nav({ severity: 'security', range: '24h' })} className="text-right"><StatTile tone="rose" icon={<ShieldAlert className="h-5 w-5" />} label="أحداث أمنية (24 ساعة)" value={summary.security} /></button>
        <button onClick={() => nav({ severity: 'error', range: '24h' })} className="text-right"><StatTile tone="lilac" icon={<Bug className="h-5 w-5" />} label="أخطاء (24 ساعة)" value={summary.errors} /></button>
        <button onClick={() => nav({ cat: 'auth', severity: 'warning', range: '24h' })} className="text-right"><StatTile tone="peri" icon={<KeyRound className="h-5 w-5" />} label="محاولات دخول فاشلة" value={summary.failedLogins} /></button>
      </div>

      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم المستخدم أو الاسم" className="pr-10" />
            {pending && <Loader2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={filters.range} onChange={(e) => nav({ range: e.target.value })} className="sm:w-36">
              <option value="24h">آخر 24 ساعة</option><option value="7d">آخر 7 أيام</option><option value="30d">آخر 30 يوم</option><option value="all">الكل</option>
            </Select>
            <Select value={filters.severity} onChange={(e) => nav({ severity: e.target.value })} className="sm:w-40">
              <option value="">كل المستويات</option><option value="problems">المشاكل فقط</option><option value="security">أمني</option><option value="error">أخطاء</option><option value="warning">تنبيهات</option><option value="info">عادي</option>
            </Select>
            <Select value={filters.cat} onChange={(e) => nav({ cat: e.target.value })} className="sm:w-40">
              <option value="">كل العمليات</option><option value="auth">الدخول</option><option value="grade">الرصد</option><option value="sheet">الكشوفات</option>
              <option value="student">الطلاب</option><option value="request">الطلبات</option><option value="account">الحسابات</option><option value="settings">الإعدادات</option>
              <option value="export">التصدير</option><option value="client">أخطاء الواجهة</option>
            </Select>
            {isAdmin && (
              <Select value={filters.branch} onChange={(e) => nav({ branch: e.target.value })} className="sm:w-40">
                <option value="">كل الفروع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
          </div>
        </div>
      </div>

      <div className={cn('card overflow-hidden transition-opacity', pending && 'opacity-60')}>
        {rows.length === 0 ? <EmptyState icon={<ScrollText className="h-6 w-6" />} title="لا توجد أحداث" hint="غيّري الفترة أو الفلاتر." /> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-right sm:px-5">
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium', SEV[r.severity])}>{SEV_LABEL[r.severity]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{label(r.action)}</p>
                    <p className="truncate text-[12px] text-ink-muted">
                      {r.actor_name ?? (r.details?.username ? String(r.details.username) : 'زائر')}{r.actor_role ? ` · ${ROLE_LABEL[r.actor_role]}` : ''}
                      {typeof r.details?.message === 'string' && <> · {r.details.message}</>}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-[12px] text-ink-muted sm:block">{fmtDateTime(r.created_at)}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-faint transition', open === r.id && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {open === r.id && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="mx-4 mb-3 space-y-1.5 rounded-2xl bg-surface p-4 text-[12.5px] sm:mx-5">
                        <p className="sm:hidden">{fmtDateTime(r.created_at)}</p>
                        <p className="text-ink-muted">رمز العملية: <span dir="ltr" className="font-mono text-ink">{r.action}</span></p>
                        {r.ip && <p className="text-ink-muted">IP: <span dir="ltr" className="font-mono text-ink">{r.ip}</span></p>}
                        {r.user_agent && <p className="truncate text-ink-muted" dir="ltr" title={r.user_agent}>{r.user_agent}</p>}
                        {Object.keys(r.details ?? {}).length > 0 && (
                          <pre dir="ltr" className="scrollbar-thin mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-white p-3 text-left font-mono text-[11.5px]">{JSON.stringify(r.details, null, 2)}</pre>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
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
    </>
  );
}
