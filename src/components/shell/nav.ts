import {
  LayoutDashboard, ClipboardPen, History, Inbox, Users, GraduationCap, Link2,
  FileSpreadsheet, ScrollText, Settings, Building2, Layers, BookOpen, UserRound,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  short?: string; // للبار السفلي
  icon: typeof LayoutDashboard;
  badge?: 'requests';
}
export interface NavGroup { title?: string; items: NavItem[] }

const home: NavItem = { href: '/', label: 'الرئيسية', icon: LayoutDashboard };
const account: NavItem = { href: '/account', label: 'حسابي', icon: UserRound };

export const NAV: Record<Role, NavGroup[]> = {
  teacher: [
    { items: [
      home,
      { href: '/grading', label: 'رصد الدرجات', short: 'الرصد', icon: ClipboardPen },
      { href: '/records', label: 'سجلات الرصد', short: 'السجلات', icon: History },
      { href: '/requests', label: 'طلباتي', short: 'الطلبات', icon: Inbox, badge: 'requests' },
    ] },
    { items: [account] },
  ],
  supervisor: [
    { items: [
      home,
      { href: '/results', label: 'نتائج الرصد', short: 'النتائج', icon: FileSpreadsheet },
      { href: '/requests', label: 'الطلبات', icon: Inbox, badge: 'requests' },
      { href: '/accounts', label: 'المعلمات', icon: Users },
    ] },
    { items: [
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
      { href: '/requests', label: 'الطلبات', icon: Inbox, badge: 'requests' },
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
    ] },
    { items: [account] },
  ],
};

/** أول 4 عناصر للبار السفلي، والباقي في "المزيد" */
export function bottomItems(role: Role) {
  const all = NAV[role].flatMap((g) => g.items);
  if (role === 'teacher') return { main: all, more: [] as NavItem[] };
  return { main: all.slice(0, 4), more: all.slice(4) };
}

export const isActive = (path: string, href: string) =>
  href === '/' ? path === '/' : href === '/settings' ? path === '/settings' : path === href || path.startsWith(href + '/');
