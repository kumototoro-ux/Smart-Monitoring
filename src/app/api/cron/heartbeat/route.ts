import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * نبض يومي (Vercel Cron — انظر vercel.json) يبقي مشروع Supabase المجاني نشطاً:
 * قراءات من عدة جداول + كتابة سطر في سجل التتبع.
 * محمي بـ CRON_SECRET: يرسله Vercel تلقائياً في ترويسة Authorization، ولا يستطيع غيره تشغيله.
 */
export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const admin = createAdminClient();
    const [students, accounts, settings] = await Promise.all([
      admin.from('students').select('id', { count: 'exact', head: true }),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('settings').select('id').limit(1),
    ]);
    const readError = students.error ?? accounts.error ?? settings.error;
    if (readError) throw readError;

    const { error } = await admin.from('audit_logs').insert({
      action: 'system.heartbeat',
      severity: 'info',
      entity: 'system',
      details: { students: students.count ?? 0, accounts: accounts.count ?? 0 },
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    // رمز 500 يظهر في Vercel ← Cron Jobs فتعرفين أن النبض فشل
    const err = e as { message?: string; code?: string };
    console.error('[heartbeat] failed', err.code, err.message);
    return NextResponse.json({ ok: false, error: err.code ?? 'failed' }, { status: 500 });
  }
}
