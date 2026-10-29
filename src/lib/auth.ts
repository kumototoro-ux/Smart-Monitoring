import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile, Role } from './types';

/** الإيميل الداخلي المخفي لكل اسم مستخدم */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@mirqat.local`;

/** المستخدم الحالي مع ملفه — مخزّن لكل طلب */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, branch_id, phone, is_active, last_login_at, created_at')
    .eq('id', user.id)
    .single<Profile>();
  if (!profile || !profile.is_active) return null;
  return { supabase, user, profile };
});

/** يتطلب تسجيل الدخول ودوراً معيناً، وإلا يعيد التوجيه */
export async function requireRole(...roles: Role[]) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (roles.length && !roles.includes(s.profile.role)) redirect('/');
  return s;
}
