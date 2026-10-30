/**
 * يلتقط أي خطأ يحدث في الخادم أثناء فتح صفحة أو تنفيذ عملية،
 * ويسجّله في سجل التتبع بالرسالة الحقيقية والصفحة والمستخدم.
 */
export async function register() {}

type Req = { path: string; method: string; headers: Record<string, string | string[] | undefined> };
type Ctx = { routerKind: string; routePath: string; routeType: string; renderSource?: string };

export async function onRequestError(err: unknown, request: Req, context: Ctx) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !service) return;
    const { createClient } = await import('@supabase/supabase-js');
    const { createServerClient } = await import('@supabase/ssr');
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    // من المستخدم؟ (من كوكيز الطلب)
    const raw = request.headers.cookie;
    const cookieHeader = Array.isArray(raw) ? raw.join('; ') : raw ?? '';
    const cookies = cookieHeader.split(/;\s*/).filter(Boolean).map((c) => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
    });
    let actor: { id: string; role: string; full_name: string; branch_id: string | null } | null = null;
    try {
      const sb = createServerClient(url, anon, { cookies: { getAll: () => cookies, setAll: () => {} } });
      const { data } = await sb.auth.getUser();
      if (data.user) {
        const { data: p } = await admin.from('profiles').select('id, role, full_name, branch_id').eq('id', data.user.id).maybeSingle();
        actor = p;
      }
    } catch { /* زائر */ }

    const e = err as { message?: string; digest?: string; code?: string; details?: string; hint?: string };
    const ua = request.headers['user-agent'];
    const fwd = request.headers['x-forwarded-for'];
    await admin.from('audit_logs').insert({
      action: 'server.error',
      severity: 'error',
      actor_id: actor?.id ?? null, actor_role: actor?.role ?? null, actor_name: actor?.full_name ?? null, branch_id: actor?.branch_id ?? null,
      entity: 'page', entity_id: request.path?.slice(0, 200),
      details: {
        message: String(e?.message ?? err).slice(0, 500),
        digest: e?.digest, code: e?.code, db_details: e?.details?.slice(0, 200), db_hint: e?.hint,
        path: request.path, route: context.routePath, kind: context.routeType, method: request.method,
      },
      ip: (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ?? null,
      user_agent: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 300) ?? null,
    });
  } catch (x) {
    console.error('[onRequestError] failed to log', x);
  }
}
