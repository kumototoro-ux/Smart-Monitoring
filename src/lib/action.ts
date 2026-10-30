import 'server-only';
import { revalidatePath } from 'next/cache';
import { getSession } from './auth';
import { audit, severityForHint } from './audit';
import { dbMessage } from './data';
import type { ActionResult, Profile, Role } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Ctx = { supabase: SupabaseClient; profile: Profile };

export class ActionError extends Error {}

/**
 * غلاف موحّد لكل Server Action:
 * - يتحقق من الجلسة والصلاحية
 * - يحوّل أخطاء قاعدة البيانات لرسائل عربية
 * - يسجّل الفشل والعمليات المرفوضة في سجل التتبع
 */
export async function run<T>(
  name: string,
  roles: Role[],
  fn: (ctx: Ctx) => Promise<T>,
  opts: {
    revalidate?: string[];
    log?: boolean | ((r: T) => Record<string, unknown>);
    /** سياق يُحفظ مع أي فشل (مثل الشعبة والمادة) ليظهر في سجل التتبع */
    context?: Record<string, unknown>;
  } = {},
): Promise<ActionResult<T>> {
  const s = await getSession();
  if (!s) return { ok: false, message: 'انتهت الجلسة، سجّلي الدخول من جديد' };
  if (!roles.includes(s.profile.role)) {
    await audit({ action: `${name}.forbidden`, severity: 'security', actor: s.profile, details: { ...opts.context } });
    return { ok: false, message: 'غير مصرّح لك بهذه العملية' };
  }
  try {
    const data = await fn({ supabase: s.supabase, profile: s.profile });
    if (opts.log) {
      await audit({ action: name, actor: s.profile, details: typeof opts.log === 'function' ? opts.log(data) : {} });
    }
    opts.revalidate?.forEach((p) => revalidatePath(p, 'layout'));
    return { ok: true, data };
  } catch (e) {
    // رفض من التطبيق نفسه (إدخال غير صحيح) — يُسجّل ليعرف المسؤول ماذا واجه المستخدم
    if (e instanceof ActionError) {
      await audit({ action: `${name}.rejected`, severity: 'warning', actor: s.profile, details: { message: e.message, ...opts.context } });
      return { ok: false, message: e.message };
    }
    const err = e as { message?: string; hint?: string; code?: string; details?: string };
    await audit({
      action: `${name}.failed`,
      severity: severityForHint(err.hint),
      actor: s.profile,
      details: { message: err.message?.slice(0, 300), hint: err.hint, code: err.code, db_details: err.details?.slice(0, 200), ...opts.context },
    });
    return { ok: false, message: dbMessage(err) };
  }
}

/** يرمي الخطأ إن وُجد — لاستخدامه داخل run */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** تحقق zod مع رسالة عربية واضحة */
export function parseOr<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new ActionError(r.error.issues[0]?.message ?? 'بيانات غير صحيحة');
  return r.data;
}
