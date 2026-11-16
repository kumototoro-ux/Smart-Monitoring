import {
  LayoutDashboard, ClipboardPen, History, Inbox, Users, GraduationCap, Link2,
  FileSpreadsheet, ScrollText, Radar, Settings, Building2, Layers, BookOpen, UserRound, UserCheck, FileBadge, ClipboardCheck, UserX,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  short?: string; // للبار السفلي
  icon: typeof LayoutDashboard;
  badge?: 'requests' | 'reviews';
}
export interface NavGroup { title?: string; items: NavItem[] }

const home: NavItem = { href: '/', label: 'الرئيسية', icon: LayoutDashboard };
const account: NavItem = { href: '/account', label: 'حسابي', icon: UserRound };
const notices: NavItem = { href: '/notices', label: 'إشعارات الدرجات', short: 'الإشعارات', icon: FileBadge };
const noticeLog: NavItem = { href: '/notices/log', label: 'سجل الإشعارات', short: 'سجل الإشعارات', icon: ClipboardCheck };
const excluded: NavItem = { href: '/excluded', label: 'الطلاب المستبعدون', short: 'المستبعدون', icon: UserX };
const reviews: NavItem = { href: '/reviews', label: 'مراجعة الطلاب', short: 'المراجعة', icon: UserCheck, badge: 'reviews' };

export const NAV: Record<Role, NavGroup[]> = {
  teacher: [
    { items: [
      home,
      { href: '/grading', label: 'رصد الدرجات', short: 'الرصد', icon: ClipboardPen },
      { href: '/records', label: 'سجلات الرصد', short: 'السجلات', icon: History },
      { href: '/requests', label: 'طلباتي', short: 'الطلبات', icon: Inbox, badge: 'requests' },
      notices,
    ] },
    { items: [account] },
  ],
  supervisor: [
    { items: [
      home,
      { href: '/results', label: 'نتائج الرصد', short: 'النتائج', icon: FileSpreadsheet },
      notices,
      noticeLog,
      { href: '/follow-up', label: 'متابعة الرصد', icon: Radar },
      { href: '/requests', label: 'الطلبات', icon: Inbox, badge: 'requests' },
      reviews,
      excluded,
    ] },
    { items: [
      { href: '/accounts', label: 'المعلمات', icon: Users },
      { href: '/assignments', label: 'الإسناد', icon: Link2 },
      { href: '/students', label: 'الطلاب', icon: GraduationCap },
      { href: '/logs', label: 'سجل التتبع', icon: ScrollText },
      account,
    ] },
  ],
  admin: [
    { items: [
      home,
      { href: '/results', label: 'نتائج الرصد', short: 'النتائج', icon: FileSpreadsheet },
      notices,
      noticeLog,
      { href: '/follow-up', label: 'متابعة الرصد', icon: Radar },
      { href: '/requests', label: 'الطلبات', icon: Inbox, badge: 'requests' },
      reviews,
      excluded,
      { href: '/accounts', label: 'الحسابات', icon: Users },
      { href: '/assignments', label: 'الإسناد', icon: Link2 },
      { href: '/students', label: 'الطلاب', icon: GraduationCap },
      { href: '/logs', label: 'سجل التتبع', icon: ScrollText },
    ] },
    { title: 'الإعدادات', items: [
      { href: '/settings', label: 'الإعدادات العامة', icon: Settings },
      { href: '/settings/branches', label: 'الفروع', icon: Building2 },
      { href: '/settings/structure', label: 'الصفوف والشعب', icon: Layers },
      { href: '/settings/subjects', label: 'المواد والتقييم', icon: BookOpen },
      { href: '/settings/notices', label: 'إعدادات الإشعارات', icon: FileBadge },
    ] },
    { items: [account] },
  ],
};

/** القائمة حسب الدور، مع إخفاء «إشعارات الدرجات» عمّن لا يملك صلاحية إصدارها */
export function navFor(role: Role, noticeAccess: boolean): NavGroup[] {
  return NAV[role]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.href !== '/notices' || noticeAccess) }))
    .filter((g) => g.items.length);
}

/** أول 4 عناصر للبار السفلي، والباقي في "المزيد" */
export function bottomItems(role: Role, noticeAccess = true) {
  const all = navFor(role, noticeAccess).flatMap((g) => g.items);
  if (role === 'teacher') return { main: all, more: [] as NavItem[] };
  return { main: all.slice(0, 4), more: all.slice(4) };
}

export const isActive = (path: string, href: string) =>
  href === '/' || href === '/notices' ? path === href : href === '/settings' ? path === '/settings' : path === href || path.startsWith(href + '/');
