'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { getSession, usernameToEmail } from '@/lib/auth';
import type { ActionResult } from '@/lib/types';

const MAX_FAILS = 5;
const WINDOW_MIN = 15;

const schema = z.object({
  username: z.string().trim().toLowerCase().min(3, 'اسم المستخدم قصير').max(32),
  password: z.string().min(6, 'كلمة المرور قصيرة').max(72),
});

export async function login(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({ username: form.get('username'), password: form.get('password') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { username, password } = parsed.data;

  const admin = createAdminClient();

  // حماية من التخمين: 5 محاولات فاشلة خلال 15 دقيقة
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'auth.login_failed')
    .eq('details->>username', username)
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_FAILS) {
    await audit({ action: 'auth.login_blocked', severity: 'security', details: { username } });
    return { ok: false, message: `تم إيقاف الدخول مؤقتاً بسبب محاولات متكررة. حاولي بعد ${WINDOW_MIN} دقيقة أو تواصلي مع المشرفة.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });

  if (error || !data.user) {
    const { data: known } = await admin.from('profiles').select('id, full_name, is_active, branch_id, role').eq('username', username).maybeSingle();
    const reason = !known ? 'unknown_user' : error?.code === 'invalid_credentials' ? 'wrong_password' : (error?.code ?? error?.message);
    await audit({
      action: 'auth.login_failed', severity: 'warning',
      // ربط المحاولة بصاحب الحساب إن وُجد، ليظهر في سجلها ولمشرفة فرعها
      actor: known ? { id: known.id, role: known.role, full_name: known.full_name, branch_id: known.branch_id } : null,
      details: { username, reason, attempt: (count ?? 0) + 1 },
    });
    const left = MAX_FAILS - (count ?? 0) - 1;
    return { ok: false, message: left > 0 ? `اسم المستخدم أو كلمة المرور غير صحيحة. متبقي ${left} محاولات.` : 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
  }

  const { data: profile } = await admin
    .from('profiles').select('id, role, full_name, branch_id, is_active').eq('id', data.user.id).single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    await audit({ action: 'auth.login_inactive', severity: 'security', details: { username } });
    return { ok: false, message: 'هذا الحساب موقوف. تواصلي مع الإدارة.' };
  }

  await admin.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', profile.id);
  await audit({ action: 'auth.login', actor: profile, details: { username } });
  redirect('/');
}

export async function logout() {
  const s = await getSession();
  if (s) await audit({ action: 'auth.logout', actor: s.profile });
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

const pwSchema = z.object({
  current: z.string().min(1, 'اكتبي كلمة المرور الحالية'),
  next: z.string().min(8, 'كلمة المرور الجديدة 8 أحرف على الأقل').max(72),
});

export async function changeOwnPassword(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const s = await getSession();
  if (!s) return { ok: false, message: 'انتهت الجلسة' };
  const parsed = pwSchema.safeParse({ current: form.get('current'), next: form.get('next') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (parsed.data.next !== form.get('confirm')) return { ok: false, message: 'تأكيد كلمة المرور غير مطابق' };

  const { error: e1 } = await s.supabase.auth.signInWithPassword({
    email: usernameToEmail(s.profile.username), password: parsed.data.current,
  });
  if (e1) {
    await audit({ action: 'auth.password_change_failed', severity: 'warning', actor: s.profile });
    return { ok: false, message: 'كلمة المرور الحالية غير صحيحة' };
  }
  const { error } = await s.supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { ok: false, message: 'تعذّر تغيير كلمة المرور' };
  await audit({ action: 'auth.password_changed', actor: s.profile });
  return { ok: true, message: 'تم تغيير كلمة المرور' };
}
