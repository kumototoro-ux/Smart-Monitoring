import 'server-only';
import { headers } from 'next/headers';
import { createAdminClient } from './supabase/admin';
import type { Profile } from './types';

export type Severity = 'info' | 'warning' | 'error' | 'security';

/**
 * تسجيل حدث في سجل التتبع من السيرفر (بصلاحية service_role)
 * يُستخدم لمحاولات الدخول والعمليات المرفوضة وإدارة الحسابات.
 */
export async function audit(params: {
  action: string;
  severity?: Severity;
  actor?: Pick<Profile, 'id' | 'role' | 'full_name' | 'branch_id'> | null;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
    const ua = h.get('user-agent')?.slice(0, 300) ?? null;
    await createAdminClient().from('audit_logs').insert({
      action: params.action,
      severity: params.severity ?? 'info',
      actor_id: params.actor?.id ?? null,
      actor_role: params.actor?.role ?? null,
      actor_name: params.actor?.full_name ?? null,
      branch_id: params.actor?.branch_id ?? null,
      entity: params.entity ?? null,
      entity_id: params.entityId ?? null,
      details: params.details ?? {},
      ip,
      user_agent: ua,
    });
  } catch (e) {
    console.error('[audit] failed', e);
  }
}

/** خطأ قادم من دوال قاعدة البيانات: hint يحمل نوع الخطأ */
export function severityForHint(hint?: string | null): Severity {
  switch (hint) {
    case 'FORBIDDEN': return 'security';
    case 'OVER_MAX':
    case 'LOCKED':
    case 'INCOMPLETE':
    case 'DUPLICATE':
    case 'CLOSED':
    case 'TERM': return 'warning';
    default: return 'error';
  }
}
